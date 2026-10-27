import { describe, expect, it } from 'vitest';
import {
  evaluateSuccessionV2,
  rankSuccessionV2,
  type SuccessionV2Input,
  type SuccessionV2Result,
  type ReviewedWorkV2,
  type ReviewedTrainingV2,
  type ReviewedEducationV2,
  type ReviewedEligibilityV2,
} from './successionScoringV2';

function work(patch: Partial<ReviewedWorkV2> = {}): ReviewedWorkV2 {
  // 2020-01-01 through 2023-12-31 inclusive is 1,461 days = 4 * 365.25.
  return { sourceId: 'work-1', relevant: true, cityHall: true,
    startDate: '2020-01-01', endDate: '2023-12-31', present: false, ...patch };
}

function training(patch: Partial<ReviewedTrainingV2> = {}): ReviewedTrainingV2 {
  return { sourceId: 'training-1', relevant: true, cityHall: true, hours: 80,
    completed: true, title: 'Public administration', provider: 'Training Institute',
    certificateId: null, startDate: '2024-01-01', endDate: '2024-01-10', ...patch };
}

function education(patch: Partial<ReviewedEducationV2> = {}): ReviewedEducationV2 {
  return { sourceId: 'degree-1', kind: 'bachelor', relevant: true,
    matchesRequiredField: true, ...patch };
}

function eligibility(patch: Partial<ReviewedEligibilityV2> = {}): ReviewedEligibilityV2 {
  return { sourceId: 'eligibility-1', typeKey: 'civil service professional',
    recognized: true, relevant: true, matchesRequirement: true, expiryDate: null, ...patch };
}

function input(patch: Partial<SuccessionV2Input> = {}): SuccessionV2Input {
  return {
    candidate: { employeeId: 'employee-1', name: 'Ana Santos', manuallyNominated: false },
    positionId: 'position-1', scoringDate: '2026-10-27',
    requirements: { experienceYears: 2, trainingHours: 40,
      education: { minimum: 'bachelor', field: 'Public administration' },
      eligibility: { kind: 'none' } },
    work: { complete: true, records: [work()] },
    training: { complete: true, records: [training()] },
    education: { complete: true, records: [education()] },
    eligibility: { complete: true, records: [] },
    performanceRating: 5, competencies: { required: 0, met: 0 }, ...patch,
  };
}

function scored(value: SuccessionV2Input = input()) {
  const result = evaluateSuccessionV2(value);
  expect(result.status).toBe('scored');
  if (result.status !== 'scored') throw new Error(JSON.stringify(result));
  return result;
}

function pending(result: SuccessionV2Result, status: 'needs-review' | 'configuration-needed') {
  expect(result.status).toBe(status);
  for (const key of ['total', 'rank', 'readiness', 'contributions']) {
    expect(result).not.toHaveProperty(key);
  }
}

