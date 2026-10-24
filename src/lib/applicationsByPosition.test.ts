import { describe, expect, it } from 'vitest';
import { belongsToPosition, countListedApplicationsByPosition, isListedOnApplicationsTab } from './applicationsByPosition';

const links = new Map<string, string[]>([
  ['multi', ['s2', 's3']],
  ['other', ['x9']],
]);

describe('belongsToPosition', () => {
  const slots = new Set(['s1', 's2', 's3']);

  it('matches through the application plantilla, any linked plantilla, or the posting id', () => {
    expect(belongsToPosition({ id: 'a', plantillaSlotId: 's1' }, 'P', slots, links)).toBe(true);
    expect(belongsToPosition({ id: 'multi' }, 'P', slots, links)).toBe(true);
    expect(belongsToPosition({ id: 'legacy', jobPostingId: 'P' }, 'P', slots, links)).toBe(true);
  });

  it('leaves out applications for other positions', () => {
    expect(belongsToPosition({ id: 'other', plantillaSlotId: 'x9', jobPostingId: 'unposted' }, 'P', slots, links)).toBe(false);
  });
});

describe('isListedOnApplicationsTab', () => {
  it('lists new and shortlisted applications, not qualified or disqualified ones', () => {
    expect(isListedOnApplicationsTab('New Application')).toBe(true);
    expect(isListedOnApplicationsTab('Shortlisted')).toBe(true);
    expect(isListedOnApplicationsTab('Qualified')).toBe(false);
    expect(isListedOnApplicationsTab('Not Qualified')).toBe(false);
  });
});

describe('countListedApplicationsByPosition', () => {
  it('counts each application once per position, across several plantillas', () => {
    const positions = [
      { id: 'P', plantillaSlots: [{ id: 's1' }, { id: 's2' }, { id: 's3' }] },
      { id: 'Q', plantillaSlots: [{ id: 'x9' }] },
      { id: 'R', plantillaSlots: [] },
    ];
    const counts = countListedApplicationsByPosition(positions, [
      { id: 'a', plantillaSlotId: 's1', status: 'New Application' },
      { id: 'multi', plantillaSlotId: 's2', status: 'Under Review' },
      { id: 'q', plantillaSlotId: 's3', status: 'Qualified' },
      { id: 'other', plantillaSlotId: 'x9', status: 'Shortlisted' },
    ], links);
    expect(counts.get('P')).toBe(2);
    expect(counts.get('Q')).toBe(1);
    expect(counts.get('R')).toBe(0);
  });
});
