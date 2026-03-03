import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useI18n, LanguageToggle } from "@/lib/i18n";

interface SubmissionForm {
  project_title: string;
  one_liner: string;
  problem: string;
  solution: string;
  why_this_chain: string;
  github_url: string;
  demo_url: string;
  docs_text: string;
}

const EMPTY_FORM: SubmissionForm = {
  project_title: "",
  one_liner: "",
  problem: "",
  solution: "",
  why_this_chain: "",
  github_url: "",
  demo_url: "",
  docs_text: "",
};

const ACCEPTED_EXTENSIONS = [".md", ".txt", ".html", ".pdf"];

export default function Submit() {
  const { t } = useI18n();
  const [form, setForm] = useState<SubmissionForm>(EMPTY_FORM);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [lastSubmissionId, setLastSubmissionId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const set = (field: keyof SubmissionForm) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleFileAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const newFiles = Array.from(e.target.files).filter((f) => {
      const ext = f.name.slice(f.name.lastIndexOf(".")).toLowerCase();
      return ACCEPTED_EXTENSIONS.includes(ext);
    });
    if (newFiles.length < (e.target.files?.length ?? 0)) {
      toast.warning(t("submit.fileFilterWarn"));
    }
    setFiles((prev) => [...prev, ...newFiles]);
    e.target.value = "";
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const validate = (): string | null => {
    if (!form.project_title.trim()) return t("submit.validateTitle");
    if (!form.one_liner.trim()) return t("submit.validateOneLiner");
    if (form.one_liner.length > 200) return t("submit.validateOneLinerLen");
    if (!form.problem.trim()) return t("submit.validateProblem");
    if (!form.solution.trim()) return t("submit.validateSolution");
    if (form.github_url && !/^https?:\/\/.+/.test(form.github_url))
      return t("submit.validateGithub");
    if (form.demo_url && !/^https?:\/\/.+/.test(form.demo_url))
      return t("submit.validateDemo");
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setSubmitting(true);

    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => {
      if (v) fd.append(k, v);
    });
    files.forEach((f) => fd.append("files", f));

    try {
      const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID || "ffkmvdvpewsgenaxeouu";
      const res = await fetch(`https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/api-proxy/api/submit`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) throw new Error("提交失败");
      const data = await res.json().catch(() => ({}));
      const submissionId = data?.id;
      setForm(EMPTY_FORM);
      setFiles([]);
      setLastSubmissionId(submissionId ?? null);
      toast.success(t("submit.submitSuccess"));
    } catch {
      toast.error(t("submit.submitFail"));
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-background p-5 relative overflow-hidden">
      <div className="pointer-events-none fixed inset-0 z-50">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.03] via-transparent to-primary/[0.03] animate-scanline" />
      </div>

      <div className="max-w-[800px] mx-auto border border-primary/40 p-8 shadow-[0_0_30px_hsl(var(--primary)/0.1)] bg-card relative">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
          <div className="flex items-center gap-2">
            <Link
              to="/submit"
              className="text-xs text-muted-foreground hover:text-primary transition-colors border border-border px-3 py-1.5"
            >
              {t("nav.home")}
            </Link>
            <LanguageToggle />
          </div>
          <div className="flex gap-2">
            <Link to="/ranking" className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-primary transition-colors">
              {t("nav.ranking")}
            </Link>
            <Link to="/judge" className="text-xs border border-primary/40 px-3 py-1.5 text-primary hover:bg-primary/10 transition-colors">
              {t("nav.judge")}
            </Link>
          </div>
        </div>

        {lastSubmissionId && (
          <div className="mb-6 p-4 bg-primary/10 border border-primary/40 rounded">
            <p className="text-sm text-foreground/90 mb-2">✅ {t("submit.successMsg")} <strong>{t("submit.successMin")}</strong> {t("submit.successWait")}</p>
            <Link
              to={`/my-submission/${lastSubmissionId}`}
              className="inline-flex items-center text-sm font-bold text-primary hover:underline"
            >
              {t("submit.viewMyProject")}
            </Link>
          </div>
        )}

        <h1 className="text-center text-3xl font-display font-bold text-primary drop-shadow-[0_0_10px_hsl(var(--primary)/0.5)] animate-flicker mb-1">
          {t("submit.title")}
        </h1>
        <p className="text-center text-xs text-muted-foreground mb-8 pb-2.5 border-b border-border">
          {t("submit.subtitle")}
        </p>

        <SectionLabel index={1} text={t("submit.section1")} />

        <FieldRow label={t("submit.projectTitle")} hint="project_title">
          <input value={form.project_title} onChange={set("project_title")} placeholder={t("submit.projectTitlePlaceholder")} className="field-input" />
        </FieldRow>

        <FieldRow label={t("submit.oneLiner")} hint="one_liner · ≤200">
          <input value={form.one_liner} onChange={set("one_liner")} maxLength={200} placeholder={t("submit.oneLinerPlaceholder")} className="field-input" />
          <div className="text-right text-[10px] text-muted-foreground mt-0.5">{form.one_liner.length}/200</div>
        </FieldRow>

        <FieldRow label={t("submit.problem")} hint="problem">
          <textarea value={form.problem} onChange={set("problem")} rows={3} placeholder={t("submit.problemPlaceholder")} className="field-input resize-y" />
        </FieldRow>

        <FieldRow label={t("submit.solution")} hint="solution">
          <textarea value={form.solution} onChange={set("solution")} rows={3} placeholder={t("submit.solutionPlaceholder")} className="field-input resize-y" />
        </FieldRow>

        <SectionLabel index={2} text={t("submit.section2")} />

        <FieldRow label={t("submit.whyChain")} hint="why_this_chain">
          <textarea value={form.why_this_chain} onChange={set("why_this_chain")} rows={2} placeholder={t("submit.whyChainPlaceholder")} className="field-input resize-y" />
        </FieldRow>

        <FieldRow label={t("submit.githubUrl")} hint="github_url">
          <input value={form.github_url} onChange={set("github_url")} placeholder="https://github.com/your-org/your-repo" className="field-input" />
        </FieldRow>

        <FieldRow label={t("submit.demoUrl")} hint="demo_url">
          <input value={form.demo_url} onChange={set("demo_url")} placeholder="https://your-demo.app" className="field-input" />
        </FieldRow>

        <FieldRow label={t("submit.docsText")} hint="docs_text">
          <textarea value={form.docs_text} onChange={set("docs_text")} rows={4} placeholder={t("submit.docsTextPlaceholder")} className="field-input resize-y" />
        </FieldRow>

        <SectionLabel index={3} text={t("submit.section3")} />

        <div className="mb-4">
          <p className="text-xs text-muted-foreground mb-3">
            <code className="bg-muted px-1 border border-border text-foreground/80">.md</code>{" "}
            <code className="bg-muted px-1 border border-border text-foreground/80">.txt</code>{" "}
            <code className="bg-muted px-1 border border-border text-foreground/80">.html</code>{" "}
            <code className="bg-muted px-1 border border-border text-foreground/80">.pdf</code>
            　{t("submit.fileNote")}
          </p>

          <input ref={fileInputRef} type="file" accept=".md,.txt,.html,.pdf" multiple onChange={handleFileAdd} className="hidden" />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full border-2 border-dashed border-primary/30 hover:border-primary/60 py-6 text-sm text-muted-foreground hover:text-primary transition-all cursor-pointer"
          >
            {t("submit.uploadBtn")}
          </button>

          {files.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {files.map((f, i) => (
                <div key={`${f.name}-${i}`} className="flex items-center justify-between bg-muted border border-border px-3 py-2 text-xs">
                  <span className="text-foreground/80 truncate mr-3">
                    {f.name} <span className="text-muted-foreground">({(f.size / 1024).toFixed(1)} KB)</span>
                  </span>
                  <button onClick={() => removeFile(i)} className="text-destructive hover:text-destructive/80 shrink-0">✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full bg-primary text-primary-foreground font-bold py-4 text-sm tracking-wider hover:shadow-[0_0_20px_hsl(var(--primary)/0.6)] hover:-translate-y-px transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-4"
        >
          {submitting ? t("submit.submitting") : t("submit.submitBtn")}
        </button>
      </div>
    </div>
  );
}

function SectionLabel({ index, text }: { index: number; text: string }) {
  return (
    <label className="block mb-3 mt-6 font-bold text-foreground/90 text-sm border-l-[3px] border-primary pl-2.5">
      {index}. {text}
    </label>
  );
}

function FieldRow({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-xs font-semibold text-foreground/80">{label}</span>
        <span className="text-[10px] text-muted-foreground font-mono">{hint}</span>
      </div>
      {children}
    </div>
  );
}
