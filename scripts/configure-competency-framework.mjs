// ─────────────────────────────────────────────────────────────────────────────
// scripts/configure-competency-framework.mjs
//
// Configures the PM Competency Framework (position_competency_requirements)
// across all 12 LGU standards for the union of active employees and job postings.
//
// Pipeline:
//   1. Stage 1: Base title normalization and inheritance
//      - Clean titles (strip parentheticals, & -> and, Maint -> Maintenance)
//      - Match against qualification_standards (levels: Basic >= 3, Intermediate >= 3.5, Advanced >= 4.5)
//      - Inherit existing generic Map rows
//   2. Stage 2: CSC LGU 5-tier Functional Archetype classification
//      - Executive / Department Head / Assistant Head
//      - Supervisory / Division Chief (with department-specific stream competencies)
//      - Professional & Technical (Health, Engineering, Social Welfare, Finance, IT, Legal, Supply)
//      - Administrative Support & Clerical
//      - Trades, Crafts, Labor & Protective Services
//
// Outputs:
//   - Idempotent SQL script: configure-competency-framework.sql
//   - Dry run report (--dry flag) or live Supabase upsert
// ─────────────────────────────────────────────────────────────────────────────

import { loadEnv, serviceClient, die } from './lib/ipcr-shared.mjs';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const SQL_FILE_PATH = resolve(ROOT, 'configure-competency-framework.sql');

const DRY_RUN = process.argv.includes('--dry');

