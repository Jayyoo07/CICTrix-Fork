import { Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { EDUCATION_LEVELS } from '../../constants/positions';
import { ActionFeedback, useFeedback } from '../../components/action-feedback';
import { updateApplicantDetails, type ApplicantDetailsPatch } from '../../lib/api/applicants';
import { describeActionFailure } from '../../lib/friendlyErrors';

const MONTHS_PER_YEAR = 12;

type Props = {
  applicant: Record<string, any>;
  onClose: () => void;
  onSaved: (patch: ApplicantDetailsPatch) => void;
};

const text = (value: unknown) => String(value ?? '').trim();

/** RSP correction form for an applicant's personal details and qualifications (§9.10 form modal). */
export function EditApplicantDetailsModal({ applicant, onClose, onSaved }: Props) {
  const startYears = Number(applicant.years_of_experience ?? applicant.work_experience_years ?? 0) || 0;
  const [form, setForm] = useState({
    first_name: text(applicant.first_name),
    middle_name: text(applicant.middle_name),
    last_name: text(applicant.last_name),
    email: text(applicant.email),
    contact_number: text(applicant.contact_number),
    address: text(applicant.address),
    is_pwd: applicant.is_pwd === true,
    education_level: text(applicant.education_level ?? applicant.education_attainment),
    education_degree: text(applicant.education_degree),
    education_school: text(applicant.education_school),
    experience_years: String(Math.floor(startYears)),
    experience_months: String(Math.round((startYears - Math.floor(startYears)) * MONTHS_PER_YEAR)),
  });
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<{ message: string; nextStep: string } | null>(null);
  const { success: notifySuccess } = useFeedback();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const handleSave = async () => {
    if (!form.first_name.trim() || !form.last_name.trim() || !form.email.trim()) {
      setFailure({
        message: 'First name, last name and email are required.',
        nextStep: 'Fill in the missing fields, then save again.',
      });
      return;
    }
    const years = Math.max(0, parseInt(form.experience_years || '0', 10) || 0);
    const months = Math.min(MONTHS_PER_YEAR - 1, Math.max(0, parseInt(form.experience_months || '0', 10) || 0));
    const totalYears = +(years + months / MONTHS_PER_YEAR).toFixed(2);
    const patch: ApplicantDetailsPatch = {
      first_name: form.first_name.trim(),
      middle_name: form.middle_name.trim() || null,
      last_name: form.last_name.trim(),
      email: form.email.trim().toLowerCase(),
      contact_number: form.contact_number.trim(),
      address: form.address.trim(),
      is_pwd: form.is_pwd,
      education_level: form.education_level || null,
      education_degree: form.education_degree.trim() || null,
      education_school: form.education_school.trim() || null,
      years_of_experience: totalYears > 0 ? totalYears : null,
    };
    setSaving(true);
    setFailure(null);
    const result = await updateApplicantDetails(String(applicant.id), patch);
    setSaving(false);
    if (!result.ok) {
      const described = describeActionFailure('save these changes', result.error);
      setFailure({ message: described.message, nextStep: described.nextStep });
      return;
    }
    notifySuccess('Applicant details saved', 'The applicant record now shows the new details.');
    onSaved(patch);
  };

  const inputClass =
    'h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition hover:border-[var(--color-primary-200)] focus:border-[var(--color-primary)] focus:ring-[3px] focus:ring-[rgba(54,62,232,.15)]';
  const labelClass = 'mb-1.5 block text-sm font-medium text-slate-700';

  return (
    <div
      className="fixed inset-0 z-[270] flex items-center justify-center p-4"
      style={{ background: 'rgba(4,14,107,.45)' }}
      onClick={() => { if (!saving) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-applicant-title"
        className="abyan-ds flex w-full max-w-[640px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        style={{ maxHeight: '90vh' }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 id="edit-applicant-title" className="text-title-s !mb-0" style={{ color: 'var(--color-primary-900)' }}>
            Edit Applicant Details
          </h2>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <section className="space-y-4">
            <h3 className="text-caps !mb-0 text-slate-500">Personal Information</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <label><span className={labelClass}>First name <span className="text-red-600">*</span></span>
                <input className={inputClass} value={form.first_name} onChange={set('first_name')} autoFocus /></label>
              <label><span className={labelClass}>Middle name</span>
                <input className={inputClass} value={form.middle_name} onChange={set('middle_name')} /></label>
              <label><span className={labelClass}>Last name <span className="text-red-600">*</span></span>
                <input className={inputClass} value={form.last_name} onChange={set('last_name')} /></label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label><span className={labelClass}>Email address <span className="text-red-600">*</span></span>
                <input type="email" className={inputClass} value={form.email} onChange={set('email')} /></label>
              <label><span className={labelClass}>Phone number</span>
                <input type="tel" className={inputClass} value={form.contact_number} onChange={set('contact_number')} /></label>
            </div>
            <label className="block"><span className={labelClass}>Address</span>
              <input className={inputClass} value={form.address} onChange={set('address')} /></label>
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="h-[18px] w-[18px] accent-[var(--color-primary)]"
                checked={form.is_pwd}
                onChange={(event) => setForm((prev) => ({ ...prev, is_pwd: event.target.checked }))}
              />
              Person with disability (PWD)
            </label>
          </section>

          <section className="space-y-4">
            <h3 className="text-caps !mb-0 text-slate-500">Qualifications</h3>
            <label className="block"><span className={labelClass}>Educational attainment</span>
              <select className={inputClass} value={form.education_level} onChange={set('education_level')}>
                <option value="">Not specified</option>
                {form.education_level && !(EDUCATION_LEVELS as readonly string[]).includes(form.education_level) && (
                  <option value={form.education_level}>{form.education_level}</option>
                )}
                {EDUCATION_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
              </select></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label><span className={labelClass}>Degree / course</span>
                <input className={inputClass} value={form.education_degree} onChange={set('education_degree')} /></label>
              <label><span className={labelClass}>School</span>
                <input className={inputClass} value={form.education_school} onChange={set('education_school')} /></label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label><span className={labelClass}>Work experience (years)</span>
                <input type="number" min={0} className={inputClass} value={form.experience_years} onChange={set('experience_years')} /></label>
              <label><span className={labelClass}>Work experience (months)</span>
                <input type="number" min={0} max={MONTHS_PER_YEAR - 1} className={inputClass} value={form.experience_months} onChange={set('experience_months')} /></label>
            </div>
          </section>

          {failure && (
            <ActionFeedback
              title="We couldn't save these changes."
              message={failure.message}
              nextStep={failure.nextStep}
              onDismiss={() => setFailure(null)}
            />
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button type="button" className="btn btn-md btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="btn btn-md btn-primary" onClick={handleSave} disabled={saving} aria-busy={saving || undefined}>
            {saving && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
