import { supabase as supabaseClient } from '../supabase';
import {
  evaluateSuccessionV2,
  rankSuccessionV2,
  PositionRequirementsV2,
  SuccessionV2Input,
  SuccessionV2Result,
  RankedSuccessionV2Result,
  ReviewedWorkV2,
  ReviewedTrainingV2,
  ReviewedEducationV2,
  ReviewedEligibilityV2,
  CanonicalDegreeV2,
  ProfessionalDegreeV2,
} from './successionScoringV2';
import {
  fetchSuccessionReviews,
  organizeReviewsByEmployee,
  isReviewStale,
  SuccessionEvidenceReview,
} from './successionReviews';
import { getLatestOverallScores } from './succession';

export interface SuccessionPoolV2 {
  positionId: string;
  scoringDate: string;
  requirements: PositionRequirementsV2;
  ranked: RankedSuccessionV2Result[];
  needsReview: SuccessionV2Result[];
  configurationNeeded: SuccessionV2Result[];
  excluded: SuccessionV2Result[];
}

export function parsePositionRequirementsV2(pos: {
  min_years_experience?: number | null;
  required_training_hours?: number | null;
  required_education?: string | null;
  required_eligibility?: string | null;
}): PositionRequirementsV2 {
  let education: PositionRequirementsV2['education'] = null;
  if (pos.required_education && pos.required_education.trim()) {
    const raw = pos.required_education.toLowerCase();
    let minimum: CanonicalDegreeV2 = 'bachelor';
    if (raw.includes('doctor') || raw.includes('phd')) minimum = 'doctorate';
    else if (raw.includes('master')) minimum = 'master';
    else minimum = 'bachelor';

    const field = pos.required_education
      .replace(/^(bachelor'?s?\s*(degree\s*(in\s*)?)?|master'?s?\s*(degree\s*(in\s*)?)?|doctorate\s*(degree\s*(in\s*)?)?|doctor of\s*|degree in\s*)/i, '')
      .trim() || 'Any relevant field';

    education = { minimum, field };
  }

  let eligibility: PositionRequirementsV2['eligibility'] = null;
  if (pos.required_eligibility !== undefined && pos.required_eligibility !== null) {
    const raw = pos.required_eligibility.trim().toLowerCase();
    if (raw === '' || raw === 'none' || raw === 'none required') {
      eligibility = { kind: 'none' };
    } else {
      eligibility = { kind: 'required', key: pos.required_eligibility.trim() };
    }
  }

  return {
    experienceYears: pos.min_years_experience ?? null,
    trainingHours: pos.required_training_hours ?? null,
    education,
    eligibility,
  };
}

export function normalizeDegree(level?: string | null, course?: string | null): CanonicalDegreeV2 | ProfessionalDegreeV2 {
  const combined = `${level ?? ''} ${course ?? ''}`.trim();
  const upper = combined.toUpperCase();

  if (/\bMD\b/.test(upper)) return 'MD';
  if (/\bDMD\b/.test(upper)) return 'DMD';
  if (/\bJD\b/.test(upper)) return 'JD';
  if (/\bLLB\b/.test(upper)) return 'LLB';
  if (/\bLLM\b/.test(upper)) return 'LLM';

  const lower = combined.toLowerCase();
  if (lower.includes('doctor') || lower.includes('phd')) return 'doctorate';
  if (lower.includes('master') || lower.includes('post graduate') || lower.includes('post-graduate')) return 'master';
  return 'bachelor';
}

function formatDate(isoOrDate: string | null | undefined): string | null {
  if (!isoOrDate) return null;
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(isoOrDate);
  return match ? match[1] : null;
}

