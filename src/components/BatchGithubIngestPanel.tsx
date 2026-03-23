import { useState } from "react";
import { postBatchIngestGithubURLs, type BatchIngestGithubResponse } from "@/lib/apiClient";
import { useI18n } from "@/lib/i18n";

export default function BatchGithubIngestPanel({
  roundId,
  adminWallet,
  onQueued,
}: {
  roundId?: string;
  adminWallet: string;
  onQueued?: () => void;
}) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [autoAudit, setAutoAudit] = useState(true);
  const [skipDup, setSkipDup] = useState(true);
  const [concurrency, setConcurrency] = useState(2);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<BatchIngestGithubResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setErr(null);
    setLast(null);
    if (!roundId?.trim()) {
      setErr(t("admin.batchIngestNeedRound"));
      return;
    }
    const urls = text
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (urls.length === 0) {
      setErr(t("admin.batchIngestNeedUrls"));
      return;
    }
    setBusy(true);
    try {
      const res = await postBatchIngestGithubURLs(
        {
          round_id: roundId.trim(),
          urls,
          skip_duplicates: skipDup,
          auto_audit: autoAudit,
          concurrency,
        },
        adminWallet
      );
      setLast(res);
      onQueued?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-6 p-4 border border-accent/30 bg-accent/[0.04] rounded-lg space-y-3">
      <h3 className="text-sm font-bold text-accent tracking-wide">{t("admin.batchIngestTitle")}</h3>
      <p className="text-[11px] text-muted-foreground leading-relaxed">{t("admin.batchIngestDesc")}</p>
      {!roundId ? (
        <p className="text-xs text-destructive">{t("admin.batchIngestNeedRound")}</p>
      ) : null}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        disabled={busy}
        placeholder={t("admin.batchIngestPlaceholder")}
        className="w-full bg-background border border-border text-foreground p-3 font-mono text-xs outline-none focus:border-accent resize-y"
      />
      <div className="flex flex-wrap gap-4 items-center text-xs">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={autoAudit} onChange={(e) => setAutoAudit(e.target.checked)} disabled={busy} />
          {t("admin.batchIngestAutoAudit")}
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={skipDup} onChange={(e) => setSkipDup(e.target.checked)} disabled={busy} />
          {t("admin.batchIngestSkipDup")}
        </label>
        <label className="flex items-center gap-2">
          <span className="text-muted-foreground">{t("admin.batchIngestConcurrency")}</span>
          <select
            value={concurrency}
            onChange={(e) => setConcurrency(Number(e.target.value))}
            disabled={busy}
            className="bg-background border border-border px-2 py-1"
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={run}
          disabled={busy || !roundId}
          className="bg-accent text-accent-foreground font-bold px-4 py-2 hover:opacity-90 disabled:opacity-40"
        >
          {busy ? t("admin.batchIngestRunning") : t("admin.batchIngestSubmit")}
        </button>
      </div>
      {err ? <p className="text-xs text-destructive">{err}</p> : null}
      {last ? (
        <div className="text-[11px] font-mono text-muted-foreground border border-border p-2 bg-muted/20 overflow-x-auto">
          <div>
            queued_jobs={last.queued_jobs} auto_audit_llm={String(last.auto_audit_llm)} concurrency={last.clone_concurrency}
          </div>
          {last.skipped_duplicates?.length ? (
            <div className="mt-1 text-amber-600/90">
              skipped_duplicates ({last.skipped_duplicates.length}): {last.skipped_duplicates.slice(0, 5).join(", ")}
              {last.skipped_duplicates.length > 5 ? "…" : ""}
            </div>
          ) : null}
          {last.invalid_urls?.length ? (
            <div className="mt-1 text-destructive">
              invalid_urls: {last.invalid_urls.join(", ")}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
