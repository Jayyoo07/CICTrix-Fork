// ─────────────────────────────────────────────────────────────────────────────
// scripts/seed-training-attendance.mjs
//
// Seeds deterministic, realistic attendance records into training_enrollments
// for completed 2026 training sessions to reflect realistic annual compliance
// on the L&D Dashboard (~65% Met, ~20% Partial, ~15% None).
//
// Usage:
//   node scripts/seed-training-attendance.mjs --dry
//   node scripts/seed-training-attendance.mjs --sql
//   node scripts/seed-training-attendance.mjs --dry --sql
//   node scripts/seed-training-attendance.mjs --apply
// ─────────────────────────────────────────────────────────────────────────────

import { loadEnv, serviceClient, die } from './lib/ipcr-shared.mjs';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const SQL_PATH = resolve(ROOT, 'seed-training-attendance.sql');

const DRY_RUN = process.argv.includes('--dry');
const WRITE_SQL = process.argv.includes('--sql');
const APPLY = process.argv.includes('--apply');

// 5 Active LGU Offices
export const ACTIVE_OFFICES = [
  'Office of The City Health Officer',
  'Office of The City Accountant',
  'Office of The City Engineer',
  'Office of The City Social Welfare and Development Officer',
  'Office of the City General Services Officer',
];

