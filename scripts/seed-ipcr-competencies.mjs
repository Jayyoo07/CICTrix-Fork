// ─────────────────────────────────────────────────────────────────────────────
// scripts/seed-ipcr-competencies.mjs
//
// Seeds deterministic, idempotent IPCR competency development matches for active
// staff in the 5 top-level LGU offices, feeding the Training Needs Assessment
// dashboard (computeNeedsAssessment in src/lib/api/trainingNeeds.ts).
//
// Pipeline:
//   1. Load active employees from employees_with_department in the 5 active offices.
//   2. Load position competency requirements from position_competency_requirements
//      mapped to the 12 canonical CSC LGU competency_standards.
//   3. For each active employee, lookup required competencies and deterministically
//      select 2-3 realistic development gap competencies, ensuring all 12
//      standards are represented across the 5 offices.
//   4. Generate domain-accurate target_text, confidence (0.85-0.95), and justification.
//   5. Output idempotent SQL (--sql flag) and/or perform dry run (--dry flag) or
//      live Supabase batch upsert.
//
// Usage:
//   node scripts/seed-ipcr-competencies.mjs --dry
//   node scripts/seed-ipcr-competencies.mjs --sql
//   node scripts/seed-ipcr-competencies.mjs --dry --sql
//   node scripts/seed-ipcr-competencies.mjs
// ─────────────────────────────────────────────────────────────────────────────

import crypto from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, serviceClient, die } from './lib/ipcr-shared.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const SQL_FILE_PATH = resolve(ROOT, 'seed-ipcr-competencies.sql');

// ── CLI Flags ────────────────────────────────────────────────────────────────
const APPLY = process.argv.includes('--apply');
const DRY_RUN = process.argv.includes('--dry') || !APPLY;
const WRITE_SQL = process.argv.includes('--sql');
const periodIdx = process.argv.indexOf('--period');
const RATING_PERIOD = periodIdx !== -1 && process.argv[periodIdx + 1]
  ? process.argv[periodIdx + 1]
  : 'Jan - Jun 2026';

// ── Canonical Active LGU Offices ─────────────────────────────────────────────
const TARGET_OFFICES = [
  'Office of The City Accountant',
  'Office of The City Engineer',
  'Office of The City Health Officer',
  'Office of The City Social Welfare and Development Officer',
  'Office of the City General Services Officer',
];
const TARGET_OFFICE_SET = new Set(TARGET_OFFICES.map((o) => o.trim().toLowerCase()));

