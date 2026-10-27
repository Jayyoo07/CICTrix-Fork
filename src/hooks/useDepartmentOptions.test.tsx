import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDepartmentNames } from './useDepartmentOptions';

vi.mock('../lib/api/departments', () => ({
  getDepartmentOptions: vi.fn().mockResolvedValue([{ value: 'Budget Office', label: 'Budget Office' }]),
}));

describe('useDepartmentNames', () => {
  it('returns the same array across re-renders, so effects that depend on it do not re-run', () => {
    const { result, rerender } = renderHook(() => useDepartmentNames(false));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
