import { useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';

import logoMark from '../assets/egestao-mark.svg';
import { supabase } from '../lib/auth';

type PasswordResetScreenProps = {
  onComplete: () => void;
};

export function PasswordResetScreen({ onComplete }: PasswordResetScreenProps) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password !== confirmation) {
      setError('As senhas informadas nao conferem.');
      return;
    }
    if (!supabase) {
      setError('A autenticacao nao esta configurada.');
      return;
    }

    setSubmitting(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onComplete();
  }

  return (
    <main className="standalone-auth-page">
      <form className="login-form auth-card" onSubmit={(event) => void handleSubmit(event)}>
        <img alt="" className="standalone-logo" src={logoMark} />
        <span className="login-icon" aria-hidden="true">
          <KeyRound size={21} />
        </span>
        <h1>Definir nova senha</h1>
        <label>
          Nova senha
          <input
            autoComplete="new-password"
            minLength={8}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
        </label>
        <label>
          Confirmar senha
          <input
            autoComplete="new-password"
            minLength={8}
            onChange={(event) => setConfirmation(event.target.value)}
            required
            type="password"
            value={confirmation}
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button className="primary-button login-submit" disabled={submitting} type="submit">
          {submitting ? 'Atualizando' : 'Atualizar senha'}
        </button>
      </form>
    </main>
  );
}
