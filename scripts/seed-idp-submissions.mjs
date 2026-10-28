// ─────────────────────────────────────────────────────────────────────────────
// scripts/seed-idp-submissions.mjs
//
// Deterministic seeder for 2026 Individual Development Plan (IDP) submissions.
// Populates public.idp_submissions for active employees across the 5 active
// offices to feed L&D Dashboard KPIs, the submission rate, and the IDP stacked
// requests chart.
//
// Usage:
//   node scripts/seed-idp-submissions.mjs --dry      # Dry-run report only (default)
//   node scripts/seed-idp-submissions.mjs --sql      # Generate seed-idp-submissions.sql
//   node scripts/seed-idp-submissions.mjs --dry --sql # Dry-run and export SQL
//   node scripts/seed-idp-submissions.mjs --apply    # Live upsert to Supabase
// ─────────────────────────────────────────────────────────────────────────────

import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { loadEnv, serviceClient, die } from './lib/ipcr-shared.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const SQL_FILE_PATH = resolve(ROOT, 'seed-idp-submissions.sql');

// Command-line flags
const ARGV = process.argv.slice(2);
const DRY_FLAG = ARGV.includes('--dry');
const SQL_FLAG = ARGV.includes('--sql');
const APPLY_FLAG = ARGV.includes('--apply');
const IS_DRY_RUN = DRY_FLAG || !APPLY_FLAG; // Dry run by default unless --apply is explicit

const CYCLE_YEAR = 2026;
const TARGET_PARTICIPATION_RATE = 0.73; // ~73% across all 5 offices

// ── Canonical questionnaire options ──────────────────────────────────────────
// Sourced directly from src/lib/idpQuestionnaire.ts and src/lib/idpAnalytics.ts
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