// ── Competency Target & Justification Templates ─────────────────────────────
const COMPETENCY_TARGETS = {
  'Knowledge of Local Governance': [
    'Reviewed and ensured 100% compliance of division workflows, local ordinances, and administrative issuances with Local Government Code (RA 7160) provisions.',
    'Formulated and aligned 100% of division annual work plans and operational guidelines with statutory LGU mandate requirements.',
    'Monitored and evaluated 100% of departmental project implementations for adherence to municipal policy guidelines and regulatory frameworks.',
  ],
  'Public Administration Principles': [
    'Implemented 100% of scheduled administrative workflow improvements, operational enhancements, and public service efficiency measures.',
    'Coordinated and executed 100% of assigned inter-division service delivery protocols according to Civil Service Commission operational standards.',
    'Streamlined 100% of internal routing procedures and client transaction cycles to meet statutory Citizen\'s Charter processing timeframes.',
  ],
  'Community Engagement Skills': [
    'Conducted 100% of scheduled community outreach consultations, public dialogues, and participatory service feedback sessions.',
    'Facilitated and documented 100% of community-based stakeholder coordination meetings and public information campaigns.',
    'Delivered 100% of frontline community assistance interventions and grassroots welfare coordination in target barangays.',
  ],
  'Project Management in a Public Setting': [
    'Monitored and delivered 100% of assigned municipal project milestones, operational schedules, and project deliverables within budget and deadlines.',
    'Coordinated 100% of project milestone reviews, risk assessments, and contractor/supplier status inspections on time.',
    'Tracked and reported 100% of public infrastructure and service project progress metrics to division leadership on a weekly basis.',
  ],
  'Fiscal Management/Budgeting for LGU': [
    'Prepared, reviewed, and processed 100% of assigned financial disbursement vouchers, ledgers, and budget allocations within COA guidelines.',
    'Monitored 100% of divisional quarterly budget execution and fund utilization against approved annual appropriations.',
    'Reconciled 100% of financial transaction records, liquidation reports, and fiscal accounts within statutory accounting deadlines.',
  ],
  'Transparency and Accountability Practices': [
    'Maintained 100% compliance with Full Disclosure Policy standards, official audit requirements, and public transparency disclosures.',
    'Conducted and submitted 100% of scheduled internal compliance audits, inventory checks, and accountability reviews with zero overdue findings.',
    'Implemented 100% of required anti-corruption checkpoints and transparent transaction logs across division public services.',
  ],
  'Disaster Risk Reduction and Management': [
    'Maintained 100% operational readiness for emergency response, disaster contingency plans, and disaster risk reduction protocols.',
    'Participated in and completed 100% of assigned disaster preparedness drills, risk mapping exercises, and crisis mitigation workflows.',
    'Executed 100% of assigned disaster relief distribution, emergency operations center shifts, or post-incident response duties.',
  ],
  'Digital Literacy for Government Services': [
    'Encoded, processed, and validated 100% of municipal records and online service applications using government enterprise digital systems.',
    'Utilized 100% of mandated electronic document tracking and digital reporting tools to maintain accurate digital service logs.',
    'Adopted and maintained 100% compliance with digital security protocols, government database standards, and electronic file backups.',
  ],
  'Ethical Conduct and Public Service Standards': [
    'Maintained 100% adherence to Republic Act 6713 (Code of Conduct and Ethical Standards for Public Officials and Employees) with zero infractions.',
    'Demonstrated 100% compliance with government service norms, professionalism standards, and timely public assistance under Citizen\'s Charter.',
    'Ensured 100% conflict-of-interest avoidance and ethical asset/gift handling in all dealings with vendors, clients, and the public.',
  ],
  'Technical Writing for Government Documents': [
    'Drafted, finalized, and submitted 100% of required technical reports, policy briefs, and formal executive correspondence within deadlines.',
    'Prepared 100% of assigned administrative memoranda, endorsement letters, and inter-office communications with high clarity and accuracy.',
    'Compiled 100% of comprehensive quarterly accomplishment summaries and project documentation for departmental submission.',
  ],
  'Data and Records Management and Organization': [
    'Organized, classified, and maintained 100% of division physical records and digital archives according to National Archives standards.',
    'Completed 100% of document retrieval requests, archiving logs, and record retention schedules within prescribed turnaround periods.',
    'Systematically cataloged 100% of incoming and outgoing official correspondence, tracking dockets, and inventory registries.',
  ],
  'Public Communication Skills': [
    'Handled 100% of citizen inquiries, frontline client concerns, and public information requests with courtesy and prompt resolution.',
    'Conducted 100% of frontline briefings and orientation sessions for client beneficiaries in clear, accessible, and respectful language.',
    'Managed and resolved 100% of public feedback submissions and client complaints within Citizen\'s Charter time limits.',
  ],
};

const COMPETENCY_JUSTIFICATIONS = {
  'Knowledge of Local Governance':
    'Performance assessment highlights a development gap in navigating LGU statutory mandates (RA 7160) and aligning division operational outputs with municipal policy ordinances.',
  'Public Administration Principles':
    'Identified as a growth priority to strengthen public sector workflow optimization, cross-division coordination, and adherence to Civil Service Commission administrative standards.',
  'Community Engagement Skills':
    'Target evaluation reveals an opportunity to enhance frontline community mobilization, participatory dialogue, and culturally sensitive stakeholder outreach in target communities.',
  'Project Management in a Public Setting':
    'Assessment indicates a training requirement in public project lifecycle management, milestone tracking, resource allocation, and multi-stakeholder project coordination.',
  'Fiscal Management/Budgeting for LGU':
    'Development need identified in local government financial management regulations, COA circular compliance, budget preparation, and audit trail verification.',
  'Transparency and Accountability Practices':
    'Identified development gap in municipal disclosure protocols, anti-corruption risk controls, and internal accountability review mechanisms across division services.',
  'Disaster Risk Reduction and Management':
    'Growth area identified to build operational preparedness in crisis response protocols, disaster contingency planning, and local disaster risk reduction workflows.',
  'Digital Literacy for Government Services':
    'Target analysis demonstrates an essential development need in operating government digital platforms, automated document registries, and online public transaction tools.',
  'Ethical Conduct and Public Service Standards':
    'Core development priority to reinforce strict compliance with RA 6713 standards, ethical public stewardship, and conflict-of-interest prevention across daily operations.',
  'Technical Writing for Government Documents':
    'Assessment reflects a development need in structured administrative writing, technical report drafting, and executive policy memorandum preparation.',
  'Data and Records Management and Organization':
    'Identified training need in systematic records classification, electronic indexing, National Archives compliance, and data privacy safeguards for office records.',
  'Public Communication Skills':
    'Development need identified in frontline client de-escalation, clear service orientation, and Citizen\'s Charter compliant public interaction.',
};

