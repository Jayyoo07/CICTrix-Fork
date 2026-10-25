import { Download } from 'lucide-react';
import React from 'react';
import { Modal } from './modal';
import { downloadEmployeeDocument } from '../lib/employeeDocuments';

interface DocumentPreviewModalProps {
  open: boolean;
  fileUrl: string;
  fileName: string;
  fileType?: string | null;
  title?: string;
  subtitle?: string;
  onClose: () => void;
  /** Optional extra controls rendered next to the Download button (e.g. Approve/Reject). */
  actions?: React.ReactNode;
}

const isImage = (fileName: string, fileType?: string | null): boolean => {
  if (fileType?.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(fileName);
};

const isPdf = (fileName: string, fileType?: string | null): boolean => {
  if (fileType === 'application/pdf') return true;
  return /\.pdf$/i.test(fileName);
};

const isOfficeDoc = (fileName: string): boolean => {
  return /\.(docx?|xlsx?|pptx?)$/i.test(fileName);
};

export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
  open,
  fileUrl,
  fileName,
  fileType,
  title,
  subtitle,
  onClose,
  actions,
}) => {
  if (!open) return null;

  const handleDownload = () => {
    void downloadEmployeeDocument({ file_url: fileUrl, file_name: fileName });
  };

  const renderBody = () => {
    if (!fileUrl) {
      return (
        <div className="flex h-full items-center justify-center text-slate-500">
          No file available to preview.
        </div>
      );
    }

    if (isImage(fileName, fileType)) {
      return (
        <div className="flex h-full items-center justify-center bg-slate-100 p-4">
          <img
            src={fileUrl}
            alt={fileName}
            className="max-h-full max-w-full object-contain shadow-md"
          />
        </div>
      );
    }

    if (isPdf(fileName, fileType)) {
      return (
        <iframe
          src={fileUrl}
          title={fileName}
          className="h-full w-full border-0 bg-slate-100"
        />
      );
    }

    if (isOfficeDoc(fileName)) {
      const officeViewer = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;
      return (
        <iframe
          src={officeViewer}
          title={fileName}
          className="h-full w-full border-0 bg-slate-100"
        />
      );
    }

    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-slate-600">
        <p className="text-sm">
          This file type can't be previewed in the browser.
        </p>
        <button
          type="button"
          onClick={handleDownload}
          className="btn btn-primary btn-md"
        >
          <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Download to view
        </button>
      </div>
    );
  };

  // §9.10 document viewer: xl, edge-to-edge body; extra actions sit beside Download.
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title || fileName}
      subtitle={subtitle}
      size="xl"
      flush
      footer={(
        <>
          {actions}
          <button type="button" onClick={handleDownload} className="btn btn-secondary btn-md">
            <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Download
          </button>
        </>
      )}
    >
      {renderBody()}
    </Modal>
  );
};
