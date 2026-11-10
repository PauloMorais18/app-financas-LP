import { useRef, useState, type FormEvent } from "react";
import { supabase, supabaseConfigured } from "../../services/supabase";
import { api } from "../../services/api";

import { ArrowRight, ArrowLeft, Eye, EyeOff, LockKeyhole, LoaderCircle, Check, ShieldCheck } from "lucide-react";
import "./login.css";

type User = { id: string; name: string; email?: string };
export function LoginPage({ onLogin }: { onLogin: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "signup" | "recover" | "reset">(sessionStorage.getItem("finanbase-recovery") ? "reset" : "login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(sessionStorage.getItem("finanbase-recovery-email") || "");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [token, setToken] = useState("");
  const submitting = useRef(false);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const switchMode = (next: typeof mode) => { sessionStorage.removeItem("finanbase-recovery"); sessionStorage.removeItem("finanbase-recovery-email"); setMode(next); setError(""); setMessage(""); setPassword(""); setConfirmation(""); setToken(""); setShow(false); };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (submitting.current) return; submitting.current = true; setBusy(true); setError(""); setMessage("");
    try {
      if (!supabaseConfigured) throw new Error("Configure o Supabase para continuar.");
      const normalizedEmail = email.trim().toLowerCase();
      if (mode === "recover") {
        const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail);
        if (error) throw error;
        sessionStorage.setItem("finanbase-recovery", "1"); sessionStorage.setItem("finanbase-recovery-email", normalizedEmail); setMode("reset"); setMessage("Se houver uma conta para este e-mail, você receberá um código de recuperação.");
      } else if (mode === "reset") {
        if (password !== confirmation) throw new Error("As senhas não conferem.");
        const { error: verificationError } = await supabase.auth.verifyOtp({ email: normalizedEmail, token: token.trim(), type: "recovery" });
        if (verificationError) throw verificationError;
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) { await supabase.auth.signOut(); throw updateError; }
        await supabase.auth.signOut(); switchMode("login"); setMessage("Senha atualizada. Entre com sua nova senha.");
      } else if (mode === "signup") {
        if (password !== confirmation) throw new Error("As senhas não conferem.");
        const response = await api.post<{ user: User | null; message: string }>("/auth/signup", { name: name.trim(), email: normalizedEmail, password });
        setMessage(response.data.message);
        if (response.data.user && response.data.message === "Conta criada.") onLogin(response.data.user);
      } else {
        const response = await api.post<{ user: User }>("/auth/login", { email: normalizedEmail, password });
        onLogin(response.data.user);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível continuar."); }
    finally { submitting.current = false; setBusy(false); }
  };
  const google = async () => {
    if (submitting.current) return; submitting.current = true; setBusy(true); setError(""); setMessage("");
    try {
      if (!supabaseConfigured) throw new Error("Configure o Supabase para continuar.");
      const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin, queryParams: { prompt: "select_account" } } });
      if (error) throw error;
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Falha ao acessar o Google."); submitting.current = false; setBusy(false); }
  };
  const recovery = mode === "recover" || mode === "reset";
  const title = mode === "signup" ? "Dê o próximo passo." : mode === "recover" ? "Vamos recuperar seu acesso." : mode === "reset" ? "Um novo começo." : "Bom ter você de volta.";
  return <main className="login-page">
    <section className="login-visual" aria-label="Finanbase: gestão financeira e produção">
      <div className="login-brand"><img src="/finanbase-icon.svg" alt="" width="44" height="44"/><b>finanbase<span>Gestão que acompanha você.</span></b></div>
      <div className="login-visual-copy"><span className="login-eyebrow"><span/> MAIS CLAREZA. MAIS POSSIBILIDADES.</span><h1>Seu talento cria.<br/>Sua gestão<br/><em>faz crescer.</em></h1><p>Finanças, pedidos e produção em sintonia.<br/>Mais tempo para o que você faz de melhor.</p><div className="login-benefits"><span><Check/> Finanças organizadas</span><span><Check/> Produção no controle</span></div></div>
      <div className="login-visual-footer"><span>Um só lugar para o seu negócio.</span><span>Feito para simplificar.</span></div>
    </section>
    <section className="login-panel">
      <header className="login-mobile-brand"><img src="/finanbase-icon.svg" alt="" width="36" height="36"/><b>finanbase</b></header>
      <div className="login-panel-meta"><span><span/> Seu espaço de trabalho</span><span>Português · BR</span></div>
      <div className="login-card">
        {!recovery ? <nav className="login-tabs" aria-label="Acesso à conta"><button type="button" aria-current={mode === "login" ? "page" : undefined} disabled={busy} onClick={()=>switchMode("login")}>Entrar</button><button type="button" aria-current={mode === "signup" ? "page" : undefined} disabled={busy} onClick={()=>switchMode("signup")}>Criar conta</button></nav> : <button className="login-back" type="button" disabled={busy} onClick={()=>switchMode("login")}><ArrowLeft/> Voltar para entrar</button>}
        <div className="login-welcome">{recovery && <span className="login-recovery-icon"><LockKeyhole/></span>}<h2>{title}</h2><p>{mode === "signup" ? "Crie sua conta e organize seu negócio com leveza." : mode === "recover" ? "Informe seu e-mail para receber um código de recuperação." : mode === "reset" ? "Digite o código recebido e escolha sua nova senha." : "Entre na sua conta e continue de onde parou."}</p></div>
        <form onSubmit={submit} aria-busy={busy}>
          {error && <div className="notice error" role="alert">{error}</div>}{message && <div className="notice success" role="status">{message}</div>}
          <fieldset disabled={busy} className="auth-fields">
            {mode === "signup" && <label htmlFor="auth-name">Seu nome<input id="auth-name" value={name} onChange={e=>setName(e.target.value)} autoComplete="name" placeholder="Como podemos chamar você?" maxLength={120} pattern=".*\S.*" required/></label>}
            <label htmlFor="auth-email">E-mail<input id="auth-email" type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username" placeholder="voce@exemplo.com" required readOnly={mode === "reset"} autoCapitalize="none" spellCheck={false}/></label>
            {mode === "reset" && <label htmlFor="auth-token">Código recebido por e-mail<input id="auth-token" value={token} onChange={e=>setToken(e.target.value)} autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6,8}" maxLength={8} placeholder="Digite o código" required/></label>}
            {mode !== "recover" && <><div className="login-password-field"><div className="login-label-row"><label htmlFor="auth-password">{mode === "reset" ? "Nova senha" : "Senha"}</label>{mode === "login" && <button className="login-text-button" type="button" onClick={()=>switchMode("recover")}>Esqueceu a senha?</button>}</div><div className="password-input"><input id="auth-password" type={show ? "text" : "password"} value={password} onChange={e=>setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "login" ? 1 : 8} placeholder={mode === "login" ? "Digite sua senha" : "Crie uma senha com 8 ou mais caracteres"} aria-describedby={mode !== "login" ? "auth-password-hint" : undefined} required/><button type="button" onClick={()=>setShow(!show)} aria-label={show ? "Ocultar senha" : "Mostrar senha"} aria-pressed={show} title={show ? "Ocultar senha" : "Mostrar senha"}>{show ? <EyeOff/> : <Eye/>}</button></div>{mode !== "login" && <small id="auth-password-hint">Use pelo menos 8 caracteres.</small>}</div>{mode !== "login" && <label htmlFor="auth-confirmation">Confirmar senha<input id="auth-confirmation" type={show ? "text" : "password"} value={confirmation} onChange={e=>setConfirmation(e.target.value)} autoComplete="new-password" minLength={8} placeholder="Repita sua senha" required/></label>}</>}
            <button className="primary login-button" type="submit">{busy ? <><LoaderCircle className="login-spinner"/> Aguarde...</> : <>{mode === "signup" ? "Criar minha conta" : mode === "recover" ? "Enviar código" : mode === "reset" ? "Salvar nova senha" : "Entrar na minha conta"}<ArrowRight/></>}</button>
          </fieldset>
        </form>
        {!recovery && <div className="login-social"><div className="auth-divider"><span>ou continue com</span></div><button type="button" className="google-login" onClick={google} disabled={busy} aria-label="Continuar com Google" title="Continuar com Google"><svg width="24" height="24" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.03 46.98 31.9 46.98 24.55Z"/><path fill="#FBBC05" d="M10.53 28.59a14.4 14.4 0 0 1 0-9.18l-7.98-6.19a24 24 0 0 0 0 21.56l7.98-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg></button></div>}
        <p className="login-bottom-note">{mode === "signup" ? "Já tem uma conta?" : recovery ? "Lembrou sua senha?" : "Ainda não tem uma conta?"} <button type="button" disabled={busy} onClick={()=>switchMode(mode === "login" ? "signup" : "login")}>{mode === "login" ? "Comece por aqui" : "Entrar"}</button></p>
      </div>
      <footer className="login-panel-footer"><ShieldCheck aria-hidden="true"/><span>Seu negócio em boas mãos. Acesso seguro.</span></footer>
    </section>
  </main>;
}
