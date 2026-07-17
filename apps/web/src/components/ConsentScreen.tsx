import { useState } from 'react';
import { ArrowRight, ShieldCheck } from 'lucide-react';

import logoMark from '../assets/egestao-mark.svg';
import type { LegalDocumentKind } from '../legal';
import { LegalDocumentDialog } from './LegalDocumentDialog';

type ConsentScreenProps = {
  onAccept: () => Promise<void>;
  onSignOut: () => void;
};

export function ConsentScreen({ onAccept, onSignOut }: ConsentScreenProps) {
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [dialog, setDialog] = useState<LegalDocumentKind | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAccept() {
    setSubmitting(true);
    setError(null);
    try {
      await onAccept();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Nao foi possivel registrar o aceite.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="consent-page">
      <section className="consent-panel">
        <div className="brand-lockup large">
          <img alt="" className="brand-logo" src={logoMark} />
          <span>
            <strong>E-Gestao Compras</strong>
            <small>Gestao multiempresa</small>
          </span>
        </div>
        <span className="login-icon" aria-hidden="true">
          <ShieldCheck size={21} />
        </span>
        <h1>Privacidade e condicoes de uso</h1>
        <p className="form-subtitle">
          Revise os documentos aplicaveis antes de acessar sua empresa.
        </p>
        <div className="consent-options">
          <label className="checkbox-row">
            <input checked={terms} onChange={(event) => setTerms(event.target.checked)} type="checkbox" />
            <span>
              Li e concordo com os{' '}
              <button className="inline-link" onClick={() => setDialog('terms')} type="button">
                Termos de uso
              </button>
              .
            </span>
          </label>
          <label className="checkbox-row">
            <input checked={privacy} onChange={(event) => setPrivacy(event.target.checked)} type="checkbox" />
            <span>
              Li e estou ciente do{' '}
              <button className="inline-link" onClick={() => setDialog('privacy')} type="button">
                Aviso de privacidade
              </button>
              .
            </span>
          </label>
        </div>
        {error && <div className="form-error">{error}</div>}
        <button
          className="primary-button login-submit"
          disabled={!terms || !privacy || submitting}
          onClick={() => void handleAccept()}
          type="button"
        >
          <span>{submitting ? 'Registrando aceite' : 'Concordar e continuar'}</span>
          <ArrowRight size={18} />
        </button>
        <button className="text-button" onClick={onSignOut} type="button">
          Sair desta conta
        </button>
      </section>
      {dialog && <LegalDocumentDialog kind={dialog} onClose={() => setDialog(null)} />}
    </main>
  );
}
