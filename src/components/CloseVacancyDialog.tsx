import { X, XCircle } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { formatPHDate } from '../lib/recruitmentData';
import { CLOSE_REASONS, type CloseReason } from '../lib/vacancies';
import type { JobPosting } from '../types/recruitment.types';

interface CloseVacancyDialogProps {
  job: JobPosting;
  onCancel: () => void;
  /** Closes the vacancy. Resolves true when it closed. */
  onConfirm: (reason: CloseReason, remarks: string) => Promise<boolean>;
  /** Why the last attempt failed, shown above the buttons. */
  error?: string;
}

/** Close a vacancy before its deadline, with a recorded reason (§9.10 confirm dialog). */
export const CloseVacancyDialog = ({ job, onCancel, onConfirm, error }: CloseVacancyDialogProps) => {
  const [reason, setReason] = useState<CloseReason | ''>('');
  const [remarks, setRemarks] = useState('');
  const [saving, setSaving] = useState(false);
  const id = useId();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, saving]);

  const remarksRequired = reason === 'Other';
  const canSubmit = reason !== '' && (!remarksRequired || remarks.trim() !== '') && !saving;
  const deadline = job.applicationDeadline ? formatPHDate(job.applicationDeadline) : 'its deadline';

  const submit = async () => {
    if (reason === '' || !canSubmit) return;
    setSaving(true);
    try { await onConfirm(reason, remarks); } finally { setSaving(false); }
  };

  const fieldClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-[3px] focus:ring-[rgba(54,62,232,.15)]';

  return (
    <div className="rsp-ds fixed inset-0 z-[300] flex items-center justify-center p-4" style={{ background: 'rgba(4,14,107,.45)' }}>
      <div className="w-full max-w-[480px] rounded-2xl bg-white p-6 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-body`}>
        <div className="mb-4 flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--error-100)] text-[var(--error-500)]">
            <XCircle className="h-5 w-5" />
          </span>
          <h3 id={`${id}-title`} className="!mb-0 self-center text-lg font-semibold text-[var(--color-primary-900)]">Close this vacancy early?</h3>
          <button type="button" aria-label="Close" onClick={onCancel} className="ml-auto flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <p id={`${id}-body`} className="!mb-5 text-sm text-slate-700">
          This will stop accepting applications for <span className="font-semibold">{job.title}</span> before its deadline of {deadline}. Existing applications will be kept.
        </p>

        <label htmlFor={`${id}-reason`} className="mb-1.5 block text-[13px] font-medium text-slate-700">Reason for closing <span className="text-rose-500">*</span></label>
        <select id={`${id}-reason`} className={`${fieldClass} h-10`} value={reason} onChange={(event) => setReason(event.target.value as CloseReason)}>
          <option value="" disabled>Choose a reason</option>
          {CLOSE_REASONS.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>

        <label htmlFor={`${id}-remarks`} className="mb-1.5 mt-4 block text-[13px] font-medium text-slate-700">
          Remarks {remarksRequired ? <span className="text-rose-500">*</span> : <span className="font-normal text-slate-500">(optional)</span>}
        </label>
        <textarea id={`${id}-remarks`} rows={3} className={`${fieldClass} py-2`} value={remarks} onChange={(event) => setRemarks(event.target.value)} />
        {remarksRequired && remarks.trim() === '' && (
          <p className="!mb-0 mt-1 text-xs text-slate-500">Add remarks when the reason is Other.</p>
        )}

        {error && <p role="alert" className="!mb-0 mt-4 text-sm text-[var(--error-700)]">{error}</p>}

        <div className="mt-6 flex justify-end gap-3 border-t border-slate-200 pt-5">
          <button type="button" className="btn btn-md btn-secondary" onClick={onCancel} disabled={saving}>Cancel</button>
          <button type="button" className="btn btn-md btn-destructive" disabled={!canSubmit} onClick={() => void submit()}>
            {saving ? 'Closing…' : 'Close Vacancy'}
          </button>
        </div>
      </div>
    </div>
  );
};
