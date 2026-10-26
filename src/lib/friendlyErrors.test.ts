import { describe, expect, it, vi } from 'vitest';

import { describeActionFailure, fieldErrorsFrom } from './friendlyErrors';

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

describe('describeActionFailure, distinct cases (Task 2)', () => {
  it('treats an expired session as sign-in-again, not a permission problem', () => {
    const failure = describeActionFailure('save the score', { status: 401, code: 'PGRST301', message: 'JWT expired' });
    expect(failure.context).toBe('session');
    expect(failure.message).toBe('Your session has expired, so nothing was saved.');
    expect(failure.nextStep).toContain('Sign in again');
  });

  it('treats a row-level security refusal as no permission', () => {
    const failure = describeActionFailure('delete the posting', { code: '42501', message: 'new row violates row-level security policy' });
    expect(failure.context).toBe('unauthorized');
  });

  it('treats a 409 or duplicate key as a conflict', () => {
    expect(describeActionFailure('add the rater', { status: 409 }).context).toBe('conflict');
    const dup = describeActionFailure('add the rater', { code: '23505', message: 'duplicate key value violates unique constraint' });
    expect(dup.message).toContain('already exists');
    expect(dup.nextStep).toContain('Refresh');
  });

  it('does not claim a timed-out write failed', () => {
    const failure = describeActionFailure('submit the evaluation', { name: 'AbortError', message: 'The operation was aborted' });
    expect(failure.context).toBe('timeout');
    expect(failure.message).toContain("couldn't confirm");
  });

  it('treats a 400 or constraint error as a validation problem', () => {
    expect(describeActionFailure('save', { status: 400, message: 'bad' }).context).toBe('validation');
    expect(describeActionFailure('save', { code: '23502', message: 'null value' }).context).toBe('validation');
  });

  it('reports offline before trying to classify the error', () => {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(describeActionFailure('save', new Error('anything')).context).toBe('network');
    spy.mockRestore();
  });
});

describe('fieldErrorsFrom', () => {
  it('names the missing required field', () => {
    expect(fieldErrorsFrom({ code: '23502', message: 'null value in column "position_title" of relation "job_postings" violates not-null constraint' }))
      .toEqual({ position_title: 'Enter the position title. It is required.' });
  });

  it('names the duplicated field', () => {
    expect(fieldErrorsFrom({ code: '23505', message: 'duplicate key', details: 'Key (email)=(a@b.c) already exists.' }))
      .toEqual({ email: 'This email is already in use. Enter a different one.' });
  });

  it('returns nothing for errors that name no field', () => {
    expect(fieldErrorsFrom(new Error('Failed to fetch'))).toEqual({});
  });
});
