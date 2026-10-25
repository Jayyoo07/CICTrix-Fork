import { FileText, RotateCcw, Trash2, X } from 'lucide-react';
import { formatDate, type ArchiveRecord } from './model';
import { StatusBadge } from './StatusBadge';
import { useFocusTrap } from './useFocusTrap';

interface ArchiveDrawerProps {
  record: ArchiveRecord;
  groupLabel: string;
  onClose: () => void;
  onRestore: () => void;
  onPurge: () => void;
  onOpenAssessment: (position: string) => void;
}

/** Right-side detail panel. The one action that applies lives here, not on every row. */
export const ArchiveDrawer = ({ record, groupLabel, onClose, onRestore, onPurge, onOpenAssessment }: ArchiveDrawerProps) => {
  const ref = useFocusTrap<HTMLElement>(onClose);
  const action = record.action;
  const facts = [
    { label: record.group === 'employees' && record.type !== 'Promoted' && record.type !== 'Transferred' ? 'Last position' : 'Position', value: record.position },
    { label: 'Department', value: record.department },
    ...(record.facts ?? []),
    ...(record.reason ? [{ label: 'Reason', value: record.reason }] : []),
    { label: 'Date', value: formatDate(record.date) },
  ];

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-[var(--overlay)]" onClick={onClose} aria-hidden="true" />
      <aside
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="archive-drawer-title"
        className="absolute bottom-0 right-0 top-0 flex w-[min(480px,100vw)] flex-col bg-white shadow-[var(--shadow-3)]"
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--neutral-200)] px-6 py-5">
          <div className="min-w-0">
            <p className="!mb-0.5 text-[13px] font-medium text-[var(--neutral-600)]">{groupLabel}</p>
            <h2 id="archive-drawer-title" className="!mb-0 text-xl font-semibold text-[var(--color-primary-900)]">{record.name}</h2>
            {record.ref && <p className="!mb-0 text-xs font-medium text-[var(--neutral-600)]">{record.ref}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--neutral-600)] hover:bg-[var(--bg-page)]">
            <X className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="mb-5"><StatusBadge type={record.type} /></div>
          <dl className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-[130px_1fr]">
            {facts.map((f) => (
              <div key={f.label} className="contents">
                <dt className="text-[13px] font-medium leading-5 text-[var(--neutral-600)]">{f.label}</dt>
                <dd className="!mb-2 text-sm font-medium leading-5 text-[var(--neutral-800)] sm:!mb-0">{f.value || '—'}</dd>
              </div>
            ))}
          </dl>

          {record.people && record.people.length > 0 && (
            <div className="mt-6">
              <h3 className="!mb-2 text-base font-semibold text-[var(--color-primary-900)]">{record.peopleTitle ?? 'People'}</h3>
              <ol className="divide-y divide-[var(--neutral-200)] border-y border-[var(--neutral-200)]">
                {record.people.map((p, i) => (
                  <li key={`${p.name}-${i}`} className="flex items-baseline justify-between gap-3 py-2.5">
                    <span className="text-sm font-medium text-[var(--color-primary-900)]">{p.name}</span>
                    <span className="text-right text-xs font-medium text-[var(--neutral-600)]">{p.detail}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>

        <footer className="flex flex-wrap justify-end gap-3 border-t border-[var(--neutral-200)] px-6 py-4">
          <button type="button" className="btn btn-secondary btn-md" onClick={onClose}>Close</button>
          {action?.kind === 'restore' && (
            <button type="button" className="btn btn-primary btn-md" onClick={onRestore}>
              <RotateCcw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />Restore application
            </button>
          )}
          {action?.kind === 'purge' && (
            <button type="button" className="btn btn-destructive-outline btn-md" onClick={onPurge}>
              <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />Permanently Delete
            </button>
          )}
          {action?.kind === 'assessment' && (
            <button type="button" className="btn btn-primary btn-md" onClick={() => { onClose(); onOpenAssessment(action.position); }}>
              <FileText className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />Open assessment forms
            </button>
          )}
        </footer>
      </aside>
    </div>
  );
};