export async function fetchSuccessionPoolV2(
  criticalPositionId: string,
  scoringDate: string = new Date().toISOString().slice(0, 10),
): Promise<SuccessionPoolV2> {
  // 1. Fetch critical position details
  const { data: posRow, error: posError } = await (supabaseClient as any)
    .from('critical_positions')
    .select('id, title, department_id, required_education, required_eligibility, min_years_experience, required_training_hours')
    .eq('id', criticalPositionId)
    .single();

  if (posError || !posRow) {
    throw new Error(`Failed to load critical position: ${posError?.message ?? 'Not found'}`);
  }

  const requirements = parsePositionRequirementsV2(posRow);

  // 2. Fetch candidates (manual candidates + department employees eligible)
  const [{ data: manualRows }, { data: deptEmps }, reviews] = await Promise.all([
    (supabaseClient as any)
      .from('succession_candidates')
      .select('id, employee_id, note')
      .eq('critical_position_id', criticalPositionId),
    (supabaseClient as any)
      .from('employees')
      .select('id, first_name, last_name, position, department_id, date_hired')
      .eq('department_id', posRow.department_id),
    fetchSuccessionReviews(criticalPositionId),
  ]);

  const candidateMap = new Map<string, { employeeId: string; name: string; manuallyNominated: boolean }>();

  // Add manual candidates
  for (const m of manualRows ?? []) {
    candidateMap.set(String(m.employee_id), {
      employeeId: String(m.employee_id),
      name: '', // will be resolved below
      manuallyNominated: true,
    });
  }

  // Add department employees
  for (const e of deptEmps ?? []) {
    const id = String(e.id);
    const fullName = `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim() || 'Employee ' + id.slice(0, 6);
    if (candidateMap.has(id)) {
      candidateMap.get(id)!.name = fullName;
    } else {
      candidateMap.set(id, {
        employeeId: id,
        name: fullName,
        manuallyNominated: false,
      });
    }
  }

  const candidateList = [...candidateMap.values()].filter((c) => c.name);
  const employeeIds = candidateList.map((c) => c.employeeId);

  if (!employeeIds.length) {
    return {
      positionId: criticalPositionId,
      scoringDate,
      requirements,
      ranked: [],
      needsReview: [],
      configurationNeeded: [],
      excluded: [],
    };
  }

  // 3. Batch fetch all evidence and IPCR scores
  const [
    { data: workRows },
    { data: trainingRows },
    { data: educationRows },
    { data: eligibilityRows },
    { data: compReqRows },
    { data: compTagRows },
    scoresMap,
  ] = await Promise.all([
    (supabaseClient as any)
      .from('employee_work_experience')
      .select('id, employee_id, from_date, to_date, is_present, position_title, company_name, department_agency_office_company')
      .in('employee_id', employeeIds),
    (supabaseClient as any)
      .from('employee_training')
      .select('id, employee_id, training_title, number_of_hours, from_date, to_date, conducted_by')
      .in('employee_id', employeeIds),
    (supabaseClient as any)
      .from('employee_education')
      .select('id, employee_id, level, course, year_graduated')
      .in('employee_id', employeeIds),
    (supabaseClient as any)
      .from('employee_eligibility')
      .select('id, employee_id, eligibility_type, validity_date')
      .in('employee_id', employeeIds),
    (supabaseClient as any)
      .from('critical_position_competency_requirements')
      .select('competency_id')
      .eq('critical_position_id', criticalPositionId),
    (supabaseClient as any)
      .from('employee_training_competencies')
      .select('employee_training_id, competency_id'),
    getLatestOverallScores(employeeIds),
  ]);

  // Group evidence by employee
  const workByEmp = new Map<string, any[]>();
  for (const w of workRows ?? []) {
    const k = String(w.employee_id);
    workByEmp.set(k, [...(workByEmp.get(k) ?? []), w]);
  }

  const trainingByEmp = new Map<string, any[]>();
  const trainingIdSet = new Set<string>();
  for (const t of trainingRows ?? []) {
    const k = String(t.employee_id);
    trainingByEmp.set(k, [...(trainingByEmp.get(k) ?? []), t]);
    trainingIdSet.add(String(t.id));
  }

  const educationByEmp = new Map<string, any[]>();
  for (const ed of educationRows ?? []) {
    const k = String(ed.employee_id);
    educationByEmp.set(k, [...(educationByEmp.get(k) ?? []), ed]);
  }

  const eligibilityByEmp = new Map<string, any[]>();
  for (const el of eligibilityRows ?? []) {
    const k = String(el.employee_id);
    eligibilityByEmp.set(k, [...(eligibilityByEmp.get(k) ?? []), el]);
  }

  // Competencies coverage
  const requiredCompIds = new Set<string>((compReqRows ?? []).map((r: any) => String(r.competency_id)));
  const compTagsByTraining = new Map<string, Set<string>>();
  for (const ct of compTagRows ?? []) {
    const tid = String(ct.employee_training_id);
    if (!compTagsByTraining.has(tid)) compTagsByTraining.set(tid, new Set());
    compTagsByTraining.get(tid)!.add(String(ct.competency_id));
  }

  const reviewMapByEmp = organizeReviewsByEmployee(reviews);
  const reqSnapshot = requirements as unknown as Record<string, unknown>;

  // 4. Assemble SuccessionV2Input and evaluate each candidate
  const evaluatedResults: SuccessionV2Result[] = [];

  for (const candidate of candidateList) {
    const empId = candidate.employeeId;
    const empReviews = reviewMapByEmp.get(empId) ?? new Map<string, SuccessionEvidenceReview>();

    // Work inventory
    const rawWork = workByEmp.get(empId) ?? [];
    const workRecords: ReviewedWorkV2[] = rawWork.map((w) => {
      const srcId = String(w.id);
      const rev = empReviews.get(`work:${srcId}`);
      const evidenceSnap = {
        from_date: w.from_date,
        to_date: w.to_date,
        is_present: w.is_present,
        position_title: w.position_title,
      };
      const stale = rev ? isReviewStale(rev, evidenceSnap, reqSnapshot) : false;
      return {
        sourceId: srcId,
        relevant: rev && !stale ? rev.isRelevant : null,
        cityHall: rev && !stale ? rev.isCityHall : null,
        startDate: formatDate(w.from_date) ?? '1970-01-01',
        endDate: w.is_present ? null : formatDate(w.to_date),
        present: Boolean(w.is_present),
      };
    });
    const workComplete = workRecords.length === 0 || workRecords.every((r) => r.relevant !== null && r.cityHall !== null);

    // Training inventory
    const rawTraining = trainingByEmp.get(empId) ?? [];
    const trainingRecords: ReviewedTrainingV2[] = rawTraining.map((t) => {
      const srcId = String(t.id);
      const rev = empReviews.get(`training:${srcId}`);
      const hours = Number(t.number_of_hours) || 0;
      const sDate = formatDate(t.from_date) ?? '1970-01-01';
      const eDate = formatDate(t.to_date) ?? sDate;
      const evidenceSnap = {
        title: t.training_title,
        hours,
        from_date: t.from_date,
        to_date: t.to_date,
      };
      const stale = rev ? isReviewStale(rev, evidenceSnap, reqSnapshot) : false;
      return {
        sourceId: srcId,
        relevant: rev && !stale ? rev.isRelevant : null,
        cityHall: rev && !stale ? rev.isCityHall : null,
        hours,
        completed: true,
        title: String(t.training_title ?? ''),
        provider: String(t.conducted_by ?? 'Unknown'),
        certificateId: null,
        startDate: sDate,
        endDate: eDate,
      };
    });
    const trainingComplete = trainingRecords.length === 0 || trainingRecords.every((r) => r.relevant !== null && r.cityHall !== null);

    // Education inventory
    const rawEducation = educationByEmp.get(empId) ?? [];
    const educationRecords: ReviewedEducationV2[] = rawEducation.map((ed) => {
      const srcId = String(ed.id);
      const rev = empReviews.get(`education:${srcId}`);
      const kind = normalizeDegree(ed.level, ed.course);
      const evidenceSnap = { level: ed.level, course: ed.course };
      const stale = rev ? isReviewStale(rev, evidenceSnap, reqSnapshot) : false;
      return {
        sourceId: srcId,
        kind,
        relevant: rev && !stale ? rev.isRelevant : null,
        matchesRequiredField: rev && !stale ? rev.matchesRequirement : null,
      };
    });
    const educationComplete = educationRecords.length === 0 || educationRecords.every((r) => r.relevant !== null && r.matchesRequiredField !== null);

    // Eligibility inventory
    const rawEligibility = eligibilityByEmp.get(empId) ?? [];
    const eligibilityRecords: ReviewedEligibilityV2[] = rawEligibility.map((el) => {
      const srcId = String(el.id);
      const rev = empReviews.get(`eligibility:${srcId}`);
      const typeKey = String(el.eligibility_type ?? '').trim();
      const expiryDate = formatDate(el.validity_date);
      const evidenceSnap = { eligibility_type: el.eligibility_type, validity_date: el.validity_date };
      const stale = rev ? isReviewStale(rev, evidenceSnap, reqSnapshot) : false;
      return {
        sourceId: srcId,
        typeKey,
        recognized: rev && !stale ? rev.isRelevant : null,
        relevant: rev && !stale ? rev.isRelevant : null,
        matchesRequirement: rev && !stale ? rev.matchesRequirement : null,
        expiryDate,
      };
    });
    const eligibilityComplete = eligibilityRecords.length === 0 || eligibilityRecords.every((r) => r.relevant !== null && r.recognized !== null);

    // Competencies met
    let metCompCount = 0;
    if (requiredCompIds.size > 0) {
      const empCompIds = new Set<string>();
      for (const t of rawTraining) {
        const cids = compTagsByTraining.get(String(t.id));
        if (cids) {
          for (const cid of cids) empCompIds.add(cid);
        }
      }
      for (const reqCid of requiredCompIds) {
        if (empCompIds.has(reqCid)) metCompCount++;
      }
    }

    const ipcr = scoresMap.get(empId)?.overallScore ?? null;

    const input: SuccessionV2Input = {
      candidate: {
        employeeId: empId,
        name: candidate.name,
        manuallyNominated: candidate.manuallyNominated,
      },
      positionId: criticalPositionId,
      scoringDate,
      requirements,
      work: { complete: workComplete, records: workRecords },
      training: { complete: trainingComplete, records: trainingRecords },
      education: { complete: educationComplete, records: educationRecords },
      eligibility: { complete: eligibilityComplete, records: eligibilityRecords },
      performanceRating: ipcr,
      competencies: {
        required: requiredCompIds.size,
        met: metCompCount,
      },
    };

    const res = evaluateSuccessionV2(input);
    evaluatedResults.push(res);
  }

  // 5. Partition results
  const scoredList = evaluatedResults.filter((r) => r.status === 'scored');
  const needsReviewList = evaluatedResults.filter((r) => r.status === 'needs-review');
  const configNeededList = evaluatedResults.filter((r) => r.status === 'configuration-needed');
  const excludedList = evaluatedResults.filter((r) => r.status === 'excluded');

  const ranked = scoredList.length > 0 ? rankSuccessionV2(scoredList) : [];

  return {
    positionId: criticalPositionId,
    scoringDate,
    requirements,
    ranked,
    needsReview: needsReviewList,
    configurationNeeded: configNeededList,
    excluded: excludedList,
  };
}
