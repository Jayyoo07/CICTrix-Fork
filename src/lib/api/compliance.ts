/**
 * Submission Compliance (Module 1 · Tab 1.3 · Subtab 1).
 *
 * Per-office progress computed from performance_evaluations + the office
 * headcount:
 *   - % Employees Submitted = submitted / total employees in the office
 *   - % Office Verified      = verified / submitted (of what was submitted, how
 *                              much the Office Account actually confirmed)
 *
 * An office can look "complete" on submissions while a backlog of unverified
 * entries still sits with the Supervisor / Dept Head — hence the two layers.
 */

import { supabase as supabaseClient } from '../supabase';
import { DIVISION_PARENT_COLUMN } from './departments';

const supabase = supabaseClient as any;

// An employee has "submitted" once their IPCR has left self-editing (sent for
// review) or been approved. "Verified" means the Office Account approved it.
export const SUBMITTED_STATUSES = ['Supervisor Review', 'Approved'];
export const VERIFIED_STATUSES = ['Approved'];

export interface EmployeeComplianceRow {
  name: string;
  status: string;
  submitted: boolean;
  verified: boolean;
}

export interface OfficeCompliance {
  officeId: string;
  officeName: string;
  totalEmployees: number;
  submitted: number;
  verified: number;
  pctSubmitted: number;
  pctVerified: number;
  employees: EmployeeComplianceRow[];
}

function defaultPeriod(): string {
  const n = new Date();
  const y = n.getFullYear();
  return n.getMonth() < 6 ? `January–June ${y}` : `July–December ${y}`;
}

/**
 * Resolve the active (or latest) performance cycle → { cycleId, period }.
 *
 * `period` is never empty: with no cycle configured it falls back to the
 * calendar half-year, because the label is written into notifications and used
 * to key submission tracking, and an empty string there produces notices that
 * read "for period: " and tracker queries that match nothing.
 *
 * `isScheduled` says whether a real `performance_cycles` row backed it, so a
 * screen can show the label it will actually use while still being honest that
 * nobody has scheduled a cycle. Without that distinction the fallback is
 * indistinguishable from a configured period.
 */
export interface ActiveCyclePeriod {
  cycleId: number | null;
  period: string;
  isScheduled: boolean;
}

export async function getActiveCyclePeriod(): Promise<ActiveCyclePeriod> {
  try {
    const { data: active } = await supabase
      .from('performance_cycles')
      .select('*')
      .eq('status', 'Active')
      .maybeSingle();
    let cycle = active;
    if (!cycle) {
      const { data: latest } = await supabase
        .from('performance_cycles')
        .select('*')
        .order('start_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      cycle = latest;
    }
    if (cycle) {
      return { cycleId: cycle.id ?? null, period: cycle.title || defaultPeriod(), isScheduled: true };
    }
    return { cycleId: null, period: defaultPeriod(), isScheduled: false };
  } catch {
    return { cycleId: null, period: defaultPeriod(), isScheduled: false };
  }
}

/** Per-office compliance for a cycle (null = across all cycles). */
export async function getComplianceByOffice(
  cycleId: number | null,
): Promise<{ ok: true; data: OfficeCompliance[] } | { ok: false; error: string }> {
  try {
    const [deptRes, empRes] = await Promise.all([
      supabase.from('departments').select('id, name').is(DIVISION_PARENT_COLUMN, null).order('name'),
      supabase.from('employees_with_department').select('id, full_name, department'),
    ]);
    if (deptRes.error) return { ok: false, error: deptRes.error.message ?? 'Failed to load offices.' };

    const departments: any[] = deptRes.data ?? [];
    const employees: any[] = empRes.error ? [] : empRes.data ?? [];

    let evalQuery = supabase.from('performance_evaluations').select('employee_id, status, cycle_id, updated_at');
    if (cycleId != null) evalQuery = evalQuery.eq('cycle_id', cycleId);
    const { data: evals } = await evalQuery;

    // Latest status per employee (rows are few; take the most recent by updated_at).
    const statusByEmp = new Map<string, { status: string; updated_at: string }>();
    for (const e of (evals ?? []) as any[]) {
      const id = String(e?.employee_id ?? '');
      if (!id) continue;
      const prev = statusByEmp.get(id);
      if (!prev || String(e.updated_at ?? '') > prev.updated_at) {
        statusByEmp.set(id, { status: String(e.status ?? ''), updated_at: String(e.updated_at ?? '') });
      }
    }

    const norm = (s: string | null | undefined) => String(s ?? '').trim().toLowerCase();
    const byOffice = new Map<string, any[]>();
    for (const emp of employees) {
      const key = norm(emp?.department);
      if (!key) continue;
      const list = byOffice.get(key) ?? [];
      list.push(emp);
      byOffice.set(key, list);
    }

    const data: OfficeCompliance[] = departments.map((d) => {
      const emps = byOffice.get(norm(d.name)) ?? [];
      const rows: EmployeeComplianceRow[] = emps.map((e) => {
        const status = statusByEmp.get(String(e.id))?.status ?? 'No submission';
        return {
          name: String(e.full_name ?? '—'),
          status,
          submitted: SUBMITTED_STATUSES.includes(status),
          verified: VERIFIED_STATUSES.includes(status),
        };
      });
      const total = emps.length;
      const submitted = rows.filter((r) => r.submitted).length;
      const verified = rows.filter((r) => r.verified).length;
      return {
        officeId: String(d.id),
        officeName: String(d.name ?? ''),
        totalEmployees: total,
        submitted,
        verified,
        pctSubmitted: total ? Math.round((submitted / total) * 100) : 0,
        pctVerified: submitted ? Math.round((verified / submitted) * 100) : 0,
        employees: rows,
      };
    });

    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Alias for getComplianceByOffice. */
export const getComplianceOverview = getComplianceByOffice;
