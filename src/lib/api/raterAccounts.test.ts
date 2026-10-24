import { describe, expect, it } from 'vitest';
import { matchRaterAccount, matchRaterAccountByName, type RaterCandidate } from './raterAccounts';

const candidate = (over: Partial<RaterCandidate> = {}): RaterCandidate => ({
  id: 'emp-1',
  employeeNumber: '2024-0001',
  name: 'Melchor U. Tan',
  email: 'melchor.tan@iloilocity.gov.ph',
  position: 'Administrative Officer II',
  department: 'Office of The City Accountant',
  ...over,
});

describe('matchRaterAccount', () => {
  const list = [candidate(), candidate({ id: 'emp-2', name: 'Helen Uy', email: 'helen.uy@iloilocity.gov.ph' })];

  it('matches regardless of casing or surrounding space', () => {
    expect(matchRaterAccount('  MELCHOR.TAN@iloilocity.gov.ph ', list)?.id).toBe('emp-1');
  });

  it('returns null for an address nobody holds', () => {
    expect(matchRaterAccount('outsider@gmail.com', list)).toBeNull();
  });

  it('returns null for an empty address rather than the first employee', () => {
    expect(matchRaterAccount('', list)).toBeNull();
    expect(matchRaterAccount('   ', list)).toBeNull();
  });

  it('returns null when there are no candidates to match against', () => {
    // An empty list means the employee read failed or RLS refused it. The caller
    // must not report "account not found" off the back of this.
    expect(matchRaterAccount('melchor.tan@iloilocity.gov.ph', [])).toBeNull();
  });
});

describe('matchRaterAccountByName', () => {
  it('fills in from an exact name', () => {
    expect(matchRaterAccountByName('Melchor U. Tan', [candidate()])?.email).toBe(
      'melchor.tan@iloilocity.gov.ph',
    );
  });

  it('ignores casing and padding', () => {
    expect(matchRaterAccountByName('  melchor u. tan  ', [candidate()])?.id).toBe('emp-1');
  });

  it('refuses to guess when two employees share a name', () => {
    const namesakes = [candidate(), candidate({ id: 'emp-9', email: 'm.tan2@iloilocity.gov.ph' })];
    expect(matchRaterAccountByName('Melchor U. Tan', namesakes)).toBeNull();
  });

  it('returns null for an empty name', () => {
    expect(matchRaterAccountByName('', [candidate()])).toBeNull();
  });
});
