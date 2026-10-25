import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ActionFeedback, FeedbackProvider, useAsyncAction, useFeedback } from '.';

const Wrapper = ({ children }: { children: React.ReactNode }) => (
  <FeedbackProvider>{children}</FeedbackProvider>
);

const NoticeButtons = () => {
  const { success, error } = useFeedback();
  return (
    <>
      <button type="button" onClick={() => success('Training saved', 'It is now on the calendar.')}>Save</button>
      <button type="button" onClick={() => error('Could not send', 'Nothing was sent.')}>Send</button>
    </>
  );
};

describe('toasts', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows a success notice and dismisses it after 5s', () => {
    render(<FeedbackProvider><NoticeButtons /></FeedbackProvider>);
    fireEvent.click(screen.getByText('Save'));

    expect(screen.getByRole('status')).toHaveTextContent('Training saved');
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(screen.queryByText('Training saved')).not.toBeInTheDocument();
  });

  it('keeps an error on screen until it is dismissed', () => {
    render(<FeedbackProvider><NoticeButtons /></FeedbackProvider>);
    fireEvent.click(screen.getByText('Send'));

    act(() => { vi.advanceTimersByTime(30_000); });
    expect(screen.getByRole('alert')).toHaveTextContent('Could not send');

    fireEvent.click(screen.getByLabelText('Dismiss notification'));
    expect(screen.queryByText('Could not send')).not.toBeInTheDocument();
  });

  it('pauses the timer while the pointer is over the notice', () => {
    render(<FeedbackProvider><NoticeButtons /></FeedbackProvider>);
    fireEvent.click(screen.getByText('Save'));

    const toast = screen.getByRole('status');
    fireEvent.mouseEnter(toast);
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(screen.getByText('Training saved')).toBeInTheDocument();

    fireEvent.mouseLeave(toast);
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(screen.queryByText('Training saved')).not.toBeInTheDocument();
  });

  it('caps the visible stack at three notices', () => {
    const Many = () => {
      const { info } = useFeedback();
      return <button type="button" onClick={() => { info('One'); info('Two'); info('Three'); info('Four'); }}>Fire</button>;
    };
    render(<FeedbackProvider><Many /></FeedbackProvider>);
    fireEvent.click(screen.getByText('Fire'));

    expect(screen.getAllByRole('status')).toHaveLength(3);
    expect(screen.queryByText('One')).not.toBeInTheDocument();
    expect(screen.getByText('Four')).toBeInTheDocument();
  });
});

describe('ActionFeedback', () => {
  it('states the failure, its completion and the next step', () => {
    render(
      <ActionFeedback
        title="We couldn't save the training."
        message="The server couldn't accept the request, so nothing was saved."
        nextStep="Try again in a moment."
      />,
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("We couldn't save the training.");
    expect(alert).toHaveTextContent('nothing was saved');
    expect(alert).toHaveTextContent('Next: Try again in a moment.');
  });

  it('offers a retry only when the caller can retry', () => {
    const onRetry = vi.fn();
    const { rerender } = render(<ActionFeedback title="Failed" />);
    expect(screen.queryByText('Try again')).not.toBeInTheDocument();

    rerender(<ActionFeedback title="Failed" onRetry={onRetry} />);
    fireEvent.click(screen.getByText('Try again'));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});

describe('useAsyncAction', () => {
  it('reports a { ok: false } result as a failure without a toast', async () => {
    const { result } = renderHook(() => useAsyncAction<{ ok: boolean; error?: string }>(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.run({
        action: 'save the training',
        run: async () => ({ ok: false, error: 'permission denied' }),
        success: { title: 'Training saved' },
      });
    });

    expect(result.current.failure?.title).toBe("We couldn't save the training.");
    expect(result.current.pending).toBe(false);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('fires the success toast and callback on success', async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useAsyncAction<{ ok: boolean }>(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.run({
        action: 'save the training',
        run: async () => ({ ok: true }),
        success: { title: 'Training saved' },
        onSuccess,
      });
    });

    expect(onSuccess).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent('Training saved');
    expect(result.current.failure).toBeNull();
  });

  it('ignores a second click while the first request is still running', async () => {
    let resolveFirst: (() => void) | undefined;
    const run = vi.fn(
      () =>
        new Promise<{ ok: boolean }>((resolve) => {
          resolveFirst = () => resolve({ ok: true });
        }),
    );
    const { result } = renderHook(() => useAsyncAction<{ ok: boolean }>(), { wrapper: Wrapper });

    act(() => {
      void result.current.run({ action: 'save the training', run });
      void result.current.run({ action: 'save the training', run });
    });

    expect(run).toHaveBeenCalledOnce();
    expect(result.current.pending).toBe(true);

    await act(async () => { resolveFirst?.(); });
    expect(result.current.pending).toBe(false);
  });
});
