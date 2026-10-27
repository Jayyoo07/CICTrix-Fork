/** Staged, pure scoring only. Callers must supply authorized, current reviews; no V1 imports. */
export type ReviewDecisionV2 = boolean | null;
export type CanonicalDegreeV2 = 'bachelor' | 'master' | 'doctorate';
export type ProfessionalDegreeV2 = 'MD' | 'DMD' | 'JD' | 'LLB' | 'LLM';

export interface PositionRequirementsV2 {
  experienceYears: number | null | undefined;
  trainingHours: number | null | undefined;
  education: { minimum: CanonicalDegreeV2; field: string } | null | undefined;
  eligibility: { kind: 'none' } | { kind: 'required'; key: string } | null | undefined;
  professionalDegreeMappings?: Partial<Record<ProfessionalDegreeV2, {
    approved: boolean;
    equivalentKind: CanonicalDegreeV2;
  }>>;
}

export interface ReviewedInventoryV2<T> {
  complete: boolean;
  records: T[];
}

export interface ReviewedWorkV2 {
  sourceId: string;
  relevant: ReviewDecisionV2;
  cityHall: ReviewDecisionV2;
  startDate: string;
  endDate: string | null;
  present: boolean;
}

export interface ReviewedTrainingV2 {
  sourceId: string;
  relevant: ReviewDecisionV2;
  cityHall: ReviewDecisionV2;
  hours: number;
  completed: boolean;
  title: string;
  provider: string;
  certificateId: string | null;
  startDate: string;
  endDate: string;
}

export interface ReviewedEducationV2 {
  sourceId: string;
  kind: CanonicalDegreeV2 | ProfessionalDegreeV2;
  relevant: ReviewDecisionV2;
  matchesRequiredField: ReviewDecisionV2;
}

export interface ReviewedEligibilityV2 {
  sourceId: string;
  typeKey: string;
  recognized: ReviewDecisionV2;
  relevant: ReviewDecisionV2;
  matchesRequirement: ReviewDecisionV2;
  expiryDate: string | null;
}

export interface SuccessionV2Input {
  candidate: { employeeId: string; name: string; manuallyNominated?: boolean };
  positionId: string;
  scoringDate: string;
  requirements: PositionRequirementsV2;
  work: ReviewedInventoryV2<ReviewedWorkV2>;
  training: ReviewedInventoryV2<ReviewedTrainingV2>;
  education: ReviewedInventoryV2<ReviewedEducationV2>;
  eligibility: ReviewedInventoryV2<ReviewedEligibilityV2>;
  performanceRating: number | null;
  competencies: { required: number; met: number };
}

export type SuccessionV2ReasonCode =
  | 'INVALID_IDENTITY' | 'INVALID_SCORING_DATE' | 'INVALID_PERFORMANCE' | 'INVALID_COMPETENCIES'
  | 'EXPERIENCE_REQUIREMENT_NEEDED' | 'TRAINING_REQUIREMENT_NEEDED'
  | 'EDUCATION_REQUIREMENT_NEEDED' | 'ELIGIBILITY_REQUIREMENT_NEEDED'
  | 'PROFESSIONAL_DEGREE_MAPPING_NEEDED'
  | 'WORK_REVIEW_INCOMPLETE' | 'TRAINING_REVIEW_INCOMPLETE'
  | 'EDUCATION_REVIEW_INCOMPLETE' | 'ELIGIBILITY_REVIEW_INCOMPLETE'
  | 'INVALID_WORK' | 'INVALID_TRAINING' | 'INVALID_EDUCATION' | 'INVALID_ELIGIBILITY'
  | 'CONFLICTING_WORK_DUPLICATE' | 'CONFLICTING_TRAINING_DUPLICATE'
  | 'CONFLICTING_EDUCATION_DUPLICATE' | 'CONFLICTING_ELIGIBILITY_DUPLICATE'
  | 'EXPERIENCE_MINIMUM_NOT_MET' | 'TRAINING_MINIMUM_NOT_MET'
  | 'EDUCATION_MINIMUM_NOT_MET' | 'ELIGIBILITY_MINIMUM_NOT_MET';

