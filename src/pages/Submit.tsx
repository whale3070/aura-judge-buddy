import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

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
  const [form, setForm] = useState<SubmissionForm>(EMPTY_FORM);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
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
      toast.warning("部分文件格式不支持，已过滤。仅支持 .md .txt .html .pdf");
    }
    setFiles((prev) => [...prev, ...newFiles]);
    e.target.value = "";
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const validate = (): string | null => {
    if (!form.project_title.trim()) return "请填写项目名称";
    if (!form.one_liner.trim()) return "请填写项目简介";
    if (form.one_liner.length > 200) return "项目简介不能超过200字";
    if (!form.problem.trim()) return "请填写要解决的问题";
    if (!form.solution.trim()) return "请填写解决方案";
    if (form.github_url && !/^https?:\/\/.+/.test(form.github_url))
      return "GitHub 链接格式不正确";
    if (form.demo_url && !/^https?:\/\/.+/.test(form.demo_url))
      return "Demo 链接格式不正确";
    return null;
  };

  const handleSubmit = async () => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setSubmitting(true);

    // Build FormData for multipart upload
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => {
      if (v) fd.append(k, v);
    });
    files.forEach((f) => fd.append("files", f));

    try {
      // POST to backend /api/submit
      const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID || "ffkmvdvpewsgenaxeouu";
      const res = await fetch(`https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/api-proxy/api/submit`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) throw new Error("提交失败");
      toast.success("🎉 项目提交成功！");
      setForm(EMPTY_FORM);
      setFiles([]);
    } catch {
      toast.error("提交失败，请检查网络或稍后重试");
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-background p-5 relative overflow-hidden">
      {/* Scanline */}
      <div className="pointer-events-none fixed inset-0 z-50">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.03] via-transparent to-primary/[0.03] animate-scanline" />
      </div>

      <div className="max-w-[800px] mx-auto border border-primary/40 p-8 shadow-[0_0_30px_hsl(var(--primary)/0.1)] bg-card relative">
        {/* Nav */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
          <Link
            to="/submit"
            className="text-xs text-muted-foreground hover:text-primary transition-colors border border-border px-3 py-1.5"
          >
            ← 首页 (HOME)
          </Link>
          <div className="flex gap-2">
            <Link to="/ranking" className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-primary transition-colors">
              项目排名
            </Link>
            <Link to="/judge" className="text-xs border border-primary/40 px-3 py-1.5 text-primary hover:bg-primary/10 transition-colors">
              裁决系统
            </Link>
          </div>
        </div>

        <h1 className="text-center text-3xl font-display font-bold text-primary drop-shadow-[0_0_10px_hsl(var(--primary)/0.5)] animate-flicker mb-1">
          📋 PROJECT SUBMISSION
        </h1>
        <p className="text-center text-xs text-muted-foreground mb-8 pb-2.5 border-b border-border">
          黑客松项目提交入口 // 支持文档上传 + GitHub 链接
        </p>

        {/* Required Fields */}
        <SectionLabel index={1} text="基本信息 (Required Fields)" />

        <FieldRow label="项目名称 *" hint="project_title">
          <input
            value={form.project_title}
            onChange={set("project_title")}
            placeholder="例：Aura Judging System"
            className="field-input"
          />
        </FieldRow>

        <FieldRow label="一句话简介 *" hint="one_liner · ≤200字">
          <input
            value={form.one_liner}
            onChange={set("one_liner")}
            maxLength={200}
            placeholder="用一句话描述你的项目"
            className="field-input"
          />
          <div className="text-right text-[10px] text-muted-foreground mt-0.5">
            {form.one_liner.length}/200
          </div>
        </FieldRow>

        <FieldRow label="解决的问题 *" hint="problem">
          <textarea
            value={form.problem}
            onChange={set("problem")}
            rows={3}
            placeholder="你的项目解决了什么问题？"
            className="field-input resize-y"
          />
        </FieldRow>

        <FieldRow label="解决方案 *" hint="solution">
          <textarea
            value={form.solution}
            onChange={set("solution")}
            rows={3}
            placeholder="你的解决方案是什么？"
            className="field-input resize-y"
          />
        </FieldRow>

        {/* Optional Fields */}
        <SectionLabel index={2} text="链接与生态 (Optional)" />

        <FieldRow label="Avalanche 生态适配理由" hint="why_this_chain · 建议填写">
          <textarea
            value={form.why_this_chain}
            onChange={set("why_this_chain")}
            rows={2}
            placeholder="为什么选择 Avalanche？你的项目如何与该生态结合？"
            className="field-input resize-y"
          />
        </FieldRow>

        <FieldRow label="GitHub 仓库链接" hint="github_url">
          <input
            value={form.github_url}
            onChange={set("github_url")}
            placeholder="https://github.com/your-org/your-repo"
            className="field-input"
          />
        </FieldRow>

        <FieldRow label="Demo / 演示链接" hint="demo_url">
          <input
            value={form.demo_url}
            onChange={set("demo_url")}
            placeholder="https://your-demo.app"
            className="field-input"
          />
        </FieldRow>

        <FieldRow label="补充文本" hint="docs_text · 可粘贴文档内容">
          <textarea
            value={form.docs_text}
            onChange={set("docs_text")}
            rows={4}
            placeholder="可在此粘贴项目文档、白皮书等文本内容..."
            className="field-input resize-y"
          />
        </FieldRow>

        {/* File Upload */}
        <SectionLabel index={3} text="文件上传 (File Upload)" />

        <div className="mb-4">
          <p className="text-xs text-muted-foreground mb-3">
            支持格式：<code className="bg-muted px-1 border border-border text-foreground/80">.md</code>{" "}
            <code className="bg-muted px-1 border border-border text-foreground/80">.txt</code>{" "}
            <code className="bg-muted px-1 border border-border text-foreground/80">.html</code>{" "}
            <code className="bg-muted px-1 border border-border text-foreground/80">.pdf</code>
            　（PDF 仅做存储，不保证全解析）
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.txt,.html,.pdf"
            multiple
            onChange={handleFileAdd}
            className="hidden"
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full border-2 border-dashed border-primary/30 hover:border-primary/60 py-6 text-sm text-muted-foreground hover:text-primary transition-all cursor-pointer"
          >
            + 点击选择文件 / Click to upload
          </button>

          {files.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {files.map((f, i) => (
                <div
                  key={`${f.name}-${i}`}
                  className="flex items-center justify-between bg-muted border border-border px-3 py-2 text-xs"
                >
                  <span className="text-foreground/80 truncate mr-3">
                    {f.name}{" "}
                    <span className="text-muted-foreground">
                      ({(f.size / 1024).toFixed(1)} KB)
                    </span>
                  </span>
                  <button
                    onClick={() => removeFile(i)}
                    className="text-destructive hover:text-destructive/80 shrink-0"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full bg-primary text-primary-foreground font-bold py-4 text-sm tracking-wider hover:shadow-[0_0_20px_hsl(var(--primary)/0.6)] hover:-translate-y-px transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-4"
        >
          {submitting ? "▶ 提交中..." : "提交项目 (SUBMIT PROJECT)"}
        </button>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function SectionLabel({ index, text }: { index: number; text: string }) {
  return (
    <label className="block mb-3 mt-6 font-bold text-foreground/90 text-sm border-l-[3px] border-primary pl-2.5">
      {index}. {text}
    </label>
  );
}

function FieldRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
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