describe('V2 fixed contributions and qualification gates', () => {
  it.each([[2, 20], [4, 10]])('scores four calendar years against %s required years as %s', (required, points) => {
    const value = input();
    value.requirements.experienceYears = required;
    const result = scored(value);
    expect(result.audit.relevantWorkDays).toBe(1461);
    expect(result.audit.relevantYears).toBe(4);
    expect(result.contributions.experience).toBe(points);
  });

  it.each([[40, 10], [80, 20], [120, 20]])('scores %s relevant hours as %s', (hours, points) => {
    expect(scored(input({ training: { complete: true, records: [training({ hours })] } }))
      .contributions.training).toBe(points);
  });

  it.each([['bachelor', 3], ['master', 9], ['doctorate', 15]] as const)(
    'awards fixed %s points independent of minimum', (kind, points) => {
      expect(scored(input({ education: { complete: true, records: [education({ kind })] } }))
        .contributions.education).toBe(points);
    });

  it('gives a master meeting a master minimum nine points', () => {
    const value = input({ education: { complete: true, records: [education({ kind: 'master' })] } });
    value.requirements.education = { minimum: 'master', field: 'Public administration' };
    expect(scored(value).contributions.education).toBe(9);
  });

  it('excludes a bachelor below a master minimum, even if nominated', () => {
    const value = input();
    value.candidate.manuallyNominated = true;
    value.requirements.education = { minimum: 'master', field: 'Public administration' };
    expect(evaluateSuccessionV2(value)).toMatchObject({ status: 'excluded',
      reasonCodes: ['EDUCATION_MINIMUM_NOT_MET'] });
  });

  it.each([[0, 0], [1, 7.5], [2, 15], [3, 15]])('scores %s distinct types as %s', (count, points) => {
    const records = Array.from({ length: count }, (_, index) => eligibility({
      sourceId: `eligibility-${index}`, typeKey: `recognized-${index}`,
    }));
    expect(scored(input({ eligibility: { complete: true, records } })).contributions.eligibility).toBe(points);
  });

  it.each([[5, 30], [0, 0], [null, 0]])('scores IPCR %s as %s without a performance gate', (rating, points) => {
    expect(scored(input({ performanceRating: rating })).contributions.performance).toBe(points);
  });

  it('reports every known minimum failure', () => {
    const value = input({ work: { complete: true, records: [] },
      training: { complete: true, records: [] }, education: { complete: true, records: [] } });
    value.requirements.eligibility = { kind: 'required', key: 'specific licence' };
    const result = evaluateSuccessionV2(value);
    expect(result.status).toBe('excluded');
    expect(result.reasonCodes).toEqual(expect.arrayContaining(['EXPERIENCE_MINIMUM_NOT_MET',
      'TRAINING_MINIMUM_NOT_MET', 'EDUCATION_MINIMUM_NOT_MET', 'ELIGIBILITY_MINIMUM_NOT_MET']));
    expect(result).not.toHaveProperty('total');
  });

  it('does not round evidence up to a minimum', () => {
    const value = input({ work: { complete: true, records: [work({ endDate: '2023-12-30' })] } });
    value.requirements.experienceYears = 4;
    expect(evaluateSuccessionV2(value)).toMatchObject({ status: 'excluded',
      reasonCodes: ['EXPERIENCE_MINIMUM_NOT_MET'] });
  });
});

