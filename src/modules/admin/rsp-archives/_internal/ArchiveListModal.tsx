import { FileText, RotateCcw, Trash2, X } from 'lucide-react';
import { formatDate, type ArchiveRecord, type GroupDef, type PositionRow } from './model';
import { StatusBadge } from './StatusBadge';
import { useFocusTrap } from './useFocusTrap';

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
  <div className="overflow-x-auto rounded-xl border border-[var(--neutral-200)]">
    <table className="w-full min-w-[560px] border-collapse">
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
 * position. Only the overlay scrolls (§9.7.1); on phones it fills the screen.
 */
export const ArchiveListModal = ({ row, group, onClose, onRestore, onPurge, onOpenAssessment }: ArchiveListModalProps) => {
  const ref = useFocusTrap<HTMLDivElement>(onClose);
  const first = row.records[0];

  const body = (() => {
    if (group.id === 'evaluations') {
      const people = first.people ?? [];
      return people.length === 0 ? (
        <p className="!mb-0 text-sm text-[var(--neutral-600)]">No applicants were ranked for this position.</p>
      ) : (
        <Table head={['Rank', 'Applicant', 'Status', 'Score']}>
          {people.map((p, i) => (
            <tr key={`${p.name}-${i}`} className="border-t border-[var(--neutral-200)]">
              <td className={`${TD} w-16 tabular-nums`}>{i + 1}</td>
              <td className={TD}><Name name={p.name} /></td>
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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-[var(--overlay)] sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex min-h-full items-start justify-center sm:items-center">
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-labelledby="archive-modal-title"
          className="min-h-screen w-full bg-white p-5 shadow-[var(--shadow-3)] sm:min-h-0 sm:max-w-[880px] sm:rounded-2xl sm:p-6"
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="archive-modal-title" className="!mb-0.5 text-xl font-semibold text-[var(--color-primary-900)]">{row.position}</h2>
              <p className="!mb-0 text-[13px] font-medium text-[var(--neutral-600)]">
                {row.department} · {row.count} {group.noun[row.count === 1 ? 0 : 1]} · {formatDate(row.date)}
              </p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--neutral-600)] hover:bg-[var(--bg-page)]">
              <X className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            </button>
          </div>

          {body}

          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <button type="button" className="btn btn-secondary btn-md" onClick={onClose}>Close</button>
            {group.id === 'evaluations' && first.action?.kind === 'assessment' && (
              <button type="button" className="btn btn-primary btn-md" onClick={() => { const position = first.action?.kind === 'assessment' ? first.action.position : row.position; onClose(); onOpenAssessment(position); }}>
                <FileText className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />Open assessment forms
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
