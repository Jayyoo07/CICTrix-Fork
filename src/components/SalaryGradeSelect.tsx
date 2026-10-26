/**
 * Salary grade picker, backed by the CSC schedule.
 *
 * Replaces the free-text grade and salary boxes that let two postings at the
 * same grade carry different amounts. Options read "SG 11 · ₱31,705", so the
 * amount is visible at the moment of choosing rather than after saving.
 *
 * It reports the Step 1 amount alongside the grade, so the caller can store
 * both without looking the salary up again.
 *
 * Form control styling follows DESIGN_IDENTITY.md §9.3.
 */

import { failureText } from '../lib/friendlyErrors';
import { useEffect, useState } from 'react';
import {
  formatSalary,
  listSalaryGrades,
  stepOneSalaryFor,
  type SalaryGradeRow,
} from '../lib/api/salaryGrades';

interface SalaryGradeSelectProps {
  value: number | null;
  onChange: (grade: number | null, monthlySalary: number | null) => void;
  id?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  /** Shown as the empty option. */
  placeholder?: string;
  /** Pass a loaded table to avoid a second fetch when several render together. */
  table?: SalaryGradeRow[];
}

export const SalaryGradeSelect = ({
  value,
  onChange,
  id,
  disabled,
  required,
  className,
  placeholder = 'Select salary grade…',
  table,
}: SalaryGradeSelectProps) => {
  const [rows, setRows] = useState<SalaryGradeRow[]>(table ?? []);
  const [loading, setLoading] = useState(!table);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (table) {
      setRows(table);
      setLoading(false);
      return;
    }
    let cancelled = false;
    void listSalaryGrades().then((res) => {
      if (cancelled) return;
      if (res.ok === false) setError(failureText('load the salary grades', res.error, { mode: 'load' }));
      else setRows(res.data);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [table]);

  return (
    <>
      <select
        id={id}
        value={value ?? ''}
        required={required}
        disabled={disabled || loading}
        onChange={(e) => {
          const next = e.target.value === '' ? null : Number(e.target.value);
          onChange(next, next == null ? null : stepOneSalaryFor(next, rows));
        }}
        className={
          className ??
          'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-[#363EE8] focus:outline-none focus:ring-1 focus:ring-[#363EE8] disabled:bg-slate-100 disabled:text-slate-500'
        }
      >
        <option value="">{loading ? 'Loading salary grades…' : placeholder}</option>
        {rows.map((r) => (
          <option key={r.salaryGrade} value={r.salaryGrade}>
            SG {r.salaryGrade}
            {r.hiringRate != null ? ` · ${formatSalary(r.hiringRate)}` : ' · no amount set'}
          </option>
        ))}
        {/*
          A grade already stored but missing from the table still has to be
          selectable, or opening an old posting would silently clear its grade.
        */}
        {value != null && !rows.some((r) => r.salaryGrade === value) && (
          <option value={value}>SG {value} · not in the schedule</option>
        )}
      </select>
      {error && <p className="mt-1 text-xs text-rose-600">{error}</p>}
    </>
  );
};

export default SalaryGradeSelect;
