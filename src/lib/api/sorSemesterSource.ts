/**
 * Department Source Semester & Published Records API for Summary of Ratings (SoR).
 *
 * Implements Step 7 of docs/plans/2026-10-27-sor-previous-semester-competency.md.
 * Replaces the legacy getIPCRRecordsFromGapView which read period-agnostic v_competency_gap_analysis.
 *
 * Each department on the Summary of Ratings shows its single published completed semester:
 * - Eligibility is evaluated by the database function public.evaluate_sor_publication(department).
 * - Ratings come from performance_evaluations.final_score.
 * - Period comes from performance_cycles.title.
 * - Competencies come from employee_competencies unioned with position requirements in the Competency Map.
 * - Assessment states come from competency_assessment_runs.
 */

import { supabase as supabaseClient } from '../supabase';
import { listCompetencyStandards, PROFICIENCY_NUMERIC, type ProficiencyLevel } from './pmCompetency';

const supabase = supabaseClient as any;

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();

export type CompetencyAssessmentState =
  | 'pending'
  | 'running'
  | 'complete'
  | 'failed'
  | 'unassessed'
  | 'never_assessed';

export interface IPCRRatingRecord {
  id: string;
  department: string;
  name: string;
  position: string;
  period: string;
  numericalRating: number | null;
  remarks: string;
  submissionStatus: 'SUBMITTED' | 'PENDING' | 'OVERDUE';
  competencies?: {
    name: string;
    possessed: number;
    required: number | null;
    requiredAvailable?: boolean;
    isGap: boolean;
    possessedAvailable?: boolean;
  }[];
  cycleId?: number | null;
  assessmentState?: CompetencyAssessmentState;
  assessmentStatus?: CompetencyAssessmentState;
  recommendations?: string | null;
}

export interface PublishedSemesterInfo {
  cycleId: number;
  status: 'published' | 'correction_pending';
  requiredCount: number;
  approvedCount: number;
  assessmentCompleteCount: number;
  cycleTitle?: string;
  department?: string;
  periodTitle?: string | null;
}

export interface DepartmentSourceSemester {
  department: string;
  cycleId: number | null;
  periodTitle: string | null;
  status: 'published' | 'correction_pending' | 'none';
  requiredCount: number;
  approvedCount: number;
  assessmentCompleteCount: number;
}

// position (lowercased) -> competency name (lowercased) -> { display name, required }
type RequiredMap = Map<string, Map<string, { name: string; required: number }>>;

async function buildRequiredMap(): Promise<RequiredMap> {
  const [reqRes, stdRes] = await Promise.all([
    supabase
      .from('position_competency_requirements')
      .select('position_title, competency_id, proficiency_level'),
    listCompetencyStandards(),
  ]);

  const nameById = new Map<number, string>();
  if (stdRes.ok && stdRes.data) {
    for (const s of stdRes.data) nameById.set(Number(s.id), s.competency_name);
  }

  const map: RequiredMap = new Map();
  for (const r of (reqRes.data ?? []) as any[]) {
    const position = norm(r.position_title);
    const compName = nameById.get(Number(r.competency_id));
    if (!position || !compName) continue;
    const required = PROFICIENCY_NUMERIC[r.proficiency_level as ProficiencyLevel];
    if (!required) continue;
    if (!map.has(position)) map.set(position, new Map());
    map.get(position)!.set(norm(compName), { name: compName, required });
  }
  return map;
}

/**
 * Returns the official published semester for a department by evaluating its eligibility via SQL function.
 * Returns PublishedSemesterInfo when a qualifying semester exists, or null when none exists.
 */
export async function getDepartmentSourceSemester(
  departmentName: string,
): Promise<PublishedSemesterInfo | null> {
  if (!departmentName) return null;

  try {
    const { data, error } = await supabase.rpc('evaluate_sor_publication', {
      p_department: departmentName,
    });

    if (error) {
      console.warn(`evaluate_sor_publication RPC error for "${departmentName}":`, error.message);
      return null;
    }

    const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
    if (!row || !row.cycle_id) {
      return null;
    }

    // Lookup cycle title from performance_cycles
    const { data: cycle } = await supabase
      .from('performance_cycles')
      .select('id, title')
      .eq('id', row.cycle_id)
      .maybeSingle();

    const title = cycle?.title;

    return {
      cycleId: Number(row.cycle_id),
      status: row.status as 'published' | 'correction_pending',
      requiredCount: Number(row.required_count ?? 0),
      approvedCount: Number(row.approved_count ?? 0),
      assessmentCompleteCount: Number(row.assessment_complete_count ?? 0),
      cycleTitle: title,
      department: departmentName,
      periodTitle: title ?? null,
    };
  } catch (err) {
    console.error(`Error in getDepartmentSourceSemester for "${departmentName}":`, err);
    return null;
  }
}

