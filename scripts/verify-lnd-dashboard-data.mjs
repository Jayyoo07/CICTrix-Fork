// ─────────────────────────────────────────────────────────────────────────────
// Verification Suite: L&D Dashboard Data Integrity & Aggregation
//
// Verifies:
// 1. Current DB counts for ipcr_competency_matches, training_enrollments,
//    idp_submissions, and training_sessions.
// 2. computeNeedsAssessment query simulation (12 competencies, canonical 5 offices).
// 3. trainingCompliance query simulation (met + partial + none = 100%).
// 4. tagSelectionsByOffice simulation (no null/NaN, valid totals and shapes).
//
// Run with:
//   node scripts/verify-lnd-dashboard-data.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { loadEnv, serviceClient } from './lib/ipcr-shared.mjs';

const db = serviceClient(loadEnv());

// ── Shared Constants & Helpers ────────────────────────────────────────────────

export const CANONICAL_5_OFFICES = [
  'Office of The City Accountant',
  'Office of The City Engineer',
  'Office of The City Health Officer',
  'Office of The City Social Welfare and Development Officer',
  'Office of the City General Services Officer',
];

export const COMPETENCY_LIST = [
  'Knowledge of Local Governance',
  'Public Administration Principles',
  'Community Engagement Skills',
  'Project Management in a Public Setting',
  'Fiscal Management/Budgeting for LGU',
  'Transparency and Accountability Practices',
  'Disaster Risk Reduction and Management',
  'Digital Literacy for Government Services',
  'Ethical Conduct and Public Service Standards',
  'Technical Writing for Government Documents',
  'Data and Records Management and Organization',
  'Public Communication Skills',
];

export const COMPETENCY_SHORT = {
  'Knowledge of Local Governance': 'Local governance',
  'Public Administration Principles': 'Public admin principles',
  'Community Engagement Skills': 'Community engagement',
  'Project Management in a Public Setting': 'Project mgmt (public)',
  'Fiscal Management/Budgeting for LGU': 'Fiscal mgmt/budgeting',
  'Transparency and Accountability Practices': 'Transparency/accountability',
  'Disaster Risk Reduction and Management': 'DRRM',
  'Digital Literacy for Government Services': 'Digital literacy',
  'Ethical Conduct and Public Service Standards': 'Ethical conduct',
  'Technical Writing for Government Documents': 'Technical writing',
  'Data and Records Management and Organization': 'Data/records mgmt',
  'Public Communication Skills': 'Public communication',
};

export const CAREER_NEED_OPTIONS = [
  'JOB SPECIFIC TRAINING',
  'LEADERSHIP AND SUPERVISORY TRAINING',
  'COMPUTER LITERACY',
];

export const PERSONAL_GOAL_OPTIONS = [
  'FINANCIAL LITERACY',
  'GENERAL HEALTH AND WELLNESS',
  'COMMUNICATION SKILLS',
  'PERSONAL DEVELOPMENT',
];

export const IDP_TAGS = [
  { tag: CAREER_NEED_OPTIONS[0], label: 'Job specific', kind: 'career' },
  { tag: CAREER_NEED_OPTIONS[1], label: 'Leadership & supervisory', kind: 'career' },
  { tag: CAREER_NEED_OPTIONS[2], label: 'Computer literacy', kind: 'career' },
  { tag: PERSONAL_GOAL_OPTIONS[0], label: 'Financial literacy', kind: 'personal' },
  { tag: PERSONAL_GOAL_OPTIONS[1], label: 'Health & wellness', kind: 'personal' },
  { tag: PERSONAL_GOAL_OPTIONS[2], label: 'Communication', kind: 'personal' },
  { tag: PERSONAL_GOAL_OPTIONS[3], label: 'Personal development', kind: 'personal' },
];

const KNOWN_IDP_TAGS = new Set(IDP_TAGS.map((t) => t.tag));

export const normComp = (s) => String(s ?? '').trim().toLowerCase().replace(/\s*\/\s*/g, '/');
export const normOffice = (s) => String(s ?? '').trim().toLowerCase();
export const normalizeTag = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toUpperCase();

export const pct = (n, d) => (d > 0 ? Math.round((n / d) * 100) : 0);