describe('review completion, precedence and invalid configuration', () => {
  it.each(['work', 'training', 'education', 'eligibility'] as const)('treats absent %s data as unreviewed, not an empty inventory', category => {
    const value = { ...input(), [category]: undefined } as SuccessionV2Input;
    pending(evaluateSuccessionV2(value), 'needs-review');
  });

  it('does not coerce string numbers into evidence or requirements', () => {
    const value = input();
    value.requirements.trainingHours = '40' as unknown as number;
    pending(evaluateSuccessionV2(value), 'configuration-needed');
    pending(evaluateSuccessionV2(input({ training: { complete: true,
      records: [training({ hours: '80' as unknown as number })] } })), 'needs-review');
  });

  it('requires a candidate, position and explicit scoring identity', () => {
    pending(evaluateSuccessionV2(input({ positionId: '' })), 'needs-review');
    pending(evaluateSuccessionV2(input({ candidate: { employeeId: '', name: 'Ana' } })), 'needs-review');
  });

  it.each(['work', 'training', 'education', 'eligibility'] as const)('requires an explicit complete %s inventory', category => {
    const value = input();
    value[category] = { complete: false, records: [] };
    pending(evaluateSuccessionV2(value), 'needs-review');
  });

  it.each(['work', 'training', 'education', 'eligibility'] as const)('does not interpret pending %s relevance as false', category => {
    const value = input();
    if (category === 'work') value.work.records = [work({ relevant: null })];
    if (category === 'training') value.training.records = [training({ relevant: null })];
    if (category === 'education') value.education.records = [education({ relevant: null })];
    if (category === 'eligibility') value.eligibility.records = [eligibility({ relevant: null })];
    pending(evaluateSuccessionV2(value), 'needs-review');
  });

  it('lets proven partial evidence meet a gate but still withholds a final score', () => {
    const value = input();
    value.work.complete = false;
    value.training.complete = false;
    const result = evaluateSuccessionV2(value);
    pending(result, 'needs-review');
    expect(result.audit.minimums).toMatchObject({ experience: 'met', training: 'met' });
  });

  it('does not infer failure from insufficient partial evidence', () => {
    const value = input({ work: { complete: false, records: [work({ endDate: '2020-01-01' })] },
      training: { complete: false, records: [training({ hours: 1 })] } });
    const result = evaluateSuccessionV2(value);
    pending(result, 'needs-review');
    expect(result.audit.minimums).toMatchObject({ experience: 'unknown', training: 'unknown' });
  });

  it('gives a known failure precedence over unknown reviews and configuration', () => {
    const value = input({ education: { complete: true, records: [] },
      work: { complete: false, records: [] } });
    value.requirements.trainingHours = 0;
    const result = evaluateSuccessionV2(value);
    expect(result.status).toBe('excluded');
    expect(result.reasonCodes).toContain('EDUCATION_MINIMUM_NOT_MET');
    expect(result).not.toHaveProperty('readiness');
  });

  it.each([0, -1, NaN, Infinity, null, undefined])('does not invent a formula for requirement %s', requirement => {
    for (const category of ['experienceYears', 'trainingHours'] as const) {
      const value = input();
      value.requirements[category] = requirement;
      pending(evaluateSuccessionV2(value), 'configuration-needed');
    }
  });

  it('distinguishes no required eligibility from an absent requirement', () => {
    const value = input();
    expect(scored(value).contributions.eligibility).toBe(0);
    value.requirements.eligibility = null;
    pending(evaluateSuccessionV2(value), 'configuration-needed');
  });

  it('requires configured education minimum and field', () => {
    const value = input();
    value.requirements.education = null;
    pending(evaluateSuccessionV2(value), 'configuration-needed');
    value.requirements.education = { minimum: 'bachelor', field: '' };
    pending(evaluateSuccessionV2(value), 'configuration-needed');
  });

  it.each([-1, 5.01, NaN, Infinity, undefined])('rejects invalid IPCR %s instead of clamping', performanceRating => {
    const value = { ...input(), performanceRating } as SuccessionV2Input;
    const result = evaluateSuccessionV2(value);
    pending(result, 'needs-review');
    expect(result.reasonCodes).toContain('INVALID_PERFORMANCE');
  });
});

describe('reviewed work calendar arithmetic', () => {
  it.each([{ relevant: false }, { cityHall: false }])('does not count work with review %j', review => {
    const result = evaluateSuccessionV2(input({ work: { complete: true, records: [work(review)] } }));
    expect(result.status).toBe('excluded');
    expect(result.audit.relevantWorkDays).toBe(0);
  });

  it('needs a City Hall review decision even with relevant work', () => {
    pending(evaluateSuccessionV2(input({ work: { complete: true, records: [work({ cityHall: null })] } })), 'needs-review');
  });

  it('unions overlapping and duplicate intervals with inclusive endpoints', () => {
    const value = input({ work: { complete: true, records: [work(), work(),
      work({ sourceId: 'overlap', startDate: '2022-01-01', endDate: '2024-01-01' }),
      work({ sourceId: 'one-day', startDate: '2024-01-02', endDate: '2024-01-02' })] } });
    expect(scored(value).audit.relevantWorkDays).toBe(1463);
  });

  it('caps present work at the scoring date and accepts a real leap day', () => {
    const value = input({ scoringDate: '2024-02-29',
      work: { complete: true, records: [work({ startDate: '2020-03-01', endDate: null, present: true })] } });
    expect(scored(value).audit.relevantWorkDays).toBe(1461);
  });

  it('caps a future end date rather than accruing future days', () => {
    const result = scored(input({ work: { complete: true,
      records: [work({ endDate: '2030-01-01' })] } }));
    expect(result.audit.relevantWorkDays).toBe(2492);
  });

  it('does not count an entirely future interval', () => {
    const result = evaluateSuccessionV2(input({ work: { complete: true,
      records: [work({ startDate: '2027-01-01', endDate: '2028-01-01' })] } }));
    expect(result.status).toBe('excluded');
    expect(result.audit.relevantWorkDays).toBe(0);
  });

  it.each(['2023-02-29', '2024-02-30', '2024-13-01', '2024-1-01', '2024-01-01T00:00:00Z', 'garbage', ''])(
    'strictly rejects malformed date %s', date => {
      pending(evaluateSuccessionV2(input({ scoringDate: date })), 'needs-review');
      pending(evaluateSuccessionV2(input({ work: { complete: true, records: [work({ startDate: date })] } })), 'needs-review');
    });

  it.each([
    { startDate: '2024-01-01', endDate: '2023-01-01' },
    { endDate: null, present: false },
    { endDate: '2023-12-31', present: true },
  ])('blocks review completion for contradictory work %j', patch => {
    const result = evaluateSuccessionV2(input({ work: { complete: true, records: [work(patch)] } }));
    pending(result, 'needs-review');
    expect(result.reasonCodes).toContain('INVALID_WORK');
  });

  it('rejects conflicting source duplicates without order-dependent credit', () => {
    const records = [work(), work({ relevant: false })];
    const forward = evaluateSuccessionV2(input({ work: { complete: true, records } }));
    const reverse = evaluateSuccessionV2(input({ work: { complete: true, records: [...records].reverse() } }));
    pending(forward, 'needs-review');
    expect(reverse).toEqual(forward);
    expect(forward.reasonCodes).toContain('CONFLICTING_WORK_DUPLICATE');
  });
});

