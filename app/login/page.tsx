"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Brand, LogoGlyph } from "@/components/Logo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError("E-mail ou senha incorretos.");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="login">
      <section className="login-hero">
        <div className="viewfinder" />
        <LogoGlyph className="login-watermark" />
        <Brand />
        <h1>Toda ideia começa no quadro</h1>
        <div className="login-foot">
          <p>Audiovisual criativo e estratégico para construir um elo forte entre marcas e pessoas.</p>
          <span className="rec">
            <i /> Referências, notas e links de cada produção num só lugar
          </span>
        </div>
      </section>

      <section className="login-side">
        <form className="login-card" onSubmit={onSubmit}>
          <h2>Entrar</h2>
          <label>
            E-mail
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </label>
          <label>
            Senha
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="btn primary" disabled={loading}>
            {loading ? "Entrando…" : "Entrar"}
          </button>
          <p className="hint">Acesso só para a equipe. Peça seu convite a um dos sócios.</p>
        </form>
      </section>
    </main>
  );
}
