import { useRef, useState, type FormEvent } from "react";
import { supabase, supabaseConfigured } from "../../services/supabase";
import { api } from "../../services/api";

import { ArrowRight, ArrowLeft, Eye, EyeOff, LockKeyhole, LoaderCircle, Mail, UserRound, KeyRound, ShieldCheck } from "lucide-react";
import "./login.css";
import PrintStudioIllustration from "./PrintStudioIllustration";

const rememberedEmail = () => { try { return localStorage.getItem("finanbase-login-email") || ""; } catch { return ""; } };

type User = { id: string; name: string; email?: string };
export function LoginPage({ onLogin }: { onLogin: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "signup" | "recover" | "reset">(sessionStorage.getItem("finanbase-recovery") ? "reset" : "login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState(sessionStorage.getItem("finanbase-recovery-email") || rememberedEmail());
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [token, setToken] = useState("");
  const [remember, setRemember] = useState(Boolean(rememberedEmail()));
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
        try { if (remember) localStorage.setItem("finanbase-login-email", normalizedEmail); else localStorage.removeItem("finanbase-login-email"); } catch {}
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
  const title = mode === "signup" ? "Criar sua conta" : mode === "recover" ? "Recuperar acesso" : mode === "reset" ? "Criar nova senha" : "Fazer login";
  return <main className="login-page">
    <div className="login-layout">
    <section className="login-panel">
      <header className="login-mobile-brand"><img src="/finanbase-icon.svg" alt="" width="36" height="36"/><b>finanbase</b></header>
      <div className="login-card">
        {recovery && <button className="login-back" type="button" disabled={busy} onClick={()=>switchMode("login")}><ArrowLeft/> Voltar para entrar</button>}
        <div className="login-welcome">{recovery && <span className="login-recovery-icon"><LockKeyhole/></span>}<h2>{title}</h2><p>{mode === "signup" ? "Crie sua conta e organize seu negócio com leveza." : mode === "recover" ? "Informe seu e-mail para receber um código de recuperação." : mode === "reset" ? "Digite o código recebido e escolha sua nova senha." : ""}</p></div>
        <form onSubmit={submit} aria-busy={busy}>
          {error && <div className="notice error" role="alert">{error}</div>}{message && <div className="notice success" role="status">{message}</div>}
          <fieldset disabled={busy} className="auth-fields">
            {mode === "signup" && <label className="login-icon-field" htmlFor="auth-name"><span className="login-sr-only">Seu nome</span><UserRound aria-hidden="true"/><input id="auth-name" value={name} onChange={e=>setName(e.target.value)} autoComplete="name" placeholder="Como podemos chamar você?" maxLength={120} pattern=".*\S.*" required/></label>}
            <label className="login-icon-field" htmlFor="auth-email"><span className="login-sr-only">E-mail</span><Mail aria-hidden="true"/><input id="auth-email" type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username" placeholder="Seu e-mail" required readOnly={mode === "reset"} autoCapitalize="none" spellCheck={false}/></label>
            {mode === "reset" && <label className="login-icon-field" htmlFor="auth-token"><span className="login-sr-only">Código recebido por e-mail</span><KeyRound aria-hidden="true"/><input id="auth-token" value={token} onChange={e=>setToken(e.target.value)} autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6,8}" maxLength={8} placeholder="Digite o código" required/></label>}
            {mode !== "recover" && <><div className="login-password-field"><div className="login-label-row"><label className="login-sr-only" htmlFor="auth-password">{mode === "reset" ? "Nova senha" : "Senha"}</label></div><div className="password-input"><LockKeyhole className="login-input-icon" aria-hidden="true"/><input id="auth-password" type={show ? "text" : "password"} value={password} onChange={e=>setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "login" ? 1 : 8} placeholder={mode === "login" ? "Senha" : "Senha com 8 ou mais caracteres"} aria-describedby={mode !== "login" ? "auth-password-hint" : undefined} required/><button type="button" onClick={()=>setShow(!show)} aria-label={show ? "Ocultar senha" : "Mostrar senha"} aria-pressed={show} title={show ? "Ocultar senha" : "Mostrar senha"}>{show ? <EyeOff/> : <Eye/>}</button></div>{mode !== "login" && <small id="auth-password-hint">Use pelo menos 8 caracteres.</small>}</div>{mode !== "login" && <label className="login-icon-field" htmlFor="auth-confirmation"><span className="login-sr-only">Confirmar senha</span><LockKeyhole aria-hidden="true"/><input id="auth-confirmation" type={show ? "text" : "password"} value={confirmation} onChange={e=>setConfirmation(e.target.value)} autoComplete="new-password" minLength={8} placeholder="Repita sua senha" required/></label>}</>}
            {mode === "login" && <div className="login-options"><label className="login-remember"><input type="checkbox" checked={remember} onChange={e=>{setRemember(e.target.checked);if(!e.target.checked){try{localStorage.removeItem("finanbase-login-email")}catch{}}}}/>Lembrar e-mail</label><button className="login-text-button" type="button" onClick={()=>switchMode("recover")}>Esqueceu a senha?</button></div>}
            <button className="primary login-button" type="submit">{busy ? <><LoaderCircle className="login-spinner"/> Aguarde...</> : <>{mode === "signup" ? "Criar minha conta" : mode === "recover" ? "Enviar código" : mode === "reset" ? "Salvar nova senha" : "Entrar"}<ArrowRight/></>}</button>
          </fieldset>
        </form>
        {!recovery && <div className="login-social"><div className="auth-divider"><span>ou entre com sua conta</span></div><button type="button" className="google-login" onClick={google} disabled={busy} aria-label="Continuar com Google" title="Continuar com Google"><svg width="24" height="24" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6C44.4 38.03 46.98 31.9 46.98 24.55Z"/><path fill="#FBBC05" d="M10.53 28.59a14.4 14.4 0 0 1 0-9.18l-7.98-6.19a24 24 0 0 0 0 21.56l7.98-6.19Z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z"/></svg></button></div>}
        <p className="login-bottom-note">{mode === "signup" ? "Já tem uma conta?" : recovery ? "Lembrou sua senha?" : "Ainda não tem uma conta?"} <button type="button" disabled={busy} onClick={()=>switchMode(mode === "login" ? "signup" : "login")}>{mode === "login" ? "Criar conta" : "Entrar"}</button></p>
      </div>
    </section>
    <section className="login-presentation" aria-label="Finanbase para impressão 3D">
      <div className="login-product-brand"><img src="/finanbase-icon.svg" alt="" width="42" height="42"/><span>finanbase</span></div>
      <p className="login-maker-eyebrow">DA IDEIA À PEÇA PRONTA</p>
      <h1>Você cria em 3D.<br/><span>A gente conecta<br/>o seu negócio.</span></h1>
      <p className="login-product-description">Do custo do filamento à entrega do pedido.<br/>Finanças e produção, camada por camada.</p>
      <PrintStudioIllustration/>
      <div className="login-maker-flow" aria-label="Organize cada etapa"><span><b>01</b> Calcule os custos</span><ArrowRight aria-hidden="true"/><span><b>02</b> Organize a produção</span><ArrowRight aria-hidden="true"/><span><b>03</b> Acompanhe as vendas</span></div>
      <p className="login-presentation-security"><ShieldCheck/> Mais tempo para criar. Mais clareza para crescer.</p>
    </section>
    </div>
    <footer className="login-page-footer">© {new Date().getFullYear()} Finanbase. Seu negócio em boas mãos.</footer>
  </main>;
}