describe('training review and certificate deduplication', () => {
  it('avoids denominator overflow for finite hours and requirements', () => {
    const value = input({ training: { complete: true, records: [training({ hours: 1.5e308 })] } });
    value.requirements.trainingHours = 1e308;
    expect(scored(value).contributions.training).toBe(15);
  });

  it('blocks a nonfinite sum of otherwise finite training rows', () => {
    const records = [training({ hours: 1e308, certificateId: 'one' }),
      training({ sourceId: 'other', hours: 1e308, certificateId: 'two' })];
    pending(evaluateSuccessionV2(input({ training: { complete: true, records } })), 'needs-review');
  });

  it('keeps distinct certificates and repeated sessions separate', () => {
    const records = [training({ hours: 40, certificateId: 'one' }),
      training({ sourceId: 'other', hours: 40, certificateId: 'two' })];
    expect(scored(input({ training: { complete: true, records } })).audit.trainingHours).toBe(80);
    records[0].certificateId = null;
    records[1].certificateId = null;
    records[1].startDate = '2024-02-01';
    records[1].endDate = '2024-02-10';
    expect(scored(input({ training: { complete: true, records } })).audit.trainingHours).toBe(80);
  });

  it.each([true, false])('counts City Hall=%s training equally', cityHall => {
    expect(scored(input({ training: { complete: true, records: [training({ cityHall, hours: 40 })] } }))
      .contributions.training).toBe(10);
  });

  it('counts identical source duplicates once', () => {
    expect(scored(input({ training: { complete: true, records: [training({ hours: 40 }), training({ hours: 40 })] } }))
      .audit.trainingHours).toBe(40);
  });

  it('dedupes normalized certificate identity despite a different title', () => {
    const records = [training({ certificateId: ' CERT  001 ', hours: 40 }),
      training({ sourceId: 'other', certificateId: 'cert 001', title: 'Renamed', hours: 40 })];
    expect(scored(input({ training: { complete: true, records } })).audit.trainingHours).toBe(40);
  });

  it('dedupes normalized title/provider/dates when certificates are absent', () => {
    const records = [training({ hours: 40 }), training({ sourceId: 'other', hours: 40,
      title: ' PUBLIC   ADMINISTRATION ', provider: ' training institute ' })];
    expect(scored(input({ training: { complete: true, records } })).audit.trainingHours).toBe(40);
  });

  it.each([{ hours: 120 }, { endDate: '2024-01-11' }, { relevant: false }])(
    'flags contradictory certificate duplicates %j', patch => {
      const records = [training({ certificateId: 'cert-1' }),
        training({ sourceId: 'other', certificateId: ' CERT-1 ', ...patch })];
      const value = input({ training: { complete: true, records } });
      const result = evaluateSuccessionV2(value);
      pending(result, 'needs-review');
      expect(result.reasonCodes).toContain('CONFLICTING_TRAINING_DUPLICATE');
      expect(evaluateSuccessionV2(input({ training: { complete: true, records: [...records].reverse() } }))).toEqual(result);
    });

  it.each([-1, NaN, Infinity, undefined])('blocks invalid hours %s, not a confirmed zero', hours => {
    const record = { ...training(), hours } as ReviewedTrainingV2;
    const result = evaluateSuccessionV2(input({ training: { complete: true, records: [record] } }));
    pending(result, 'needs-review');
    expect(result.reasonCodes).toContain('INVALID_TRAINING');
  });

  it.each([
    { completed: false }, { startDate: '2027-01-01', endDate: '2027-01-10' },
    { endDate: '2027-01-10' }, { relevant: false },
  ])('does not credit unfinished/future/irrelevant training %j', patch => {
    const result = evaluateSuccessionV2(input({ training: { complete: true, records: [training(patch)] } }));
    expect(result.status).toBe('excluded');
    expect(result.audit.trainingHours).toBe(0);
  });

  it.each([{ startDate: '2024-02-30' }, { endDate: '2023-12-31' }])('requires valid training dates %j', patch => {
    pending(evaluateSuccessionV2(input({ training: { complete: true, records: [training(patch)] } })), 'needs-review');
  });
});

