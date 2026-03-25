import { useState, useEffect } from "react";
import { postBatchIngestGithubURLs, fetchRoundTracksAPI, type BatchIngestGithubResponse, type RoundTrackEntry } from "@/lib/apiClient";
import { useI18n } from "@/lib/i18n";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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
  const [roundTracks, setRoundTracks] = useState<RoundTrackEntry[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState("");

  useEffect(() => {
    const rid = roundId?.trim();
    if (!rid) {
      setRoundTracks([]);
      setSelectedTrackId("");
      return;
    }
    let cancelled = false;
    fetchRoundTracksAPI(rid)
      .then((rows) => {
        if (!cancelled) {
          setRoundTracks(rows);
          setSelectedTrackId((prev) => (prev && rows.some((x) => x.id === prev) ? prev : ""));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setRoundTracks([]);
          setSelectedTrackId("");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [roundId]);

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
    if (roundTracks.length > 0 && !selectedTrackId.trim()) {
      setErr(t("admin.batchIngestTrackRequired"));
      return;
    }
    setBusy(true);
    try {
      const res = await postBatchIngestGithubURLs(
        {
          round_id: roundId.trim(),
          urls,
          ...(selectedTrackId.trim() ? { track: selectedTrackId.trim() } : {}),
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
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 lg:items-start">
        <div className="flex-1 min-w-0 space-y-3">
          <p className="text-[11px] text-muted-foreground leading-relaxed">{t("admin.batchIngestDesc")}</p>
          {!roundId ? <p className="text-xs text-destructive">{t("admin.batchIngestNeedRound")}</p> : null}
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
                <div className="mt-1 text-destructive">invalid_urls: {last.invalid_urls.join(", ")}</div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="lg:w-[min(100%,320px)] shrink-0 rounded-lg border border-border bg-background/80 p-3 lg:sticky lg:top-4">
          <Tabs defaultValue="track" className="w-full">
            <TabsList className="grid w-full grid-cols-2 h-auto gap-1">
              <TabsTrigger value="track" className="text-xs py-2">
                {t("admin.batchIngestTabTrack")}
              </TabsTrigger>
              <TabsTrigger value="help" className="text-xs py-2">
                {t("admin.batchIngestHelpTab")}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="track" className="mt-3 space-y-2 outline-none">
              <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                {t("admin.batchIngestTrackLabel")}
              </label>
              {roundTracks.length === 0 ? (
                <p className="text-[11px] text-muted-foreground leading-relaxed">{t("admin.trackNoConfigHint")}</p>
              ) : (
                <>
                  <select
                    value={selectedTrackId}
                    onChange={(e) => setSelectedTrackId(e.target.value)}
                    disabled={busy}
                    className="w-full bg-background border border-border text-foreground text-xs px-2 py-2.5 outline-none focus:border-accent"
                  >
                    <option value="">{t("admin.batchIngestTrackPlaceholder")}</option>
                    {roundTracks.map((tr) => (
                      <option key={tr.id} value={tr.id}>
                        {(tr.name ?? "").trim() || tr.id}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">{t("admin.batchIngestTrackHint")}</p>
                </>
              )}
            </TabsContent>
            <TabsContent value="help" className="mt-3 outline-none">
              <p className="text-[11px] text-muted-foreground leading-relaxed">{t("admin.batchIngestHelpBody")}</p>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