export const priorityOf = (demand) =>
  demand >= 75 ? 'High' : demand >= 50 ? 'Medium' : 'Emerging';

export const endOfDay = (iso) => {
  const d = new Date(iso);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
};

export const effectiveStatus = (e, now = new Date()) => {
  if (e.status === 'Cancelled') return 'Cancelled';
  const t = now.getTime();
  if (t < new Date(e.startDate).getTime()) return 'Scheduled';
  if (t <= endOfDay(e.endDate ?? e.startDate)) return 'Ongoing';
  return 'Completed';
};

export function normalizeSemesterKey(label) {
  const s = String(label ?? '').toLowerCase();
  const year = s.match(/\b(20\d{2})\b/)?.[1];
  if (!year) return null;
  const half = /\b(jan|feb|mar|apr|may|jun)/.test(s)
    ? 'H1'
    : /\b(jul|aug|sep|oct|nov|dec)/.test(s)
      ? 'H2'
      : null;
  return half ? `${year}-${half}` : null;
}

// ── Test Runner Infrastructure ────────────────────────────────────────────────

let passedCount = 0;
let failedCount = 0;

function assert(condition, message) {
  if (!condition) {
    failedCount++;
    console.error(`  ❌ FAIL: ${message}`);
    throw new Error(message);
  } else {
    passedCount++;
    console.log(`  ✅ PASS: ${message}`);
  }
}

// ── Suite 1: Current DB Counts & Schema Baselines ─────────────────────────────

async function verifyTableCounts() {
  console.log('\n' + '='.repeat(78));
  console.log('1. CURRENT DATABASE COUNTS & BASELINES');
  console.log('='.repeat(78));

  const tables = [
    'ipcr_competency_matches',
    'training_enrollments',
    'idp_submissions',
    'training_sessions',
    'competency_standards',
    'departments',
  ];

  const counts = {};
  for (const table of tables) {
    const { count, error } = await db.from(table).select('*', { count: 'exact', head: true });
    if (error) throw new Error(`Failed to query count for ${table}: ${error.message}`);
    counts[table] = count ?? 0;
    console.log(`  • ${table.padEnd(26)} : ${count} rows`);
  }

  // Active departments check
  const { data: activeDepts, error: deptErr } = await db
    .from('departments')
    .select('id, name, code, is_active')
    .is('parent_department_id', null)
    .eq('is_active', true);
  if (deptErr) throw new Error(`Failed to query active departments: ${deptErr.message}`);

  assert(activeDepts.length === 5, `Active top-level departments count is 5 (got ${activeDepts.length})`);

  const activeDeptNames = activeDepts.map((d) => d.name);
  for (const expected of CANONICAL_5_OFFICES) {
    const found = activeDeptNames.some((n) => normOffice(n) === normOffice(expected));
    assert(found, `Canonical office "${expected}" is present and active`);
  }

  // Competency standards check
  const { data: standards, error: stdErr } = await db
    .from('competency_standards')
    .select('id, competency_name, training_stream');
  if (stdErr) throw new Error(`Failed to query competency_standards: ${stdErr.message}`);

  assert(standards.length === 12, `Competency standards count is 12 (got ${standards.length})`);

  const standardNames = standards.map((s) => s.competency_name);
  for (const comp of COMPETENCY_LIST) {
    const found = standardNames.some((n) => normComp(n) === normComp(comp));
    assert(found, `Competency standard "${comp}" is defined`);
  }

  return { counts, activeDepts, standards };
}

// ── Suite 2: computeNeedsAssessment Query Simulation ─────────────────────────

