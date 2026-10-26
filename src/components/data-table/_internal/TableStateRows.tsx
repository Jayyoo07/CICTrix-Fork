import { AlertTriangle, FolderOpen, RefreshCw } from 'lucide-react';
import type React from 'react';
import { describeActionFailure, type ErrorContext } from '../../../lib/friendlyErrors';
import { TableSkeletonRows, type SkeletonCell } from '../../table-loading';

export type TableView = 'loading' | 'error' | 'empty' | 'rows';

/**
 * Which body a table shows. An error wins over stale rows only on the first
 * load; a failed refresh keeps the rows the user already has.
 */
export function getTableView({
  loading,
  error,
  rowCount,
}: {
  /** From useTableLoading().initialLoading, or plain loading for a first load. */
  loading: boolean;
  error?: unknown;
  rowCount: number;
}): TableView {
  if (loading) return 'loading';
  if (error && rowCount === 0) return 'error';
  if (rowCount === 0) return 'empty';
  return 'rows';
}

interface TableStateRowsProps {
  view: TableView;
  /** Column count, or one skeleton shape per column. */
  columns: number | SkeletonCell[];
  /** From useTableLoading().showSkeleton; keeps fast loads from flashing. Default true. */
  showSkeleton?: boolean;
  skeletonRows?: number;
  loadingLabel?: string;
  error?: unknown;
  errorContext?: ErrorContext;
  /** Verb phrase for the error title, e.g. "load the applicants". */
  errorAction?: string;
  onRetry?: () => void;
  emptyTitle?: string;
  /** Why it is empty and what to do next (§12). */
  emptyMessage?: React.ReactNode;
  emptyIcon?: React.ElementType;
}

/**
 * The loading, error and empty bodies for an `.abyan-table` (§9.5, Task 2
 * standards). Renders nothing when `view` is 'rows'; the caller renders rows.
 * Error and empty look different on purpose: a failed load never reads as
 * "no records".
 */
export function TableStateRows({
  view,
  columns,
  showSkeleton = true,
  skeletonRows,
  loadingLabel = 'Loading…',
  error,
  errorContext,
  errorAction = 'load this table',
  onRetry,
  emptyTitle = 'No records found',
  emptyMessage,
  emptyIcon: EmptyIcon = FolderOpen,
}: TableStateRowsProps) {
  const colSpan = typeof columns === 'number' ? columns : columns.length;

  if (view === 'loading') {
    return <TableSkeletonRows columns={columns} rows={skeletonRows} show={showSkeleton} label={loadingLabel} />;
  }

  if (view === 'error') {
    const failure = describeActionFailure(errorAction, error, { context: errorContext, mode: 'load' });
    return (
      <tr className="abyan-table-state">
        <td colSpan={colSpan}>
          <div className="abyan-table-error" role="alert">
            <AlertTriangle size={24} strokeWidth={1.75} aria-hidden="true" />
            <p className="abyan-table-state-title">{failure.title}</p>
            <p>{failure.message}</p>
            <p>{failure.nextStep}</p>
            {onRetry && (
              <button type="button" className="btn btn-sm btn-secondary" onClick={onRetry}>
                <RefreshCw size={14} strokeWidth={1.75} aria-hidden="true" /> Retry
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  }

  if (view === 'empty') {
    return (
      <tr className="abyan-table-state">
        <td colSpan={colSpan}>
          <div className="abyan-table-empty">
            <EmptyIcon size={24} strokeWidth={1.75} aria-hidden="true" />
            <p className="abyan-table-state-title">{emptyTitle}</p>
            {emptyMessage && <p>{emptyMessage}</p>}
          </div>
        </td>
      </tr>
    );
  }

  return null;
}