/**
 * Returns IPCRRatingRecord[] for a department and cycle:
 * - numericalRating from performance_evaluations.final_score
 * - period from performance_cycles.title
 * - competencies from employee_competencies unioned with the Competency Map
 * - assessmentState from competency_assessment_runs
 * - recommendations from employee_competency_summaries
 */
export async function getPublishedRecords(
  departmentName: string,
  cycleId: number,
): Promise<IPCRRatingRecord[]> {
  try {
    // 1. Fetch eligible roster rows for this department & cycle
    const { data: rosterRows, error: rosterErr } = await supabase
      .from('ipcr_semester_roster')
      .select('employee_id, department_name, owes_ipcr')
      .eq('cycle_id', cycleId)
      .eq('department_name', departmentName)
      .eq('owes_ipcr', true);

    if (rosterErr) {
      console.warn(`Error fetching roster for "${departmentName}":`, rosterErr.message);
    }

    let eligibleEmpIds: Set<string>;
    const rosterDeptMap = new Map<string, string>();

    if (rosterRows && rosterRows.length > 0) {
      eligibleEmpIds = new Set(rosterRows.map((r: any) => {
        const id = String(r.employee_id);
        if (r.department_name) rosterDeptMap.set(id, r.department_name);
        return id;
      }));
    } else {
      // Fallback: employees with approved target settings for this cycle
      const { data: targetRows } = await supabase
        .from('target_settings')
        .select('id, employee_id, status')
        .eq('cycle_id', cycleId)
        .eq('status', 'approved');

      eligibleEmpIds = new Set(((targetRows ?? []) as any[]).map((r: any) => String(r.employee_id)));
    }

    if (eligibleEmpIds.size === 0) {
      return [];
    }

    const empIdArray = Array.from(eligibleEmpIds);

    // 2. Fetch parallel dependent data scoped to eligible employees
    const [
      requiredMap,
      { data: cycleRow },
      { data: evalRows },
      { data: possessedRows },
      { data: runRows },
      { data: summaryRows },
      { data: emps },
    ] = await Promise.all([
      buildRequiredMap(),
      supabase
        .from('performance_cycles')
        .select('id, title')
        .eq('id', cycleId)
        .maybeSingle(),
      supabase
        .from('performance_evaluations')
        .select('employee_id, final_score, remarks, status')
        .eq('cycle_id', cycleId)
        .in('employee_id', empIdArray),
      supabase
        .from('employee_competencies')
        .select('employee_id, proficiency_level, competencies ( name )')
        .eq('cycle_id', cycleId)
        .in('employee_id', empIdArray),
      supabase
        .from('competency_assessment_runs')
        .select('employee_id, status, stage')
        .eq('cycle_id', cycleId)
        .eq('stage', 'assessing')
        .in('employee_id', empIdArray),
      supabase
        .from('employee_competency_summaries')
        .select('employee_id, recommendations')
        .eq('cycle_id', cycleId)
        .in('employee_id', empIdArray),
      supabase
        .from('employees_with_department')
        .select('id, employee_id, full_name, current_position, department, status')
        .in('id', empIdArray),
    ]);

    const periodTitle = cycleRow?.title ?? `Cycle ${cycleId}`;

    // Index evaluations strictly extracting final_score
    const evalByEmp = new Map<string, { finalScore: number | null; remarks: string; status: string }>();
    for (const r of (evalRows ?? []) as any[]) {
      evalByEmp.set(String(r.employee_id), {
        finalScore: r.final_score != null ? Number(r.final_score) : null,
        remarks: r.remarks ?? '',
        status: r.status ?? '',
      });
    }

    // Index possessed competencies
    const possessedByEmp = new Map<string, Map<string, { name: string; level: number }>>();
    for (const r of (possessedRows ?? []) as any[]) {
      const empId = String(r.employee_id);
      const display = String(
        r.competencies?.name ?? (Array.isArray(r.competencies) ? r.competencies[0]?.name : '') ?? r.competency_name ?? '',
      ).trim();
      const name = norm(display);
      const level = Number(r.proficiency_level);
      if (!empId || !name || !Number.isFinite(level)) continue;
      if (!possessedByEmp.has(empId)) possessedByEmp.set(empId, new Map());
      possessedByEmp.get(empId)!.set(name, { name: display, level });
    }

    // Index assessment runs
    const runByEmp = new Map<string, CompetencyAssessmentState>();
    for (const r of (runRows ?? []) as any[]) {
      const empId = String(r.employee_id);
      runByEmp.set(empId, r.status as CompetencyAssessmentState);
    }

    // Index summaries
    const summaryByEmp = new Map<string, string>();
    for (const r of (summaryRows ?? []) as any[]) {
      if (r.employee_id && r.recommendations) {
        summaryByEmp.set(String(r.employee_id), r.recommendations);
      }
    }

    // Index employees
    const empById = new Map<string, any>();
    for (const emp of (emps ?? []) as any[]) {
      empById.set(String(emp.id), emp);
    }

    const records: IPCRRatingRecord[] = [];

    for (const empId of empIdArray) {
      const emp = empById.get(empId);
      const evalData = evalByEmp.get(empId);
      const positionKey = norm(emp?.current_position);
      const positionReqs = requiredMap.get(positionKey);
      const possessed = possessedByEmp.get(empId) ?? new Map<string, { name: string; level: number }>();

      // Assessment state: from queue run first, else completed if summary or possessed exists, else unassessed
      let assessmentState: CompetencyAssessmentState = 'unassessed';
      if (runByEmp.has(empId)) {
        assessmentState = runByEmp.get(empId)!;
      } else if (summaryByEmp.has(empId) || possessed.size > 0) {
        assessmentState = 'complete';
      }

      // Union Competency Map requirements with assessed competencies
      const names = new Map<string, { name: string; required: number | null }>();
      for (const req of positionReqs?.values() ?? []) {
        names.set(norm(req.name), { name: req.name, required: req.required });
      }
      for (const [key, hit] of possessed.entries()) {
        if (!names.has(key)) {
          names.set(key, { name: hit.name, required: null });
        }
      }

      const competencies = [...names.values()].map((req) => {
        const hit = possessed.get(norm(req.name));
        const available = hit != null && Number.isFinite(hit.level);
        const possessedVal = available ? hit.level : 0;
        const requiredVal = req.required;
        const requiredAvailable = requiredVal != null;
        const isGap = available && requiredAvailable && possessedVal < requiredVal;

        return {
          name: req.name,
          possessed: possessedVal,
          required: requiredVal,
          requiredAvailable,
          isGap,
          possessedAvailable: available,
        };
      });

      const numericalRating = evalData?.finalScore ?? null;
      const needsTraining = competencies.some((c) => c.isGap);
      const employeeNumber = String(emp?.employee_id ?? emp?.id ?? empId);
      const empDepartment = rosterDeptMap.get(empId) ?? emp?.department ?? departmentName;

      let submissionStatus: 'SUBMITTED' | 'PENDING' | 'OVERDUE' = 'SUBMITTED';
      if (numericalRating === null && evalData?.status !== 'Approved') {
        submissionStatus = 'PENDING';
      }

      records.push({
        id: employeeNumber,
        department: empDepartment,
        name: String(emp?.full_name ?? '').trim() || 'Unknown employee',
        position: emp?.current_position ?? '—',
        period: periodTitle,
        numericalRating,
        remarks: evalData?.remarks || (needsTraining ? 'Training Recommended' : ''),
        submissionStatus,
        competencies,
        cycleId,
        assessmentState,
        assessmentStatus: assessmentState,
        recommendations: summaryByEmp.get(empId) ?? null,
      });
    }

    return records.sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    console.error(`Error in getPublishedRecords for "${departmentName}" cycle ${cycleId}:`, err);
    return [];
  }
}

/**
 * Triggers a retry for a failed competency assessment run.
 */
export async function retryCompetencyAssessment(
  employeeId: string,
  cycleId: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('competency_assessment_runs')
      .update({
        status: 'pending',
        last_error: null,
      })
      .eq('employee_id', employeeId)
      .eq('cycle_id', cycleId)
      .eq('stage', 'assessing');

    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to retry assessment' };
  }
}
