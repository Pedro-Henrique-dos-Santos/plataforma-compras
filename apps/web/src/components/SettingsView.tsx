import { useEffect, useState, type FormEvent } from 'react';
import type { UpdateUserProfileInput, UserContext } from '@compras/contracts';
import {
  ChevronDown,
  ExternalLink,
  FileText,
  MonitorCog,
  Save,
  ShieldCheck,
  UserRound,
} from 'lucide-react';

import type { LegalDocumentKind } from '../legal';
import type { ThemeMode } from '../lib/theme';
import { LegalDocumentDialog } from './LegalDocumentDialog';

type SettingsViewProps = {
  onProfileUpdate: (input: UpdateUserProfileInput) => Promise<void>;
  onThemeChange: (theme: ThemeMode) => void;
  theme: ThemeMode;
  user: UserContext;
};

export function SettingsView({ onProfileUpdate, onThemeChange, theme, user }: SettingsViewProps) {
  const [name, setName] = useState(user.name);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [legalDialog, setLegalDialog] = useState<LegalDocumentKind | null>(null);

  useEffect(() => setName(user.name), [user.name]);

  async function handleProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      await onProfileUpdate({ name });
      setMessage('Nome da conta atualizado.');
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Nao foi possivel atualizar a conta.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="management-layout">
      <section className="section-heading">
        <span>
          <p className="eyebrow">Preferencias</p>
          <h2>Configuracoes da conta</h2>
        </span>
      </section>

      <section className="panel settings-list">
        <form className="settings-row settings-form-row" onSubmit={(event) => void handleProfile(event)}>
          <span className="settings-icon">
            <UserRound size={19} />
          </span>
          <span className="settings-copy">
            <strong>Nome exibido</strong>
            <small>{user.email}</small>
          </span>
          <input
            aria-label="Nome exibido"
            className="settings-input"
            maxLength={120}
            minLength={2}
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
          <button
            aria-label="Salvar nome"
            className="icon-button"
            disabled={submitting || name.trim() === user.name}
            title="Salvar nome"
            type="submit"
          >
            <Save size={17} />
          </button>
        </form>

        <div className="settings-row">
          <span className="settings-icon">
            <MonitorCog size={19} />
          </span>
          <span className="settings-copy">
            <strong>Aparencia</strong>
            <small>Tema aplicado neste navegador</small>
          </span>
          <label className="settings-select">
            <span className="sr-only">Aparencia</span>
            <select onChange={(event) => onThemeChange(event.target.value as ThemeMode)} value={theme}>
              <option value="normal">Normal</option>
              <option value="dark">Escuro</option>
              <option value="white">Branco</option>
            </select>
            <ChevronDown size={15} />
          </label>
        </div>

        <div className="settings-row">
          <span className="settings-icon">
            <FileText size={19} />
          </span>
          <span className="settings-copy">
            <strong>Termos de uso</strong>
            <small>{acceptanceLabel(user.termsAcceptedAt, user.termsVersion)}</small>
          </span>
          <button
            aria-label="Consultar Termos de uso"
            className="icon-button"
            onClick={() => setLegalDialog('terms')}
            title="Consultar Termos de uso"
            type="button"
          >
            <ExternalLink size={16} />
          </button>
        </div>

        <div className="settings-row">
          <span className="settings-icon">
            <ShieldCheck size={19} />
          </span>
          <span className="settings-copy">
            <strong>Aviso de privacidade</strong>
            <small>{acceptanceLabel(user.privacyAcceptedAt, user.privacyVersion)}</small>
          </span>
          <button
            aria-label="Consultar Aviso de privacidade"
            className="icon-button"
            onClick={() => setLegalDialog('privacy')}
            title="Consultar Aviso de privacidade"
            type="button"
          >
            <ExternalLink size={16} />
          </button>
        </div>
      </section>
      {message && <div className="success-banner">{message}</div>}
      {error && <div className="inline-error">{error}</div>}
      {legalDialog && (
        <LegalDocumentDialog kind={legalDialog} onClose={() => setLegalDialog(null)} />
      )}
    </div>
  );
}

function acceptanceLabel(acceptedAt: string | null, version: string | null): string {
  if (!acceptedAt || !version) return 'Aceite pendente';
  const date = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(acceptedAt));
  return `Versao ${version}, aceita em ${date}`;
}
