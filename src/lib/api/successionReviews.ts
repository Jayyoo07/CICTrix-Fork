import { supabase as supabaseClient } from '../supabase';

export type ReviewCriterion = 'work' | 'training' | 'education' | 'eligibility';

export interface SuccessionEvidenceReview {
  id: string;
  criticalPositionId: string;
  employeeId: string;
  criterion: ReviewCriterion;
  sourceRecordId: string;
  isRelevant: boolean | null;
  isCityHall: boolean | null;
  matchesRequirement: boolean | null;
  evidenceSnapshot: Record<string, unknown>;
  requirementsSnapshot: Record<string, unknown>;
  reviewedBy: string | null;
  reviewedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaveEvidenceReviewInput {
  criticalPositionId: string;
  employeeId: string;
  criterion: ReviewCriterion;
  sourceRecordId: string;
  isRelevant?: boolean | null;
  isCityHall?: boolean | null;
  matchesRequirement?: boolean | null;
  evidenceSnapshot: Record<string, unknown>;
  requirementsSnapshot: Record<string, unknown>;
  reviewedBy?: string | null;
}

interface RawReviewRow {
  id: string;
  critical_position_id: string;
  employee_id: string;
  criterion: string;
  source_record_id: string;
  is_relevant: boolean | null;
  is_city_hall: boolean | null;
  matches_requirement: boolean | null;
  evidence_snapshot: Record<string, unknown> | null;
  requirements_snapshot: Record<string, unknown> | null;
  reviewed_by: string | null;
  reviewed_at: string;
  created_at: string;
  updated_at: string;
}

function mapRowToReview(row: RawReviewRow): SuccessionEvidenceReview {
  return {
    id: row.id,
    criticalPositionId: row.critical_position_id,
    employeeId: row.employee_id,
    criterion: row.criterion as ReviewCriterion,
    sourceRecordId: row.source_record_id,
    isRelevant: row.is_relevant ?? null,
    isCityHall: row.is_city_hall ?? null,
    matchesRequirement: row.matches_requirement ?? null,
    evidenceSnapshot: row.evidence_snapshot ?? {},
    requirementsSnapshot: row.requirements_snapshot ?? {},
    reviewedBy: row.reviewed_by ?? null,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? '';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

/**
 * Returns true if the evaluated evidence record or position requirements have drifted
 * since the review was recorded.
 */
export function isReviewStale(
  review: SuccessionEvidenceReview,
  currentRecordSnapshot: Record<string, unknown>,
  currentRequirementsSnapshot: Record<string, unknown>,
): boolean {
  if (stableStringify(review.evidenceSnapshot) !== stableStringify(currentRecordSnapshot)) {
    return true;
  }
  if (stableStringify(review.requirementsSnapshot) !== stableStringify(currentRequirementsSnapshot)) {
    return true;
  }
  return false;
}

/**
 * Fetch all evidence reviews for a critical position, optionally scoped to a single employee.
 */
export async function fetchSuccessionReviews(
  criticalPositionId: string,
  employeeId?: string,
): Promise<SuccessionEvidenceReview[]> {
  let query = (supabaseClient as any)
    .from('succession_evidence_reviews')
    .select('*')
    .eq('critical_position_id', criticalPositionId);

  if (employeeId) {
    query = query.eq('employee_id', employeeId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to fetch succession evidence reviews: ${error.message}`);
  }

  return ((data as RawReviewRow[]) || []).map(mapRowToReview);
}

/**
 * Save or update a single evidence review.
 */
export async function saveSuccessionReview(
  input: SaveEvidenceReviewInput,
): Promise<SuccessionEvidenceReview> {
  const payload = {
    critical_position_id: input.criticalPositionId,
    employee_id: input.employeeId,
    criterion: input.criterion,
    source_record_id: input.sourceRecordId,
    is_relevant: input.isRelevant ?? null,
    is_city_hall: input.isCityHall ?? null,
    matches_requirement: input.matchesRequirement ?? null,
    evidence_snapshot: input.evidenceSnapshot,
    requirements_snapshot: input.requirementsSnapshot,
    reviewed_by: input.reviewedBy ?? null,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await (supabaseClient as any)
    .from('succession_evidence_reviews')
    .upsert(payload, {
      onConflict: 'critical_position_id,employee_id,criterion,source_record_id',
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Failed to save succession evidence review: ${error.message}`);
  }

  return mapRowToReview(data as RawReviewRow);
}

/**
 * Batch save or update multiple evidence reviews in a single call.
 */
export async function batchSaveSuccessionReviews(
  inputs: SaveEvidenceReviewInput[],
): Promise<SuccessionEvidenceReview[]> {
  if (!inputs.length) return [];

  const now = new Date().toISOString();
  const payloads = inputs.map((input) => ({
    critical_position_id: input.criticalPositionId,
    employee_id: input.employeeId,
    criterion: input.criterion,
    source_record_id: input.sourceRecordId,
    is_relevant: input.isRelevant ?? null,
    is_city_hall: input.isCityHall ?? null,
    matches_requirement: input.matchesRequirement ?? null,
    evidence_snapshot: input.evidenceSnapshot,
    requirements_snapshot: input.requirementsSnapshot,
    reviewed_by: input.reviewedBy ?? null,
    reviewed_at: now,
    updated_at: now,
  }));

  const { data, error } = await (supabaseClient as any)
    .from('succession_evidence_reviews')
    .upsert(payloads, {
      onConflict: 'critical_position_id,employee_id,criterion,source_record_id',
    })
    .select('*');

  if (error) {
    throw new Error(`Failed to batch save succession evidence reviews: ${error.message}`);
  }

  return ((data as RawReviewRow[]) || []).map(mapRowToReview);
}

/**
 * Groups reviews into a Map: Map<employeeId, Map<`${criterion}:${sourceRecordId}`, SuccessionEvidenceReview>>
 */
export function organizeReviewsByEmployee(
  reviews: SuccessionEvidenceReview[],
): Map<string, Map<string, SuccessionEvidenceReview>> {
  const result = new Map<string, Map<string, SuccessionEvidenceReview>>();

  for (const r of reviews) {
    if (!result.has(r.employeeId)) {
      result.set(r.employeeId, new Map());
    }
    const empMap = result.get(r.employeeId)!;
    empMap.set(`${r.criterion}:${r.sourceRecordId}`, r);
  }

  return result;
}