/** Stable 32-bit FNV-1a hash */
export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < String(s).length; i++) {
    h ^= String(s).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic enrollment timestamp 3 to 10 days before session start */
export function computeEnrolledAt(scheduledDate, empId, sessionId) {
  const d = new Date(scheduledDate);
  const h = hashString(`${empId}:${sessionId}`);
  const daysBefore = 4 + (h % 7); // 4 to 10 days before
  const hours = 8 + (h % 9); // 08:00 to 16:00
  const minutes = (h >> 4) % 60;
  d.setDate(d.getDate() - daysBefore);
  d.setUTCHours(hours, minutes, 0, 0);
  return d.toISOString();
}

/** End of day helper matching src/lib/trainingProgress.ts */
const endOfDay = (iso) => {
  const d = new Date(iso);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
};

/** Effective status calculation matching src/lib/trainingProgress.ts */
export const effectiveStatus = (e, now = new Date()) => {
  if (e.status === 'Cancelled') return 'Cancelled';
  const t = now.getTime();
  if (t < new Date(e.scheduled_date).getTime()) return 'Scheduled';
  if (t <= endOfDay(e.end_date ?? e.scheduled_date)) return 'Ongoing';
  return 'Completed';
};

/**
 * Score office affinity for a training session:
 * Health -> DRRM, community, frontline, ethics
 * Engineer -> engineering, infrastructure, project management, agile, DRRM
 * Accountant -> budgeting, fiscal, audit, transparency, records
 * SWDO -> community engagement, welfare, DRRM, communication, grievance
 * GSO -> records management, procurement, transparency, DRRM, conflict resolution
 */
export function getOfficeAffinity(session, office) {
  const text = (session.title + ' ' + (session.objectives || []).join(' ')).toLowerCase();

  if (office === 'Office of The City Health Officer') {
    if (text.includes('health') || text.includes('medic') || text.includes('clinic')) return 100;
    if (text.includes('community engagement') || text.includes('public communication')) return 75;
    if (text.includes('disaster') || text.includes('drrm') || text.includes('emergency')) return 65;
    if (text.includes('frontline') || text.includes('digital literacy')) return 50;
    if (text.includes('ethics') || text.includes('ethical') || text.includes('conduct')) return 40;
    if (text.includes('governance') || text.includes('public administration')) return 30;
    return 10;
  }

  if (office === 'Office of The City Engineer') {
    if (text.includes('engineer') || text.includes('infrastructure') || text.includes('construct')) return 100;
    if (text.includes('project management') || text.includes('agile')) return 85;
    if (text.includes('disaster') || text.includes('drrm') || text.includes('hazard')) return 70;
    if (text.includes('conflict resolution') || text.includes('it environments')) return 55;
    if (text.includes('ethics') || text.includes('ethical') || text.includes('conduct')) return 40;
    if (text.includes('governance') || text.includes('public administration')) return 30;
    return 10;
  }

  if (office === 'Office of The City Accountant') {
    if (text.includes('budget') || text.includes('fiscal') || text.includes('account')) return 100;
    if (text.includes('transparency') || text.includes('accountability')) return 85;
    if (text.includes('records') || text.includes('data management')) return 65;
    if (text.includes('ethics') || text.includes('ethical') || text.includes('conduct')) return 40;
    if (text.includes('governance') || text.includes('public administration')) return 30;
    return 10;
  }

  if (office === 'Office of The City Social Welfare and Development Officer') {
    if (text.includes('welfare') || text.includes('social') || text.includes('gender')) return 100;
    if (text.includes('community engagement') || text.includes('public communication')) return 85;
    if (text.includes('disaster') || text.includes('drrm') || text.includes('relief')) return 65;
    if (text.includes('technical writing') || text.includes('grievance')) return 50;
    if (text.includes('ethics') || text.includes('ethical') || text.includes('conduct')) return 40;
    if (text.includes('governance') || text.includes('public administration')) return 30;
    return 10;
  }

  if (office === 'Office of the City General Services Officer') {
    if (text.includes('records') || text.includes('data management') || text.includes('asset') || text.includes('procurement')) return 100;
    if (text.includes('transparency') || text.includes('accountability')) return 85;
    if (text.includes('disaster') || text.includes('drrm') || text.includes('drill')) return 65;
    if (text.includes('digital literacy') || text.includes('conflict resolution')) return 60;
    if (text.includes('change management') || text.includes('technical writing')) return 50;
    if (text.includes('ethics') || text.includes('ethical') || text.includes('conduct')) return 40;
    if (text.includes('governance') || text.includes('public administration')) return 30;
    return 10;
  }

  return 20;
}

/** Check if session is general governance/ethics vs specialized domain */
export function isGeneralOrEthics(session) {
  const text = (session.title + ' ' + (session.objectives || []).join(' ')).toLowerCase();
  return (
    text.includes('ethic') ||
    text.includes('conduct') ||
    text.includes('governance') ||
    text.includes('public administration') ||
    text.includes('grievance') ||
    text.includes('onboarding')
  );
}

/** Generates SQL upsert file */
export function generateSql(completedSessions, enrollments) {
  const sessionIds = completedSessions.map((s) => `'${s.id}'`).join(',\n    ');
  const values = enrollments
    .map(
      (e) =>
        `  ('${e.employee_id}', '${e.session_id}', '${e.status}', '${e.enrollment_status}', '${e.attendance_status}', '${e.created_at}', '${e.added_by}', '${e.added_by_role}', ${e.is_active})`,
    )
    .join(',\n');

  return `-- ─────────────────────────────────────────────────────────────────────────────
-- seed-training-attendance.sql
--
-- Seed realistic attendance into training_enrollments for 2026 completed sessions.
-- Compliance targets: ~65% met (2 completed trainings), ~20% partial (1), ~15% none (0).
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- 1. Ensure all completed sessions have status = 'Completed' and roster_finalized_at set
UPDATE training_sessions
SET status = 'Completed',
    roster_finalized_at = COALESCE(roster_finalized_at, scheduled_date)
WHERE id IN (
    ${sessionIds}
) AND status <> 'Completed';

-- 2. Upsert generated training enrollments
INSERT INTO training_enrollments (
  employee_id,
  session_id,
  status,
  enrollment_status,
  attendance_status,
  created_at,
  added_by,
  added_by_role,
  is_active
) VALUES
${values}
ON CONFLICT (employee_id, session_id) DO UPDATE SET
  enrollment_status = EXCLUDED.enrollment_status,
  attendance_status = EXCLUDED.attendance_status,
  status = EXCLUDED.status,
  is_active = EXCLUDED.is_active;

COMMIT;
`;
}

export async function generateTrainingAttendance(options = {}) {
  const dryRun = options.dryRun ?? (DRY_RUN || (!APPLY && !WRITE_SQL));
  const writeSql = options.writeSql ?? WRITE_SQL;
  const applyDb = options.applyDb ?? APPLY;

  const env = loadEnv();
  const db = serviceClient(env);

  console.log('='.repeat(78));
  console.log('L&D TRAINING ATTENDANCE SEEDER (2026)');
  console.log('='.repeat(78));

  // 1. Fetch active employees across the 5 target offices
  const { data: emps, error: empErr } = await db
    .from('employees_with_department')
    .select('id, employee_id, full_name, first_name, last_name, current_position, department, status')
    .in('department', ACTIVE_OFFICES)
    .eq('status', 'Active')
    .order('department', { ascending: true })
    .order('id', { ascending: true });

  if (empErr) die('Failed to fetch active employees', empErr);
  console.log(`\n▶ Loaded ${emps.length} active employees across the 5 offices.`);

  // 2. Fetch completed 2026 sessions
  const { data: allSessions, error: sErr } = await db
    .from('training_sessions')
    .select('id, title, category, scheduled_date, end_date, capacity, status, objectives')
    .order('scheduled_date', { ascending: true });

  if (sErr) die('Failed to fetch training sessions', sErr);

  const now = new Date('2026-10-28T00:00:00Z');
  const completedSessions = allSessions.filter((s) => effectiveStatus(s, now) === 'Completed');
  console.log(`▶ Identified ${completedSessions.length} completed sessions for 2026 (out of ${allSessions.length} total sessions).`);

  // Group employees by office
  const byOffice = new Map();
  for (const off of ACTIVE_OFFICES) byOffice.set(off, []);
  for (const emp of emps) {
    if (byOffice.has(emp.department)) byOffice.get(emp.department).push(emp);
  }

  const officeStats = [];
  let totalMet = 0;
  let totalPartial = 0;
  let totalNone = 0;
  const generatedEnrollments = [];
  const sessionAttendeeCounts = new Map(completedSessions.map((s) => [s.id, 0]));

  for (const [office, officeEmps] of byOffice) {
    const n = officeEmps.length;
    // Target compliance: ~65% met, ~20% partial, ~15% none
    const nMet = Math.round(n * 0.65);
    const nPartial = Math.round(n * 0.20);
    const nNone = n - nMet - nPartial;

    totalMet += nMet;
    totalPartial += nPartial;
    totalNone += nNone;

    officeStats.push({
      office,
      total: n,
      met: nMet,
      partial: nPartial,
      none: nNone,
      metPct: `${Math.round((nMet / n) * 100)}%`,
      partialPct: `${Math.round((nPartial / n) * 100)}%`,
      nonePct: `${Math.round((nNone / n) * 100)}%`,
    });

    // Score sessions for this office
    const scoredSessions = completedSessions.map((s) => ({
      session: s,
      affinity: getOfficeAffinity(s, office),
      isGeneral: isGeneralOrEthics(s),
    }));

    const domainSessions = scoredSessions
      .filter((s) => !s.isGeneral)
      .sort((a, b) => b.affinity - a.affinity);
    const generalSessions = scoredSessions
      .filter((s) => s.isGeneral)
      .sort((a, b) => b.affinity - a.affinity);

    // Assign sessions to employees in this office
    for (let i = 0; i < n; i++) {
      const emp = officeEmps[i];
      let targetCount = 0;
      if (i < nMet) {
        targetCount = 2; // Met target
      } else if (i < nMet + nPartial) {
        targetCount = 1; // Partial target
      } else {
        targetCount = 0; // None
      }

      if (targetCount === 2) {
        // Pick 1 domain session and 1 general/ethics session
        const domainChoice = domainSessions[i % domainSessions.length].session;
        let generalChoice = generalSessions[i % generalSessions.length].session;

        // Ensure distinct sessions
        if (generalChoice.id === domainChoice.id) {
          generalChoice = generalSessions[(i + 1) % generalSessions.length].session;
        }

        const picked = [domainChoice, generalChoice];
        for (const s of picked) {
          const enrolledAt = computeEnrolledAt(s.scheduled_date, emp.id, s.id);
          generatedEnrollments.push({
            training_session_id: s.id, // alias matching prompt requirement
            session_id: s.id,          // database foreign key
            employee_id: emp.id,
            enrollment_status: 'Confirmed',
            attendance_status: 'Present',
            enrolled_at: enrolledAt,   // alias matching prompt requirement
            created_at: enrolledAt,    // database timestamp
            status: 'Enrolled',
            is_active: true,
            added_by: 'seed-training-attendance',
            added_by_role: 'LND',
          });
          sessionAttendeeCounts.set(s.id, (sessionAttendeeCounts.get(s.id) || 0) + 1);
        }
      } else if (targetCount === 1) {
        // Alternate between domain-relevant and general session
        const pool = i % 2 === 0 ? domainSessions : generalSessions;
        const choice = pool[i % pool.length].session;
        const enrolledAt = computeEnrolledAt(choice.scheduled_date, emp.id, choice.id);

        generatedEnrollments.push({
          training_session_id: choice.id,
          session_id: choice.id,
          employee_id: emp.id,
          enrollment_status: 'Confirmed',
          attendance_status: 'Present',
          enrolled_at: enrolledAt,
          created_at: enrolledAt,
          status: 'Enrolled',
          is_active: true,
          added_by: 'seed-training-attendance',
          added_by_role: 'LND',
        });
        sessionAttendeeCounts.set(choice.id, (sessionAttendeeCounts.get(choice.id) || 0) + 1);
      }
    }
  }

  // ── Verification: Capacity and duplicate checks ───────────────────────────
  let capExceeded = 0;
  for (const s of completedSessions) {
    const attendees = sessionAttendeeCounts.get(s.id) || 0;
    if (attendees > s.capacity) {
      console.warn(`⚠ Capacity exceeded for ${s.title}: ${attendees} / ${s.capacity}`);
      capExceeded++;
    }
  }

  const enrKeySet = new Set();
  let duplicates = 0;
  for (const e of generatedEnrollments) {
    const key = `${e.employee_id}:${e.session_id}`;
    if (enrKeySet.has(key)) duplicates++;
    enrKeySet.add(key);
  }

  // ── Print Reports ──────────────────────────────────────────────────────────
  console.log('\n--- Distribution of Completions by Office (0 / 1 / 2) ---');
  console.table(officeStats);

  const metPct = ((totalMet / emps.length) * 100).toFixed(1);
  const partialPct = ((totalPartial / emps.length) * 100).toFixed(1);
  const nonePct = ((totalNone / emps.length) * 100).toFixed(1);

  console.log(`\nOverall Compliance Summary across 5 Offices:`);
  console.log(`  • Met Target (2 trainings)     : ${totalMet} employees (${metPct}%)   [Target: ~65%]`);
  console.log(`  • Partial (1 training)         : ${totalPartial} employees (${partialPct}%)   [Target: ~20%]`);
  console.log(`  • None (0 trainings)           : ${totalNone} employees (${nonePct}%)   [Target: ~15%]`);
  console.log(`  • Total Active Employees       : ${emps.length}`);
  console.log(`  • Total Enrollments Generated  : ${generatedEnrollments.length}`);
  console.log(`  • Duplicate Enrollments        : ${duplicates} (should be 0)`);
  console.log(`  • Capacity Violations          : ${capExceeded} (should be 0)`);

  // Write SQL if requested
  if (writeSql) {
    const sql = generateSql(completedSessions, generatedEnrollments);
    writeFileSync(SQL_PATH, sql, 'utf8');
    console.log(`\n✓ Generated SQL migration script written to:\n  ${SQL_PATH}`);
  }

  // Apply to DB if requested
  if (applyDb) {
    console.log(`\nApplying ${generatedEnrollments.length} enrollments to database...`);
    const BATCH_SIZE = 100;
    for (let i = 0; i < generatedEnrollments.length; i += BATCH_SIZE) {
      const chunk = generatedEnrollments.slice(i, i + BATCH_SIZE).map((e) => ({
        employee_id: e.employee_id,
        session_id: e.session_id,
        status: e.status,
        enrollment_status: e.enrollment_status,
        attendance_status: e.attendance_status,
        created_at: e.created_at,
        added_by: e.added_by,
        added_by_role: e.added_by_role,
        is_active: e.is_active,
      }));

      const { error: upsertErr } = await db
        .from('training_enrollments')
        .upsert(chunk, { onConflict: 'employee_id,session_id' });

      if (upsertErr) die(`Failed to upsert enrollments chunk ${i}`, upsertErr);
    }

    // Ensure past sessions are marked Completed
    const sessionIds = completedSessions.map((s) => s.id);
    const { error: updErr } = await db
      .from('training_sessions')
      .update({ status: 'Completed', roster_finalized_at: new Date().toISOString() })
      .in('id', sessionIds);

    if (updErr) die('Failed to update sessions status', updErr);
    console.log(`✓ Database successfully updated.`);
  }

  if (dryRun && !applyDb) {
    console.log('\n[DRY RUN] No database writes were performed.');
    console.log('Sample generated enrollment row:');
    console.log(JSON.stringify(generatedEnrollments[0], null, 2));
  }

  return {
    totalEmployees: emps.length,
    completedSessions: completedSessions.length,
    generatedEnrollments: generatedEnrollments.length,
    met: totalMet,
    partial: totalPartial,
    none: totalNone,
    metPct: Number(metPct),
    partialPct: Number(partialPct),
    nonePct: Number(nonePct),
    officeStats,
  };
}

// Direct execution
if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) {
  generateTrainingAttendance().catch((err) => {
    console.error('\nFatal error in seed-training-attendance:', err);
    process.exit(1);
  });
}
