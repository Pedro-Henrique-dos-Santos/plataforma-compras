import { useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, LockKeyhole, MailCheck } from 'lucide-react';

import logoMark from '../assets/egestao-mark.svg';
import { demoMode, supabase } from '../lib/auth';

type LoginScreenProps = {
  onAuthenticated: (token: string | null) => void;
};

type LoginMode = 'login' | 'recovery' | 'recovery-sent';

export function LoginScreen({ onAuthenticated }: LoginScreenProps) {
  const [mode, setMode] = useState<LoginMode>('login');
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
    if (mode === 'recovery') {
      const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/?recovery=1`,
      });
      setSubmitting(false);
      if (recoveryError) {
        setError(recoveryError.message);
        return;
      }
      setMode('recovery-sent');
      return;
    }

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
      <section className="login-brand" aria-label="E-Gestão Compras">
        <div className="login-brand-inner">
          <div className="brand-lockup large">
            <img alt="" className="brand-logo" src={logoMark} />
            <span>
              <strong>E-Gestão Compras</strong>
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
        {mode === 'recovery-sent' ? (
          <div className="login-form recovery-result">
            <span className="login-icon" aria-hidden="true">
              <MailCheck size={21} />
            </span>
            <h2>Verifique seu e-mail</h2>
            <p className="form-subtitle">O link para redefinir a senha foi enviado para {email}.</p>
            <button className="secondary-button login-submit" onClick={() => setMode('login')} type="button">
              <ArrowLeft size={17} />
              Voltar ao acesso
            </button>
          </div>
        ) : (
          <form className="login-form" onSubmit={(event) => void handleSubmit(event)}>
            <span className="login-icon" aria-hidden="true">
              <LockKeyhole size={21} />
            </span>
            <h2>{mode === 'recovery' ? 'Recuperar acesso' : 'Acessar plataforma'}</h2>
            <p className="form-subtitle">
              {demoMode
                ? 'Ambiente local de desenvolvimento'
                : mode === 'recovery'
                  ? 'Informe o e-mail cadastrado'
                  : 'Entre com sua conta cadastrada'}
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
                {mode === 'login' && (
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
                )}
              </>
            )}

            {error && <div className="form-error">{error}</div>}

            <button className="primary-button login-submit" disabled={submitting} type="submit">
              <span>
                {demoMode
                  ? 'Entrar na demonstracao'
                  : mode === 'recovery'
                    ? 'Enviar link'
                    : 'Entrar'}
              </span>
              <ArrowRight size={18} />
            </button>
            {!demoMode && (
              <button
                className="text-button login-mode-button"
                onClick={() => {
                  setError(null);
                  setMode(mode === 'login' ? 'recovery' : 'login');
                }}
                type="button"
              >
                {mode === 'login' ? 'Esqueci minha senha' : 'Voltar ao acesso'}
              </button>
            )}
          </form>
        )}
      </section>
    </main>
  );
}
