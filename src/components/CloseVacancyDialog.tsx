import { XCircle } from 'lucide-react';
import { useId, useState } from 'react';
import { ConfirmModal } from './modal';
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
    <ConfirmModal
      open
      icon={<XCircle strokeWidth={1.75} />}
      title="Close this vacancy early?"
      tone="destructive"
      confirmLabel="Close Vacancy"
      loading={saving}
      confirmDisabled={!canSubmit}
      onConfirm={() => void submit()}
      onCancel={onCancel}
      message={(
        <p className="!mb-0">
          This will stop accepting applications for <span className="font-semibold">{job.title}</span> before its deadline of {deadline}. Existing applications will be kept.
        </p>
      )}
    >
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
    </ConfirmModal>
  );
};
