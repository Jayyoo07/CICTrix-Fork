import { useEffect, useMemo, useState } from 'react';
import { AdminHeader } from './AdminHeader';
import { ApplicantsTabBar } from './ApplicantsTabBar';
import { Sidebar } from './Sidebar';
import { useBackClosesView } from '../hooks/useHistoryBack';
import {
  ensureRecruitmentSeedData,
  getApplicants,
  getNewlyHiredFromSupabase,
  resolveDepartmentForPosition,
  saveApplicants,
} from '../lib/recruitmentData';
import type { PlantillaSlot } from '../types/recruitment.types';
import { reserveSlotForApplicant } from '../lib/plantillaSlots';
import { plantillaLabel } from '../lib/plantillaRules';
import { getEmployeePortalAccounts } from '../lib/employeePortalData';
import { signingForfeitWarning } from '../lib/api/applicantStatus';
import {
  DEFAULT_SIGNING_INSTRUCTIONS,
  RESERVED_STATUS,
  SIGNING_WINDOW_DAYS,
  fetchHiringContext,
  fetchOtherOpenApplications,
  type OtherApplication,
} from '../lib/hiringFlow';
import { formatDisplayDate, localIsoDate } from '../lib/scheduleSelection';
import { supabase } from '../lib/supabase';
import { TableRefreshBar, TableSkeletonRows, tableBodyClass, useTableLoading } from './table-loading';
import { buildEvaluationSnapshotMap, subscribeToEvaluationChanges, type EvaluationSnapshot } from '../lib/evaluationScores';
import {
  AlertTriangle,
  Briefcase,
  Building2,
  ChevronRight,
  Lock,
  UserCheck,
  Users,
} from 'lucide-react';

interface HiringRow {
  id: string;
  fullName: string;
  email: string;
  position: string;
  department: string;
  interviewScore: number | null;
  examScore: number | null;
  status: string;
  /** The one plantilla this application is for; null for legacy unlinked rows. */
  slot: PlantillaSlot | null;
  selectionRevokedAt: string | null;
}

const QUALIFY_STATUSES = ['qualified', 'recommended for hiring', 'accepted', 'for hiring', 'hired', 'for contract signing'];

// Disqualified, rejected and archived (Not Selected) applicants never surface
// here, regardless of scores.
const isRejected = (status: string) => {
  const s = status.toLowerCase().trim();
  return s.includes('not qualified') || s.includes('disqualif') || s.includes('reject') || s.includes('not selected');
};

const isReserved = (status: string) => status.toLowerCase().trim() === RESERVED_STATUS.toLowerCase();

/** One folder per plantilla: each plantilla is its own vacancy with one hire. */
const positionKeyOf = (row: Pick<HiringRow, 'position' | 'slot'>) =>
  row.slot ? `${row.position || 'No Position'} · ${plantillaLabel(row.slot)}` : row.position || 'No Position';

const addDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localIsoDate(date);
};

type SelectStep = 'loading' | 'notice' | 'confirm';

const isForHiring = (status: string) => {
  const s = status.toLowerCase().trim();
  if (isRejected(status)) return false;
  return QUALIFY_STATUSES.some(q => s.includes(q));
};

const CAT_SCORES_KEY = 'cictrix_category_scores';
const EXAM_SCORES_KEY = 'cictrix_exam_scores';

const oralRawToConvertedScore = (raw: number) => +Math.min(20, Math.max(0, (raw / 5) * 20)).toFixed(2);

// Mirrors the "Finalized" flag on the Applicant Score tab: an applicant is
// considered completed once RSP has saved their category scores (localStorage)
// or an interviewer evaluation is marked completed. Every completed applicant
// should appear in the For Hiring list even before being manually marked.
const buildCompletedSet = async (): Promise<Set<string>> => {
  const completed = new Set<string>();
  try {
    const catScores = JSON.parse(localStorage.getItem(CAT_SCORES_KEY) ?? '{}');
    Object.keys(catScores).forEach(id => completed.add(String(id)));
  } catch { /* ignore malformed cache */ }
  try {
    const { data } = await (supabase as any).from('evaluations').select('*');
    if (Array.isArray(data)) {
      buildEvaluationSnapshotMap(data).forEach(snap => {
        if (snap.completed) completed.add(String(snap.applicantId));
      });
    }
  } catch { /* evaluations unavailable — fall back to saved scores only */ }
  return completed;
};

const fmtScore = (v: number | null) => (v != null ? v.toFixed(2) : '—');

