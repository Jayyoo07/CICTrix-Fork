import { useState } from 'react';
import { ArrowRight, RotateCcw, Trash2, X, XCircle } from 'lucide-react';
import { RESTORE_TARGETS } from '../../../../lib/api/rspArchives';
import type { ApplicantWorkflowStatus } from '../../../../lib/api/applicantStatus';
import type { ArchiveRecord } from './model';
import { StatusBadge } from './StatusBadge';
import { useFocusTrap } from './useFocusTrap';

const MIN_REASON_LENGTH = 5;
const DEFAULT_RESTORE_TARGET: ApplicantWorkflowStatus = 'For Evaluation';

const DialogShell = ({ title, onCancel, children }: { title: string; onCancel: () => void; children: React.ReactNode }) => {
  const ref = useFocusTrap<HTMLDivElement>(onCancel);
  return (
    <div className="fixed inset-0 z-[55] grid place-items-center overflow-y-auto bg-[var(--overlay)] p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="archive-dialog-title" className="w-full max-w-[480px] rounded-2xl bg-white p-6 shadow-[var(--shadow-3)]">
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 id="archive-dialog-title" className="!mb-0 text-xl font-semibold text-[var(--color-primary-900)]">{title}</h2>
          <button type="button" onClick={onCancel} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--neutral-600)] hover:bg-[var(--bg-page)]">
            <X className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

export const RestoreDialog = ({ record, onCancel, onConfirm }: {
  record: ArchiveRecord;
  onCancel: () => void;
  onConfirm: (status: ApplicantWorkflowStatus, reason: string) => Promise<boolean>;
}) => {
  const [target, setTarget] = useState<ApplicantWorkflowStatus>(DEFAULT_RESTORE_TARGET);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ready = reason.trim().length >= MIN_REASON_LENGTH;

  const submit = async () => {
    setBusy(true); setError('');
    const ok = await onConfirm(target, reason.trim());
    if (!ok) { setBusy(false); setError("We couldn't restore this application. Check your connection and try again."); }
  };

  return (
    <DialogShell title={`Restore ${record.name}?`} onCancel={onCancel}>
      <p className="!mb-4 text-sm leading-[22px] text-[var(--neutral-800)]">
        Their application for <b>{record.position}</b> leaves the archive and goes back to Applications.
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-2.5 rounded-xl bg-[var(--bg-page)] px-4 py-3">
        <StatusBadge type="Disqualified" />
        <ArrowRight className="h-4 w-4 text-[var(--neutral-600)]" strokeWidth={1.75} aria-hidden="true" />
        <select aria-label="Return to status" value={target} onChange={(e) => setTarget(e.target.value as ApplicantWorkflowStatus)} className="h-9 rounded-lg border border-[var(--neutral-200)] bg-white px-2.5 text-sm font-medium text-[var(--color-primary-900)]">
          {RESTORE_TARGETS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <label htmlFor="restore-reason" className="mb-1.5 block text-[13px] font-medium text-[var(--neutral-800)]">
        Reason for restoring <span className="text-[var(--error-500)]" aria-hidden="true">*</span><span className="sr-only">(required)</span>
      </label>
      <textarea
        id="restore-reason"
        data-autofocus
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. Exam attendance confirmed by the proctor's log"
        aria-describedby="restore-help"
        className="w-full resize-y rounded-lg border border-[var(--neutral-200)] px-3 py-2.5 text-sm font-medium text-[var(--neutral-800)] placeholder:text-[var(--neutral-600)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-[3px] focus:ring-[rgba(54,62,232,.15)]"
      />
      <p id="restore-help" className="!mb-0 mt-1 text-xs font-medium text-[var(--neutral-600)]">Saved on the application with your name and today's date.</p>
      {error && <p role="alert" className="!mb-0 mt-3 text-xs font-medium text-[var(--error-700)]">{error}</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-3">
        <button type="button" className="btn btn-secondary btn-md" onClick={onCancel}>Cancel</button>
        <button type="button" className={`btn btn-primary btn-md${busy ? ' is-loading' : ''}`} disabled={!ready || busy} aria-busy={busy || undefined} onClick={() => { void submit(); }}>
          <RotateCcw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />Restore application
        </button>
      </div>
    </DialogShell>
  );
};

export const PurgeDialog = ({ record, onCancel, onConfirm }: {
  record: ArchiveRecord;
  onCancel: () => void;
  onConfirm: () => void;
}) => {
  const [typed, setTyped] = useState('');
  const counts = record.action?.kind === 'purge' ? record.action : { applicants: 0, documents: 0 };
  return (
    <DialogShell title={`Permanently delete ${record.name}?`} onCancel={onCancel}>
      <div className="mb-4 flex gap-3 rounded-xl bg-[var(--error-100)] p-4">
        <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--error-500)]" strokeWidth={1.75} aria-hidden="true" />
        <div>
          <p className="!mb-0 text-sm font-semibold text-[var(--error-700)]">This can't be undone.</p>
          <p className="!mb-0 text-sm font-medium text-[var(--neutral-800)]">CSC and COA may ask for these records later. Export them before deleting.</p>
        </div>
      </div>
      <ul className="mb-4 divide-y divide-[var(--neutral-200)] rounded-xl border border-[var(--neutral-200)]">
        <li className="flex justify-between gap-3 px-4 py-2.5 text-sm font-medium text-[var(--neutral-800)]"><span>Preserved applicant records</span><span className="font-semibold tabular-nums text-[var(--color-primary-900)]">{counts.applicants}</span></li>
        <li className="flex justify-between gap-3 px-4 py-2.5 text-sm font-medium text-[var(--neutral-800)]"><span>Archived documents</span><span className="font-semibold tabular-nums text-[var(--color-primary-900)]">{counts.documents}</span></li>
      </ul>
      <label htmlFor="purge-confirm" className="mb-1.5 block text-[13px] font-medium text-[var(--neutral-800)]">Type <b>{record.name}</b> to confirm</label>
      <input
        id="purge-confirm"
        data-autofocus
        type="text"
        autoComplete="off"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        className="h-10 w-full rounded-lg border border-[var(--neutral-200)] px-3 text-sm font-medium text-[var(--neutral-800)] focus:border-[var(--color-primary)] focus:outline-none focus:ring-[3px] focus:ring-[rgba(54,62,232,.15)]"
      />
      <div className="mt-5 flex flex-wrap justify-end gap-3">
        <button type="button" className="btn btn-secondary btn-md" onClick={onCancel}>Cancel</button>
        <button type="button" className="btn btn-destructive btn-md" disabled={typed.trim() !== record.name} onClick={onConfirm}>
          <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />Permanently Delete
        </button>
      </div>
    </DialogShell>
  );
};
