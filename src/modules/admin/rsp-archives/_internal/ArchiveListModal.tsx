import { FileText, RotateCcw, Trash2 } from 'lucide-react';
import { Modal } from '../../../../components/modal';
import { formatDate, type ArchiveRecord, type GroupDef, type PositionRow } from './model';
import { StatusBadge } from './StatusBadge';
import { TopScorerBadge, topScorerIds, topScorerRowClass } from '../../../../components/data-table';

interface ArchiveListModalProps {
  row: PositionRow;
  group: GroupDef;
  onClose: () => void;
  onRestore: (record: ArchiveRecord) => void;
  onPurge: (record: ArchiveRecord) => void;
  onOpenAssessment: (position: string) => void;
}

const TH = 'whitespace-nowrap px-4 py-2.5 text-left text-[13px] font-semibold text-[var(--color-primary-900)]';
const TD = 'px-4 py-3 align-middle text-sm font-medium text-[var(--neutral-800)]';

const Name = ({ name, sub }: { name: string; sub?: string }) => (
  <>
    <span className="block text-sm font-medium text-[var(--color-primary-900)]">{name}</span>
    {sub && <span className="block text-xs font-medium text-[var(--neutral-600)]">{sub}</span>}
  </>
);

const Table = ({ head, children }: { head: string[]; children: React.ReactNode }) => (
  <div className="abyan-table-wrap">
    <table className="abyan-table w-full min-w-[560px]">
      <thead>
        <tr className="bg-[var(--bg-page)]">
          {head.map((h, i) => <th key={`${h}-${i}`} scope="col" className={`${TH} ${h === 'Score' ? 'text-right' : ''}`}>{h || <span className="sr-only">Actions</span>}</th>)}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  </div>
);

const factOf = (r: ArchiveRecord, label: string) => r.facts?.find((f) => f.label === label)?.value ?? '';

/**
 * §9.10 large list modal (880px): everything archived under one department +
 * position. On phones it fills the screen.
 */
export const ArchiveListModal = ({ row, group, onClose, onRestore, onPurge, onOpenAssessment }: ArchiveListModalProps) => {
  const first = row.records[0];

  const body = (() => {
    if (group.id === 'evaluations') {
      const people = first.people ?? [];
      // The archived ranking is one position, so it is one comparison group (Task 5).
      const topIds = topScorerIds(people.map((p, i) => ({ id: String(i), score: Number(p.score) })), {
        idOf: (p) => p.id,
        scoreOf: (p) => (Number.isFinite(p.score) ? p.score : null),
      });
      return people.length === 0 ? (
        <p className="!mb-0 text-sm text-[var(--neutral-600)]">No applicants were ranked for this position.</p>
      ) : (
        <Table head={['Rank', 'Applicant', 'Status', 'Score']}>
          {people.map((p, i) => (
            <tr key={`${p.name}-${i}`} className={topScorerRowClass(topIds.has(String(i)))}>
              <td className={`${TD} w-16 tabular-nums`}>{i + 1}</td>
              <td className={TD}><Name name={p.name} />{topIds.has(String(i)) && <span className="mt-1 inline-block"><TopScorerBadge /></span>}</td>
              <td className={TD}>{p.status ? <StatusBadge type={p.status} /> : '—'}</td>
              <td className={`${TD} text-right tabular-nums`}>{p.score || '—'}</td>
            </tr>
          ))}
        </Table>
      );
    }
    if (group.id === 'jobs') {
      return (
        <div className="space-y-6">
          {row.records.map((r) => (
            <section key={r.key}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="!mb-0 text-base font-semibold text-[var(--color-primary-900)]">{r.name}{r.ref ? <span className="text-sm font-medium text-[var(--neutral-600)]"> · {r.ref}</span> : null}</p>
                  <p className="!mb-0 text-xs font-medium text-[var(--neutral-600)]">Deleted {formatDate(r.date)}{factOf(r, 'Deleted by') ? ` by ${factOf(r, 'Deleted by')}` : ''}</p>
                </div>
                {r.action?.kind === 'purge' && (
                  <button type="button" className="btn btn-destructive-outline btn-sm" onClick={() => onPurge(r)} aria-label={`Permanently delete ${r.name}`}>
                    <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />Permanently Delete
                  </button>
                )}
              </div>
              {(r.people ?? []).length === 0 ? (
                <p className="!mb-0 text-sm text-[var(--neutral-600)]">No applicants were preserved for this post.</p>
              ) : (
                <Table head={['Preserved applicant', 'Status', 'Documents']}>
                  {(r.people ?? []).map((p, i) => (
                    <tr key={`${p.name}-${i}`} className="border-t border-[var(--neutral-200)]">
                      <td className={TD}><Name name={p.name} /></td>
                      <td className={TD}>{p.status || '—'}</td>
                      <td className={TD}>{p.detail || '—'}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </section>
          ))}
        </div>
      );
    }
    const isApplicants = group.id === 'applicants';
    return (
      <Table head={[isApplicants ? 'Applicant' : 'Employee', 'Status', isApplicants ? 'Reason' : 'Details', 'Date', ...(isApplicants ? [''] : [])]}>
        {row.records.map((r) => (
          <tr key={r.key} className="border-t border-[var(--neutral-200)]">
            <td className={TD}><Name name={r.name} sub={r.ref} /></td>
            <td className={TD}><StatusBadge type={r.type} /></td>
            <td className={TD}>{factOf(r, 'Moved to') ? `Moved to ${factOf(r, 'Moved to')}` : r.reason || '—'}</td>
            <td className={`${TD} whitespace-nowrap`}>{formatDate(r.date)}</td>
            {isApplicants && (
              <td className={`${TD} text-right`}>
                {r.action?.kind === 'restore' && (
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => onRestore(r)} aria-label={`Restore ${r.name}`}>
                    <RotateCcw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />Restore
                  </button>
                )}
              </td>
            )}
          </tr>
        ))}
      </Table>
    );
  })();

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={row.position}
      subtitle={`${row.department} · ${row.count} ${group.noun[row.count === 1 ? 0 : 1]} · ${formatDate(row.date)}`}
      footer={(
        <>
          <button type="button" className="btn btn-secondary btn-md" onClick={onClose}>Close</button>
          {group.id === 'evaluations' && first.action?.kind === 'assessment' && (
            <button type="button" className="btn btn-primary btn-md" onClick={() => { const position = first.action?.kind === 'assessment' ? first.action.position : row.position; onClose(); onOpenAssessment(position); }}>
              <FileText className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />Open assessment forms
            </button>
          )}
        </>
      )}
    >
      {body}
    </Modal>
  );
};
