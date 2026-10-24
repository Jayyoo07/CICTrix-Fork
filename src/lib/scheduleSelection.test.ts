import { describe, expect, it } from 'vitest';
import {
  groupByDepartmentAndPosition,
  groupCheckState,
  isPastDate,
  isSchedulableApplicant,
  localIsoDate,
  partitionForStatusAdvance,
  toggleGroup,
  toggleId,
} from './scheduleSelection';

const applicant = (id: string, office: string, position: string) => ({ id, office, position });

describe('groupByDepartmentAndPosition', () => {
  it('groups by department then position, sorted by name', () => {
    const groups = groupByDepartmentAndPosition([
      applicant('1', "City Engineer's Office", 'Engineer II'),
      applicant('2', 'City Budget Office', 'Budget Officer'),
      applicant('3', "City Engineer's Office", 'Engineer I'),
      applicant('4', "City Engineer's Office", 'Engineer I'),
    ]);

    expect(groups.map((d) => d.department)).toEqual(['City Budget Office', "City Engineer's Office"]);
    expect(groups[1].positions.map((p) => p.position)).toEqual(['Engineer I', 'Engineer II']);
    expect(groups[1].positions[0].applicants.map((a) => a.id)).toEqual(['3', '4']);
  });

  it('keeps the same title in two departments as separate groups', () => {
    const groups = groupByDepartmentAndPosition([
      applicant('1', 'Office A', 'Clerk'),
      applicant('2', 'Office B', 'Clerk'),
    ]);
    const keys = groups.flatMap((d) => d.positions.map((p) => p.key));
    expect(new Set(keys).size).toBe(2);
  });

  it('labels blank department and position values', () => {
    const [group] = groupByDepartmentAndPosition([applicant('1', ' ', '')]);
    expect(group.department).toBe('Unassigned department');
    expect(group.positions[0].position).toBe('Untitled position');
  });
});

describe('position checkbox state', () => {
  const ids = ['a', 'b', 'c'];

  it('derives checked, indeterminate and unchecked from the selection', () => {
    expect(groupCheckState(ids, new Set())).toBe('unchecked');
    expect(groupCheckState(ids, new Set(['a']))).toBe('indeterminate');
    expect(groupCheckState(ids, new Set(['a', 'b', 'c', 'other']))).toBe('checked');
  });

  it('selects every applicant when the position is unchecked or partly checked', () => {
    expect(toggleGroup(ids, new Set(['other']))).toEqual(new Set(['other', 'a', 'b', 'c']));
    expect(toggleGroup(ids, new Set(['a']))).toEqual(new Set(['a', 'b', 'c']));
  });

  it('clears only that position when it is fully checked', () => {
    expect(toggleGroup(ids, new Set(['a', 'b', 'c', 'other']))).toEqual(new Set(['other']));
  });

  it('toggles a single applicant without mutating the input', () => {
    const selected = new Set(['a']);
    expect(toggleId('b', selected)).toEqual(new Set(['a', 'b']));
    expect(toggleId('a', selected)).toEqual(new Set());
    expect(selected).toEqual(new Set(['a']));
  });
});

describe('partitionForStatusAdvance', () => {
  it('advances only applicants whose status may move to Interview/Exam Scheduled', () => {
    const result = partitionForStatusAdvance([
      { id: 'shortlisted', status: 'Shortlisted' },
      { id: 'legacy', status: 'Recommended for Hiring' },
      { id: 'rescheduled', status: 'Interview/Exam Scheduled' },
      { id: 'qualified', status: 'Qualified' },
      { id: 'unknown', status: 'something odd' },
    ]);
    expect(result.advance).toEqual(['shortlisted', 'legacy']);
    expect(result.keep).toEqual(['rescheduled', 'qualified', 'unknown']);
  });
});

describe('date helpers', () => {
  it('formats the local date as YYYY-MM-DD', () => {
    expect(localIsoDate(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });

  it('treats only earlier dates as past', () => {
    expect(isPastDate('2026-10-10', '2026-10-11')).toBe(true);
    expect(isPastDate('2026-10-11', '2026-10-11')).toBe(false);
    expect(isPastDate('2026-10-12', '2026-10-11')).toBe(false);
  });
});

describe('isSchedulableApplicant', () => {
  it.each(['Shortlisted', 'Recommended for Hiring', 'Interview/Exam Scheduled', 'For Evaluation', 'Qualified'])(
    'lists %s',
    (status) => expect(isSchedulableApplicant(status, false)).toBe(true),
  );

  it.each(['Disqualified', 'Not Qualified', 'not qualified', 'Not Selected', 'Selected', 'Withdrawn - Hired Elsewhere'])(
    'never lists %s, even with a completed evaluation',
    (status) => {
      expect(isSchedulableApplicant(status, false)).toBe(false);
      expect(isSchedulableApplicant(status, true)).toBe(false);
    },
  );

  it('leaves out earlier statuses unless the evaluation is complete', () => {
    expect(isSchedulableApplicant('Submitted', false)).toBe(false);
    expect(isSchedulableApplicant('For Contract Signing', false)).toBe(false);
    expect(isSchedulableApplicant('For Contract Signing', true)).toBe(true);
  });

  it('leaves out blank and unrecognised statuses', () => {
    expect(isSchedulableApplicant('', true)).toBe(false);
    expect(isSchedulableApplicant(null, false)).toBe(false);
    expect(isSchedulableApplicant('something odd', true)).toBe(false);
  });
});
