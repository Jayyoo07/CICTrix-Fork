import { fireEvent, render, screen } from '@testing-library/react';
import { useMemo, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { TableStateRows, TopScorerBadge, getTableView, topScorerIds, topScorerRowClass } from './index';

type Row = { id: string; name: string; position: string; score: number | null };
const opts = { idOf: (r: Row) => r.id, scoreOf: (r: Row) => r.score, groupOf: (r: Row) => r.position };

describe('topScorerIds', () => {
  it('marks the single highest scorer in each group', () => {
    const rows: Row[] = [
      { id: 'a', name: 'Ana', position: 'Engineer I', score: 82 },
      { id: 'b', name: 'Ben', position: 'Engineer I', score: 90 },
      { id: 'c', name: 'Cara', position: 'Budget Officer', score: 70 },
      { id: 'd', name: 'Dan', position: 'Budget Officer', score: 75 },
    ];
    expect([...topScorerIds(rows, opts)].sort()).toEqual(['b', 'd']);
  });

  it('marks every applicant tied for the top score', () => {
    const rows: Row[] = [
      { id: 'a', name: 'Ana', position: 'Engineer I', score: 90 },
      { id: 'b', name: 'Ben', position: 'Engineer I', score: 90 },
      { id: 'c', name: 'Cara', position: 'Engineer I', score: 60 },
    ];
    expect([...topScorerIds(rows, opts)].sort()).toEqual(['a', 'b']);
  });

  it('marks nobody when no scores are entered or all are zero', () => {
    const none: Row[] = [
      { id: 'a', name: 'Ana', position: 'Engineer I', score: null },
      { id: 'b', name: 'Ben', position: 'Engineer I', score: null },
    ];
    const zeros: Row[] = none.map((r) => ({ ...r, score: 0 }));
    expect(topScorerIds(none, opts).size).toBe(0);
    expect(topScorerIds(zeros, opts).size).toBe(0);
  });

  it('marks nobody when a group has only one applicant', () => {
    expect(topScorerIds([{ id: 'a', name: 'Ana', position: 'Engineer I', score: 88 }], opts).size).toBe(0);
  });

  it('uses the full group, not the visible page', () => {
    const rows: Row[] = [
      { id: 'a', name: 'Ana', position: 'Engineer I', score: 70 },
      { id: 'b', name: 'Ben', position: 'Engineer I', score: 95 },
    ];
    const top = topScorerIds(rows, opts);
    const firstPage = rows.slice(0, 1);
    expect(firstPage.some((r) => top.has(r.id))).toBe(false);
  });
});

function ScoreTable() {
  const [rows, setRows] = useState<Row[]>([
    { id: 'a', name: 'Ana', position: 'Engineer I', score: 80 },
    { id: 'b', name: 'Ben', position: 'Engineer I', score: 85 },
  ]);
  const top = useMemo(() => topScorerIds(rows, opts), [rows]);
  return (
    <>
      <button type="button" onClick={() => setRows((r) => r.map((x) => (x.id === 'a' ? { ...x, score: 99 } : x)))}>Edit Ana</button>
      <div className="abyan-table-wrap">
        <table className="abyan-table">
          <thead><tr><th>Applicant</th><th className="is-num">Score</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} data-testid={`row-${r.id}`} className={topScorerRowClass(top.has(r.id))}>
                <td><span className="abyan-cell-primary">{r.name}</span>{top.has(r.id) && <TopScorerBadge />}</td>
                <td className="is-num">{r.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

describe('top scorer highlight in a table', () => {
  it('moves the highlight when a score is edited', () => {
    render(<ScoreTable />);
    expect(screen.getByTestId('row-b').className).toBe('is-top-scorer');
    expect(screen.getByTestId('row-a').className).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Edit Ana' }));
    expect(screen.getByTestId('row-a').className).toBe('is-top-scorer');
    expect(screen.getByTestId('row-b').className).toBe('');
    expect(screen.getAllByText('Top scorer')).toHaveLength(1);
  });

  it('renders the shared table structure', () => {
    const { container } = render(<ScoreTable />);
    expect(container.querySelector('.abyan-table-wrap')).toMatchSnapshot();
  });
});

describe('getTableView', () => {
  it('tells loading, error, empty and rows apart', () => {
    expect(getTableView({ loading: true, rowCount: 0 })).toBe('loading');
    expect(getTableView({ loading: false, error: new Error('x'), rowCount: 0 })).toBe('error');
    expect(getTableView({ loading: false, rowCount: 0 })).toBe('empty');
    expect(getTableView({ loading: false, rowCount: 3 })).toBe('rows');
    // A failed refresh keeps the rows already shown.
    expect(getTableView({ loading: false, error: new Error('x'), rowCount: 3 })).toBe('rows');
  });
});

describe('TableStateRows', () => {
  const inTable = (node: React.ReactNode) => render(<table><tbody>{node}</tbody></table>);

  it('shows a retryable error that is not the empty state', () => {
    const onRetry = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    inTable(<TableStateRows view="error" columns={3} error={new TypeError('Failed to fetch')} errorAction="load the applicants" onRetry={onRetry} />);
    expect(screen.getByRole('alert').textContent).toContain("We couldn't load the applicants.");
    expect(screen.queryByText('No records found')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('never shows raw error text', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    inTable(<TableStateRows view="error" columns={2} error={{ code: '42P01', message: 'relation "applicants" does not exist' }} />);
    expect(screen.getByRole('alert').textContent).not.toContain('relation');
  });

  it('shows the empty title and next step', () => {
    inTable(<TableStateRows view="empty" columns={2} emptyTitle="No applicants yet" emptyMessage="Applicants appear here once they apply." />);
    expect(screen.getByText('No applicants yet')).toBeTruthy();
    expect(screen.getByText('Applicants appear here once they apply.')).toBeTruthy();
  });

  it('renders nothing when rows are ready', () => {
    const { container } = inTable(<TableStateRows view="rows" columns={2} />);
    expect(container.querySelector('tbody')?.children.length).toBe(0);
  });
});
