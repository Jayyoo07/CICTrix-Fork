import { Download, ExternalLink, FileText, LoaderCircle, Printer } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useBackClosesView } from '../hooks/useHistoryBack';
import { downloadPreparedDocument, openPdfForPrinting, prepareDocumentPreview, type PreparedDocument } from '../lib/documentViewing';
import { Modal } from './modal';

interface Props {
  open: boolean;
  fileUrl: string;
  fileName: string;
  fileType?: string | null;
  storageBucket?: string;
  title?: string;
  subtitle?: string;
  onClose: () => void;
  actions?: ReactNode;
}

/** RSP's opt-in viewer: local PDF/image previews, no third-party document viewer. */
export const ViewFirstDocumentPreview = ({ open, fileUrl, fileName, fileType, storageBucket, title, subtitle, onClose, actions }: Props) => {
  const [prepared, setPrepared] = useState<PreparedDocument | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [retry, setRetry] = useState(0);
  useBackClosesView(open, onClose, 'rsp-document-preview', { fromMount: true });

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    let current: PreparedDocument | undefined;
    setPrepared(null);
    setError('');
    setNotice('');
    setLoaded(false);
    void prepareDocumentPreview({ id: fileUrl, url: fileUrl, fileName, fileType, bucket: storageBucket }, controller.signal)
      .then((file) => {
        current = file;
        if (controller.signal.aborted) file.dispose();
        else setPrepared(file);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Could not load this document. Try again.');
      });
    return () => { controller.abort(); current?.dispose(); };
  }, [open, fileUrl, fileName, fileType, storageBucket, retry]);

  const print = () => {
    if (!prepared || !loaded) return;
    try {
      if (prepared.kind === 'image') window.print();
      else {
        openPdfForPrinting(prepared);
        setNotice('Use the PDF viewer’s Print button or Ctrl+P (⌘P on Mac) in the new tab. If it does not display a PDF, this browser does not support PDF preview.');
      }
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : 'Could not open printing. Try again.');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title || fileName || 'Document'} subtitle={subtitle}
      size="xl" flush printable={prepared?.kind === 'image' && loaded && !error}
      footer={(
        <>
          {actions}
          <button type="button" className="btn btn-secondary btn-md" disabled={!prepared || Boolean(error)} onClick={() => {
            if (!prepared) return;
            try { downloadPreparedDocument(prepared); setNotice('Download started.'); }
            catch { setNotice('Could not start the download. Try again.'); }
          }}>
            <Download size={16} strokeWidth={1.75} aria-hidden="true" /> Download
          </button>
          <button type="button" className="btn btn-primary btn-md" onClick={print}
            disabled={!loaded || Boolean(error) || !prepared || prepared.kind === 'unsupported'}
            title={prepared?.kind === 'pdf' ? 'Open the PDF in a new tab to print' : undefined}>
            <Printer size={16} strokeWidth={1.75} aria-hidden="true" /> Print
            {prepared?.kind === 'pdf' && <ExternalLink size={16} strokeWidth={1.75} aria-hidden="true" />}
          </button>
        </>
      )}>
      <div className="flex h-full min-h-0 flex-col bg-[var(--bg-page)] print:h-auto print:bg-[var(--bg-surface)]">
        <div className="shrink-0 border-b border-[var(--neutral-200)] bg-[var(--bg-surface)] px-4 py-2 print:hidden">
          <p className="!m-0 break-all text-body-s">{prepared?.fileName || fileName}</p>
          {prepared && prepared.kind !== 'unsupported' && !loaded && !error && <p role="status" className="!mb-0 mt-1 text-body-s">Loading preview…</p>}
          {notice && <p role="status" className="!mb-0 mt-1 text-body-s">{notice}</p>}
          {prepared?.kind === 'pdf' && !notice && <p className="!mb-0 mt-1 text-body-s text-[var(--neutral-600)]">Print opens a PDF tab. If the preview is blank, try Print to open it separately, or download the file.</p>}
        </div>
        {error ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 overflow-y-auto p-6 text-center">
            <p role="alert" className="!m-0 text-body-l">{error}</p>
            <button type="button" className="btn btn-secondary btn-md" onClick={() => setRetry((value) => value + 1)}>Try again</button>
          </div>
        ) : !prepared ? (
          <div role="status" className="flex flex-1 items-center justify-center gap-2" aria-live="polite">
            <LoaderCircle size={20} strokeWidth={1.75} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> Loading document…
          </div>
        ) : prepared.kind === 'image' ? (
          <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4 print:block print:p-0">
            <img src={prepared.url} alt={prepared.fileName} className="max-h-full max-w-full object-contain print:h-auto print:w-auto"
              onLoad={() => setLoaded(true)} onError={() => setError('This image could not be displayed. Ask for a readable upload.')} />
          </div>
        ) : prepared.kind === 'pdf' ? (
          <iframe src={prepared.url} title={prepared.fileName} className="min-h-0 w-full flex-1 border-0"
            onLoad={() => setLoaded(true)} onError={() => setError('This PDF could not be displayed. Close the viewer and try again.')} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 overflow-y-auto p-6 text-center">
            <FileText size={24} strokeWidth={1.75} aria-hidden="true" />
            <p className="!m-0 text-title-s">Preview unavailable for this file type</p>
            <p className="!m-0 max-w-prose text-body-l">PDFs and images can be viewed and printed here. Download this file to open and print it in a compatible app. It has not been sent to an external viewer.</p>
          </div>
        )}
      </div>
    </Modal>
  );
};