describe('canonical education and explicit eligibility', () => {
  it('does not accept an unapproved professional mapping', () => {
    const value = input({ education: { complete: true, records: [education({ kind: 'MD' })] } });
    value.requirements.professionalDegreeMappings = { MD: { approved: false, equivalentKind: 'doctorate' } };
    pending(evaluateSuccessionV2(value), 'configuration-needed');
  });

  it('does not fuzzy-match a noncanonical degree', () => {
    const kind = 'Master of Public Administration' as unknown as ReviewedEducationV2['kind'];
    pending(evaluateSuccessionV2(input({ education: { complete: true, records: [education({ kind })] } })), 'needs-review');
  });

  it('blocks conflicting education duplicates', () => {
    pending(evaluateSuccessionV2(input({ education: { complete: true,
      records: [education(), education({ kind: 'doctorate' })] } })), 'needs-review');
  });

  it.each(['MD', 'DMD', 'JD', 'LLB', 'LLM'] as const)('does not invent an equivalence for %s', kind => {
    const result = evaluateSuccessionV2(input({ education: { complete: true, records: [education({ kind })] } }));
    pending(result, 'configuration-needed');
    expect(result.reasonCodes).toContain('PROFESSIONAL_DEGREE_MAPPING_NEEDED');
  });

  it('uses only an explicitly approved professional mapping for points and minimum', () => {
    const value = input({ education: { complete: true, records: [education({ kind: 'JD' })] } });
    value.requirements.education = { minimum: 'master', field: 'Law' };
    value.requirements.professionalDegreeMappings = { JD: { approved: true, equivalentKind: 'master' } };
    expect(scored(value).contributions.education).toBe(9);
  });

  it('requires an explicit field match rather than inferring it from relevance', () => {
    const value = input({ education: { complete: true, records: [education({ matchesRequiredField: false })] } });
    expect(evaluateSuccessionV2(value).status).toBe('excluded');
    value.education.records = [education({ matchesRequiredField: null })];
    pending(evaluateSuccessionV2(value), 'needs-review');
  });

  it('does not turn an irrelevant doctorate into a relevant education score', () => {
    const value = input({ education: { complete: true, records: [education(),
      education({ sourceId: 'doctorate', kind: 'doctorate', relevant: false, matchesRequiredField: false })] } });
    expect(scored(value).contributions.education).toBe(3);
  });

  it('counts valid renewal despite an expired record of the same normalized type', () => {
    const records = [eligibility({ expiryDate: '2026-10-26' }),
      eligibility({ sourceId: 'renewal', typeKey: ' CIVIL  SERVICE Professional ', expiryDate: '2026-10-27' })];
    const value = input({ eligibility: { complete: true, records } });
    value.requirements.eligibility = { kind: 'required', key: 'civil service professional' };
    const result = scored(value);
    expect(result.contributions.eligibility).toBe(7.5);
    expect(result.audit.distinctEligibilityTypes).toEqual(['civil service professional']);
  });

  it.each([['2026-10-26', 0], ['2026-10-27', 7.5], [null, 7.5]] as const)(
    'scores expiry %s as %s', (expiryDate, points) => {
      expect(scored(input({ eligibility: { complete: true, records: [eligibility({ expiryDate })] } }))
        .contributions.eligibility).toBe(points);
    });

  it.each([{ recognized: false }, { relevant: false }])('does not credit eligibility with %j', patch => {
    expect(scored(input({ eligibility: { complete: true, records: [eligibility(patch)] } }))
      .contributions.eligibility).toBe(0);
  });

  it('does not infer a generic professional licence requirement match', () => {
    const value = input({ eligibility: { complete: true,
      records: [eligibility({ typeKey: 'PRC professional', matchesRequirement: false })] } });
    value.requirements.eligibility = { kind: 'required', key: 'civil engineer licence' };
    expect(evaluateSuccessionV2(value).status).toBe('excluded');
    value.eligibility.records = [eligibility({ matchesRequirement: null })];
    pending(evaluateSuccessionV2(value), 'needs-review');
  });

  it('flags inconsistent duplicate renewal source rows, not valid separate renewals', () => {
    const records = [eligibility({ expiryDate: '2026-10-26' }), eligibility({ expiryDate: null })];
    pending(evaluateSuccessionV2(input({ eligibility: { complete: true, records } })), 'needs-review');
  });

  it('rejects malformed eligibility expiry', () => {
    pending(evaluateSuccessionV2(input({ eligibility: { complete: true,
      records: [eligibility({ expiryDate: '2026-02-30' })] } })), 'needs-review');
  });
});