type MinimumV2 = 'met' | 'failed' | 'unknown';
export interface SuccessionV2Audit {
  performanceRating: number | null;
  relevantWorkDays: number;
  relevantYears: number;
  trainingHours: number;
  highestRelevantDegree: CanonicalDegreeV2 | null;
  distinctEligibilityTypes: string[];
  minimums: Record<'experience' | 'training' | 'education' | 'eligibility', MinimumV2>;
  requirements: PositionRequirementsV2;
  competencies: SuccessionV2Input['competencies'];
}

interface ResultBaseV2 {
  modelVersion: 'v2';
  positionId: string;
  scoringDate: string;
  candidate: SuccessionV2Input['candidate'];
  reasonCodes: SuccessionV2ReasonCode[];
  audit: SuccessionV2Audit;
}

export interface ScoredSuccessionV2Result extends ResultBaseV2 {
  status: 'scored';
  contributions: Record<'performance' | 'experience' | 'training' | 'education' | 'eligibility', number>;
  total: number;
  readiness: 'Ready Now' | 'Ready in 1–2 Years' | 'Developmental' | null;
}

export type SuccessionV2Result = ScoredSuccessionV2Result | (ResultBaseV2 & {
  status: 'excluded' | 'needs-review' | 'configuration-needed';
});
export type RankedSuccessionV2Result = ScoredSuccessionV2Result & { rank: number };

const DAY_MS = 86_400_000;
const DAYS_PER_YEAR = 365.25;
const MAXIMUMS = { performance: 30, experience: 20, training: 20, education: 15, eligibility: 15 };
const DEGREE_POINTS: Record<CanonicalDegreeV2, number> = { bachelor: 3, master: 9, doctorate: 15 };
const PROFESSIONAL_DEGREES: readonly string[] = ['MD', 'DMD', 'JD', 'LLB', 'LLM'];

function normalized(value: string): string {
  return typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase() : '';
}

function day(value: string): number | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const milliseconds = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(milliseconds) || new Date(milliseconds).toISOString().slice(0, 10) !== value) return null;
  return milliseconds / DAY_MS;
}

function canonicalDegree(value: string): value is CanonicalDegreeV2 {
  return value === 'bachelor' || value === 'master' || value === 'doctorate';
}

function finiteNonnegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function positive(value: unknown): value is number {
  return finiteNonnegative(value) && value > 0;
}

function decided(value: ReviewDecisionV2): value is boolean {
  return typeof value === 'boolean';
}

function roundPoints(value: number): number {
  // Scale the floating-point tolerance with the contribution, not just with one.
  return Math.round((value + Number.EPSILON * Math.max(1, value)) * 100) / 100;
}

