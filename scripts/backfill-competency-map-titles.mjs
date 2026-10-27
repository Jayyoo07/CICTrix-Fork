// Backfill the PM Competency Map for the position titles employees actually hold.
//
// Plan: docs/plans/2026-10-27-sor-competency-breakdown.md (step 9)
//
// Why: `position_competency_requirements` stores generic titles ("Construction and
// Maintenance Foreman"), while employees hold plantilla titles ("Construction &
// Maint General Foreman"). As of 2026-10-27 only 7 of the 92 position titles in
// the gap view had a Map row, so the Summary of Ratings could not compute a gap
// for 85 of them.
//
// Sources, in order — nothing is invented:
//   1. `qualification_standards` (real per-position levels, 29 rows / 6 titles).
//      Applied to every employee title that normalises to the same base title, so
//      "Accountant II (General Fund Accountant)" inherits "Accountant II"'s levels.
//   2. Existing Map rows for a generic title, inheriting to employee titles with
//      the same normalised base (strip parentheticals, & → and, Maint → Maintenance,
//      drop punctuation).
//
// Rows are tagged `source='auto-synced'` so a PM can review them in the Competency
// Framework; a PM save flips a row back to 'manual'. Idempotent: existing
// (position_title, competency_id) pairs are never touched.
//
//   node scripts/backfill-competency-map-titles.mjs --dry   # report only
//   node scripts/backfill-competency-map-titles.mjs         # insert
//
// Requires scripts/lib/ipcr-shared.mjs env (SUPABASE_URL + service role key).
import { loadEnv, serviceClient } from './lib/ipcr-shared.mjs';

const db = serviceClient(loadEnv());
const DRY = process.argv.includes('--dry');

const normTitle = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/\bmaint\b/g, 'maintenance')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Numeric QS level → the Map's Basic/Intermediate/Advanced tiers. */
function tierFor(level) {
  const n = Number(level);
  if (!Number.isFinite(n)) return null;
  if (n >= 4.5) return 'Advanced';
  if (n >= 3.5) return 'Intermediate';
  return 'Basic';
}

async function main() {
  const [{ data: reqs, error: reqErr }, { data: qs, error: qsErr }, { data: emps, error: empErr }] =
    await Promise.all([
      db.from('position_competency_requirements').select('position_title, competency_id, proficiency_level'),
      db
        .from('qualification_standards')
        .select('position, competency_id, required_proficiency_level'),
      db.from('employees_with_department').select('current_position'),
    ]);
  if (reqErr) throw reqErr;
  if (qsErr) throw qsErr;
  if (empErr) throw empErr;

  const existing = new Set((reqs ?? []).map((r) => `${r.position_title}|${r.competency_id}`));
  const employeeTitles = [...new Set((emps ?? [])
    .map((e) => String(e.current_position ?? '').trim())
    .filter(Boolean))];

  // Map key → its rows, both for matching employee titles and for copying.
  const byKey = new Map(); // normTitle -> { title, rows: [{ competency_id, proficiency_level }] }
  for (const r of reqs ?? []) {
    const key = normTitle(r.position_title);
    if (!key) continue;
    if (!byKey.has(key)) byKey.set(key, { title: r.position_title, rows: [] });
    byKey.get(key).rows.push({ competency_id: r.competency_id, proficiency_level: r.proficiency_level });
  }

  const rows = []; // { position_title, competency_id, proficiency_level, source }
  const seen = new Set();
  const add = (title, competencyId, proficiencyLevel, source) => {
    const compId = Number(competencyId);
    if (!Number.isFinite(compId) || !proficiencyLevel) return;
    const pair = `${title}|${compId}`;
    if (existing.has(pair) || seen.has(pair)) return;
    seen.add(pair);
    rows.push({
      position_title: title,
      competency_id: compId,
      proficiency_level: proficiencyLevel,
      source,
      updated_by: 'reconciliation:backfill-competency-map-titles',
      updated_at: new Date().toISOString(),
    });
  };

  // 1. Qualification standards — the only real per-position level source.
  for (const q of qs ?? []) {
    const level = tierFor(q.required_proficiency_level);
    if (!level) continue;
    const qsKey = normTitle(q.position);
    if (!qsKey) continue;
    for (const title of employeeTitles) {
      if (normTitle(title) !== qsKey) continue;
      add(title, Number(q.competency_id), level, 'auto-synced');
    }
  }

  // 2. Inherit a generic Map title's rows onto matching employee titles.
  for (const title of employeeTitles) {
    const entry = byKey.get(normTitle(title));
    if (!entry) continue;
    for (const r of entry.rows) {
      add(title, Number(r.competency_id), r.proficiency_level, 'auto-synced');
    }
  }

  // Which employee titles still have nothing?
  const covered = new Set([...rows.map((r) => r.position_title), ...(reqs ?? []).map((r) => r.position_title)]);
  const uncovered = employeeTitles.filter((t) => !covered.has(t)).sort();

  console.log(`Employee position titles: ${employeeTitles.length}`);
  console.log(`Existing Map rows: ${(reqs ?? []).length} across ${byKey.size} title(s)`);
  console.log(`Rows to insert: ${rows.length}`);
  console.log(`Titles still without a Map row: ${uncovered.length}`);
  if (uncovered.length) {
    uncovered.slice(0, 30).forEach((t) => console.log(`   ${t}`));
    if (uncovered.length > 30) console.log(`   … ${uncovered.length - 30} more`);
  }

  if (!rows.length || DRY) {
    if (DRY && rows.length) console.log('\n--dry: no writes. First rows:\n' + JSON.stringify(rows.slice(0, 10), null, 2));
    return;
  }

  const { data: inserted, error: insErr } = await db
    .from('position_competency_requirements')
    .upsert(rows, { onConflict: 'position_title,competency_id', ignoreDuplicates: true })
    .select('position_title, competency_id');
  if (insErr) throw insErr;
  console.log(`\n✅ Inserted ${inserted?.length ?? 0} row(s). Re-run the audit afterward.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
