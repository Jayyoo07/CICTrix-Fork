import { describe, expect, it } from 'vitest';
import {
  EDUCATION_LEVEL_RANK,
  educationLabel,
  educationSearchTexts,
  highestEducation,
  type EducationRow,
} from './educationAttainment';

const row = (overrides: Partial<EducationRow> = {}): EducationRow => ({
  level: 'College',
  course: 'BS in Information Technology',
  year_graduated: 2020,
  ...overrides,
});

describe('highestEducation', () => {
  it('picks the highest level when several rows are on file', () => {
    const highest = highestEducation([
      row(),
      row({ level: 'Graduate Studies', course: 'Master in Public Administration', year_graduated: 2026 }),
    ]);

    expect(highest?.level).toBe('Graduate Studies');
    expect(highest?.course).toBe('Master in Public Administration');
  });

  it('ranks a doctorate above graduate studies', () => {
    const highest = highestEducation([
      row({ level: 'Graduate Studies', course: 'Master of Arts in Nursing', year_graduated: 2024 }),
      row({ level: 'Doctorate', course: 'Doctor of Philosophy in Education', year_graduated: 2019 }),
    ]);

    expect(highest?.level).toBe('Doctorate');
  });

  it('breaks a level tie with the later graduation year', () => {
    const highest = highestEducation([
      row({ level: 'Graduate Studies', course: 'Master of Arts in Education', year_graduated: 2018 }),
      row({ level: 'Graduate Studies', course: 'Master in Public Administration', year_graduated: 2026 }),
    ]);

    expect(highest?.course).toBe('Master in Public Administration');
  });

  it('returns null when nothing is on file', () => {
    expect(highestEducation([])).toBeNull();
  });

  it('treats an unknown or missing level as the lowest rank', () => {
    const highest = highestEducation([
      row({ level: null, course: null, year_graduated: null }),
      row({ level: 'Secondary', course: 'High School Diploma', year_graduated: 2010 }),
    ]);

    expect(highest?.level).toBe('Secondary');
  });

  it('orders every level the table can hold', () => {
    expect(EDUCATION_LEVEL_RANK.Doctorate).toBeGreaterThan(EDUCATION_LEVEL_RANK['Graduate Studies']);
    expect(EDUCATION_LEVEL_RANK['Graduate Studies']).toBeGreaterThan(EDUCATION_LEVEL_RANK.College);
    expect(EDUCATION_LEVEL_RANK.College).toBeGreaterThan(EDUCATION_LEVEL_RANK.Vocational);
    expect(EDUCATION_LEVEL_RANK.Vocational).toBeGreaterThan(EDUCATION_LEVEL_RANK.Secondary);
    expect(EDUCATION_LEVEL_RANK.Secondary).toBeGreaterThan(EDUCATION_LEVEL_RANK.Elementary);
  });
});

describe('educationLabel', () => {
  it('uses the course, trimmed', () => {
    expect(educationLabel(row({ course: '  Master in Public Administration  ' }))).toBe(
      'Master in Public Administration',
    );
  });

  it('falls back to College Level when the degree was not completed', () => {
    expect(educationLabel(row({ course: null, year_graduated: null }))).toBe('College Level');
  });

  it('falls back to College Graduate when a graduation year is recorded', () => {
    expect(educationLabel(row({ course: '   ', year_graduated: 2020 }))).toBe('College Graduate');
  });

  it('does not invent a degree type for graduate studies without a course', () => {
    // Level alone cannot tell a master's from a doctorate, so the label stays
    // neutral rather than claiming a degree the record does not name.
    expect(educationLabel(row({ level: 'Graduate Studies', course: null }))).toBe('Graduate Studies');
  });

  it('labels the school levels', () => {
    expect(educationLabel(row({ level: 'Secondary', course: null, year_graduated: 2010 }))).toBe(
      'High School Graduate',
    );
    expect(educationLabel(row({ level: 'Secondary', course: null, year_graduated: null }))).toBe(
      'High School Level',
    );
    expect(educationLabel(row({ level: 'Elementary', course: null, year_graduated: null }))).toBe(
      'Elementary Level',
    );
    expect(educationLabel(row({ level: 'Vocational', course: null, year_graduated: null }))).toBe(
      'Vocational',
    );
  });
});

describe('educationSearchTexts', () => {
  it('returns every degree and its level, so a lower degree still matches the field', () => {
    const texts = educationSearchTexts([
      row({ level: 'College', course: 'BS in Civil Engineering' }),
      row({ level: 'Graduate Studies', course: 'Master in Public Administration' }),
    ]);

    expect(texts).toContain('BS in Civil Engineering');
    expect(texts).toContain('Master in Public Administration');
    expect(texts).toContain('College Graduate');
    expect(texts).toContain('Graduate Studies');
  });

  it('skips blank rows', () => {
    expect(educationSearchTexts([row({ level: null, course: null, year_graduated: null })])).toEqual([]);
    expect(educationSearchTexts([])).toEqual([]);
  });
});
