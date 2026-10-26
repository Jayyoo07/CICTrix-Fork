import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WRITTEN_EXAM_TOTAL,
  WRITTEN_EXAM_FORM_SHARE,
  WRITTEN_EXAM_SHARE,
  canEditExamTotal,
  convertExamScore,
  describeBlockedTotal,
  findScoresAboveTotal,
  formatScoreOverTotal,
  totalForPosition,
  validateExamScore,
  validateTotalPoints,
} from './examTotalPoints';

describe('validateTotalPoints', () => {
  it('accepts a positive whole number', () => {
    expect(validateTotalPoints('50')).toBeNull();
  });

  it.each(['', '0', '-5', '12.5', 'abc'])('rejects %j', (value) => {
    expect(validateTotalPoints(value)).not.toBeNull();
  });
});

describe('validateExamScore', () => {
  it('allows an empty field and scores up to the total', () => {
    expect(validateExamScore('', 50)).toBeNull();
    expect(validateExamScore('0', 50)).toBeNull();
    expect(validateExamScore('50', 50)).toBeNull();
  });

  it('rejects a score above the total with the total in the message', () => {
    expect(validateExamScore('51', 50)).toBe('Score cannot exceed the total points (50).');
  });

  it('rejects decimals and negatives', () => {
    expect(validateExamScore('10.5', 50)).not.toBeNull();
    expect(validateExamScore('-1', 50)).not.toBeNull();
  });
});

describe('convertExamScore', () => {
  it('matches the old fixed conversion when the total is the default', () => {
    expect(convertExamScore(80, DEFAULT_WRITTEN_EXAM_TOTAL)).toEqual({ points: 24, exceedsTotal: false });
  });

  it('scales against a configured total', () => {
    expect(convertExamScore(40, 50).points).toBe(24);
    expect(convertExamScore(50, 50).points).toBe(WRITTEN_EXAM_SHARE);
  });

  it('caps a score above the total at the share and flags it', () => {
    expect(convertExamScore(70, 50)).toEqual({ points: WRITTEN_EXAM_SHARE, exceedsTotal: true });
  });

  it('supports the 20-point share on the printed form', () => {
    expect(convertExamScore(25, 50, WRITTEN_EXAM_FORM_SHARE).points).toBe(10);
  });

  it('treats a missing score as zero', () => {
    expect(convertExamScore(null, 50)).toEqual({ points: 0, exceedsTotal: false });
  });
});

describe('lowering the total', () => {
  const applicants = [
    { id: 'a', name: 'Ana Cruz', score: 45 },
    { id: 'b', name: 'Ben Lim', score: 30 },
    { id: 'c', name: 'Cara Dee', score: null },
  ];

  it('lists only applicants above the proposed total', () => {
    expect(findScoresAboveTotal(applicants, 40).map((a) => a.id)).toEqual(['a']);
  });

  it('blocks with a message naming the affected applicants', () => {
    expect(describeBlockedTotal(findScoresAboveTotal(applicants, 25), 25)).toContain('Ana Cruz (45), Ben Lim (30)');
  });

  it('does not block when no score is above the total', () => {
    expect(describeBlockedTotal(findScoresAboveTotal(applicants, 45), 45)).toBeNull();
  });
});

describe('permissions', () => {
  it('lets only the RSP role edit the total', () => {
    expect(canEditExamTotal('rsp')).toBe(true);
    expect(canEditExamTotal('super-admin')).toBe(false);
    expect(canEditExamTotal('pm')).toBe(false);
    expect(canEditExamTotal(null)).toBe(false);
  });
});

describe('display helpers', () => {
  it('formats score over total', () => {
    expect(formatScoreOverTotal(42, 50)).toBe('42 / 50');
    expect(formatScoreOverTotal(null, 50)).toBe('—');
  });

  it('falls back to the default total for unknown positions', () => {
    expect(totalForPosition({ 'Engineer I': 50 }, 'Engineer I')).toBe(50);
    expect(totalForPosition({}, 'Engineer I')).toBe(DEFAULT_WRITTEN_EXAM_TOTAL);
  });
});
