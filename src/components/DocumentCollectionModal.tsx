import { Eye, FileText } from 'lucide-react';
import { useState } from 'react';
import { useBackClosesView } from '../hooks/useHistoryBack';
import { hasDocumentFile, type ViewerDocument } from '../lib/documentViewing';
import { DocumentPreviewModal } from './DocumentPreviewModal';
import { Modal } from './modal';

interface Props {
  title: string;
  subtitle?: string;
  files: ViewerDocument[];
  onClose: () => void;
}

/** File-by-file review; opening a collection never fetches or downloads its files. */
export const DocumentCollectionModal = ({ title, subtitle, files, onClose }: Props) => {
  const [selected, setSelected] = useState<ViewerDocument | null>(null);
  useBackClosesView(true, onClose, 'rsp-document-collection', { fromMount: true });

  return (
    <>
      <Modal open onClose={onClose} title={title} subtitle={subtitle} icon={<FileText strokeWidth={1.75} />} size="lg"
        footer={<button type="button" className="btn btn-secondary btn-md" onClick={onClose}>Close</button>}>
        {files.length === 0 ? <p className="text-body-l">No documents are available in this collection.</p> : (
          <ul className="!m-0 list-none divide-y divide-[var(--neutral-200)] !p-0">
            {files.map((file) => (
              <li key={file.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="min-w-0 flex-1 basis-40">
                  {file.label && <p className="!mb-1 text-headline-m text-[var(--color-primary-900)]">{file.label}</p>}
                  <p className="!m-0 break-all text-body-m">{file.fileName || 'Document'}</p>
                  {file.subtitle && <p className="!mb-0 mt-1 text-body-s">{file.subtitle}</p>}
                  {!hasDocumentFile(file) && <p className="!mb-0 mt-1 text-body-s">Unavailable — no file uploaded.</p>}
                </div>
                <button type="button" className="btn btn-secondary btn-sm" disabled={!hasDocumentFile(file)}
                  aria-label={`View ${file.fileName || file.label || 'document'}`} onClick={() => setSelected(file)}>
                  <Eye size={16} strokeWidth={1.75} aria-hidden="true" /> View
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
      {selected && <DocumentPreviewModal open viewFirst fileUrl={selected.url} fileName={selected.fileName} fileType={selected.fileType}
        storageBucket={selected.bucket} title={selected.label || selected.fileName} subtitle={selected.subtitle}
        onClose={() => setSelected(null)} />}
    </>
  );
};