/** Stable fingerprints avoid object-property order deciding duplicate results. */
function fingerprint(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(fingerprint).join(',')}]`;
  return `{${Object.entries(value).sort(([a], [b]) => compareText(a, b))
    .map(([key, entry]) => `${JSON.stringify(key)}:${fingerprint(entry)}`).join(',')}}`;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

interface ReviewState<T> {
  records: T[];
  complete: boolean;
  blocked: boolean;
}

/** Conflicting groups contribute nothing, regardless of which record arrived first. */
function dedupe<T>(records: T[], key: (record: T) => string, signature: (record: T) => string,
  conflict: () => void): T[] {
  const groups = new Map<string, T[]>();
  for (const record of records) {
    const identity = key(record);
    groups.set(identity, [...(groups.get(identity) ?? []), record]);
  }
  const unique: T[] = [];
  for (const group of groups.values()) {
    const first = group[0];
    if (group.some(record => signature(record) !== signature(first))) conflict();
    else unique.push(first);
  }
  return unique;
}

function unionDays(intervals: [number, number][]): number {
  const sorted = [...intervals].sort(([a], [b]) => a - b);
  let end = -Infinity;
  let days = 0;
  for (const [start, finish] of sorted) {
    days += Math.max(0, finish - Math.max(start, end + 1) + 1);
    end = Math.max(end, finish);
  }
  return days;
}

export function evaluateSuccessionV2(input: SuccessionV2Input): SuccessionV2Result {
  const reviewReasons = new Set<SuccessionV2ReasonCode>();
  const configReasons = new Set<SuccessionV2ReasonCode>();
  const failures = new Set<SuccessionV2ReasonCode>();
  const scoringDay = day(input.scoringDate);
  const requirements = input.requirements;
  if (!normalized(input.positionId) || !normalized(input.candidate?.employeeId) || !normalized(input.candidate?.name)) {
    reviewReasons.add('INVALID_IDENTITY');
  }
  if (scoringDay === null) reviewReasons.add('INVALID_SCORING_DATE');
  const performanceValid = input.performanceRating === null ||
    (finiteNonnegative(input.performanceRating) && input.performanceRating <= 5);
  if (!performanceValid) reviewReasons.add('INVALID_PERFORMANCE');
  const coverage = input.competencies;
  if (!coverage || !Number.isInteger(coverage.required) || !Number.isInteger(coverage.met) ||
      !finiteNonnegative(coverage.required) || !finiteNonnegative(coverage.met) || coverage.met > coverage.required) {
    reviewReasons.add('INVALID_COMPETENCIES');
  }

  function review<T extends { sourceId: string }>(inventory: ReviewedInventoryV2<T>,
    incomplete: SuccessionV2ReasonCode, invalid: SuccessionV2ReasonCode,
    duplicate: SuccessionV2ReasonCode): ReviewState<T> {
    const validInventory = inventory && Array.isArray(inventory.records);
    const state: ReviewState<T> = { records: [], complete: validInventory && inventory.complete === true, blocked: false };
    if (!state.complete) reviewReasons.add(incomplete);
    const records = validInventory ? inventory.records.filter(record => {
      if (record && normalized(record.sourceId)) return true;
      state.blocked = true;
      reviewReasons.add(invalid);
      return false;
    }) : [];
    state.records = dedupe<T>(records, record => record.sourceId.trim(), fingerprint, () => {
      state.blocked = true;
      reviewReasons.add(duplicate);
    });
    return state;
  }

  function block<T>(state: ReviewState<T>, reason: SuccessionV2ReasonCode) {
    state.blocked = true;
    reviewReasons.add(reason);
  }

  function minimum(proven: boolean, state: { complete: boolean; blocked: boolean },
    configured: boolean, reason: SuccessionV2ReasonCode): MinimumV2 {
    if (!configured) return 'unknown';
    if (proven) return 'met';
    if (state.complete && !state.blocked) {
      failures.add(reason);
      return 'failed';
    }
    return 'unknown';
  }

  const work = review(input.work, 'WORK_REVIEW_INCOMPLETE', 'INVALID_WORK', 'CONFLICTING_WORK_DUPLICATE');
  const intervals: [number, number][] = [];
  if (scoringDay === null) work.blocked = true;
  for (const record of work.records) {
    const start = day(record.startDate);
    const finish = record.present ? scoringDay : day(record.endDate ?? '');
    if (typeof record.present !== 'boolean' || (record.present && record.endDate !== null) ||
        start === null || (!record.present && (finish === null || finish < start))) {
      block(work, 'INVALID_WORK');
      continue;
    }
    if (!decided(record.relevant) || !decided(record.cityHall)) {
      block(work, 'WORK_REVIEW_INCOMPLETE');
      continue;
    }
    if (record.relevant && record.cityHall && scoringDay !== null && finish !== null && start <= scoringDay) {
      intervals.push([start, Math.min(finish, scoringDay)]);
    }
  }
  const relevantWorkDays = unionDays(intervals);
  const relevantYears = relevantWorkDays / DAYS_PER_YEAR;
  const experienceConfigured = positive(requirements?.experienceYears);
  if (!experienceConfigured) configReasons.add('EXPERIENCE_REQUIREMENT_NEEDED');
  const experienceMinimum = minimum(experienceConfigured && relevantYears >= requirements.experienceYears,
    work, experienceConfigured, 'EXPERIENCE_MINIMUM_NOT_MET');

  const training = review(input.training, 'TRAINING_REVIEW_INCOMPLETE', 'INVALID_TRAINING', 'CONFLICTING_TRAINING_DUPLICATE');
  if (scoringDay === null) training.blocked = true;
  training.records = dedupe(training.records, record => normalized(record.certificateId ?? '')
    ? `certificate:${normalized(record.certificateId ?? '')}`
    : fingerprint([normalized(record.title), normalized(record.provider), record.startDate, record.endDate]),
  record => fingerprint([record.hours, record.startDate, record.endDate, record.relevant, record.completed, record.cityHall]),
  () => block(training, 'CONFLICTING_TRAINING_DUPLICATE'));
  let trainingHours = 0;
  for (const record of training.records) {
    const start = day(record.startDate);
    const finish = day(record.endDate);
    if (!finiteNonnegative(record.hours) || start === null || finish === null || finish < start ||
        typeof record.completed !== 'boolean' || (!normalized(record.certificateId ?? '') &&
        (!normalized(record.title) || !normalized(record.provider)))) {
      block(training, 'INVALID_TRAINING');
      continue;
    }
    if (!decided(record.relevant) || !decided(record.cityHall)) {
      block(training, 'TRAINING_REVIEW_INCOMPLETE');
      continue;
    }
    if (record.relevant && record.completed && scoringDay !== null && finish <= scoringDay) trainingHours += record.hours;
  }
  if (!Number.isFinite(trainingHours)) block(training, 'INVALID_TRAINING');
  const trainingConfigured = positive(requirements?.trainingHours);
  if (!trainingConfigured) configReasons.add('TRAINING_REQUIREMENT_NEEDED');
  const trainingMinimum = minimum(trainingConfigured && trainingHours >= requirements.trainingHours,
    training, trainingConfigured, 'TRAINING_MINIMUM_NOT_MET');

  const education = review(input.education, 'EDUCATION_REVIEW_INCOMPLETE', 'INVALID_EDUCATION', 'CONFLICTING_EDUCATION_DUPLICATE');
  const educationRequirement = requirements?.education;
  const educationConfigured = !!educationRequirement && canonicalDegree(educationRequirement.minimum) &&
    !!normalized(educationRequirement.field);
  if (!educationConfigured) configReasons.add('EDUCATION_REQUIREMENT_NEEDED');
  let highestRelevantDegree: CanonicalDegreeV2 | null = null;
  let educationProven = false;
  for (const record of education.records) {
    if (!canonicalDegree(record.kind) && !PROFESSIONAL_DEGREES.includes(record.kind)) {
      block(education, 'INVALID_EDUCATION');
      continue;
    }
    if (!decided(record.relevant) || !decided(record.matchesRequiredField)) {
      block(education, 'EDUCATION_REVIEW_INCOMPLETE');
      continue;
    }
    if (!record.relevant) continue;
    let equivalent: CanonicalDegreeV2;
    if (canonicalDegree(record.kind)) equivalent = record.kind;
    else {
      const mapping = requirements?.professionalDegreeMappings?.[record.kind];
      if (!mapping || mapping.approved !== true || !canonicalDegree(mapping.equivalentKind)) {
        configReasons.add('PROFESSIONAL_DEGREE_MAPPING_NEEDED');
        education.blocked = true;
        continue;
      }
      equivalent = mapping.equivalentKind;
    }
    if (highestRelevantDegree === null || DEGREE_POINTS[equivalent] > DEGREE_POINTS[highestRelevantDegree]) {
      highestRelevantDegree = equivalent;
    }
    if (educationConfigured && record.matchesRequiredField &&
        DEGREE_POINTS[equivalent] >= DEGREE_POINTS[educationRequirement.minimum]) educationProven = true;
  }
  const educationMinimum = minimum(educationProven, education, educationConfigured, 'EDUCATION_MINIMUM_NOT_MET');

  const eligibility = review(input.eligibility, 'ELIGIBILITY_REVIEW_INCOMPLETE', 'INVALID_ELIGIBILITY', 'CONFLICTING_ELIGIBILITY_DUPLICATE');
  const eligibilityRequirement = requirements?.eligibility;
  const eligibilityConfigured = eligibilityRequirement?.kind === 'none' ||
    (eligibilityRequirement?.kind === 'required' && !!normalized(eligibilityRequirement.key));
  if (!eligibilityConfigured) configReasons.add('ELIGIBILITY_REQUIREMENT_NEEDED');
  if (scoringDay === null) eligibility.blocked = true;
  const types = new Set<string>();
  let eligibilityProven = eligibilityRequirement?.kind === 'none';
  for (const record of eligibility.records) {
    const expiry = record.expiryDate === null ? null : day(record.expiryDate);
    if (!normalized(record.typeKey) || (record.expiryDate !== null && expiry === null)) {
      block(eligibility, 'INVALID_ELIGIBILITY');
      continue;
    }
    if (!decided(record.relevant) || !decided(record.recognized) ||
        (eligibilityRequirement?.kind === 'required' && !decided(record.matchesRequirement))) {
      block(eligibility, 'ELIGIBILITY_REVIEW_INCOMPLETE');
      continue;
    }
    if (record.recognized && record.relevant && scoringDay !== null && (expiry === null || expiry >= scoringDay)) {
      types.add(normalized(record.typeKey));
      if (record.matchesRequirement === true) eligibilityProven = true;
    }
  }
  const eligibilityMinimum = minimum(eligibilityProven, eligibility, eligibilityConfigured, 'ELIGIBILITY_MINIMUM_NOT_MET');

  const base: ResultBaseV2 = {
    modelVersion: 'v2', candidate: { ...input.candidate }, positionId: input.positionId, scoringDate: input.scoringDate,
    reasonCodes: [...failures, ...configReasons, ...reviewReasons].sort(),
    audit: { performanceRating: input.performanceRating, relevantWorkDays, relevantYears, trainingHours,
      highestRelevantDegree, distinctEligibilityTypes: [...types].sort(), requirements, competencies: coverage,
      minimums: { experience: experienceMinimum, training: trainingMinimum, education: educationMinimum, eligibility: eligibilityMinimum } },
  };
  if (failures.size) return { ...base, status: 'excluded' };
  if (configReasons.size) return { ...base, status: 'configuration-needed' };
  if (reviewReasons.size) return { ...base, status: 'needs-review' };

  // Guards retain numeric narrowing and prevent a future invalid-requirement fallback.
  if (!positive(requirements.experienceYears) || !positive(requirements.trainingHours)) {
    return { ...base, status: 'configuration-needed' };
  }
  const contributions = {
    performance: roundPoints((input.performanceRating ?? 0) / 5 * MAXIMUMS.performance),
    // Divide in stages so doubling a finite requirement cannot overflow to Infinity.
    experience: roundPoints(Math.min(relevantYears / requirements.experienceYears / 2, 1) * MAXIMUMS.experience),
    training: roundPoints(Math.min(trainingHours / requirements.trainingHours / 2, 1) * MAXIMUMS.training),
    education: highestRelevantDegree === null ? 0 : DEGREE_POINTS[highestRelevantDegree],
    eligibility: Math.min(types.size, 2) / 2 * MAXIMUMS.eligibility,
  };
  const total = roundPoints(Object.values(contributions).reduce((sum, points) => sum + points, 0));
  let readiness: ScoredSuccessionV2Result['readiness'] = null;
  if (input.performanceRating !== null) {
    if (coverage.required > 0) {
      readiness = coverage.met === coverage.required ? 'Ready Now'
        : coverage.met / coverage.required >= 0.5 ? 'Ready in 1–2 Years' : 'Developmental';
    } else readiness = total >= 80 ? 'Ready Now' : total >= 60 ? 'Ready in 1–2 Years' : 'Developmental';
  }
  return { ...base, status: 'scored', contributions, total, readiness };
}

/** Pending states stay with the evaluator; a ranked pool must share position, model and date. */
export function rankSuccessionV2(results: readonly SuccessionV2Result[]): RankedSuccessionV2Result[] {
  const first = results[0];
  const unique = new Map<string, SuccessionV2Result>();
  for (const result of results) {
    if (result.modelVersion !== 'v2' || result.positionId !== first.positionId ||
        result.scoringDate !== first.scoringDate || day(result.scoringDate) === null) {
      throw new Error('Cannot rank a mixed or invalid position/model/date pool');
    }
    const previous = unique.get(result.candidate.employeeId);
    if (previous && fingerprint(previous) !== fingerprint(result)) throw new Error('Conflicting candidate results');
    unique.set(result.candidate.employeeId, result);
  }
  return [...unique.values()].filter((result): result is ScoredSuccessionV2Result => result.status === 'scored')
    .sort((a, b) => b.total - a.total || b.contributions.performance - a.contributions.performance ||
      compareText(normalized(a.candidate.name), normalized(b.candidate.name)) ||
      compareText(a.candidate.employeeId, b.candidate.employeeId))
    .map((result, index) => ({ ...result, rank: index + 1 }));
}