describe('readiness, rounding, audit and deterministic ranking', () => {
  it.each([[0.331666, 59.99, 'Developmental'], [1 / 3, 60, 'Ready in 1–2 Years'],
    [3.665, 79.99, 'Ready in 1–2 Years'], [11 / 3, 80, 'Ready Now']] as const)(
    'respects score readiness boundaries for IPCR %s', (performanceRating, total, readiness) => {
      const value = input({ performanceRating, eligibility: { complete: true, records: [eligibility(),
        eligibility({ sourceId: 'other', typeKey: 'other recognized type' })] } });
      expect(scored(value)).toMatchObject({ total, readiness });
    });

  it('returns an empty ranking for an empty or pending-only pool', () => {
    expect(rankSuccessionV2([])).toEqual([]);
    expect(rankSuccessionV2([evaluateSuccessionV2(input({ work: { complete: false, records: [] } }))])).toEqual([]);
  });

  it('withholds readiness with no IPCR even with complete competency coverage', () => {
    const result = scored(input({ performanceRating: null, competencies: { met: 2, required: 2 } }));
    expect(result.readiness).toBeNull();
  });

  it.each([[2, 2, 'Ready Now'], [1, 2, 'Ready in 1–2 Years'], [0, 2, 'Developmental'],
    [249, 250, 'Ready in 1–2 Years']] as const)('uses exact competency coverage %s/%s', (met, required, readiness) => {
    expect(scored(input({ competencies: { met, required } })).readiness).toBe(readiness);
  });

  it.each([[0, 0, 'Developmental'], [5, 0, 'Ready in 1–2 Years'], [5, 2, 'Ready Now']] as const)(
    'uses score thresholds only with no competency requirements (%s IPCR, %s types)', (rating, types, readiness) => {
      const records = Array.from({ length: types }, (_, i) => eligibility({ sourceId: `e-${i}`, typeKey: `type-${i}` }));
      expect(scored(input({ performanceRating: rating, eligibility: { complete: true, records } })).readiness).toBe(readiness);
    });

  it.each([{ met: 1, required: 0 }, { met: 3, required: 2 }, { met: -1, required: 2 },
    { met: 0.5, required: 2 }, { met: NaN, required: 2 }, { met: 0, required: Infinity }])(
    'rejects invalid competency counts %j', competencies => {
      pending(evaluateSuccessionV2(input({ competencies })), 'needs-review');
    });

  it('rounds contributions before summing, keeping raw evidence in audit', () => {
    const value = input({ performanceRating: 4.444,
      training: { complete: true, records: [training({ hours: 40.01 })] },
      work: { complete: true, records: [work({ endDate: '2022-01-01' })] } });
    const result = scored(value);
    expect(result.audit.relevantWorkDays).toBe(732);
    expect(result.audit.trainingHours).toBe(40.01);
    expect(result.contributions).toEqual({ performance: 26.66, experience: 10.02,
      training: 10, education: 3, eligibility: 0 });
    expect(result.total).toBe(49.68);
  });

  it.each([[0.3625, 2.18], [1.0125, 6.08], [4.2375, 25.43]])(
    'rounds half-cent IPCR contributions upwards despite binary arithmetic (%s)', (performanceRating, points) => {
      expect(scored(input({ performanceRating })).contributions.performance).toBe(points);
    });

  it('rounds a half-cent training contribution upwards', () => {
    expect(scored(input({ training: { complete: true, records: [training({ hours: 40.02 })] } }))
      .contributions.training).toBe(10.01);
  });

  it('does not mutate evidence or attach ranks to evaluator results', () => {
    const value = input();
    const before = structuredClone(value);
    const result = scored(value);
    rankSuccessionV2([result]);
    expect(value).toEqual(before);
    expect(result).not.toHaveProperty('rank');
  });

  it('ranks scored results only without reserving zero ranks for pending states', () => {
    const review = evaluateSuccessionV2(input({ candidate: { employeeId: 'pending', name: 'Bea' },
      work: { complete: false, records: [] } }));
    const ranked = rankSuccessionV2([review, scored()]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0]).toMatchObject({ status: 'scored', rank: 1 });
  });

  it('sorts total, then IPCR contribution, normalized name, then employee ID', () => {
    const candidates = [
      scored(input({ candidate: { employeeId: 'b', name: ' ANA  Santos ' } })),
      scored(input({ candidate: { employeeId: 'a', name: 'ana santos' } })),
      scored(input({ candidate: { employeeId: 'c', name: 'Bea Ramos' } })),
    ];
    const lowerIpcr = input({ candidate: { employeeId: 'd', name: 'Aaa' }, performanceRating: 4 });
    lowerIpcr.education.records = [education({ kind: 'master' })];
    candidates.push(scored(lowerIpcr)); // Same 73 total, but only 24 IPCR points.
    const higher = input({ candidate: { employeeId: 'e', name: 'Zed' } });
    higher.education.records = [education({ kind: 'doctorate' })];
    candidates.push(scored(higher));
    const ranked = rankSuccessionV2(candidates);
    expect(ranked.map(row => row.candidate.employeeId)).toEqual(['e', 'a', 'b', 'c', 'd']);
    expect(ranked.map(row => row.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(rankSuccessionV2([...candidates].reverse())).toEqual(ranked);
  });

  it('coalesces identical candidate duplicates and rejects conflicting results', () => {
    const result = scored();
    expect(rankSuccessionV2([result, structuredClone(result)])).toHaveLength(1);
    expect(() => rankSuccessionV2([result, scored(input({ performanceRating: 4 }))])).toThrow(/conflicting/i);
    const pendingResult = evaluateSuccessionV2(input({ work: { complete: false, records: [] } }));
    expect(() => rankSuccessionV2([result, pendingResult])).toThrow(/conflicting/i);
  });

  it.each(['positionId', 'scoringDate', 'modelVersion'] as const)('rejects a mixed %s pool', key => {
    const first = scored();
    const second = { ...scored(input({ candidate: { employeeId: 'other', name: 'Bea' } })),
      [key]: key === 'scoringDate' ? '2026-10-26' : 'different' } as SuccessionV2Result;
    expect(() => rankSuccessionV2([first, second])).toThrow(/pool|model/i);
  });
});
