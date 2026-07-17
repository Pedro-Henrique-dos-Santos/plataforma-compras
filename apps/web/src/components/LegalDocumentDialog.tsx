import { X } from 'lucide-react';

import { legalDocuments, type LegalDocumentKind } from '../legal';

type LegalDocumentDialogProps = {
  kind: LegalDocumentKind;
  onClose: () => void;
};

export function LegalDocumentDialog({ kind, onClose }: LegalDocumentDialogProps) {
  const document = legalDocuments[kind];
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-labelledby="legal-document-title"
        aria-modal="true"
        className="modal-panel legal-modal"
        role="dialog"
      >
        <header className="modal-header">
          <span>
            <p className="eyebrow">Versao {document.version}</p>
            <h2 id="legal-document-title">{document.title}</h2>
          </span>
          <button
            aria-label="Fechar"
            className="icon-button"
            onClick={onClose}
            title="Fechar"
            type="button"
          >
            <X size={18} />
          </button>
        </header>
        <div className="legal-document-copy">
          {document.sections.map((section) => (
            <section key={section.heading}>
              <h3>{section.heading}</h3>
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </section>
          ))}
        </div>
        <footer className="modal-actions">
          <button className="primary-button" onClick={onClose} type="button">
            Fechar
          </button>
        </footer>
      </section>
    </div>
  );
}
