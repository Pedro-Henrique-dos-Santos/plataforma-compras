import { useState, type FormEvent } from 'react';
import { ArrowRight, LockKeyhole } from 'lucide-react';

import { demoMode, supabase } from '../lib/auth';

type LoginScreenProps = {
  onAuthenticated: (token: string | null) => void;
};

export function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (demoMode) {
      onAuthenticated(null);
      return;
    }
    if (!supabase) {
      setError('A autenticacao ainda nao foi configurada neste ambiente.');
      return;
    }

    setSubmitting(true);
    setError(null);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setSubmitting(false);

    if (signInError || !data.session) {
      setError(signInError?.message ?? 'Nao foi possivel iniciar a sessao.');
      return;
    }
    onAuthenticated(data.session.access_token);
  }

  return (
    <main className="login-page">
      <section className="login-brand" aria-label="Plataforma de Compras">
        <div className="login-brand-inner">
          <div className="brand-lockup large">
            <span className="brand-mark">PC</span>
            <span>
              <strong>Plataforma de Compras</strong>
              <small>Gestao multiempresa</small>
            </span>
          </div>
          <div className="login-statement">
            <p className="eyebrow">Operacao centralizada</p>
            <h1>Compras sob controle, empresa por empresa.</h1>
            <p>
              Acompanhe valores, fornecedores e resultados em um ambiente separado para cada
              organizacao.
            </p>
          </div>
          <div className="login-brand-footer">Ambiente seguro e auditavel</div>
        </div>
      </section>

      <section className="login-form-panel">
        <form className="login-form" onSubmit={handleSubmit}>
          <span className="login-icon" aria-hidden="true">
            <LockKeyhole size={21} />
          </span>
          <h2>Acessar plataforma</h2>
          <p className="form-subtitle">
            {demoMode ? 'Ambiente local de desenvolvimento' : 'Entre com sua conta cadastrada'}
          </p>

          {!demoMode && (
            <>
              <label>
                E-mail
                <input
                  autoComplete="email"
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="seu@email.com"
                  required
                  type="email"
                  value={email}
                />
              </label>
              <label>
                Senha
                <input
                  autoComplete="current-password"
                  minLength={8}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </label>
            </>
          )}

          {error && <div className="form-error">{error}</div>}

          <button className="primary-button login-submit" disabled={submitting} type="submit">
            <span>{demoMode ? 'Entrar na demonstracao' : 'Entrar'}</span>
            <ArrowRight size={18} />
          </button>
        </form>
      </section>
    </main>
  );
}

