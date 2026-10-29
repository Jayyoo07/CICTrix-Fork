/**
 * Per-employee competency gap panel — shared by the PM and L&D Summary of
 * Ratings so both portals show the same gap breakdown + AI summary.
 *
 * The "Assessment Summary" is generated from the employee's competency breakdown
 * (possessed vs required proficiency from v_competency_gap_analysis or sorSemesterSource).
 * It reads as a narrative explaining where the employee lacks.
 */

import { AlertCircle, CheckCircle2, ChevronDown, Clock, MinusCircle, RefreshCw, Shield, Cpu, GraduationCap, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { IPCRRatingRecord, CompetencyAssessmentState } from './SummaryOfRatings';
import { supabase } from '../../../lib/supabase';
import { getCompetencyTargetTrace, type CompetencyTargetTrace } from '../../../lib/api/competencyTargetTrace';
import { retryCompetencyAssessment } from '../../../lib/api/sorSemesterSource';

type Comp = {
  name: string;
  possessed: number;
  /** Null when the Competency Map has no level for this position + competency. */
  required: number | null;
  isGap: boolean;
  possessedAvailable?: boolean;
  stream?: string;
};

export type TrainingStreamKey = 'LEADERSHIP' | 'TECHNICAL' | 'EMPLOYEE DEVELOPMENT' | 'CULTURAL TRANSFORMATION';

const normComp = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const STREAM_BY_NAME: Record<string, TrainingStreamKey> = {
  knowledgeoflocalgovernance: 'LEADERSHIP',
  publicadministrationprinciples: 'LEADERSHIP',
  projectmanagementinapublicsetting: 'LEADERSHIP',
  fiscalmanagementbudgetingforlgu: 'TECHNICAL',
  disasterriskreductionandmanagement: 'TECHNICAL',
  digitalliteracyforgovernmentservices: 'TECHNICAL',
  technicalwritingforgovernmentdocuments: 'TECHNICAL',
  dataandrecordsmanagementandorganization: 'TECHNICAL',
  communityengagementskills: 'EMPLOYEE DEVELOPMENT',
  publiccommunicationskills: 'EMPLOYEE DEVELOPMENT',
  transparencyandaccountabilitypractices: 'CULTURAL TRANSFORMATION',
  ethicalconductandpublicservicestandards: 'CULTURAL TRANSFORMATION',
};

const STREAM_CONFIG: {
  key: TrainingStreamKey;
  title: string;
  icon: React.ElementType;
  badgeClass: string;
  headerBorder: string;
  bgTint: string;
  description: string;
}[] = [
  {
    key: 'LEADERSHIP',
    title: 'Leadership',
    icon: Shield,
    badgeClass: 'bg-indigo-50 text-indigo-700 border border-indigo-200',
    headerBorder: 'border-indigo-200',
    bgTint: 'bg-indigo-50/20',
    description: 'Local governance, public administration principles, and project execution',
  },
  {
    key: 'TECHNICAL',
    title: 'Technical & Functional',
    icon: Cpu,
    badgeClass: 'bg-sky-50 text-sky-700 border border-sky-200',
    headerBorder: 'border-sky-200',
    bgTint: 'bg-sky-50/20',
    description: 'Fiscal management, disaster risk reduction, records, and digital systems',
  },
  {
    key: 'EMPLOYEE DEVELOPMENT',
    title: 'Employee Development',
    icon: GraduationCap,
    badgeClass: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    headerBorder: 'border-emerald-200',
    bgTint: 'bg-emerald-50/20',
    description: 'Community engagement and public communication skills',
  },
  {
    key: 'CULTURAL TRANSFORMATION',
    title: 'Cultural Transformation',
    icon: Sparkles,
    badgeClass: 'bg-amber-50 text-amber-700 border border-amber-200',
    headerBorder: 'border-amber-200',
    bgTint: 'bg-amber-50/20',
    description: 'Transparency, accountability, and ethical public service standards',
  },
];

/** A narrative summary of where the employee lacks, from their competency gaps. */
export function summarizeGaps(record: IPCRRatingRecord): string {
  const all = (record.competencies ?? []) as Comp[];
  const who = record.name.includes(',')
    ? record.name.split(',').map((s) => s.trim()).reverse().join(' ')
    : record.name;
  if (all.length === 0) return `No competency evaluation is available for ${who} this period.`;

  // "Not yet assessed" competencies (submitted IPCR, AI assessment pending) must
  // not be read as either strengths or gaps — call them out separately.
  const pending = all.filter((c) => c.possessedAvailable === false);
  const comps = all.filter((c) => c.possessedAvailable !== false);
  const pendingClause = pending.length
    ? ` ${pending.length} competenc${pending.length === 1 ? 'y is' : 'ies are'} awaiting competency assessment for this semester.`
    : '';
  if (comps.length === 0) {
    return `${who}'s IPCR is in, but the competency assessment for this semester hasn't run yet, so no possessed scores are available.${pendingClause}`;
  }

  // An assessed competency whose position has no Competency Map row cannot be
  // compared to a bar. It is neither a strength nor a gap; say so separately.
  const unconfigured = comps.filter((c) => c.required == null);
  const configured = comps.filter((c): c is Comp & { required: number } => c.required != null);
  const unconfiguredClause = unconfigured.length
    ? ` ${unconfigured.length} competenc${unconfigured.length === 1 ? 'y has' : 'ies have'} no required level configured for this position yet.`
    : '';
  if (configured.length === 0) {
    return `${who} has ${comps.length} assessed competenc${comps.length === 1 ? 'y' : 'ies'}, but the Competency Map has no required level for the ${record.position} role, so no gap can be measured.${pendingClause}`;
  }

  const gaps = configured
    .filter((c) => c.isGap)
    .sort((a, b) => (b.required - b.possessed) - (a.required - a.possessed));
  const strong = configured.length - gaps.length;

  if (gaps.length === 0) {
    return `${who} meets or exceeds the required proficiency on all ${configured.length} evaluated competencies for the ${record.position} role. No training gap identified this period.${unconfiguredClause}${pendingClause}`;
  }

  const phrases = gaps.map(
    (g) => `${g.name} (rated ${g.possessed.toFixed(2)} against a required ${g.required.toFixed(2)} — a ${(g.required - g.possessed).toFixed(2)}-point shortfall)`
  );
  const list = phrases.length === 1 ? phrases[0] : `${phrases.slice(0, -1).join('; ')}; and ${phrases[phrases.length - 1]}`;
  const strongClause = strong > 0 ? ` ${strong} other competenc${strong === 1 ? 'y is' : 'ies are'} at or above standard.` : '';

  return `${who}, ${record.position}, shows a development need in ${gaps.length} competenc${gaps.length === 1 ? 'y' : 'ies'}: ${list}.${strongClause}${unconfiguredClause}${pendingClause} Recommended action: targeted training on ${gaps.map((g) => g.name).join(', ')} to raise ${gaps.length === 1 ? 'it' : 'them'} to the required level.`;
}

export interface CompetencyGapPanelProps {
  record: IPCRRatingRecord;
  onRetryAssessment?: (record: IPCRRatingRecord) => void | Promise<void>;
}

export const CompetencyGapPanel = ({ record, onRetryAssessment }: CompetencyGapPanelProps) => {
  const comps = (record.competencies ?? []) as Comp[];
  const [recommendations, setRecommendations] = useState<string | null>(null);
  const [loadingRec, setLoadingRec] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [localStatus, setLocalStatus] = useState<CompetencyAssessmentState | null>(null);

  const rawState = localStatus ?? record.assessmentState ?? record.assessmentStatus;

  // Derive explicit assessment state (Step 9):
  // 1. "pending" / "running" -> "Analysis pending"
  // 2. "failed" -> "Analysis failed"
  // 3. "never_assessed" or no competencies -> "Never assessed"
  // 4. "complete" -> render normal breakdown (with "Required level not configured" for unconfigured position)
  let effectiveState: CompetencyAssessmentState;
  if (rawState === 'pending' || rawState === 'running') {
    effectiveState = 'pending';
  } else if (rawState === 'failed') {
    effectiveState = 'failed';
  } else if (rawState === 'never_assessed' || rawState === 'unassessed' || comps.length === 0) {
    effectiveState = 'never_assessed';
  } else if (rawState === 'complete') {
    effectiveState = 'complete';
  } else if (comps.length > 0 && comps.every((c) => c.possessedAvailable === false)) {
    effectiveState = 'pending';
  } else {
    effectiveState = 'complete';
  }

  useEffect(() => {
    let active = true;
    if (effectiveState !== 'complete') {
      return;
    }
    const fetchRecommendations = async () => {
      setLoadingRec(true);
      try {
        const { data, error } = await (supabase as any)
          .from('employee_competency_summaries')
          .select('recommendations, employees!inner(employee_number)')
          .eq('employees.employee_number', record.id)
          .order('created_at', { ascending: false })
          .limit(1);

        if (error) throw error;
        if (active) {
          if (data && data.length > 0) {
            setRecommendations(data[0].recommendations);
          } else {
            setRecommendations(null);
          }
        }
      } catch (err) {
        console.error('Error fetching recommendations in CompetencyGapPanel:', err);
      } finally {
        if (active) setLoadingRec(false);
      }
    };

    void fetchRecommendations();
    return () => {
      active = false;
    };
  }, [record.id, effectiveState]);

  const handleRetry = async () => {
    setRetrying(true);
    setRetryError(null);
    try {
      if (onRetryAssessment) {
        await onRetryAssessment(record);
        setLocalStatus('pending');
      } else if (record.cycleId) {
        const res = await retryCompetencyAssessment(record.employeeUuid ?? record.id, record.cycleId);
        if (res.success) {
          setLocalStatus('pending');
        } else {
          setRetryError(res.error ?? 'Retry failed');
        }
      } else {
        setLocalStatus('pending');
      }
    } catch (err: any) {
      setRetryError(err?.message ?? 'Failed to retry assessment');
    } finally {
      setRetrying(false);
    }
  };

  // When no competencies exist whatsoever, render explicit status box
  if (comps.length === 0) {
    if (effectiveState === 'pending') {
      return (
        <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4" data-testid="assessment-pending">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 animate-spin text-amber-600" />
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
              Analysis pending
            </span>
          </div>
          <p className="mt-2 text-xs text-amber-800">
            Competency evaluation is currently queued or in progress for this semester. Scores will be published once analysis completes.
          </p>
        </div>
      );
    }

    if (effectiveState === 'failed') {
      return (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4" role="alert" data-testid="assessment-failed">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600" />
              <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800">
                Analysis failed
              </span>
            </div>
            <button
              type="button"
              onClick={handleRetry}
              disabled={retrying}
              className="inline-flex items-center gap-1.5 rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 shadow-sm hover:bg-rose-50 transition disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`} />
              {retrying ? 'Retrying…' : 'Retry assessment'}
            </button>
          </div>
          <p className="mt-2 text-xs text-rose-800">
            Competency analysis encountered an error for this record. Click &ldquo;Retry assessment&rdquo; to re-queue the evaluation.
          </p>
          {retryError && (
            <p className="mt-1 text-xs text-rose-600">{retryError}</p>
          )}
        </div>
      );
    }

    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4" data-testid="never-assessed">
        <div className="flex items-center gap-2">
          <MinusCircle className="h-4 w-4 text-slate-400" />
          <span className="inline-flex items-center rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
            Never assessed
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-600">
          No competency assessment has been run for this employee for this period. This is distinct from a zero score. The rating shown above is the official IPCR final score.
        </p>
      </div>
    );
  }

  const gapCount = comps.filter((c) => c.isGap).length;

  return (
    <div className="space-y-4">
      {/* Informational Status Banner when assessment is not complete */}
      {effectiveState === 'pending' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3" data-testid="assessment-pending">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 animate-spin text-amber-600" />
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
              Analysis pending
            </span>
          </div>
          <p className="mt-1.5 text-xs text-amber-800">
            Competency evaluation is currently queued or in progress for this semester. Position requirements are shown below; possessed ratings will populate once analysis completes.
          </p>
        </div>
      )}

      {effectiveState === 'failed' && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3" role="alert" data-testid="assessment-failed">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-rose-600" />
              <span className="inline-flex items-center rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-800">
                Analysis failed
              </span>
            </div>
            <button
              type="button"
              onClick={handleRetry}
              disabled={retrying}
              className="inline-flex items-center gap-1.5 rounded-md border border-rose-300 bg-white px-3 py-1 text-xs font-semibold text-rose-700 shadow-sm hover:bg-rose-50 transition disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${retrying ? 'animate-spin' : ''}`} />
              {retrying ? 'Retrying…' : 'Retry assessment'}
            </button>
          </div>
          <p className="mt-1 text-xs text-rose-800">
            Competency analysis encountered an error for this record. Click &ldquo;Retry assessment&rdquo; to re-queue evaluation.
          </p>
          {retryError && (
            <p className="mt-1 text-xs text-rose-600">{retryError}</p>
          )}
        </div>
      )}

      {effectiveState === 'never_assessed' && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3" data-testid="never-assessed">
          <div className="flex items-center gap-2">
            <MinusCircle className="h-4 w-4 text-slate-400" />
            <span className="inline-flex items-center rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
              Never assessed
            </span>
          </div>
          <p className="mt-1.5 text-xs text-slate-600">
            No competency assessment has been run for this employee for this period. Required competencies for this position are displayed below; possessed scores will appear once evaluated.
          </p>
        </div>
      )}

      {/* Assessment summary */}
      <div className="rounded-lg border border-indigo-200 bg-indigo-50/70 p-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700">
          Assessment Summary
        </p>
        <p className="mt-1 text-sm leading-relaxed text-slate-700">{summarizeGaps(record)}</p>
      </div>

      {/* Recommended Training */}
      {loadingRec ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3 animate-pulse">
          <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
            Loading Recommended Training...
          </p>
        </div>
      ) : recommendations ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">
            Recommended Training
          </p>
          <p className="mt-1 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">{recommendations}</p>
        </div>
      ) : null}

      {/* Four Training Stream Blocks */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Competency Assessment · 4 Streams {gapCount > 0 && <span className="text-rose-600">· {gapCount} gap{gapCount === 1 ? '' : 's'}</span>}
          </h4>
          <span className="text-xs text-slate-400">click a competency card for IPCR source trace</span>
        </div>

        <div className="space-y-4">
          {STREAM_CONFIG.map((stream) => {
            const StreamIcon = stream.icon;
            const streamComps = comps.filter((c) => {
              const compStream = (c.stream ? c.stream.toUpperCase() : null) ?? STREAM_BY_NAME[normComp(c.name)] ?? 'TECHNICAL';
              return compStream === stream.key;
            });

            const streamGaps = streamComps.filter((c) => c.isGap).length;

            return (
              <div
                key={stream.key}
                className={`rounded-lg border ${stream.headerBorder} ${stream.bgTint} p-3.5 transition-all`}
                data-testid={`stream-block-${stream.key.toLowerCase().replace(/\s+/g, '-')}`}
              >
                {/* Stream Header */}
                <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <StreamIcon className="h-4 w-4 text-slate-600" />
                    <span className="text-xs font-bold text-slate-800">{stream.title}</span>
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${stream.badgeClass}`}>
                      {streamComps.length} {streamComps.length === 1 ? 'competency' : 'competencies'}
                    </span>
                    {streamGaps > 0 && (
                      <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
                        {streamGaps} gap{streamGaps === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-500 italic hidden sm:inline">
                    {stream.description}
                  </span>
                </div>

                {/* Stream Competency Cards */}
                {streamComps.length === 0 ? (
                  <div className="rounded-md border border-dashed border-slate-200 bg-white/60 p-3 text-center text-xs text-slate-400">
                    No specific competencies required for the {record.position} role in this stream.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                    {streamComps.map((comp) => {
                      const notAssessed = comp.possessedAvailable === false;
                      const compIndex = comps.indexOf(comp);
                      const open = selected === compIndex;

                      return (
                        <div key={comp.name} className="contents">
                          <button
                            type="button"
                            onClick={() => setSelected(open ? null : compIndex)}
                            aria-expanded={open}
                            className={`rounded-lg border p-3 text-left transition hover:shadow-sm ${
                              open ? 'ring-2 ring-indigo-300 ' : ''
                            }${
                              comp.isGap
                                ? 'border-rose-200 bg-rose-50/90'
                                : notAssessed
                                  ? 'border-amber-200 bg-amber-50/70'
                                  : 'border-slate-200 bg-white'
                            }`}
                          >
                            <div className="mb-2 flex items-start justify-between">
                              <span className="pr-2 text-xs font-bold leading-tight text-slate-800">
                                {comp.name}
                              </span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {comp.isGap ? (
                                  <AlertCircle className="h-4 w-4 text-rose-500" />
                                ) : notAssessed ? (
                                  <Clock className="h-4 w-4 text-amber-500" />
                                ) : comp.required == null ? (
                                  <MinusCircle className="h-4 w-4 text-slate-400" />
                                ) : (
                                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                )}
                                <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                              </div>
                            </div>
                            <div className="mt-2 flex items-center gap-4">
                              <div>
                                <span className="block text-[10px] uppercase tracking-wider text-slate-500">
                                  Required
                                </span>
                                {comp.required == null ? (
                                  <span className="text-xs font-semibold text-slate-400">
                                    Required level not configured
                                  </span>
                                ) : (
                                  <span className="text-sm font-semibold text-slate-700">
                                    {comp.required.toFixed(2)}
                                  </span>
                                )}
                              </div>
                              <div>
                                <span className="block text-[10px] uppercase tracking-wider text-slate-500">
                                  Possessed
                                </span>
                                {notAssessed ? (
                                  <span className="text-xs font-semibold text-amber-600">
                                    Not yet assessed
                                  </span>
                                ) : (
                                  <span className={`text-sm font-bold ${comp.isGap ? 'text-rose-600' : 'text-emerald-600'}`}>
                                    {comp.possessed.toFixed(2)}
                                  </span>
                                )}
                              </div>
                              {comp.isGap && (
                                <span className="ml-auto inline-flex rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-700">
                                  Gap
                                </span>
                              )}
                            </div>
                          </button>
                          {open && (
                            <div className="md:col-span-2 lg:col-span-3">
                              <TraceDetail
                                employeeNumber={record.employeeUuid ?? record.id}
                                competencyName={comp.name}
                                cycleId={record.cycleId ?? null}
                                card={comp}
                                position={record.position}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/**
 * Drill-down under a competency card (Requirement 1): the IPCR target(s) mapped
 * to the competency with their individual scores (A), how they aggregate into
 * the Possessed value (B), and the Required score's source (C). Reads the exact
 * chain the AI assessor used via getCompetencyTargetTrace — no re-derivation.
 */
const TraceDetail = ({
  employeeNumber,
  competencyName,
  cycleId,
  card,
  position,
}: {
  employeeNumber: string;
  competencyName: string;
  cycleId: number | null;
  card: Comp;
  position?: string;
}) => {
  const [trace, setTrace] = useState<CompetencyTargetTrace | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getCompetencyTargetTrace({ employeeNumber, competencyName, cycleId })
      .then((t) => {
        if (active) setTrace(t);
      })
      .catch((e) => {
        console.error('trace error:', e);
        if (active) setTrace(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [employeeNumber, competencyName, cycleId]);

  if (loading) {
    return (
      <div className="mt-1 animate-pulse rounded-lg border border-indigo-100 bg-indigo-50/50 p-3 text-xs text-indigo-500">
        Loading IPCR source…
      </div>
    );
  }

  const targets = trace?.mappedTargets ?? [];
  const noTargets = targets.length === 0;
  const possessed = card.possessedAvailable === false ? null : (trace?.possessedStored ?? card.possessed);
  const displayPosition = trace?.position || position;

  return (
    <div className="mt-1 space-y-3 rounded-lg border border-indigo-200 bg-white p-4 shadow-sm" data-testid="trace-detail-drawer">
      {/* C. Required source */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Required — from Competency Map</p>
        <p className="mt-0.5 text-sm text-slate-700">
          {displayPosition ? `${displayPosition} — ` : ''}{competencyName} — Required:{' '}
          {card.required == null
            ? 'Required level not configured for this position'
            : trace?.requiredLevel
              ? `${trace.requiredLevel} (${card.required.toFixed(2)})`
              : card.required.toFixed(2)}
        </p>
      </div>

      {/* A. Mapped IPCR targets */}
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Mapped IPCR target{targets.length === 1 ? '' : 's'}
        </p>
        {noTargets ? (
          <p className="mt-1 rounded border border-amber-200 bg-amber-50 p-2 text-sm text-amber-700">
            No IPCR target is currently mapped to this competency — the possessed score is{' '}
            {card.possessedAvailable === false ? 'not yet available (assessment pending).' : 'unavailable / defaulted.'}
          </p>
        ) : (
          <ul className="mt-1 space-y-2">
            {targets.map((t, i) => {
              const targetScore =
                t.individualScore != null
                  ? t.individualScore
                  : targets.length === 1 && possessed != null
                    ? possessed
                    : null;
              return (
                <li key={i} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <span className="text-xs text-slate-700 leading-relaxed">
                      {t.functionType && <span className="font-semibold text-slate-600">{t.functionType} — </span>}
                      {t.functionType ? t.targetText.replace(/^.*?—\s*/, '') : t.targetText}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[9px] font-semibold uppercase tracking-wider text-slate-400">IPCR rating</span>
                      <span className="text-sm font-bold text-slate-800">
                        {targetScore != null ? targetScore.toFixed(2) : '—'}
                      </span>
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                    {t.quality != null && <span className="rounded bg-slate-200/60 px-1.5 py-0.5 font-medium">Q {t.quality}</span>}
                    {t.efficiency != null && <span className="rounded bg-slate-200/60 px-1.5 py-0.5 font-medium">E {t.efficiency}</span>}
                    {t.timeliness != null && <span className="rounded bg-slate-200/60 px-1.5 py-0.5 font-medium">T {t.timeliness}</span>}
                    {t.confidence != null && (
                      <span className="inline-flex items-center rounded-full bg-indigo-50 border border-indigo-200 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                        {Math.round(t.confidence <= 1 ? t.confidence * 100 : t.confidence)}% confidence
                      </span>
                    )}
                  </div>
                  {t.justification && <p className="mt-1.5 text-[11px] italic leading-normal text-slate-500">{t.justification}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* B. How Possessed was calculated */}
      {!noTargets && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">How possessed was calculated</p>
          <p className="mt-0.5 text-sm text-slate-700">
            {card.possessedAvailable === false
              ? 'Possessed score is awaiting competency assessment for this semester.'
              : trace?.aggregationMethod === 'single'
                ? `Possessed ${possessed != null ? possessed.toFixed(2) : '—'} comes directly from the single mapped IPCR target above` +
                  (trace?.possessedComputed != null ? ` (scored ${trace.possessedComputed.toFixed(2)}).` : '.')
                : trace?.aggregationMethod === 'average'
                  ? `Possessed ${possessed != null ? possessed.toFixed(2) : '—'} is the average of ${targets.length} IPCR targets mapped to this competency` +
                    (trace?.possessedComputed != null
                      ? trace?.possessedStored != null && Math.abs(trace.possessedStored - trace.possessedComputed) >= 0.01
                        ? ` (mean ${trace.possessedComputed.toFixed(2)}, recorded as ${trace.possessedStored.toFixed(2)} on the 1–5 scale).`
                        : ` (mean ${trace.possessedComputed.toFixed(2)}, rounded to the 1-5 proficiency scale).`
                      : '.')
                  : `Possessed score is not yet computed because the mapped IPCR target${targets.length === 1 ? ' has' : 's have'} not received ratings yet.`}
          </p>
        </div>
      )}
    </div>
  );
};

export default CompetencyGapPanel;
