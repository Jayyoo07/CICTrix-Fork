import React from 'react';
import '../styles/components.css';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  headerIcon?: React.ReactNode;
  children: React.ReactNode;
}

export const Dialog: React.FC<DialogProps> = ({ open, onClose, title, subtitle, headerIcon, children }) => {
  if (!open) return null;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={(e) => e.stopPropagation()}>
        {title && (
          <div className="dialog-header" style={subtitle ? { alignItems: 'flex-start' } : undefined}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {headerIcon}
                <h2 className="dialog-title">{title}</h2>
              </div>
              {subtitle && (
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#515F69', fontWeight: 400, lineHeight: 1.4 }}>
                  {subtitle}
                </p>
              )}
            </div>
            <button className="dialog-close" onClick={onClose}>×</button>
          </div>
        )}
        <div className="dialog-body">
          {children}
        </div>
      </div>
    </div>
  );
};
