// ─────────────────────────────────────────────────────────────────────────────
// Verification script for Module 3 Competency Framework & Gap Analysis
// Run with: node scripts/verify-competency-framework.mjs
// ─────────────────────────────────────────────────────────────────────────────
import { loadEnv, serviceClient } from './lib/ipcr-shared.mjs';

const db = serviceClient(loadEnv());
const norm = (s) => String(s ?? '').trim();
const lc = (s) => norm(s).toLowerCase();

async function fetchAllRows(tableName, selectColumns = '*') {
  const PAGE_SIZE = 1000;
  let offset = 0;
  const rows = [];
  while (true) {
    const { data, error } = await db
      .from(tableName)
      .select(selectColumns)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows;
}

async function verify() {
  console.log('='.repeat(78));
  console.log('VERIFICATION: PM COMPETENCY FRAMEWORK & POSITION REQUIREMENTS');
  console.log('='.repeat(78));

  // 1. Load data
  const [reqs, standards, employees, jobPostings] = await Promise.all([
    fetchAllRows('position_competency_requirements', 'id, position_title, competency_id, proficiency_level, source'),
    fetchAllRows('competency_standards', 'id, competency_name, training_stream'),
    fetchAllRows('employees_with_department', 'id, employee_id, full_name, current_position, department, status'),
    fetchAllRows('job_postings', 'id, title, department, status'),
  ]);

  const activeEmployees = employees.filter((e) => norm(e.status).toLowerCase() === 'active');
  const stdById = new Map(standards.map((s) => [s.id, s]));

  // Index requirements by position_title (lowercased)
  const reqsByPos = new Map();
  const sourceBreakdown = { manual: 0, 'auto-synced': 0, undefined_or_other: 0 };
  const levelBreakdown = { Basic: 0, Intermediate: 0, Advanced: 0, other: 0 };

  for (const r of reqs) {
    const pKey = lc(r.position_title);
    if (!reqsByPos.has(pKey)) reqsByPos.set(pKey, []);
    reqsByPos.get(pKey).push(r);

    const src = r.source === 'auto-synced' ? 'auto-synced' : r.source === 'manual' ? 'manual' : 'undefined_or_other';
    sourceBreakdown[src] = (sourceBreakdown[src] || 0) + 1;

    const lvl = r.proficiency_level;
    if (lvl === 'Basic' || lvl === 'Intermediate' || lvl === 'Advanced') {
      levelBreakdown[lvl]++;
    } else {
      levelBreakdown.other++;
    }
  }

  // Active employee positions
  const activeEmpPositions = [...new Set(activeEmployees.map((e) => norm(e.current_position)).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b),
  );

  // Missing active positions
  const missingActivePositions = [];
  for (const pos of activeEmpPositions) {
    if (!reqsByPos.has(lc(pos))) {
      const empCount = activeEmployees.filter((e) => norm(e.current_position) === pos).length;
      missingActivePositions.push({ position: pos, employeeCount: empCount });
    }
  }

  // Job posting positions
  const jobTitles = [...new Set(jobPostings.map((j) => norm(j.title)).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
  const missingJobTitles = [];
  for (const title of jobTitles) {
    if (!reqsByPos.has(lc(title))) {
      missingJobTitles.push(title);
    }
  }

  // Competency standards coverage
  const stdCountMap = new Map();
  standards.forEach((s) => stdCountMap.set(s.id, 0));
  reqs.forEach((r) => {
    if (stdCountMap.has(r.competency_id)) {
      stdCountMap.set(r.competency_id, stdCountMap.get(r.competency_id) + 1);
    }
  });

  // Report
  console.log(`\n1. ROW COUNTS & SOURCE BREAKDOWN`);
  console.log(`   Total Requirements in Map:      ${reqs.length}`);
  console.log(`   Distinct Positions in Map:      ${reqsByPos.size}`);
  console.log(`   Source 'manual':                ${sourceBreakdown.manual}`);
  console.log(`   Source 'auto-synced':           ${sourceBreakdown['auto-synced']}`);
  console.log(`   Source other/null (treated man):${sourceBreakdown.undefined_or_other}`);
  console.log(`   Level Basic (numeric 3):        ${levelBreakdown.Basic}`);
  console.log(`   Level Intermediate (numeric 4): ${levelBreakdown.Intermediate}`);
  console.log(`   Level Advanced (numeric 5):     ${levelBreakdown.Advanced}`);

  console.log(`\n2. ACTIVE EMPLOYEES COVERAGE`);
  console.log(`   Active Employees:               ${activeEmployees.length}`);
  console.log(`   Distinct Active Positions:      ${activeEmpPositions.length}`);
  console.log(`   Positions With Requirements:    ${activeEmpPositions.length - missingActivePositions.length}`);
  console.log(`   Positions WITHOUT Requirements: ${missingActivePositions.length}`);

  if (missingActivePositions.length === 0) {
    console.log(`   ✅ SUCCESS: 100% of active employee positions have competency requirements configured!`);
  } else {
    console.log(`   ⚠️ WARNING: ${missingActivePositions.length} active positions are unmapped:`);
    missingActivePositions.slice(0, 10).forEach((m) => {
      console.log(`      - "${m.position}" (${m.employeeCount} active employee${m.employeeCount > 1 ? 's' : ''})`);
    });
    if (missingActivePositions.length > 10) {
      console.log(`      ... and ${missingActivePositions.length - 10} more`);
    }
  }

  console.log(`\n3. JOB POSTINGS COVERAGE`);
  console.log(`   Distinct Job Posting Titles:    ${jobTitles.length}`);
  console.log(`   Job Titles With Requirements:   ${jobTitles.length - missingJobTitles.length}`);
  console.log(`   Job Titles WITHOUT Requirements:${missingJobTitles.length}`);

  console.log(`\n4. COMPETENCY STANDARDS UTILIZATION`);
  let zeroUsageStandards = 0;
  standards.forEach((s) => {
    const count = stdCountMap.get(s.id) || 0;
    if (count === 0) zeroUsageStandards++;
    console.log(
      `   [${String(s.id).padStart(2)}] ${s.competency_name.padEnd(45)} (${s.training_stream.padEnd(23)}): ${count} position${count === 1 ? '' : 's'}`,
    );
  });
  if (zeroUsageStandards === 0) {
    console.log(`   ✅ All 12 competency standards are actively utilized across position requirements.`);
  }

  console.log(`\n5. SPOT CHECK ARCHETYPE SAMPLES`);
  const samples = [
    'City Government Department Head II',
    'Division Chief',
    'Medical Officer III',
    'Engineer II',
    'Administrative Officer IV',
    'Administrative Aide VI',
    'Heavy Equipment Operator',
    'Security Guard I',
  ];
  for (const s of samples) {
    const matchKey = [...reqsByPos.keys()].find((k) => k.includes(lc(s)) || lc(s).includes(k));
    if (matchKey) {
      const pReqs = reqsByPos.get(matchKey);
      console.log(`   ✓ "${matchKey}" (${pReqs.length} reqs):`);
      pReqs.slice(0, 4).forEach((r) => {
        const std = stdById.get(r.competency_id);
        console.log(`       - ${std?.competency_name}: ${r.proficiency_level} (${r.source || 'manual'})`);
      });
      if (pReqs.length > 4) console.log(`       ... + ${pReqs.length - 4} more`);
    } else {
      console.log(`   - "${s}": Not found in requirements yet`);
    }
  }

  console.log('\n' + '='.repeat(78));
  return {
    totalReqs: reqs.length,
    distinctPositionsInMap: reqsByPos.size,
    missingActivePositionsCount: missingActivePositions.length,
    missingJobTitlesCount: missingJobTitles.length,
  };
}

verify().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});