async function verifyNeedsAssessmentSimulation(activeDepts, standards) {
  console.log('\n' + '='.repeat(78));
  console.log('2. COMPUTE NEEDS ASSESSMENT QUERY SIMULATION');
  console.log('='.repeat(78));

  // 1. Load active employees
  const { data: emps, error: empErr } = await db
    .from('employees_with_department')
    .select('id, department, status')
    .eq('status', 'Active');
  if (empErr) throw new Error(`Failed to load active employees: ${empErr.message}`);

  const activeOfficeSet = new Set(activeDepts.map((d) => normOffice(d.name)));
  const isActiveOffice = (office) => activeOfficeSet.size === 0 || activeOfficeSet.has(normOffice(office));

  const officeByEmp = new Map();
  const totalByOffice = new Map();
  for (const e of emps ?? []) {
    const office = e.department ?? 'Unassigned office';
    if (!isActiveOffice(office)) continue;
    officeByEmp.set(String(e.id), office);
    totalByOffice.set(office, (totalByOffice.get(office) ?? 0) + 1);
  }

  const totalLgu = officeByEmp.size;
  console.log(`  • Active employees in active offices: ${totalLgu}`);
  assert(totalLgu > 0, `Active employee headcount in active offices is > 0 (got ${totalLgu})`);

  // 2. Build canonical map and training streams from competency_standards
  const titleCase = (s) => String(s ?? '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  const canonicalMap = new Map();
  const categoryOf = new Map();
  for (const s of standards) {
    const raw = String(s.competency_name);
    canonicalMap.set(normComp(raw), raw);
    categoryOf.set(raw, titleCase(s.training_stream));
  }
  const resolveCompetency = (name) => canonicalMap.get(normComp(name)) ?? name;

  // Verify normalization of slashed competency
  const slashedVariant = 'Fiscal Management / Budgeting for LGU';
  assert(
    resolveCompetency(slashedVariant) === 'Fiscal Management/Budgeting for LGU',
    `Normalization handles spacing in slashed competencies ("${slashedVariant}" -> "Fiscal Management/Budgeting for LGU")`
  );

  // 3. Load matches and check semester filter
  const { data: transitionRow } = await db
    .from('semester_transition_state')
    .select('current_cycle_id')
    .eq('id', 1)
    .maybeSingle();

  let lndPeriodKey = null;
  if (transitionRow?.current_cycle_id != null) {
    const { data: cycle } = await db
      .from('performance_cycles')
      .select('title')
      .eq('id', transitionRow.current_cycle_id)
      .maybeSingle();
    lndPeriodKey = normalizeSemesterKey(cycle?.title);
  }
  console.log(`  • L&D Source Period Key: ${lndPeriodKey ?? 'null (no pinned cycle, all matches in scope)'}`);

  const { data: matches, error: mErr } = await db
    .from('ipcr_competency_matches')
    .select('employee_id, competency, rating_period')
    .not('competency', 'is', null)
    .not('employee_id', 'is', null);
  if (mErr) throw new Error(`Failed to load competency matches: ${mErr.message}`);

  const matchesInScope = (matches ?? []).filter((m) => {
    if (!lndPeriodKey) return true;
    const key = normalizeSemesterKey(m.rating_period);
    return key == null || key === lndPeriodKey;
  });

  console.log(`  • Competency matches in scope: ${matchesInScope.length} of ${matches?.length ?? 0}`);

  // 4. Aggregate by competency and office
  const byComp = new Map();
  const affectedByComp = new Map();
  for (const m of matchesInScope) {
    const comp = resolveCompetency(String(m.competency));
    const emp = String(m.employee_id);
    const office = officeByEmp.get(emp);
    if (!office) continue;
    if (!byComp.has(comp)) byComp.set(comp, new Map());
    const officeMap = byComp.get(comp);
    if (!officeMap.has(office)) officeMap.set(office, new Set());
    officeMap.get(office).add(emp);
    if (!affectedByComp.has(comp)) affectedByComp.set(comp, new Set());
    affectedByComp.get(comp).add(emp);
  }

  const needs = [];
  for (const [competency, officeMap] of byComp) {
    const offices = [...officeMap.entries()]
      .map(([office, set]) => {
        const total = totalByOffice.get(office) ?? set.size;
        return { office, affected: set.size, total, demand: pct(set.size, total) };
      })
      .sort((a, b) => b.demand - a.demand || b.affected - a.affected);

    const affected = affectedByComp.get(competency)?.size ?? 0;
    const demand = pct(affected, totalLgu);
    needs.push({
      competency,
      category: categoryOf.get(competency) ?? 'Technical',
      demand,
      priority: priorityOf(demand),
      peakOfficeDemand: offices[0]?.demand ?? 0,
      offices,
    });
  }
  needs.sort((a, b) => b.demand - a.demand);

  // 5. Test Frontend Mapping (COMPETENCY_LIST mapping in LNDDashboard.tsx)
  const competencyRows = COMPETENCY_LIST.map((comp) => {
    const need = needs.find((n) => normComp(n.competency) === normComp(comp));
    return {
      competency: comp,
      short: COMPETENCY_SHORT[comp] ?? comp,
      affected: need?.offices.reduce((sum, o) => sum + o.affected, 0) ?? 0,
      byOffice: new Map((need?.offices ?? []).map((o) => [o.office, o.demand])),
    };
  }).sort((a, b) => b.affected - a.affected || a.competency.localeCompare(b.competency));

  assert(competencyRows.length === 12, `Frontend mapped exactly 12 competency rows (got ${competencyRows.length})`);

  for (const row of competencyRows) {
    assert(typeof row.affected === 'number' && !Number.isNaN(row.affected) && row.affected >= 0,
      `Competency "${row.short}" has valid non-negative affected count (${row.affected})`);
    for (const [office, demand] of row.byOffice.entries()) {
      assert(activeOfficeSet.has(normOffice(office)), `Office "${office}" in need results is an active canonical office`);
      assert(typeof demand === 'number' && !Number.isNaN(demand) && demand >= 0 && demand <= 100,
        `Demand percentage for ${office} in "${row.short}" is valid 0-100% (${demand}%)`);
    }
  }

  const competenciesWithGaps = competencyRows.filter((r) => r.affected > 0).length;
  console.log(`  • Competencies with gaps found: ${competenciesWithGaps} / 12`);
}

// ── Suite 3: trainingCompliance Query Simulation ──────────────────────────────

async function verifyTrainingComplianceSimulation(activeDepts) {
  console.log('\n' + '='.repeat(78));
  console.log('3. TRAINING COMPLIANCE QUERY SIMULATION');
  console.log('='.repeat(78));

  const year = 2026;
  const yearStart = new Date(Date.UTC(year, 0, 1)).toISOString();
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1)).toISOString();

  const [{ data: emps, error: empErr }, { data: sessions, error: sesErr }] = await Promise.all([
    db.from('employees_with_department')
      .select('id, full_name, current_position, department, status')
      .eq('status', 'Active'),
    db.from('training_sessions')
      .select(`
        id, title, status, scheduled_date, end_date,
        training_enrollments ( id, employee_id, enrollment_status, attendance_status )
      `)
      .lt('scheduled_date', yearEnd)
      .or(`end_date.gte.${yearStart},and(end_date.is.null,scheduled_date.gte.${yearStart})`),
  ]);

  if (empErr) throw new Error(`Failed to load active employees: ${empErr.message}`);
  if (sesErr) throw new Error(`Failed to load training sessions: ${sesErr.message}`);

  const activeOfficeSet = new Set(activeDepts.map((d) => normOffice(d.name)));
  const activeEmps = (emps ?? []).filter((e) => activeOfficeSet.has(normOffice(e.department)));

  const calendarEvents = (sessions ?? []).map((s) => ({
    startDate: s.scheduled_date,
    endDate: s.end_date,
    status: s.status,
    attendees: (s.training_enrollments ?? []).map((e) => ({
      employeeId: String(e.employee_id),
      attendanceStatus: e.attendance_status,
    })),
  }));

  console.log(`  • Active employees for compliance: ${activeEmps.length}`);
  console.log(`  • Calendar events in ${year}: ${calendarEvents.length}`);

  // Simulate trainingCompliance logic
  const now = new Date();
  const attended = new Map(activeEmps.map((e) => [String(e.id), new Set()]));
  calendarEvents.forEach((ev, i) => {
    if (effectiveStatus(ev, now) !== 'Completed') return;
    for (const a of ev.attendees) {
      if (a.attendanceStatus === 'Present') {
        attended.get(a.employeeId)?.add(i);
      }
    }
  });

  const REQUIRED_TRAININGS_PER_YEAR = 2;
  const rows = activeEmps
    .map((e) => ({
      id: String(e.id),
      name: e.full_name ?? 'Unnamed',
      position: e.current_position ?? '—',
      department: e.department ?? '—',
      completed: attended.get(String(e.id))?.size ?? 0,
    }))
    .sort((a, b) => a.completed - b.completed || a.name.localeCompare(b.name));

  const depts = new Map();
  let met = 0, partial = 0, none = 0;
  for (const r of rows) {
    const d = depts.get(r.department) ?? {
      department: r.department,
      total: 0,
      met: 0,
      partial: 0,
      none: 0,
      percentMet: 0,
    };
    d.total += 1;
    if (r.completed >= REQUIRED_TRAININGS_PER_YEAR) {
      d.met += 1;
      met += 1;
    } else if (r.completed > 0) {
      d.partial += 1;
      partial += 1;
    } else {
      d.none += 1;
      none += 1;
    }
    depts.set(r.department, d);
  }

  const byDepartment = [...depts.values()]
    .map((d) => ({ ...d, percentMet: pct(d.met, d.total) }))
    .sort((a, b) => b.percentMet - a.percentMet || a.department.localeCompare(b.department));

  const total = rows.length;

  console.log(`  • Compliance Breakdown: Met=${met}, Partial=${partial}, None=${none}, Total=${total}`);

  // Assertions
  assert(met + partial + none === total, `Count conservation: met(${met}) + partial(${partial}) + none(${none}) === total(${total})`);

  // Float percentages check: (met/total + partial/total + none/total) * 100 === 100%
  const exactPercentageSum = ((met + partial + none) / total) * 100;
  assert(
    Math.abs(exactPercentageSum - 100) < 0.0001,
    `Exact percentages sum to 100% (${exactPercentageSum.toFixed(4)}%)`
  );

  // Integer rounded percentages check: sum should be between 99 and 101 due to rounding
  const roundedSum = pct(met, total) + pct(partial, total) + pct(none, total);
  assert(
    roundedSum >= 99 && roundedSum <= 101,
    `Rounded integer percentages sum within [99, 101]% (${roundedSum}%)`
  );

  // Per-department conservation check
  for (const d of byDepartment) {
    assert(
      d.met + d.partial + d.none === d.total,
      `Department "${d.department}": met(${d.met}) + partial(${d.partial}) + none(${d.none}) === total(${d.total})`
    );
    assert(
      d.percentMet >= 0 && d.percentMet <= 100 && !Number.isNaN(d.percentMet),
      `Department "${d.department}": percentMet is valid (${d.percentMet}%)`
    );
  }
}

