import { useState, useRef, useEffect } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useI18n, LanguageToggle } from "@/lib/i18n";
import { MODELS } from "@/lib/prompts";
import { API_BASE, fetchRoundTracksAPI, roundNavSuffix, sanitizeRoundIdParam, type RoundTrackEntry } from "@/lib/apiClient";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";

interface SubmissionForm {
  project_title: string;
  github_url: string;
  one_liner: string;
  problem: string;
  solution: string;
  demo_url: string;
  docs_text: string;
}

const EMPTY_FORM: SubmissionForm = {
  project_title: "",
  github_url: "",
  one_liner: "",
  problem: "",
  solution: "",
  demo_url: "",
  docs_text: "",
};

const ACCEPTED_EXTENSIONS = [".md", ".txt", ".html", ".pdf"];

const COMMON_KEYWORDS = [
  "GoPlus", "token security API", "rug pull detection", "address scan",
  "contract risk scoring", "honeypot detection", "token risk API", "address risk API",
];

const DEFAULT_SUBMIT_PROMPT = "Score strictly based on rules. Pay special attention to novelty vs existing solutions.";

export default function Submit() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roundIdRequired = sanitizeRoundIdParam(searchParams.get("round_id"));
  const [form, setForm] = useState<SubmissionForm>(EMPTY_FORM);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [lastSubmissionId, setLastSubmissionId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Advanced fields
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [outputLang, setOutputLang] = useState<"en" | "zh">("en");
  const [enableWebSearch, setEnableWebSearch] = useState(true);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [selectedModels, setSelectedModels] = useState<string[]>(["deepseek"]);
  const [customPrompt, setCustomPrompt] = useState(DEFAULT_SUBMIT_PROMPT);
  const [roundTracks, setRoundTracks] = useState<RoundTrackEntry[]>([]);
  const [tracksLoading, setTracksLoading] = useState(true);
  const [selectedTrackId, setSelectedTrackId] = useState("");

  useEffect(() => {
    if (!roundIdRequired) {
      setTracksLoading(false);
      setRoundTracks([]);
      setSelectedTrackId("");
      return;
    }
    let cancelled = false;
    setTracksLoading(true);
    fetchRoundTracksAPI(roundIdRequired)
      .then((tracks) => {
        if (cancelled) return;
        setRoundTracks(tracks);
        setSelectedTrackId((prev) => (prev && tracks.some((x) => x.id === prev) ? prev : ""));
      })
      .catch(() => {
        if (!cancelled) {
          setRoundTracks([]);
          setSelectedTrackId("");
        }
      })
      .finally(() => {
        if (!cancelled) setTracksLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [roundIdRequired]);

  if (!roundIdRequired) {
    return <Navigate to="/rounds" replace />;
  }

  const navSuffix = roundNavSuffix(roundIdRequired);
  const rankingHref =
    roundTracks.length > 0 && selectedTrackId
      ? `/ranking?round_id=${encodeURIComponent(roundIdRequired)}&track=${encodeURIComponent(selectedTrackId)}`
      : `/ranking${navSuffix}`;

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

  const addKeyword = (kw: string) => {
    const trimmed = kw.trim();
    if (trimmed && !keywords.includes(trimmed)) {
      setKeywords((prev) => [...prev, trimmed]);
    }
  };

  const handleKeywordKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addKeyword(keywordInput);
      setKeywordInput("");
    }
  };

  const removeKeyword = (kw: string) => {
    setKeywords((prev) => prev.filter((k) => k !== kw));
  };

  const addCommonKeywords = () => {
    setKeywords((prev) => {
      const set = new Set(prev);
      COMMON_KEYWORDS.forEach((k) => set.add(k));
      return Array.from(set);
    });
  };

  const toggleModel = (id: string) => {
    setSelectedModels((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const validate = (): string | null => {
    if (!form.project_title.trim()) return t("submit.validateTitle");
    const gh = form.github_url.trim();
    if (!gh) return t("submit.validateGithubMissing");
    if (!/^https?:\/\/.+/i.test(gh)) return t("submit.validateGithub");
    if (!/github\.com/i.test(gh)) return t("submit.validateGithubHost");
    if (roundTracks.length > 0 && !selectedTrackId.trim()) return t("submit.validateTrack");
    if (form.one_liner.length > 200) return t("submit.validateOneLinerLen");
    if (form.demo_url.trim() && !/^https?:\/\/.+/i.test(form.demo_url.trim()))
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
    fd.append("project_title", form.project_title.trim());
    fd.append("github_url", form.github_url.trim());
    const optional: [keyof SubmissionForm, string][] = [
      ["one_liner", form.one_liner],
      ["problem", form.problem],
      ["solution", form.solution],
      ["demo_url", form.demo_url],
      ["docs_text", form.docs_text],
    ];
    optional.forEach(([k, v]) => {
      const s = v.trim();
      if (s) fd.append(k, s);
    });
    files.forEach((f) => fd.append("files", f));

    // Advanced fields (backward compatible - backend ignores unknown fields)
    fd.append("output_lang", outputLang);
    fd.append("custom_prompt", customPrompt);
    fd.append("selected_models", JSON.stringify(selectedModels));
    if (enableWebSearch) {
      fd.append("enable_web_search", "true");
      if (keywords.length > 0) {
        fd.append("project_keywords", JSON.stringify(keywords));
      }
    }
    fd.append("round_id", roundIdRequired);
    if (roundTracks.length > 0 && selectedTrackId.trim()) {
      fd.append("track", selectedTrackId.trim());
    }

    try {
      const res = await fetch(`${API_BASE}/api/submit`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "提交失败");
      const submissionId = data?.id;
      setForm(EMPTY_FORM);
      setFiles([]);
      setLastSubmissionId(submissionId ?? null);
      toast.success(t("submit.submitSuccess"));
      if (submissionId) {
        const q = `?round_id=${encodeURIComponent(roundIdRequired)}`;
        navigate(`/my-submission/${submissionId}${q}`);
      }
    } catch (e: any) {
      toast.error(e?.message || t("submit.submitFail"));
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
            <Link to="/" className="text-xs text-muted-foreground hover:text-primary transition-colors border border-border px-3 py-1.5">
              {t("nav.home")}
            </Link>
            <LanguageToggle />
          </div>
          <div className="flex gap-2">
            <Link to={rankingHref} className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-primary transition-colors">
              {t("nav.ranking")}
            </Link>
            <Link to={`/judge${navSuffix}`} className="text-xs border border-primary/40 px-3 py-1.5 text-primary hover:bg-primary/10 transition-colors">
              {t("nav.judge")}
            </Link>
          </div>
        </div>

        <div className="mb-4 px-3 py-2 border border-accent/30 bg-accent/5 text-xs text-muted-foreground">
          <span className="text-accent font-bold">{t("submit.roundBanner", { id: roundIdRequired })}</span>
        </div>

        {lastSubmissionId && (
          <div className="mb-6 p-4 bg-primary/10 border border-primary/40 rounded">
            <p className="text-sm text-foreground/90 mb-2">✅ {t("submit.successMsg")} <strong>{t("submit.successMin")}</strong> {t("submit.successWait")}</p>
            <Link
              to={`/my-submission/${lastSubmissionId}?round_id=${encodeURIComponent(roundIdRequired)}`}
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

        <FieldRow label={t("submit.projectTitle")} hint="project_title *">
          <input value={form.project_title} onChange={set("project_title")} placeholder={t("submit.projectTitlePlaceholder")} className="field-input" />
        </FieldRow>

        <FieldRow label={t("submit.githubUrl")} hint="github_url *">
          <input value={form.github_url} onChange={set("github_url")} placeholder="https://github.com/your-org/your-repo" className="field-input" />
        </FieldRow>

        {tracksLoading ? (
          <p className="text-xs text-muted-foreground my-3">{t("submit.tracksLoading")}</p>
        ) : roundTracks.length > 0 ? (
          <FieldRow label={t("submit.trackLabel")} hint="track *">
            <select
              value={selectedTrackId}
              onChange={(e) => setSelectedTrackId(e.target.value)}
              className="field-input bg-background cursor-pointer"
            >
              <option value="">{t("submit.trackPlaceholder")}</option>
              {roundTracks.map((tr) => (
                <option key={tr.id} value={tr.id}>
                  {(tr.name ?? "").trim() || tr.id}
                  {(tr.name ?? "").trim() && tr.name !== tr.id ? ` (${tr.id})` : ""}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground mt-1">{t("submit.trackHint")}</p>
          </FieldRow>
        ) : null}

        <SectionLabel index={2} text={t("submit.section2")} />

        <FieldRow label={t("submit.oneLiner")} hint="one_liner · ≤200 · optional">
          <input value={form.one_liner} onChange={set("one_liner")} maxLength={200} placeholder={t("submit.oneLinerPlaceholder")} className="field-input" />
          <div className="text-right text-[10px] text-muted-foreground mt-0.5">{form.one_liner.length}/200</div>
        </FieldRow>

        <FieldRow label={t("submit.problem")} hint="problem · optional">
          <textarea value={form.problem} onChange={set("problem")} rows={3} placeholder={t("submit.problemPlaceholder")} className="field-input resize-y" />
        </FieldRow>

        <FieldRow label={t("submit.solution")} hint="solution · optional">
          <textarea value={form.solution} onChange={set("solution")} rows={3} placeholder={t("submit.solutionPlaceholder")} className="field-input resize-y" />
        </FieldRow>

        <FieldRow label={t("submit.demoUrl")} hint="demo_url · optional">
          <input value={form.demo_url} onChange={set("demo_url")} placeholder="https://your-demo.app" className="field-input" />
        </FieldRow>

        <FieldRow label={t("submit.docsText")} hint="docs_text · optional">
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

        {/* Advanced Settings */}
        <div className="mt-6 mb-4">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-muted-foreground hover:text-primary transition-colors border border-border px-3 py-1.5 flex items-center gap-1.5"
          >
            <span className={`transition-transform inline-block ${showAdvanced ? "rotate-90" : ""}`}>▶</span>
            {t("submit.advanced")}
          </button>

          {showAdvanced && (
            <div className="mt-4 p-4 border border-border bg-muted/30 space-y-5">
              {/* Output Language */}
              <div>
                <label className="block text-xs font-semibold text-foreground/80 mb-2">
                  {t("judge.outputLang")}
                </label>
                <div className="flex gap-3">
                  {(["en", "zh"] as const).map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => setOutputLang(l)}
                      className={`px-3 py-1.5 text-xs border transition-colors ${
                        outputLang === l
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {l === "en" ? t("judge.langEn") : t("judge.langZh")}
                    </button>
                  ))}
                </div>
              </div>

              {/* Competitor Search Toggle */}
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <label className="text-xs font-semibold text-foreground/80">
                    {t("judge.competitorSearch")}
                  </label>
                  <Switch checked={enableWebSearch} onCheckedChange={setEnableWebSearch} />
                  <span className="text-[10px] text-muted-foreground">
                    {enableWebSearch ? t("judge.on") : t("judge.off")}
                  </span>
                </div>

                {enableWebSearch && (
                  <div className="pl-1 space-y-2">
                    <label className="block text-xs text-muted-foreground">
                      {t("judge.competitorKeywords")}
                    </label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {keywords.map((kw) => (
                        <Badge key={kw} variant="secondary" className="text-[10px] gap-1">
                          {kw}
                          <button onClick={() => removeKeyword(kw)} className="hover:text-destructive ml-0.5">✕</button>
                        </Badge>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        value={keywordInput}
                        onChange={(e) => setKeywordInput(e.target.value)}
                        onKeyDown={handleKeywordKeyDown}
                        placeholder={t("judge.keywordsPlaceholder")}
                        className="field-input flex-1 text-xs"
                      />
                      <button
                        type="button"
                        onClick={addCommonKeywords}
                        className="text-[10px] border border-border px-2 py-1 text-muted-foreground hover:text-primary hover:border-primary transition-colors whitespace-nowrap"
                      >
                        {t("judge.addCommonKeywords")}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Model Selection */}
              <div>
                <label className="block text-xs font-semibold text-foreground/80 mb-2">
                  {t("modelSelector.label")}
                </label>
                <div className="flex gap-4 flex-wrap">
                  {MODELS.map((m) => (
                    <label key={m.id} className="flex items-center gap-2 cursor-pointer text-foreground/80 text-xs hover:text-foreground transition-colors">
                      <input
                        type="checkbox"
                        checked={selectedModels.includes(m.id)}
                        onChange={() => toggleModel(m.id)}
                        className="accent-primary w-3.5 h-3.5"
                      />
                      {m.label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Custom Prompt */}
              <div>
                <label className="block text-xs font-semibold text-foreground/80 mb-2">
                  {t("submit.customPrompt")}
                </label>
                <textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  rows={3}
                  className="field-input resize-y text-xs"
                  placeholder={DEFAULT_SUBMIT_PROMPT}
                />
              </div>
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