export const ForHiringPage = () => {
  const [rows, setRows]                         = useState<HiringRow[]>([]);
  const [loading, setLoading]                   = useState(true);
  const [selectedDept, setSelectedDept]         = useState<string | null>(null);
  // One plantilla takes one hire, so exactly one applicant is selected at a time.
  const [selectedId, setSelectedId]             = useState<string | null>(null);
  useBackClosesView(selectedDept !== null, () => { setSelectedDept(null); setSelectedPosition(null); setSelectedId(null); }, 'for-hiring-dept');
  const [selectedPosition, setSelectedPosition] = useState<string | null>(null);
  useBackClosesView(selectedPosition !== null, () => { setSelectedPosition(null); setSelectedId(null); }, 'for-hiring-position');

  // The select dialog: notice (other applications) → confirm (date, instructions).
  const [selectTarget, setSelectTarget]         = useState<HiringRow | null>(null);
  const [selectStep, setSelectStep]             = useState<SelectStep>('loading');
  const [otherApps, setOtherApps]               = useState<OtherApplication[]>([]);
  const [deadline, setDeadline]                 = useState('');
  const [instructions, setInstructions]         = useState(DEFAULT_SIGNING_INSTRUCTIONS);
  const [acknowledged, setAcknowledged]         = useState(false);
  const [reserving, setReserving]               = useState(false);
  const [selectError, setSelectError]           = useState<string | null>(null);

  // ── Data loading ────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        ensureRecruitmentSeedData();

        // Build job position -> department lookup from Supabase job postings
        const jobDeptMap = new Map<string, string>();
        try {
          const { data: jobData } = await (supabase as any).from('job_postings').select('*');
          if (Array.isArray(jobData)) {
            jobData.forEach((j: any) => {
              const titleKey = String(j.title || '').trim().toLowerCase();
              const deptName = String(j.department || j.office || '').trim();
              if (titleKey && deptName) jobDeptMap.set(titleKey, deptName);
            });
          }
        } catch { /* ignore */ }

        const isGenericCategory = (val: string) =>
          !val || ['operations', 'finance', 'human resources', 'unassigned', 'unassigned department'].includes(val.toLowerCase().trim());

        const resolveOffice = (pos: string, rawOffice?: string, rawDept?: string): string => {
          const o = String(rawOffice || '').trim();
          const d = String(rawDept || '').trim();
          const titleKey = String(pos || '').trim().toLowerCase();

          if (o && !isGenericCategory(o)) return o;
          if (d && !isGenericCategory(d)) return d;
          if (titleKey && jobDeptMap.has(titleKey)) return jobDeptMap.get(titleKey)!;
          if (o) return o;
          if (d) return d;
          return resolveDepartmentForPosition(pos) || 'Operations';
        };

        // Load evaluation snapshots from DB & local storage
        let evalSnapshotMap = new Map<string, EvaluationSnapshot>();
        try {
          const { data: evalData } = await (supabase as any).from('evaluations').select('*');
          if (Array.isArray(evalData)) {
            evalSnapshotMap = buildEvaluationSnapshotMap(evalData);
          } else {
            evalSnapshotMap = buildEvaluationSnapshotMap([]);
          }
        } catch {
          evalSnapshotMap = buildEvaluationSnapshotMap([]);
        }

        // Load local category and exam scores
        let catScores: Record<string, any> = {};
        try {
          catScores = JSON.parse(localStorage.getItem(CAT_SCORES_KEY) ?? '{}');
        } catch { /* ignore */ }

        let examScores: Record<string, Record<string, string>> = {};
        try {
          examScores = JSON.parse(localStorage.getItem(EXAM_SCORES_KEY) ?? '{}');
        } catch { /* ignore */ }

        const resolveApplicantScores = (
          id: string,
          email?: string,
          name?: string,
          position?: string,
          dbTotalScore?: number | null,
          dbQualScore?: number | null
        ) => {
          const sid = String(id);
          const semail = (email || '').toLowerCase().trim();
          const sname = (name || '').toLowerCase().trim();

          const snap = evalSnapshotMap.get(sid)
            || (semail ? evalSnapshotMap.get(`email:${semail}`) : null)
            || (sname ? evalSnapshotMap.get(`name:${sname}`) : null);

          const savedCat = catScores[sid]
            || (semail ? catScores[`email:${semail}`] : null);

          const posExamScoreStr = position && examScores[position]?.[sid] ? examScores[position][sid] : null;
          const posExamScore = posExamScoreStr && !isNaN(Number(posExamScoreStr)) ? Number(posExamScoreStr) : null;

          // 1. Exam score (Written Exam)
          let examScore: number | null = null;
          if (savedCat?.writtenExam?.finalScore != null) {
            examScore = Number(savedCat.writtenExam.finalScore);
          } else if (savedCat?.writtenExam?.initialScore != null && savedCat.writtenExam.initialScore > 0) {
            examScore = Number(savedCat.writtenExam.initialScore);
          } else if (posExamScore != null) {
            examScore = posExamScore;
          } else if (typeof snap?.writtenExamRawScore === 'number') {
            examScore = snap.writtenExamRawScore;
          } else if (dbQualScore != null && dbQualScore > 0) {
            examScore = dbQualScore;
          }

          // 2. Interview Score (Oral Examination / Interviewer Rating)
          let interviewScore: number | null = null;
          if (savedCat?.oralExam?.finalScore != null) {
            interviewScore = Number(savedCat.oralExam.finalScore);
          } else if (savedCat?.oralExam?.initialScore != null && savedCat.oralExam.initialScore > 0) {
            interviewScore = Number(savedCat.oralExam.initialScore);
          } else if (typeof snap?.oralRawScore === 'number') {
            interviewScore = snap.oralRawScore <= 5 ? oralRawToConvertedScore(snap.oralRawScore) : snap.oralRawScore;
          } else if (typeof snap?.score === 'number' && snap.score > 0) {
            interviewScore = snap.score;
          } else if (dbTotalScore != null && dbTotalScore > 0) {
            interviewScore = dbTotalScore;
          }

          return { interviewScore, examScore };
        };

        // Applicant qualifies for this list if it is already flagged for hiring
        // OR it is "completed" (Finalized) on the Applicant Score tab — but never
        // if it has been disqualified/rejected or if credentials have already been generated.
        const completedIds = await buildCompletedSet();
        const generatedApplicantIds = new Set<string>();
        const generatedEmails = new Set<string>();

        try {
          const newlyHired = await getNewlyHiredFromSupabase();
          if (Array.isArray(newlyHired)) {
            newlyHired.forEach(nh => {
              if (nh.applicantId) generatedApplicantIds.add(String(nh.applicantId));
              if (nh.employeeInfo?.email) generatedEmails.add(String(nh.employeeInfo.email).toLowerCase().trim());
            });
          }
        } catch { /* fallback to portal accounts */ }

        try {
          const portalAccounts = getEmployeePortalAccounts();
          if (Array.isArray(portalAccounts)) {
            portalAccounts.forEach(acc => {
              if (acc.employee?.email) generatedEmails.add(String(acc.employee.email).toLowerCase().trim());
            });
          }
        } catch { /* ignore */ }

        const includeApplicant = (id: string, status: string, email?: string) => {
          const sid = String(id);
          const normalizedEmail = (email || '').toLowerCase().trim();
          if (isRejected(status)) return false;

          // Exclude ONLY if account/credentials have actually been generated for this applicant
          if (generatedApplicantIds.has(sid) || (normalizedEmail && generatedEmails.has(normalizedEmail))) {
            return false;
          }

          return isForHiring(status) || completedIds.has(sid);
        };

        const local = getApplicants().filter(a => includeApplicant(a.id, a.status, a.personalInfo?.email));

        const remoteData: any[] = [];
        try {
          const res = await fetch('/api/applicants/?skip=0&limit=5000');
          if (res.ok) {
            const json = await res.json();
            if (Array.isArray(json)) remoteData.push(...json);
          }
        } catch { /* fallback */ }

        if (remoteData.length === 0) {
          try {
            const { data } = await (supabase as any)
              .from('applicants')
              .select('id,first_name,last_name,middle_name,full_name,email,position,office,department,status,qualification_score,total_score');
            if (Array.isArray(data)) remoteData.push(...data);
          } catch { /* local store only */ }
        }

        // Build remote map — API data is authoritative
        const remoteMap = new Map<string, HiringRow>();
        const newLocalEntries: any[] = [];

        remoteData.forEach((r: any) => {
          const status = String(r.status ?? '');
          const email = String(r.email ?? '');
          if (!includeApplicant(String(r.id), status, email)) return;

          const fullName = [r.first_name, r.middle_name, r.last_name].filter(Boolean).join(' ')
            || r.full_name || '';
          const position = r.position || '';
          const department = resolveOffice(position, r.office, r.department);
          const { interviewScore, examScore } = resolveApplicantScores(
            String(r.id),
            email,
            fullName,
            position,
            r.total_score != null ? Number(r.total_score) : null,
            r.qualification_score != null ? Number(r.qualification_score) : null
          );

          const row: HiringRow = {
            id:            String(r.id),
            fullName:      fullName || (r.email ? String(r.email).split('@')[0] : '—'),
            email:         r.email ?? '',
            position,
            department,
            interviewScore,
            examScore,
            status,
            slot: null,
            selectionRevokedAt: null,
          };
          remoteMap.set(row.id, row);

          const existsLocally = local.some(a => a.id === row.id);
          if (!existsLocally) {
            const nameParts = (row.fullName || '').split(/\s+/);
            newLocalEntries.push({
              id: row.id,
              jobPostingId: 'supabase-sync',
              personalInfo: {
                firstName: nameParts[0] || '',
                lastName:  nameParts.slice(1).join(' ') || '',
                email:     row.email,
                phone: '', address: '', dateOfBirth: '',
              },
              position:         row.position,
              department:       row.department,
              office:           row.department,
              qualificationScore: row.examScore ?? 0,
              status:           row.status as any,
              education: [], experience: [], skills: [],
              certifications: [], documents: [],
              applicationDate: new Date().toISOString(),
            });
          }
        });

        if (newLocalEntries.length > 0) {
          saveApplicants([...getApplicants(), ...newLocalEntries]);
        }

        // Merge: local baseline, then remote overwrites
        const mergedMap = new Map<string, HiringRow>();
        local.forEach(a => {
          const fullName = [a.personalInfo.firstName, a.personalInfo.lastName].filter(Boolean).join(' ')
            || a.personalInfo.email?.split('@')[0] || '—';
          const position = (a as any).position ?? '';
          const department = resolveOffice(position, (a as any).office, (a as any).department);
          const { interviewScore, examScore } = resolveApplicantScores(
            a.id,
            a.personalInfo.email,
            fullName,
            position,
            null,
            Number(a.qualificationScore ?? 0) || null
          );

          mergedMap.set(a.id, {
            id:            a.id,
            fullName,
            email:         a.personalInfo.email ?? '',
            position,
            department,
            interviewScore,
            examScore,
            status:         a.status,
            slot:           null,
            selectionRevokedAt: null,
          });
        });
        remoteMap.forEach((row, id) => mergedMap.set(id, row));

        // Which plantilla each application is for, its reservation, and any
        // revoked selection.
        const context = await fetchHiringContext(Array.from(mergedMap.keys()));
        mergedMap.forEach((row, id) => {
          row.slot = context.slotByApplicant.get(id) ?? null;
          row.selectionRevokedAt = context.revokedAt.get(id) ?? null;
        });

        const all = Array.from(mergedMap.values())
          // A filled plantilla's hire happens on the Generate Employee
          // Credentials tab; nobody else can be selected for it.
          .filter(r => !r.slot || r.slot.status !== 'filled')
          .sort((a, b) =>
          (a.department || 'zzz').localeCompare(b.department || 'zzz') ||
          (a.position   || 'zzz').localeCompare(b.position   || 'zzz')
        );
        setRows(all);
      } finally {
        setLoading(false);
      }
    };
    void load();
    const unsubscribeEvals = subscribeToEvaluationChanges(load);
    window.addEventListener('cictrix:applicants-updated', load);
    window.addEventListener('cictrix:category-scores-updated', load);
    return () => {
      unsubscribeEvals();
      window.removeEventListener('cictrix:applicants-updated', load);
      window.removeEventListener('cictrix:category-scores-updated', load);
    };
  }, []);

  // ── Department folder list ────────────────────────────────────────────────
  const rowsLoad = useTableLoading(loading, rows.length > 0);

  const departmentList = useMemo(() => {
    const map = new Map<string, { positions: Set<string>; count: number }>();
    rows.forEach(r => {
      const dept = r.department || 'No Department';
      if (!map.has(dept)) map.set(dept, { positions: new Set(), count: 0 });
      const entry = map.get(dept)!;
      entry.positions.add(positionKeyOf(r));
      entry.count++;
    });
    return Array.from(map.entries())
      .map(([dept, { positions, count }]) => ({
        dept,
        positionCount:  positions.size,
        applicantCount: count,
      }))
      .sort((a, b) => a.dept.localeCompare(b.dept));
  }, [rows]);

  // ── Position folders (one per plantilla) inside the selected department ───
  const positionList = useMemo(() => {
    if (!selectedDept) return [];
    const byKey = new Map<string, { applicantCount: number; reservedFor: HiringRow | null }>();
    rows
      .filter(r => (r.department || 'No Department') === selectedDept)
      .forEach(r => {
        const key = positionKeyOf(r);
        const entry = byKey.get(key) ?? { applicantCount: 0, reservedFor: null };
        entry.applicantCount++;
        if (isReserved(r.status)) entry.reservedFor = r;
        byKey.set(key, entry);
      });
    return Array.from(byKey.entries())
      .map(([position, entry]) => ({ position, ...entry }))
      .sort((a, b) => a.position.localeCompare(b.position));
  }, [rows, selectedDept]);

  // ── Applicants for the selected plantilla, sorted by interview score ──────
  const deptApplicants = useMemo(() => {
    if (!selectedDept || !selectedPosition) return [];
    return rows
      .filter(r => (r.department || 'No Department') === selectedDept && positionKeyOf(r) === selectedPosition)
      .sort((a, b) => (b.interviewScore ?? b.examScore ?? -1) - (a.interviewScore ?? a.examScore ?? -1));
  }, [rows, selectedDept, selectedPosition]);

  /** Who holds this plantilla while they sign; nobody else can be selected. */
  const reservedRow = deptApplicants.find(r => isReserved(r.status)) ?? null;
  const selectedRow = deptApplicants.find(r => r.id === selectedId) ?? null;

  // ── Select for Hiring: notice → confirm → reserve ─────────────────────────
  const closeSelectDialog = () => {
    setSelectTarget(null);
    setOtherApps([]);
    setSelectError(null);
    setAcknowledged(false);
  };

  const handleSelectClick = async () => {
    if (!selectedRow || reservedRow) return;
    setSelectTarget(selectedRow);
    setSelectStep('loading');
    setSelectError(null);
    setAcknowledged(false);
    setDeadline(addDays(SIGNING_WINDOW_DAYS));
    setInstructions(DEFAULT_SIGNING_INSTRUCTIONS);
    const others = await fetchOtherOpenApplications(selectedRow.email, selectedRow.id);
    setOtherApps(others);
    setSelectStep(others.length > 0 ? 'notice' : 'confirm');
  };

  const today = localIsoDate();
  const canConfirm = Boolean(selectTarget?.slot) && deadline >= today && acknowledged && !reserving;

  const handleConfirmSelect = async () => {
    if (!selectTarget || !selectTarget.slot || !canConfirm) return;
    setReserving(true);
    setSelectError(null);
    const result = await reserveSlotForApplicant(selectTarget.slot.id, selectTarget.id, deadline, instructions);
    setReserving(false);
    if (!result.ok) {
      setSelectError(result.error ?? 'The selection could not be saved. Try again.');
      return;
    }
    saveApplicants(getApplicants().map(a => (a.id === selectTarget.id ? { ...a, status: RESERVED_STATUS as any } : a)));
    setRows(prev => prev.map(r => (r.id === selectTarget.id ? { ...r, status: RESERVED_STATUS, selectionRevokedAt: null } : r)));
    setSelectedId(null);
    closeSelectDialog();
    window.dispatchEvent(new Event('cictrix:applicants-updated'));
  };

  // ── Shell layout ──────────────────────────────────────────────────────────
  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div className="rsp-ds min-h-screen bg-[var(--bg-page)]">
      <AdminHeader userName="RSP Admin" divisionLabel="RSP Division" />
      <div className="admin-layout">
        <Sidebar activeModule="RSP" userRole="rsp" />
        <main className="admin-content bg-slate-50 !p-0">
          <ApplicantsTabBar
            title="For Hiring"
            subtitle="Select one applicant per plantilla. Their credentials are generated after they sign."
          />
          {children}
        </main>
      </div>
    </div>
  );

  // ── VIEW 1 — Department folder table ──────────────────────────────────────
  if (!selectedDept) return (
    <Shell>
      <div className="p-6">
        {!rowsLoad.initialLoading && departmentList.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-20 text-slate-400">
            <Users className="mb-3 h-10 w-10" />
            <p className="font-medium">No qualified applicants yet.</p>
            <p className="mt-1 text-sm">Applicants completed in the Applicant Score appear here.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Department</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Positions</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Applicants</th>
                  <th className="w-10 px-5 py-3" />
                </tr>
                <TableRefreshBar active={rowsLoad.refreshing} colSpan={4} />
              </thead>
              <tbody className={tableBodyClass(rowsLoad.refreshing)}>
                {rowsLoad.initialLoading ? (
                  <TableSkeletonRows show={rowsLoad.showSkeleton} columns={['text', 'text', 'text', 'text']} label="Loading departments…" />
                ) : departmentList.map(({ dept, positionCount, applicantCount }) => (
                  <tr
                    key={dept}
                    onClick={() => { setSelectedDept(dept); setSelectedId(null); }}
                    className="border-b border-slate-100 last:border-0 cursor-pointer transition-colors hover:bg-blue-50/40 group"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="shrink-0 rounded-xl bg-[var(--color-primary-50)] p-2 text-[var(--color-primary)]">
                          <Building2 className="h-5 w-5" />
                        </div>
                        <span className="text-sm font-semibold text-slate-900">{dept}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-center text-sm text-slate-600">
                      {positionCount} {positionCount === 1 ? 'position' : 'positions'}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className="badge badge-tint">
                        <Users className="h-3 w-3" />
                        {applicantCount} {applicantCount === 1 ? 'applicant' : 'applicants'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-slate-400 group-hover:text-[var(--color-primary)] transition-colors">
                      <ChevronRight className="h-4 w-4" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </Shell>
  );

  // ── VIEW 2 — Plantilla folders for the selected department ────────────────
  if (!selectedPosition) return (
    <Shell>
      <div className="p-6">
        <div className="mb-5">
          <h1 className="text-xl font-bold text-slate-900">{selectedDept}</h1>
          <p className="text-sm text-slate-500">
            {positionList.length} position{positionList.length !== 1 ? 's' : ''} with qualified applicants
          </p>
        </div>
        {positionList.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-20 text-slate-400">
            <Users className="mb-3 h-10 w-10" />
            <p className="font-medium">No applicants in this department.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Position</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Applicants</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Hiring</th>
                  <th className="w-10 px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {positionList.map(({ position, applicantCount, reservedFor }) => (
                  <tr
                    key={position}
                    onClick={() => { setSelectedPosition(position); setSelectedId(null); }}
                    className="border-b border-slate-100 last:border-0 cursor-pointer transition-colors hover:bg-blue-50/40 group"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="shrink-0 rounded-xl bg-[var(--color-primary-50)] p-2 text-[var(--color-primary)]">
                          <Briefcase className="h-5 w-5" />
                        </div>
                        <span className="text-sm font-semibold text-slate-900">{position}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className="badge badge-tint">
                        {applicantCount} {applicantCount === 1 ? 'applicant' : 'applicants'}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {/* §10 application status: For Interview / pending = Warning, open = Info */}
                      {reservedFor ? (
                        <span className="badge badge-warning" title={`Reserved for ${reservedFor.fullName}`}>
                          <span className="badge-dot" aria-hidden="true" />Reserved
                        </span>
                      ) : (
                        <span className="badge badge-info"><span className="badge-dot" aria-hidden="true" />Open</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-slate-400 group-hover:text-[var(--color-primary)] transition-colors">
                      <ChevronRight className="h-4 w-4" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Shell>
  );

  // ── VIEW 3 — Ranked applicants for one plantilla ──────────────────────────
  return (
    <Shell>
      <div className="p-6">
        {/* Header */}
        <div className="mb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{selectedDept}</p>
            <h1 className="text-xl font-bold text-slate-900">{selectedPosition}</h1>
            <p className="text-sm text-slate-500">
              {deptApplicants.length} qualified applicant{deptApplicants.length !== 1 ? 's' : ''}, ranked by interview score. One is hired.
            </p>
          </div>
          <button
            type="button"
            disabled={!selectedRow || Boolean(reservedRow)}
            onClick={() => { void handleSelectClick(); }}
            className="btn btn-md btn-primary mt-4"
          >
            <UserCheck className="h-4 w-4" aria-hidden="true" />
            Select for Hiring
          </button>
        </div>

        {/* §9.9 warning alert: only one applicant can hold the plantilla. */}
        {reservedRow && (
          <div role="status" className="mb-4 flex items-start gap-3 rounded-xl border-l-4 border-[var(--warning-500)] bg-[var(--warning-100)] p-4">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-[var(--warning-700)]" aria-hidden="true" />
            <div className="text-sm text-[var(--neutral-800)]">
              <p className="font-semibold text-[var(--color-primary-900)]">
                Reserved for {reservedRow.fullName} until {formatDisplayDate(reservedRow.slot?.signingDeadline)}
              </p>
              <p>
                Only one applicant can be selected for this plantilla. Generate their credentials once they sign, or mark them
                "Did not report" on the Generate Employee Credentials tab to select someone else.
              </p>
            </div>
          </div>
        )}

        {deptApplicants.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white py-20 text-slate-400">
            <Users className="mb-3 h-10 w-10" />
            <p className="font-medium">No applicants for this position.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <table className="w-full min-w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="w-12 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Rank</th>
                  <th className="w-10 px-3 py-3"><span className="sr-only">Select</span></th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Applicant Name</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Interview Score</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Exam Score</th>
                </tr>
                <TableRefreshBar active={rowsLoad.refreshing} colSpan={6} />
              </thead>
              <tbody className={tableBodyClass(rowsLoad.refreshing)}>
                {deptApplicants.map((row, idx) => {
                  const rank = idx + 1;
                  const medalBg =
                    rank === 1 ? 'bg-yellow-400 text-yellow-900'  :
                    rank === 2 ? 'bg-slate-300 text-slate-800'    :
                    rank === 3 ? 'bg-amber-500 text-amber-900'    :
                                 'bg-slate-100 text-slate-600';
                  const reserved = isReserved(row.status);
                  const blockedReason = !row.slot
                    ? 'This application is not linked to a plantilla. Link it from the job post first.'
                    : reservedRow
                      ? `Plantilla reserved for ${reservedRow.fullName}.`
                      : undefined;
                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-slate-100 last:border-0 transition-colors hover:bg-slate-50 ${selectedId === row.id ? 'bg-[var(--color-primary-50)]' : ''} ${reservedRow && !reserved ? 'opacity-60' : ''}`}
                    >
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${medalBg}`}>
                          {rank}
                        </span>
                      </td>
                      <td className="px-3 py-4 text-center">
                        <input
                          type="radio"
                          name="for-hiring-select"
                          aria-label={`Select ${row.fullName}`}
                          checked={selectedId === row.id}
                          disabled={Boolean(blockedReason)}
                          title={blockedReason}
                          onChange={() => setSelectedId(row.id)}
                          className="h-4 w-4 accent-[var(--color-primary)] disabled:cursor-not-allowed"
                        />
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-slate-900">{row.fullName}</p>
                        <p className="text-xs text-slate-400">{row.email}</p>
                        {row.selectionRevokedAt && !reserved && (
                          <p className="mt-0.5 text-xs text-[var(--neutral-600)]">
                            Selection revoked {formatDisplayDate(row.selectionRevokedAt)}: did not report
                          </p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {reserved ? (
                          <span className="badge badge-warning"><span className="badge-dot" aria-hidden="true" />Awaiting signing</span>
                        ) : (
                          <span className="badge badge-success"><span className="badge-dot" aria-hidden="true" />Qualified</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className={`text-sm font-bold ${row.interviewScore != null ? 'text-[var(--color-primary-900)]' : 'text-slate-300'}`}>
                          {fmtScore(row.interviewScore)}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className={`text-sm font-bold ${row.examScore != null ? 'text-[var(--color-primary-900)]' : 'text-slate-300'}`}>
                          {fmtScore(row.examScore)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {renderSelectDialog()}
    </Shell>
  );

  // ── Select for Hiring dialog: notice → confirm ────────────────────────────
  function renderSelectDialog() {
    if (!selectTarget) return null;
    const plantilla = selectTarget.slot ? plantillaLabel(selectTarget.slot) : '';
    const deadlineText = deadline ? formatDisplayDate(deadline) : '[date]';
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--overlay)] px-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="select-dialog-title"
      >
        <div className="max-h-[90vh] w-full max-w-[480px] overflow-y-auto rounded-2xl bg-white p-6 shadow-[var(--shadow-3)]">
          {selectStep === 'loading' && (
            <p className="text-sm text-[var(--neutral-600)]" aria-busy="true">Checking the applicant's other applications…</p>
          )}

          {selectStep === 'notice' && (
            <>
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-[10px] bg-[var(--warning-100)] text-[var(--warning-500)]">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </div>
              <h2 id="select-dialog-title" className="mb-1 text-base font-semibold text-[var(--color-primary-900)]">
                {selectTarget.fullName} applied to other positions
              </h2>
              <p className="mb-3 text-sm text-[var(--neutral-600)]">
                They have {otherApps.length} other open application{otherApps.length === 1 ? '' : 's'}:
              </p>
              <ul className="divide-y divide-[var(--neutral-200)] rounded-xl border border-[var(--neutral-200)] text-sm">
                {otherApps.map(app => (
                  <li key={app.id} className="px-3 py-2.5">
                    <p className="font-semibold text-[var(--color-primary-900)]">{app.position}</p>
                    <p className="text-xs text-[var(--neutral-600)]">{[app.office, app.plantilla].filter(Boolean).join(' · ')}</p>
                    <span className="badge badge-neutral mt-1">{app.status || 'Submitted'}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-[var(--neutral-800)]">
                Continue selecting them for <b>{selectTarget.position}{plantilla ? ` · ${plantilla}` : ''}</b>? Their other
                applications close once their credentials are generated.
              </p>
              <div className="mt-5 flex justify-end gap-3">
                <button type="button" className="btn btn-md btn-secondary" onClick={closeSelectDialog}>Cancel</button>
                <button type="button" className="btn btn-md btn-primary" onClick={() => setSelectStep('confirm')}>Continue</button>
              </div>
            </>
          )}

          {selectStep === 'confirm' && (
            <>
              <h2 id="select-dialog-title" className="mb-1 text-base font-semibold text-[var(--color-primary-900)]">
                Select {selectTarget.fullName} for {selectTarget.position}?
              </h2>
              <p className="mb-3 text-sm text-[var(--neutral-600)]">{plantilla || 'No plantilla linked'} · {selectTarget.department}</p>

              <div className="rounded-xl border-l-4 border-[var(--warning-500)] bg-[var(--warning-100)] p-3 text-sm text-[var(--neutral-800)]">
                <b>This updates the applicant's status and cannot be undone</b>, unless the applicant does not secure the
                slot by the date below.
              </div>

              <label htmlFor="signing-deadline" className="mb-1.5 mt-4 block text-[13px] font-medium text-[var(--neutral-800)]">
                Report to the office on or before <span className="text-[var(--error-500)]">*</span>
              </label>
              <input
                id="signing-deadline"
                type="date"
                min={today}
                value={deadline}
                onChange={(event) => setDeadline(event.target.value)}
                className="h-10 w-full rounded-lg border border-[var(--neutral-200)] px-3 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-[3px] focus:ring-[var(--color-primary-200)]"
              />

              <label htmlFor="signing-instructions" className="mb-1.5 mt-4 block text-[13px] font-medium text-[var(--neutral-800)]">
                Instructions to the applicant
              </label>
              <textarea
                id="signing-instructions"
                rows={4}
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                aria-describedby="signing-instructions-help"
                className="w-full rounded-lg border border-[var(--neutral-200)] px-3 py-2 text-sm leading-relaxed focus:border-[var(--color-primary)] focus:outline-none focus:ring-[3px] focus:ring-[var(--color-primary-200)]"
              />
              <p id="signing-instructions-help" className="mt-1 text-xs text-[var(--neutral-600)]">
                Shown on their status tracker as a congratulatory notice, always followed by: "{signingForfeitWarning(deadlineText)}"
              </p>

              <label className="mt-4 flex items-start gap-2 text-sm text-[var(--neutral-800)]">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  className="mt-0.5 h-[18px] w-[18px] accent-[var(--color-primary)]"
                />
                I understand this cannot be revoked unless the applicant does not secure the slot.
              </label>

              {!selectTarget.slot && (
                <p className="mt-3 text-xs font-medium text-[var(--error-700)]">
                  This application is not linked to a plantilla, so it cannot be reserved. Link it from the job post first.
                </p>
              )}
              {selectError && (
                <p role="alert" className="mt-3 text-sm font-medium text-[var(--error-700)]">{selectError}</p>
              )}

              <div className="mt-5 flex justify-end gap-3">
                <button
                  type="button"
                  className="btn btn-md btn-secondary"
                  disabled={reserving}
                  onClick={() => (otherApps.length > 0 ? setSelectStep('notice') : closeSelectDialog())}
                >
                  {otherApps.length > 0 ? 'Back' : 'Cancel'}
                </button>
                <button type="button" className="btn btn-md btn-primary" disabled={!canConfirm} onClick={() => { void handleConfirmSelect(); }}>
                  {reserving ? 'Saving…' : 'Confirm Selection'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }
};