// ── Suite 4: tagSelectionsByOffice Simulation ────────────────────────────────

async function verifyTagSelectionsSimulation() {
  console.log('\n' + '='.repeat(78));
  console.log('4. TAG SELECTIONS BY OFFICE SIMULATION');
  console.log('='.repeat(78));

  // Query live IDP submissions
  const { data: dbSubs, error: subErr } = await db
    .from('idp_submissions')
    .select('*')
    .not('submitted_at', 'is', null);
  if (subErr) throw new Error(`Failed to load idp_submissions: ${subErr.message}`);

  const liveSubs = (dbSubs ?? []).map((s) => ({
    office: s.office,
    careerNeeds: s.career_needs ?? [],
    personalGoals: s.personal_goals ?? [],
  }));

  console.log(`  • Live submitted IDP submissions in DB: ${liveSubs.length}`);

  const tagsOf = (s) =>
    new Set(
      [...(s.careerNeeds ?? []), ...(s.personalGoals ?? [])]
        .map((t) => normalizeTag(String(t)))
        .filter((t) => KNOWN_IDP_TAGS.has(t))
    );

  const simulateTagSelections = (subs) =>
    IDP_TAGS.map(({ tag, label, kind }) => {
      const byOffice = {};
      for (const s of subs) {
        if (s.office && tagsOf(s).has(tag)) {
          byOffice[s.office] = (byOffice[s.office] ?? 0) + 1;
        }
      }
      const total = Object.values(byOffice).reduce((a, b) => a + b, 0);
      return { tag, label, kind, byOffice, total };
    });

  // Test with live submissions
  const liveTagRows = simulateTagSelections(liveSubs);
  assert(liveTagRows.length === 7, `Returns 7 canonical IDP tag rows (got ${liveTagRows.length})`);

  for (const r of liveTagRows) {
    assert(typeof r.total === 'number' && !Number.isNaN(r.total) && r.total >= 0,
      `Live tag "${r.label}": total is a valid non-negative number (${r.total})`);
    for (const [office, count] of Object.entries(r.byOffice)) {
      assert(typeof count === 'number' && !Number.isNaN(count) && count >= 0,
        `Live tag "${r.label}" office "${office}": count is a valid number (${count})`);
    }
  }

  // Frontend breakdown transformation test with live rows
  const liveBreakdown = liveTagRows.map((r) => ({ category: r.label, ...r.byOffice }));
  for (const item of liveBreakdown) {
    assert(typeof item.category === 'string' && item.category.length > 0,
      `Breakdown category is a non-empty string ("${item.category}")`);
    for (const [key, val] of Object.entries(item)) {
      if (key !== 'category') {
        assert(typeof val === 'number' && !Number.isNaN(val),
          `Breakdown item [${key}] is a valid number (${val})`);
      }
    }
  }

  // Also test with synthetic submissions covering all offices and tags to test invariant properties
  console.log('\n  --- Invariant Test: Synthetic Submissions Matrix ---');
  const syntheticSubs = [
    { office: 'Office of The City Accountant', careerNeeds: ['JOB SPECIFIC TRAINING', 'COMPUTER LITERACY'], personalGoals: ['FINANCIAL LITERACY'] },
    { office: 'Office of The City Engineer', careerNeeds: ['JOB SPECIFIC TRAINING', 'LEADERSHIP AND SUPERVISORY TRAINING'], personalGoals: ['COMMUNICATION SKILLS'] },
    { office: 'Office of The City Health Officer', careerNeeds: ['COMPUTER LITERACY'], personalGoals: ['GENERAL HEALTH AND WELLNESS', 'PERSONAL DEVELOPMENT'] },
    { office: 'Office of The City Social Welfare and Development Officer', careerNeeds: ['JOB SPECIFIC TRAINING'], personalGoals: ['FINANCIAL LITERACY', 'COMMUNICATION SKILLS'] },
    { office: 'Office of the City General Services Officer', careerNeeds: ['LEADERSHIP AND SUPERVISORY TRAINING'], personalGoals: ['GENERAL HEALTH AND WELLNESS'] },
  ];

  const synRows = simulateTagSelections(syntheticSubs);
  assert(synRows.length === 7, `Synthetic simulation returns exactly 7 rows`);

  for (const r of synRows) {
    const sumOfOffices = Object.values(r.byOffice).reduce((a, b) => a + b, 0);
    assert(r.total === sumOfOffices, `Tag "${r.label}": total (${r.total}) exactly equals sum of office counts (${sumOfOffices})`);
    assert(!Number.isNaN(r.total) && r.total >= 0, `Tag "${r.label}": total is not NaN`);
  }

  const topIdpTag = synRows.reduce((best, cur) => (cur.total > best.total ? cur : best), synRows[0]);
  assert(topIdpTag && !Number.isNaN(topIdpTag.total) && topIdpTag.total >= 0,
    `Top tag calculation resolves cleanly (top: "${topIdpTag.label}" with count ${topIdpTag.total})`);

  const synBreakdown = synRows.map((r) => ({ category: r.label, ...r.byOffice }));
  for (const row of synBreakdown) {
    for (const [k, v] of Object.entries(row)) {
      if (k !== 'category') {
        assert(!Number.isNaN(v) && typeof v === 'number', `Synthetic breakdown [${k}] is valid number: ${v}`);
      }
    }
  }
}

// ── Main Runner ───────────────────────────────────────────────────────────────

async function main() {
  console.log('╔' + '═'.repeat(76) + '╗');
  console.log('║' + ' '.repeat(16) + 'LND DASHBOARD DATA INTEGRITY SUITE' + ' '.repeat(26) + '║');
  console.log('╚' + '═'.repeat(76) + '╝');

  try {
    const { activeDepts, standards } = await verifyTableCounts();
    await verifyNeedsAssessmentSimulation(activeDepts, standards);
    await verifyTrainingComplianceSimulation(activeDepts);
    await verifyTagSelectionsSimulation();

    console.log('\n' + '='.repeat(78));
    console.log(`VERIFICATION COMPLETE: ${passedCount} passed, ${failedCount} failed.`);
    console.log('='.repeat(78) + '\n');

    if (failedCount > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('\n❌ Verification suite encountered an unhandled exception:', err);
    process.exit(1);
  }
}

main();
