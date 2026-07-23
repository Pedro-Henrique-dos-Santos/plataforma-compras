import { useState, type FormEvent } from 'react';
import type { CreateOrganizationInput } from '@compras/contracts';
import { Building2, LogOut, Plus } from 'lucide-react';

import logoMark from '../assets/egestao-mark.svg';

type OrganizationSetupScreenProps = {
  canCreate: boolean;
  onCreate: (input: CreateOrganizationInput) => Promise<void>;
  onSignOut: () => void;
};

export function OrganizationSetupScreen({ canCreate, onCreate, onSignOut }: OrganizationSetupScreenProps) {
  const [name, setName] = useState('');
  const [document, setDocument] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onCreate({ name, document: document || null });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Nao foi possivel criar a empresa.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="standalone-auth-page">
      <section className="setup-panel">
        <img alt="" className="standalone-logo" src={logoMark} />
        <span className="setup-icon"><Building2 size={21} /></span>
        <h1>{canCreate ? 'Cadastre a primeira empresa' : 'Nenhuma empresa disponivel'}</h1>
        {canCreate ? (
          <form className="management-form" onSubmit={(event) => void handleSubmit(event)}>
            <label>
              Razao social ou nome
              <input autoFocus maxLength={120} onChange={(event) => setName(event.target.value)} required value={name} />
            </label>
            <label>
              CNPJ
              <input
                inputMode="numeric"
                maxLength={18}
                onChange={(event) => setDocument(event.target.value)}
                placeholder="00.000.000/0000-00"
                value={document}
              />
            </label>
            {error && <div className="form-error">{error}</div>}
            <button className="primary-button login-submit" disabled={submitting} type="submit">
              <Plus size={16} />
              {submitting ? 'Criando ambiente' : 'Criar empresa'}
            </button>
          </form>
        ) : (
          <>
            <p className="form-subtitle setup-message">
              Sua conta esta ativa, mas ainda nao foi vinculada a uma empresa. O administrador da
              empresa precisa enviar o convite para este mesmo e-mail.
            </p>
            <button className="secondary-button login-submit" onClick={onSignOut} type="button">
              <LogOut size={16} />
              Sair
            </button>
          </>
        )}
      </section>
    </main>
  );
}