/** Clean and normalize position title for base inheritance matching. */
export const cleanTitle = (s) =>
  String(s ?? '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/\bmaint\b/gi, 'Maintenance')
    .replace(/\s+/g, ' ')
    .trim();

export const normKey = (s) => cleanTitle(s).toLowerCase();

/** Convert numeric qualification standard level to Competency Framework tier. */
export function tierForLevel(level) {
  const n = Number(level);
  if (!Number.isFinite(n)) return null;
  if (n >= 4.5) return 'Advanced';
  if (n >= 3.5) return 'Intermediate';
  if (n >= 3.0) return 'Basic';
  return 'Basic';
}

/** Classify unmapped position into CSC LGU Functional Archetype and return standards. */
export function classifyArchetype(title, departments = []) {
  const t = title.toLowerCase();
  const depts = departments.map((d) => String(d ?? '').toLowerCase());
  const isDept = (kw) => depts.some((d) => d.includes(kw));

  // 1. Executive / Department Head / Assistant Head
  if (
    t.startsWith('city ') ||
    t.includes('city social welfare') ||
    t.startsWith('assistant city ') ||
    t.startsWith('head of ') ||
    t.includes('operations manager')
  ) {
    return {
      archetype: 'Executive / Department Head / Assistant Head',
      standards: [
        [1, 'Advanced'],
        [2, 'Advanced'],
        [4, 'Advanced'],
        [5, 'Advanced'],
        [6, 'Advanced'],
        [9, 'Advanced'],
        [10, 'Intermediate'],
        [12, 'Advanced'],
      ],
    };
  }

  // 2. Supervisory / Division Chief
  if (
    t.startsWith('supervising ') ||
    t.includes('division chief') ||
    t.includes('chief nurse') ||
    t.includes('chief dentist') ||
    t.includes('supervising nurse') ||
    t.includes('supervising midwife') ||
    t.includes('nurse v') ||
    t.includes('dentist iv') ||
    t.includes('engineer v') ||
    t.includes('engineer iv') ||
    t.includes('supply officer iv') ||
    t.includes('social welfare officer iv') ||
    t.includes('administrative officer v') ||
    t.includes('administrative officer iv') ||
    t.includes('procurement head') ||
    t.includes('general foreman')
  ) {
    const stds = [
      [1, 'Intermediate'],
      [2, 'Intermediate'],
      [4, 'Intermediate'],
      [6, 'Intermediate'],
      [9, 'Advanced'],
      [10, 'Intermediate'],
      [11, 'Intermediate'],
    ];

    const isFin =
      isDept('account') ||
      isDept('finance') ||
      isDept('general services') ||
      t.includes('supply') ||
      t.includes('procurement');

    const isHealthSoc =
      isDept('health') ||
      isDept('social welfare') ||
      t.includes('nurse') ||
      t.includes('dentist') ||
      t.includes('midwife') ||
      t.includes('social welfare');

    const isEng =
      isDept('engineer') ||
      t.includes('engineer') ||
      t.includes('building') ||
      t.includes('foreman');

    if (isFin) stds.push([5, 'Intermediate']);
    if (isHealthSoc) {
      stds.push([3, 'Intermediate']);
      stds.push([7, 'Intermediate']);
    }
    if (isEng) stds.push([7, 'Advanced']);

    return {
      archetype: 'Supervisory / Division Chief',
      standards: stds,
    };
  }

  // 3. Administrative Support & Clerical
  if (
    t.includes('bookbinder') ||
    t.includes('stenograph') ||
    t.includes('storekeeper') ||
    t.includes('computer operator') ||
    t.includes('data encoder') ||
    t.includes('clerk') ||
    t.includes('buyer') ||
    t.includes('admin assistant') ||
    t.includes('administrative assistant') ||
    (t.includes('admin aide') && !t.includes('utility') && !t.includes('laborer') && !t.includes('driver')) ||
    (t.includes('administrative aide') && !t.includes('utility') && !t.includes('laborer') && !t.includes('driver')) ||
    t === 'admin aid i' ||
    t === 'administrative aide ii' ||
    t === 'ao ii'
  ) {
    const isCompOp =
      t.includes('computer operator') ||
      t.includes('data encoder') ||
      t.includes('encoder');
    const std8 = isCompOp ? 'Intermediate' : 'Basic';
    const stds = [
      [8, std8],
      [9, 'Basic'],
      [11, 'Basic'],
      [12, 'Basic'],
    ];
    if (
      t.includes('admin assistant iii') ||
      t.includes('sr bookkeeper') ||
      t.includes('senior bookkeeper')
    ) {
      stds.push([10, 'Basic']);
    }
    return {
      archetype: 'Administrative Support & Clerical',
      standards: stds,
    };
  }

  // 4. Trades, Crafts, Labor & Protective Services
  if (
    t.includes('utility') ||
    t.includes('laborer') ||
    t.includes('driver') ||
    t.includes('carpenter') ||
    t.includes('plumber') ||
    t.includes('electrician') ||
    t.includes('heavy equipment operator') ||
    t.includes('mechanic') ||
    t.includes('security guard') ||
    t.includes('cleaner') ||
    t.includes('janitor') ||
    t.includes('maintenance man') ||
    t.includes('contractor')
  ) {
    const stds = [
      [6, 'Basic'],
      [7, 'Basic'],
      [9, 'Basic'],
    ];
    if (t.includes('driver') || t.includes('security guard')) {
      stds.push([12, 'Basic']);
    }
    return {
      archetype: 'Trades, Crafts, Labor & Protective Services',
      standards: stds,
    };
  }

  // 5. Professional & Technical (Department/Discipline streams)

  // Health / Medical
  if (
    t.includes('medical') ||
    t.includes('nurse') ||
    t.includes('dentist') ||
    t.includes('midwife') ||
    t.includes('nutritionist') ||
    t.includes('sanitation inspector') ||
    t.includes('pharmacist') ||
    isDept('health')
  ) {
    return {
      archetype: 'Professional & Technical: Health / Medical',
      standards: [
        [3, 'Intermediate'],
        [7, 'Intermediate'],
        [9, 'Intermediate'],
        [11, 'Intermediate'],
        [12, 'Basic'],
      ],
    };
  }

  // Engineering / Architecture
  if (
    t.includes('engineer') ||
    t.includes('architect') ||
    t.includes('draftsman') ||
    t.includes('engineering aide') ||
    t.includes('engineering assistant') ||
    isDept('engineer')
  ) {
    return {
      archetype: 'Professional & Technical: Engineering / Architecture',
      standards: [
        [1, 'Basic'],
        [4, 'Intermediate'],
        [7, 'Intermediate'],
        [9, 'Intermediate'],
        [10, 'Basic'],
        [11, 'Basic'],
      ],
    };
  }

  // Social Welfare
  if (
    t.includes('social welfare') ||
    t.includes('childhood care') ||
    isDept('social welfare')
  ) {
    return {
      archetype: 'Professional & Technical: Social Welfare',
      standards: [
        [3, 'Intermediate'],
        [7, 'Intermediate'],
        [9, 'Intermediate'],
        [11, 'Intermediate'],
        [12, 'Intermediate'],
      ],
    };
  }

  // Supply & Logistics (checked before generic finance / IT)
  if (
    t.includes('supply officer') ||
    t.includes('logistics') ||
    t.includes('inventory') ||
    t.includes('warehouse') ||
    t.includes('inspection lead')
  ) {
    return {
      archetype: 'Professional & Technical: Supply & Logistics',
      standards: [
        [5, 'Intermediate'],
        [6, 'Intermediate'],
        [9, 'Intermediate'],
        [11, 'Intermediate'],
      ],
    };
  }

  // Finance / Accounting
  if (
    t.includes('accountant') ||
    t.includes('accounts analyst') ||
    t.includes('bookkeeper') ||
    isDept('account') ||
    isDept('finance')
  ) {
    return {
      archetype: 'Professional & Technical: Finance / Accounting',
      standards: [
        [1, 'Basic'],
        [5, 'Intermediate'],
        [6, 'Intermediate'],
        [9, 'Intermediate'],
        [10, 'Intermediate'],
        [11, 'Intermediate'],
      ],
    };
  }

  // IT & Systems
  if (
    t.includes('information') ||
    t.includes('programmer') ||
    t.includes('systems analyst') ||
    t.includes('network admin') ||
    t.includes('computer') ||
    t.includes('instructor') ||
    t.includes('pdo') ||
    isDept('information technology')
  ) {
    return {
      archetype: 'Professional & Technical: IT & Systems',
      standards: [
        [4, 'Intermediate'],
        [8, 'Advanced'],
        [9, 'Intermediate'],
        [11, 'Intermediate'],
      ],
    };
  }

  // Legal
  if (
    t.includes('attorney') ||
    t.includes('legal') ||
    t.includes('paralegal') ||
    isDept('legal')
  ) {
    return {
      archetype: 'Professional & Technical: Legal',
      standards: [
        [2, 'Intermediate'],
        [6, 'Intermediate'],
        [9, 'Advanced'],
        [10, 'Intermediate'],
        [11, 'Intermediate'],
      ],
    };
  }

  // Fallback Supply & Logistics for General Services Dept
  if (isDept('general services')) {
    return {
      archetype: 'Professional & Technical: Supply & Logistics',
      standards: [
        [5, 'Intermediate'],
        [6, 'Intermediate'],
        [9, 'Intermediate'],
        [11, 'Intermediate'],
      ],
    };
  }

  // Default fallback for any remaining professional role
  return {
    archetype: 'Professional & Technical: General Administration',
    standards: [
      [1, 'Basic'],
      [2, 'Basic'],
      [6, 'Intermediate'],
      [9, 'Intermediate'],
      [10, 'Basic'],
      [11, 'Basic'],
    ],
  };
}

/** Generate idempotent SQL script. */
function generateSql(rows) {
  const header = `-- -----------------------------------------------------------------------------
-- configure-competency-framework.sql
-- Generated at: ${new Date().toISOString()}
-- Total rows: ${rows.length}
--
-- Idempotent insert of PM Competency Framework requirements.
-- Preserves all existing rows via ON CONFLICT (position_title, competency_id) DO NOTHING.
-- -----------------------------------------------------------------------------

INSERT INTO position_competency_requirements (
  position_title,
  competency_id,
  proficiency_level,
  source,
  updated_by,
  updated_at
)
VALUES
`;

  const values = rows
    .map(
      (r) =>
        `  ('${r.position_title.replace(/'/g, "''")}', ${r.competency_id}, '${r.proficiency_level}', '${r.source}', '${r.updated_by}', '${r.updated_at}')`,
    )
    .join(',\n');

  const footer = `\nON CONFLICT (position_title, competency_id) DO NOTHING;\n`;

  return header + values + footer;
}

async function main() {
  const db = serviceClient(loadEnv());

  console.log('Fetching database tables for competency framework configuration...');
  const [
    { data: reqs, error: reqErr },
    { data: qs, error: qsErr },
    { data: stds, error: stdErr },
    { data: emps, error: empErr },
    { data: jobs, error: jobErr },
  ] = await Promise.all([
    db
      .from('position_competency_requirements')
      .select('position_title, competency_id, proficiency_level, source'),
    db.from('qualification_standards').select('*'),
    db.from('competency_standards').select('*').order('id'),
    db
      .from('employees_with_department')
      .select('current_position, department, status')
      .eq('status', 'Active'),
    db.from('job_postings').select('title, department'),
  ]);

  if (reqErr) die('Failed to fetch position_competency_requirements', reqErr);
  if (qsErr) die('Failed to fetch qualification_standards', qsErr);
  if (stdErr) die('Failed to fetch competency_standards', stdErr);
  if (empErr) die('Failed to fetch employees_with_department', empErr);
  if (jobErr) die('Failed to fetch job_postings', jobErr);

  console.log(`Retrieved:`);
  console.log(`  - Existing Map rows: ${reqs?.length ?? 0}`);
  console.log(`  - Qualification Standards rows: ${qs?.length ?? 0}`);
  console.log(`  - Competency Standards: ${stds?.length ?? 0}`);
  console.log(`  - Active Employees: ${emps?.length ?? 0}`);
  console.log(`  - Job Postings: ${jobs?.length ?? 0}`);

  // Build target union of positions
  const empPositions = new Set(
    (emps ?? [])
      .map((e) => String(e.current_position ?? '').trim())
      .filter(Boolean),
  );
  const jobTitles = new Set(
    (jobs ?? []).map((j) => String(j.title ?? '').trim()).filter(Boolean),
  );
  const unionPositions = [...new Set([...empPositions, ...jobTitles])].sort();

  // Position -> Departments map
  const posDepts = new Map();
  for (const e of emps ?? []) {
    const p = String(e.current_position ?? '').trim();
    if (!p) continue;
    if (!posDepts.has(p)) posDepts.set(p, new Set());
    if (e.department) posDepts.get(p).add(e.department);
  }
  for (const j of jobs ?? []) {
    const p = String(j.title ?? '').trim();
    if (!p) continue;
    if (!posDepts.has(p)) posDepts.set(p, new Set());
    if (j.department) posDepts.get(p).add(j.department);
  }

  // Existing positions & pairs
  const existingByTitle = new Map();
  const existingPairs = new Set();
  for (const r of reqs ?? []) {
    if (!existingByTitle.has(r.position_title)) existingByTitle.set(r.position_title, []);
    existingByTitle.get(r.position_title).push(r);
    existingPairs.add(`${r.position_title}|${r.competency_id}`);
  }

  // Generic Map rows indexed by normKey
  const genericMap = new Map();
  for (const r of reqs ?? []) {
    const k = normKey(r.position_title);
    if (!genericMap.has(k)) genericMap.set(k, []);
    genericMap.get(k).push(r);
  }

  // Qualification standards indexed by normKey
  const qsByKey = new Map();
  for (const q of qs ?? []) {
    const lvl = tierForLevel(q.required_proficiency_level);
    if (!lvl) continue;
    const k = normKey(q.position);
    if (!qsByKey.has(k)) qsByKey.set(k, []);
    qsByKey.get(k).push({
      competency_id: Number(q.competency_id),
      proficiency_level: lvl,
    });
  }

  const generatedRows = [];
  const generatedByPosition = new Map(); // pos -> Map(compId -> level)
  const positionStage = new Map(); // pos -> stage label
  const seenPairs = new Set();

  const addRow = (pos, compId, level, stage) => {
    const id = Number(compId);
    if (!Number.isFinite(id) || !level) return;
    const pair = `${pos}|${id}`;
    if (existingPairs.has(pair) || seenPairs.has(pair)) return;
    seenPairs.add(pair);

    if (!generatedByPosition.has(pos)) generatedByPosition.set(pos, new Map());
    generatedByPosition.get(pos).set(id, level);

    generatedRows.push({
      position_title: pos,
      competency_id: id,
      proficiency_level: level,
      source: 'auto-synced',
      updated_by: 'migration:configure-competency-framework',
      updated_at: new Date().toISOString(),
    });

    if (!positionStage.has(pos)) positionStage.set(pos, stage);
  };

  // Process all positions in the union
  for (const pos of unionPositions) {
    if (existingByTitle.has(pos)) {
      positionStage.set(pos, 'Existing Curated Map');
      continue;
    }

    const n = normKey(pos);
    let matchedStage1 = false;

    // Stage 1: Qualification Standards match
    if (qsByKey.has(n)) {
      for (const q of qsByKey.get(n)) {
        addRow(pos, q.competency_id, q.proficiency_level, 'Stage 1: QS Inheritance');
      }
      matchedStage1 = true;
    }

    // Stage 1: Generic Map match
    if (genericMap.has(n)) {
      for (const r of genericMap.get(n)) {
        addRow(
          pos,
          r.competency_id,
          r.proficiency_level,
          matchedStage1 ? 'Stage 1: QS + Generic Inheritance' : 'Stage 1: Generic Map Inheritance',
        );
      }
      matchedStage1 = true;
    }

    if (matchedStage1) continue;

    // Stage 2: CSC LGU 5-tier Functional Archetypes
    const depts = [...(posDepts.get(pos) ?? [])];
    const { archetype, standards } = classifyArchetype(pos, depts);

    for (const [compId, level] of standards) {
      addRow(pos, compId, level, `Stage 2: ${archetype}`);
    }
  }

  // Diagnostics and stats
  const stageStats = {};
  for (const pos of unionPositions) {
    const stage = positionStage.get(pos) || 'Unmapped';
    stageStats[stage] = (stageStats[stage] || 0) + 1;
  }

  const unmappedPositions = unionPositions.filter(
    (p) => !existingByTitle.has(p) && !generatedByPosition.has(p),
  );

  console.log('\n================ CONFIGURATION AUDIT REPORT ================');
  console.log(`Active Union Target Positions: ${unionPositions.length}`);
  console.log(`  - Already covered in Map:    ${existingByTitle.size} (of which ${unionPositions.filter((p) => existingByTitle.has(p)).length} are in active union)`);
  console.log(`  - Newly mapped positions:    ${generatedByPosition.size}`);
  console.log(`  - Unmapped positions:        ${unmappedPositions.length}`);
  console.log(`Total new requirement rows:    ${generatedRows.length}`);
  console.log('\nCoverage by Pipeline Stage:');
  for (const [stg, count] of Object.entries(stageStats)) {
    console.log(`  • ${stg.padEnd(46)} : ${count} positions`);
  }

  // Export SQL file
  const sqlContent = generateSql(generatedRows);
  writeFileSync(SQL_FILE_PATH, sqlContent, 'utf8');
  console.log(`\nGenerated idempotent SQL script written to:\n  ${SQL_FILE_PATH}`);

  if (unmappedPositions.length > 0) {
    console.error('\n❌ Error: The following positions could not be mapped:');
    unmappedPositions.forEach((p) => console.error(`  - ${p}`));
    process.exit(1);
  }

  console.log('\n✅ 100% of union positions are successfully mapped (0 unmapped).');

  if (DRY_RUN) {
    console.log('\n[DRY RUN MODE] No database writes were performed.');
    console.log('Sample generated rows (first 10 of ' + generatedRows.length + '):');
    console.log(JSON.stringify(generatedRows.slice(0, 10), null, 2));
    return;
  }

  // Batch insert into Supabase
  console.log(`\nWriting ${generatedRows.length} rows to position_competency_requirements...`);
  const BATCH_SIZE = 100;
  let totalInserted = 0;

  for (let i = 0; i < generatedRows.length; i += BATCH_SIZE) {
    const chunk = generatedRows.slice(i, i + BATCH_SIZE);
    const { data: insData, error: insErr } = await db
      .from('position_competency_requirements')
      .upsert(chunk, { onConflict: 'position_title,competency_id', ignoreDuplicates: true })
      .select('position_title, competency_id');

    if (insErr) {
      die(`Failed to upsert batch ${i} - ${i + chunk.length}`, insErr);
    }
    totalInserted += insData?.length ?? 0;
  }

  console.log(`✅ Successfully backfilled ${totalInserted} rows into position_competency_requirements.`);
}

main().catch((err) => {
  console.error('\nFatal error in configure-competency-framework:', err);
  process.exit(1);
});