// ── Deterministic PRNG (Mulberry32) ─────────────────────────────────────────
export function createPrng(seed = 20261028) {
  let s = seed >>> 0;
  return function rand() {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(array, rand) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Content generation dictionaries ─────────────────────────────────────────
const SKILLS_BY_OFFICE = {
  'Office of The City Health Officer': [
    'Community health surveillance and epidemiological reporting',
    'Clinical triage standards and emergency medical protocol',
    'Healthcare records digitization and patient management systems',
    'Maternal and child healthcare outreach procedures',
  ],
  'Office of The City Accountant': [
    'Government accounting standards (e-NGAS) and statutory compliance',
    'Financial statement consolidation and internal audit review',
    'Electronic tax reporting and LGU disbursement auditing',
    'Advanced digital spreadsheet modeling for budget tracking',
  ],
  'Office of The City Engineer': [
    'Structural infrastructure assessment and project monitoring',
    'AutoCAD / civil design drafting and building code verification',
    'Government infrastructure procurement and contractor compliance',
    'Material quality control testing and cost estimation',
  ],
  'Office of The City Social Welfare and Development Officer': [
    'Crisis intervention protocol and vulnerable sector case handling',
    'Community social welfare profiling and family assistance programs',
    'Child and youth development program facilitation',
    'Disaster relief distribution management and post-calamity support',
  ],
  'Office of the City General Services Officer': [
    'Public asset inventory control and warehouse supply chain management',
    'RA 9184 government procurement guidelines and bid documentation',
    'Fleet maintenance scheduling and facilities inspection',
    'Fixed asset tagging, disposal procedures, and property records',
  ],
};

const STRENGTHS_POOL = [
  'Cross-departmental collaboration and inter-office task coordination',
  'Data analysis, process optimization, and digital documentation',
  'Mentoring junior staff, organizing team workshops, and technical coaching',
  'Workflow troubleshooting, records reconciliation, and operational quality control',
  'Frontline public service communication and stakeholder consultation',
];

const OUTSIDE_TASKS_POOL = [
  'Assisting with inter-office procurement audits and physical inventory counts',
  'Providing technical support for office computer systems and network peripherals',
  'Coordinating frontline emergency relief distribution during typhoon response',
  'Facilitating cross-office administrative compliance reporting and document tracking',
];

const CAREER_SPECIFICS = {
  'JOB SPECIFIC TRAINING': 'Advanced technical specialization in office operations and statutory compliance',
  'LEADERSHIP AND SUPERVISORY TRAINING': 'Supervisory development program, emotional intelligence, and team leadership',
  'COMPUTER LITERACY': 'Modern office productivity tools, digital database navigation, and spreadsheet analytics',
};

const PERSONAL_SPECIFICS = {
  'FINANCIAL LITERACY': 'Personal budgeting, government savings programs, and retirement financial management',
  'GENERAL HEALTH AND WELLNESS': 'Workplace ergonomics, mental health resilience, and stress mitigation workshops',
  'COMMUNICATION SKILLS': 'Technical business writing, public presentation, and frontline citizen service etiquette',
  'PERSONAL DEVELOPMENT': 'Time management, workplace professionalism, and conflict de-escalation techniques',
};

/**
 * Generate synthetic IDP submissions deterministically for active employees.
 */
export function generateSubmissions(activeEmployees, rand = createPrng(20261028)) {
  // Group employees by canonical department and sort deterministically
  const byDept = new Map();
  for (const emp of activeEmployees) {
    const dept = emp.department;
    if (!byDept.has(dept)) byDept.set(dept, []);
    byDept.get(dept).push(emp);
  }

  // Sort departments alphabetically, and employees by id within each department
  const sortedDepts = [...byDept.keys()].sort();
  for (const dept of sortedDepts) {
    byDept.get(dept).sort((a, b) => a.id.localeCompare(b.id));
  }

  const submissions = [];

  for (const dept of sortedDepts) {
    const staff = byDept.get(dept);
    const targetCount = Math.round(staff.length * TARGET_PARTICIPATION_RATE);

    // Shuffle employee pool deterministically to pick submitters
    const shuffledPool = shuffle(staff, rand);
    const selected = shuffledPool.slice(0, targetCount);

    for (const emp of selected) {
      const position = emp.current_position || emp.position || '';
      const isLeader = /head|chief|director|supervisor|manager|lead|officer-in-charge/i.test(position);

      // Pick 1-2 career needs
      const numCareer = rand() < 0.45 ? 2 : 1;
      let careerPool = shuffle(CAREER_NEED_OPTIONS, rand);
      if (isLeader && !careerPool.slice(0, numCareer).includes('LEADERSHIP AND SUPERVISORY TRAINING')) {
        careerPool = [
          'LEADERSHIP AND SUPERVISORY TRAINING',
          ...careerPool.filter((c) => c !== 'LEADERSHIP AND SUPERVISORY TRAINING'),
        ];
      }
      const careerNeeds = careerPool.slice(0, numCareer);

      // Pick 1-2 personal goals
      const numPersonal = rand() < 0.5 ? 2 : 1;
      const personalGoals = shuffle(PERSONAL_GOAL_OPTIONS, rand).slice(0, numPersonal);

      // Self-evaluation fields
      const deptSkills = SKILLS_BY_OFFICE[dept] || SKILLS_BY_OFFICE['Office of The City Health Officer'];
      const skillsToDevelop = deptSkills[Math.floor(rand() * deptSkills.length)];
      const strengthsToUtilize = STRENGTHS_POOL[Math.floor(rand() * STRENGTHS_POOL.length)];

      const worksOutside = rand() < 0.22; // ~22% report outside tasks
      const outsideTasks = worksOutside
        ? OUTSIDE_TASKS_POOL[Math.floor(rand() * OUTSIDE_TASKS_POOL.length)]
        : null;

      // Realistic submission timestamp between Jan 15, 2026 and Feb 28, 2026
      const dayOffset = Math.floor(rand() * 44); // 44 days
      const hour = 8 + Math.floor(rand() * 9); // 8 AM - 4 PM
      const minute = Math.floor(rand() * 60);
      const second = Math.floor(rand() * 60);
      const subDate = new Date(Date.UTC(2026, 0, 15 + dayOffset, hour, minute, second));
      const submittedAt = subDate.toISOString();

      const careerSpec = careerNeeds.map((n) => CAREER_SPECIFICS[n] || n).join('; ');
      const personalSpec = personalGoals.map((g) => PERSONAL_SPECIFICS[g] || g).join('; ');

      submissions.push({
        employee_id: emp.id,
        cycle_year: CYCLE_YEAR,
        full_name: emp.full_name || emp.name || 'Unnamed Employee',
        office: dept,
        division: emp.current_division || null,
        position: position || null,
        salary_grade: emp.salary_grade || null,
        years_in_position: `${1 + Math.floor(rand() * 8)} years`,
        years_government_service: `${2 + Math.floor(rand() * 15)} years`,
        eligibility: isLeader
          ? 'Career Service Professional'
          : /nurse|engineer|accountant/i.test(position)
          ? 'RA 1080 (Board / Bar)'
          : 'Career Service Subprofessional',
        educational_attainment: isLeader || rand() < 0.35 ? "Master's Degree" : "Bachelor's Degree",
        age: String(24 + Math.floor(rand() * 35)),
        gender: emp.gender || (rand() < 0.5 ? 'Female' : 'Male'),
        email: emp.email || null,
        skills_to_develop: skillsToDevelop,
        strengths_to_utilize: strengthsToUtilize,
        works_outside_job_description: worksOutside,
        outside_tasks: outsideTasks,
        career_needs: careerNeeds,
        career_other: null,
        career_specifics: careerSpec,
        personal_goals: personalGoals,
        personal_other: null,
        personal_specifics: personalSpec,
        other_topics: null,
        submitted_at: submittedAt,
        created_at: submittedAt,
        updated_at: submittedAt,
      });
    }
  }

  return submissions;
}

// ── SQL File Generator ───────────────────────────────────────────────────────
function escapeSqlString(str) {
  if (str === null || str === undefined) return 'NULL';
  return `'${String(str).replace(/'/g, "''")}'`;
}

function escapeSqlArray(arr) {
  if (!arr || !Array.isArray(arr) || arr.length === 0) return "'{}'::text[]";
  const elements = arr.map((item) => escapeSqlString(item)).join(', ');
  return `ARRAY[${elements}]::text[]`;
}

export function generateSql(submissions) {
  const header = [
    '--',
    `-- IDP Submissions Seeder - CY ${CYCLE_YEAR}`,
    `-- Total submissions: ${submissions.length}`,
    `-- Generated on: ${new Date().toISOString()}`,
    '--',
    'BEGIN;',
    '',
  ];

  const valueRows = submissions.map((s) => {
    return `  (
    ${escapeSqlString(s.employee_id)},
    ${s.cycle_year},
    ${escapeSqlString(s.full_name)},
    ${escapeSqlString(s.office)},
    ${escapeSqlString(s.division)},
    ${escapeSqlString(s.position)},
    ${escapeSqlString(s.salary_grade)},
    ${escapeSqlString(s.years_in_position)},
    ${escapeSqlString(s.years_government_service)},
    ${escapeSqlString(s.eligibility)},
    ${escapeSqlString(s.educational_attainment)},
    ${escapeSqlString(s.age)},
    ${escapeSqlString(s.gender)},
    ${escapeSqlString(s.email)},
    ${escapeSqlString(s.skills_to_develop)},
    ${escapeSqlString(s.strengths_to_utilize)},
    ${s.works_outside_job_description ? 'TRUE' : 'FALSE'},
    ${escapeSqlString(s.outside_tasks)},
    ${escapeSqlArray(s.career_needs)},
    ${escapeSqlString(s.career_other)},
    ${escapeSqlString(s.career_specifics)},
    ${escapeSqlArray(s.personal_goals)},
    ${escapeSqlString(s.personal_other)},
    ${escapeSqlString(s.personal_specifics)},
    ${escapeSqlString(s.other_topics)},
    ${escapeSqlString(s.submitted_at)}::timestamptz,
    ${escapeSqlString(s.created_at)}::timestamptz,
    ${escapeSqlString(s.updated_at)}::timestamptz
  )`;
  });

  const query = [
    ...header,
    'INSERT INTO public.idp_submissions (',
    '  employee_id,',
    '  cycle_year,',
    '  full_name,',
    '  office,',
    '  division,',
    '  position,',
    '  salary_grade,',
    '  years_in_position,',
    '  years_government_service,',
    '  eligibility,',
    '  educational_attainment,',
    '  age,',
    '  gender,',
    '  email,',
    '  skills_to_develop,',
    '  strengths_to_utilize,',
    '  works_outside_job_description,',
    '  outside_tasks,',
    '  career_needs,',
    '  career_other,',
    '  career_specifics,',
    '  personal_goals,',
    '  personal_other,',
    '  personal_specifics,',
    '  other_topics,',
    '  submitted_at,',
    '  created_at,',
    '  updated_at',
    ') VALUES',
    valueRows.join(',\n'),
    'ON CONFLICT (employee_id, cycle_year) DO UPDATE SET',
    '  full_name = EXCLUDED.full_name,',
    '  office = EXCLUDED.office,',
    '  division = EXCLUDED.division,',
    '  position = EXCLUDED.position,',
    '  salary_grade = EXCLUDED.salary_grade,',
    '  years_in_position = EXCLUDED.years_in_position,',
    '  years_government_service = EXCLUDED.years_government_service,',
    '  eligibility = EXCLUDED.eligibility,',
    '  educational_attainment = EXCLUDED.educational_attainment,',
    '  age = EXCLUDED.age,',
    '  gender = EXCLUDED.gender,',
    '  email = EXCLUDED.email,',
    '  skills_to_develop = EXCLUDED.skills_to_develop,',
    '  strengths_to_utilize = EXCLUDED.strengths_to_utilize,',
    '  works_outside_job_description = EXCLUDED.works_outside_job_description,',
    '  outside_tasks = EXCLUDED.outside_tasks,',
    '  career_needs = EXCLUDED.career_needs,',
    '  career_other = EXCLUDED.career_other,',
    '  career_specifics = EXCLUDED.career_specifics,',
    '  personal_goals = EXCLUDED.personal_goals,',
    '  personal_other = EXCLUDED.personal_other,',
    '  personal_specifics = EXCLUDED.personal_specifics,',
    '  other_topics = EXCLUDED.other_topics,',
    '  submitted_at = EXCLUDED.submitted_at,',
    '  updated_at = EXCLUDED.updated_at;',
    '',
    'COMMIT;',
  ].join('\n');

  return query;
}

// ── Main Pipeline ───────────────────────────────────────────────────────────
async function main() {
  console.log(`\n======================================================`);
  console.log(`  IDP Submissions Seeder — CY ${CYCLE_YEAR}`);
  console.log(`  Mode: ${IS_DRY_RUN ? 'DRY RUN (No live DB modifications)' : 'APPLY (Live DB writes)'}`);
  if (SQL_FLAG) console.log(`  SQL export: Enabled (${SQL_FILE_PATH})`);
  console.log(`======================================================\n`);

  const env = loadEnv();
  const db = serviceClient(env);

  // 1. Fetch active canonical departments
  const { data: deptRows, error: deptErr } = await db
    .from('departments')
    .select('id, name')
    .is('parent_department_id', null)
    .eq('is_active', true);

  if (deptErr) die('Failed to load active departments:', deptErr);

  const activeOfficeNames = new Set((deptRows ?? []).map((d) => d.name.trim().toLowerCase()));
  console.log(`Found ${activeOfficeNames.size} active top-level offices in departments lookup:`);
  for (const d of deptRows) {
    console.log(`  • ${d.name}`);
  }

  // 2. Load active employees from employees_with_department
  const { data: empRows, error: empErr } = await db
    .from('employees_with_department')
    .select('id, full_name, department, current_position, current_division, gender, email, status')
    .eq('status', 'Active');

  if (empErr) die('Failed to load active employees:', empErr);

  const activeStaff = (empRows ?? []).filter((e) =>
    activeOfficeNames.has((e.department || '').trim().toLowerCase())
  );

  console.log(`\nActive employee headcount in 5 active offices: ${activeStaff.length} (total active in DB: ${empRows?.length ?? 0})`);

  // 3. Generate deterministic submissions
  const prng = createPrng(20261028);
  const submissions = generateSubmissions(activeStaff, prng);

  // 4. Compute statistics
  const byOfficeStats = {};
  for (const emp of activeStaff) {
    if (!byOfficeStats[emp.department]) {
      byOfficeStats[emp.department] = { headcount: 0, submissions: 0 };
    }
    byOfficeStats[emp.department].headcount += 1;
  }
  for (const sub of submissions) {
    if (byOfficeStats[sub.office]) {
      byOfficeStats[sub.office].submissions += 1;
    }
  }

  console.log('\n--- Office Participation Breakdown ---');
  console.log(
    'Office'.padEnd(58) +
      'Headcount'.padStart(10) +
      'Submitted'.padStart(12) +
      'Share'.padStart(8)
  );
  console.log('-'.repeat(88));
  for (const [dept, st] of Object.entries(byOfficeStats).sort(([a], [b]) => a.localeCompare(b))) {
    const pct = Math.round((st.submissions / st.headcount) * 100);
    console.log(
      dept.padEnd(58) +
        String(st.headcount).padStart(10) +
        String(st.submissions).padStart(12) +
        `${pct}%`.padStart(8)
    );
  }
  console.log('-'.repeat(88));
  const totalSubmissions = submissions.length;
  const overallPct = Math.round((totalSubmissions / activeStaff.length) * 100);
  console.log(
    'TOTAL'.padEnd(58) +
      String(activeStaff.length).padStart(10) +
      String(totalSubmissions).padStart(12) +
      `${overallPct}%`.padStart(8)
  );

  console.log('\n--- IDP Tag Distribution Across All Submissions ---');
  console.log('Tag'.padEnd(30) + 'Kind'.padEnd(12) + 'Total'.padStart(8) + '   Per-Office Breakdown');
  console.log('-'.repeat(88));
  for (const t of IDP_TAGS) {
    const totalWithTag = submissions.filter(
      (s) => s.career_needs.includes(t.tag) || s.personal_goals.includes(t.tag)
    ).length;

    const perDept = Object.keys(byOfficeStats)
      .sort()
      .map((d) => {
        const count = submissions.filter(
          (s) =>
            s.office === d &&
            (s.career_needs.includes(t.tag) || s.personal_goals.includes(t.tag))
        ).length;
        return `${d.replace('Office of ', '').replace('The ', '')}: ${count}`;
      })
      .join(', ');

    console.log(
      t.label.padEnd(30) +
        t.kind.padEnd(12) +
        String(totalWithTag).padStart(8) +
        `   (${perDept})`
    );
  }

  // 5. Export SQL if requested
  if (SQL_FLAG) {
    const sqlContent = generateSql(submissions);
    writeFileSync(SQL_FILE_PATH, sqlContent, 'utf8');
    console.log(`\n✅ Generated SQL script written to: ${SQL_FILE_PATH}`);
  }

  // 6. Live apply if requested
  if (APPLY_FLAG) {
    console.log(`\nUpserting ${submissions.length} rows to public.idp_submissions...`);
    const BATCH_SIZE = 50;
    let totalUpserted = 0;

    for (let i = 0; i < submissions.length; i += BATCH_SIZE) {
      const batch = submissions.slice(i, i + BATCH_SIZE);
      const { data, error } = await db
        .from('idp_submissions')
        .upsert(batch, { onConflict: 'employee_id,cycle_year' })
        .select('id, employee_id');

      if (error) die(`Failed to upsert batch ${i} to ${i + batch.length}:`, error);
      totalUpserted += data?.length ?? batch.length;
    }
    console.log(`✅ Successfully upserted ${totalUpserted} IDP submissions for CY ${CYCLE_YEAR}.`);
  } else if (IS_DRY_RUN) {
    console.log('\n[DRY RUN] No database writes were performed.');
    console.log('To write directly to Supabase, run with: --apply');
    console.log('To generate the SQL migration file, run with: --sql');
  }
}

main().catch((err) => {
  console.error('\nFatal error in seed-idp-submissions:', err);
  process.exit(1);
});
