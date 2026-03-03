import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useI18n, LanguageToggle } from "@/lib/i18n";

export default function Login() {
  const { t } = useI18n();
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const err = mode === "login" ? await signIn(email, password) : await signUp(email, password);
    setSubmitting(false);
    if (err) {
      setError(err);
    } else {
      navigate("/admin");
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-5">
      <div className="w-full max-w-md border border-primary/40 p-8 bg-card shadow-[0_0_30px_hsl(var(--primary)/0.1)]">
        <div className="flex justify-end mb-4">
          <LanguageToggle />
        </div>
        <h1 className="text-center text-2xl font-display font-bold text-primary drop-shadow-[0_0_10px_hsl(var(--primary)/0.5)] mb-6">
          🔐 ADMIN ACCESS
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">EMAIL</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="field-input" required />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">PASSWORD</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="field-input" required minLength={6} />
          </div>

          {error && <div className="text-destructive text-xs">{error}</div>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-primary text-primary-foreground font-bold py-3 text-sm tracking-wider hover:shadow-[0_0_20px_hsl(var(--primary)/0.6)] transition-all disabled:opacity-50"
          >
            {submitting ? "PROCESSING..." : mode === "login" ? "LOGIN" : "REGISTER"}
          </button>
        </form>

        <button
          onClick={() => setMode(mode === "login" ? "register" : "login")}
          className="mt-4 text-xs text-muted-foreground hover:text-primary transition-colors w-full text-center"
        >
          {mode === "login" ? t("login.noAccount") : t("login.hasAccount")}
        </button>
      </div>
    </div>
  );
}
