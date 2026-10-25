import { describe, expect, it } from 'vitest';

import { describeActionFailure } from './friendlyErrors';

describe('describeActionFailure', () => {
  it('names the action and does not claim completion on a network failure', () => {
    const failure = describeActionFailure('save the training', new TypeError('Failed to fetch'));

    expect(failure.title).toBe("We couldn't save the training.");
    expect(failure.context).toBe('network');
    expect(failure.message).toContain("couldn't confirm");
    expect(failure.nextStep).toContain('Check your connection');
    expect(`${failure.title} ${failure.message} ${failure.nextStep}`).not.toContain('Failed to fetch');
  });

  it('says nothing was saved when the server rejected the write', () => {
    const failure = describeActionFailure('save the training', {
      code: '42P01',
      message: 'relation "training_courses" does not exist',
    });

    expect(failure.context).toBe('server');
    expect(failure.message).toBe("The server couldn't accept the request, so nothing was saved.");
    expect(failure.nextStep).toContain('contact your administrator');
  });

  it('reports a failed read as no data loaded, not as nothing saved', () => {
    const failure = describeActionFailure('load the office directory', new Error('Failed to fetch'), {
      mode: 'load',
    });

    expect(failure.message).toBe("The request didn't reach the server, so no data was loaded.");
    expect(failure.message).not.toContain('nothing was saved');
  });

  it('turns a permission error into a sign-in next step', () => {
    const failure = describeActionFailure('approve this application', { status: 403 }, { context: 'unauthorized' });

    expect(failure.message).toContain("don't have permission");
    expect(failure.nextStep).toContain('Sign in again');
  });

  it('strips a trailing period from the action', () => {
    const failure = describeActionFailure('delete the draft.', new Error('boom'));
    expect(failure.title).toBe("We couldn't delete the draft.");
    expect(failure.title).not.toContain('..');
  });
});