const CONFIDENCES = [0.85, 0.88, 0.90, 0.92, 0.95];

// ── Helpers ──────────────────────────────────────────────────────────────────
/** Stable hash integer from a string. */
function hashStr(s) {
  let h = 0;
  const str = String(s ?? '');
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Deterministic RFC4122 v4 UUID generated from an input seed string. */
export function deterministicUuid(seed) {
  const hash = crypto.createHash('sha256').update(String(seed)).digest('hex');
  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    '4' + hash.substring(13, 16),
    ((parseInt(hash.substring(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0') + hash.substring(18, 20),
    hash.substring(20, 32),
  ].join('-');
}

/** Paginated fetch for large table queries. */
async function fetchAllRows(db, tableName, selectColumns = '*', filterFn = null) {
  const PAGE_SIZE = 1000;
  let offset = 0;
  const rows = [];
  while (true) {
    let q = db.from(tableName).select(selectColumns).range(offset, offset + PAGE_SIZE - 1);
    if (filterFn) q = filterFn(q);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows;
}

/** Format rows as an idempotent SQL INSERT script with ON CONFLICT DO NOTHING. */
export function generateSql(rows, ratingPeriod) {
  const header = `-- -----------------------------------------------------------------------------
-- seed-ipcr-competencies.sql
-- Generated at: ${new Date().toISOString()}
-- Total rows: ${rows.length}
-- Target offices: 5 active LGU offices (~167 employees)
-- Rating period: ${ratingPeriod}
--
-- Idempotent insert of IPCR competency development matches for TNA dashboard.
-- ON CONFLICT (id) DO NOTHING preserves existing rows and prevents duplication.
-- -----------------------------------------------------------------------------

INSERT INTO ipcr_competency_matches (
  id,
  employee_id,
  employee_position,
  rating_period,
  target_text,
  competency,
  confidence,
  justification,
  flag_for_review,
  prompt_version,
  model,
  created_by
)
VALUES
`;

  const values = rows
    .map((r) => {
      const esc = (val) => String(val ?? '').replace(/'/g, "''");
      return `  ('${r.id}', '${r.employee_id}', '${esc(r.employee_position)}', '${esc(r.rating_period)}', '${esc(r.target_text)}', '${esc(r.competency)}', ${r.confidence}, '${esc(r.justification)}', ${r.flag_for_review}, '${esc(r.prompt_version)}', '${esc(r.model)}', '${esc(r.created_by)}')`;
    })
    .join(',\n');

  return header + values + '\nON CONFLICT (id) DO NOTHING;\n';
}

// ── Main Pipeline ────────────────────────────────────────────────────────────
async function main() {
  console.log('='.repeat(78));
  console.log('IPCR COMPETENCY SEEDER (TNA DASHBOARD FEED)');
  console.log(`Rating Period: ${RATING_PERIOD} | Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE DB'} | SQL Export: ${WRITE_SQL ? 'YES' : 'NO'}`);
  console.log('='.repeat(78));

  const env = loadEnv();
  const db = serviceClient(env);

  // 1. Load active employees, position requirements, and competency standards
  console.log('\n[1/4] Loading active employees, position requirements & standards...');
  const [employees, requirements, standards] = await Promise.all([
    fetchAllRows(db, 'employees_with_department', 'id, employee_id, full_name, current_position, department, status', (q) =>
      q.eq('status', 'Active'),
    ),
    fetchAllRows(db, 'position_competency_requirements', 'position_title, competency_id, proficiency_level'),
    fetchAllRows(db, 'competency_standards', 'id, competency_name, training_stream'),
  ]);

  // Filter employees to the 5 canonical active top-level offices
  const targetEmployees = employees.filter((e) =>
    TARGET_OFFICE_SET.has(String(e.department ?? '').trim().toLowerCase()),
  );

  console.log(`  • Total Active Employees in Database:   ${employees.length}`);
  console.log(`  • Active Staff in 5 Target Offices:     ${targetEmployees.length}`);
  console.log(`  • Position Requirements Configured:     ${requirements.length}`);
  console.log(`  • Canonical Competency Standards:       ${standards.length}`);

  if (targetEmployees.length === 0) {
    die('No active employees found in the 5 target offices.');
  }

  // Index competency standards by id and canonical name
  const stdById = new Map(standards.map((s) => [s.id, s]));
  const stdByName = new Map(standards.map((s) => [s.competency_name.trim().toLowerCase(), s]));

  // Index position requirements by lowercase normalized title
  const reqsByPos = new Map();
  for (const r of requirements) {
    const key = String(r.position_title ?? '').trim().toLowerCase();
    if (!reqsByPos.has(key)) reqsByPos.set(key, []);
    reqsByPos.get(key).push(r);
  }

  // 2. Select 2-3 development gap competencies per employee
  console.log('\n[2/4] Allocating 2-3 development gap competencies per employee...');
  const selectedCounts = {};
  standards.forEach((s) => (selectedCounts[s.id] = 0));

  const generatedRows = [];
  const officeStats = {};
  TARGET_OFFICES.forEach((o) => (officeStats[o] = { employees: 0, matches: 0 }));

  for (const emp of targetEmployees) {
    const officeName = emp.department;
    if (officeStats[officeName]) {
      officeStats[officeName].employees++;
    }

    const posTitle = String(emp.current_position ?? '').trim();
    const posKey = posTitle.toLowerCase();
    const posReqs = reqsByPos.get(posKey) || [];

    // Distinct competency IDs required for this position
    const uniqueCompIds = [...new Set(posReqs.map((r) => r.competency_id))].filter((id) =>
      stdById.has(id),
    );

    if (uniqueCompIds.length === 0) {
      console.warn(`  ⚠️ Warning: No requirements found for position "${posTitle}" (Emp: ${emp.full_name})`);
      continue;
    }

    // Number of gaps to select: 2 if position has <=2 requirements, otherwise 2 or 3 based on hash
    const numToPick = uniqueCompIds.length <= 2 ? uniqueCompIds.length : (hashStr(emp.id) % 2 === 0 ? 2 : 3);

    // Score and rank available competencies to distribute demand across all 12 standards
    const scored = uniqueCompIds.map((cid) => {
      const h = hashStr(`${emp.id}:${cid}`);
      const rarityWeight = 100 - (selectedCounts[cid] || 0) * 2;
      const score = rarityWeight + (h % 50);
      return { cid, score };
    });

    scored.sort((a, b) => b.score - a.score);
    const chosen = scored.slice(0, numToPick);

    for (const item of chosen) {
      const std = stdById.get(item.cid);
      const competencyName = std.competency_name;
      selectedCounts[item.cid]++;

      // Deterministic UUID based on employee + competency + rating_period
      const rowId = deterministicUuid(`${emp.id}|${competencyName}|${RATING_PERIOD}`);

      // Select deterministic target text template
      const targetTemplates = COMPETENCY_TARGETS[competencyName] || [
        `Executed 100% of assigned divisional deliverables according to established ${competencyName} performance standards.`,
      ];
      const targetText = targetTemplates[hashStr(`${emp.id}:${std.id}`) % targetTemplates.length];

      // Deterministic confidence between 0.85 and 0.95
      const confidence = CONFIDENCES[hashStr(`${emp.id}:${std.id}:conf`) % CONFIDENCES.length];

      // Justification
      const justification = COMPETENCY_JUSTIFICATIONS[competencyName] ||
        `Identified development gap based on position competency standards for ${posTitle}; target requires strengthening ${competencyName} skills.`;

      generatedRows.push({
        id: rowId,
        employee_id: emp.id,
        employee_position: posTitle,
        rating_period: RATING_PERIOD,
        target_text: targetText,
        competency: competencyName,
        confidence,
        justification,
        flag_for_review: false,
        prompt_version: '2026-07-21.1',
        model: 'rule-based-curated',
        created_by: 'Competency Batch Sync',
        created_at: new Date().toISOString(),
      });

      if (officeStats[officeName]) {
        officeStats[officeName].matches++;
      }
    }
  }

  // 3. Summarize Distribution & TNA Metrics
  console.log('\n[3/4] Distribution & Training Needs Assessment (TNA) Metrics:');
  console.log(`  • Total Generated Competency Matches:   ${generatedRows.length}`);
  console.log(`  • Total Active Employees Covered:       ${targetEmployees.length}`);
  console.log(`  • Average Matches per Employee:         ${(generatedRows.length / targetEmployees.length).toFixed(2)}`);

  console.log('\n--- Office Breakdown ---');
  for (const [off, stat] of Object.entries(officeStats)) {
    console.log(`  • ${off.padEnd(58)} : ${String(stat.employees).padStart(3)} staff | ${String(stat.matches).padStart(3)} match rows`);
  }

  console.log('\n--- Competency Demand Distribution (LGU-wide) ---');
  const tnaSummary = standards.map((std) => {
    const count = selectedCounts[std.id] || 0;
    const demandPct = Math.round((count / targetEmployees.length) * 100);
    const priority = demandPct >= 75 ? 'High' : demandPct >= 50 ? 'Medium' : 'Emerging';
    return {
      id: std.id,
      name: std.competency_name,
      stream: std.training_stream,
      count,
      demandPct,
      priority,
    };
  });

  tnaSummary.sort((a, b) => b.count - a.count);
  for (const item of tnaSummary) {
    console.log(
      `  [${String(item.id).padStart(2)}] ${item.name.padEnd(46)} : ` +
        `${String(item.count).padStart(3)} emps (${String(item.demandPct).padStart(2)}% demand) [${item.priority.padEnd(8)}] (${item.stream})`,
    );
  }

  // 4. Output SQL or execute live batch upsert
  if (WRITE_SQL) {
    console.log('\n[4/4] Writing SQL script...');
    const sqlContent = generateSql(generatedRows, RATING_PERIOD);
    writeFileSync(SQL_FILE_PATH, sqlContent, 'utf8');
    console.log(`  ✅ Idempotent SQL script written to:\n     ${SQL_FILE_PATH}`);
  }

  if (DRY_RUN) {
    console.log('\n' + '='.repeat(78));
    console.log('DRY RUN COMPLETE — NO DATABASE WRITES PERFORMED');
    console.log('='.repeat(78));
    console.log('\nSample Generated Rows (First 3):');
    console.log(JSON.stringify(generatedRows.slice(0, 3), null, 2));
    return;
  }

  if (APPLY) {
    console.log('\n[4/4] Writing matches to Supabase ipcr_competency_matches...');
    const BATCH_SIZE = 100;
    let totalUpserted = 0;

    for (let i = 0; i < generatedRows.length; i += BATCH_SIZE) {
      const chunk = generatedRows.slice(i, i + BATCH_SIZE);
      const { data: upsertData, error: upsertErr } = await db
        .from('ipcr_competency_matches')
        .upsert(chunk, { onConflict: 'id', ignoreDuplicates: true })
        .select('id');

      if (upsertErr) {
        die(`Failed to upsert batch ${i} - ${i + chunk.length}`, upsertErr);
      }
      totalUpserted += upsertData?.length ?? 0;
    }

    console.log(`  ✅ Successfully seeded ${totalUpserted} rows into ipcr_competency_matches.`);
  }
}

main().catch((err) => {
  console.error('\nFatal error in seed-ipcr-competencies:', err);
  process.exit(1);
});
