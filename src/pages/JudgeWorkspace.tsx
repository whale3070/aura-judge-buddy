import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useI18n } from "@/lib/i18n";
import {
  fetchJudgeWorkspaceAPI,
  putJudgeHumanReviewAPI,
  type JudgeWorkspaceSubmission,
} from "@/lib/apiClient";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ExternalLink, Loader2, User, Save } from "lucide-react";

type Draft = { comment: string; scoreText: string };

function draftsFromSubs(subs: JudgeWorkspaceSubmission[]): Record<string, Draft> {
  const o: Record<string, Draft> = {};
  for (const s of subs) {
    o[s.id] = {
      comment: s.human_comment ?? "",
      scoreText:
        s.human_score !== undefined && s.human_score !== null ? String(s.human_score) : "",
    };
  }
  return o;
}

function parseScorePayload(scoreText: string): { ok: true; score: number | null } | { ok: false; error: string } {
  const t = scoreText.trim();
  if (t === "") return { ok: true, score: null };
  const n = Number(t);
  if (!Number.isFinite(n)) return { ok: false, error: "invalid" };
  if (n < 0 || n > 100) return { ok: false, error: "range" };
  return { ok: true, score: n };
}

export default function JudgeWorkspace() {
  const { t } = useI18n();
  const { id: roundId, judgeId } = useParams<{ id: string; judgeId: string }>();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [judgeName, setJudgeName] = useState("");
  const [subs, setSubs] = useState<JudgeWorkspaceSubmission[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!roundId || !judgeId) return Promise.resolve();
    setLoading(true);
    setErr(null);
    return fetchJudgeWorkspaceAPI(roundId, judgeId)
      .then((data) => {
        setJudgeName(data.judge?.name ?? "");
        const list = data.submissions ?? [];
        setSubs(list);
        setDrafts(draftsFromSubs(list));
      })
      .catch((e: Error) => {
        setErr(e.message || "Error");
      })
      .finally(() => setLoading(false));
  }, [roundId, judgeId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const setDraft = (subId: string, patch: Partial<Draft>) => {
    setDrafts((prev) => ({
      ...prev,
      [subId]: { ...prev[subId], ...patch },
    }));
  };

  const saveOne = async (subId: string) => {
    if (!roundId || !judgeId) return;
    const d = drafts[subId];
    if (!d) return;
    const parsed = parseScorePayload(d.scoreText);
    if (!parsed.ok) {
      toast.error(parsed.error === "range" ? t("judges.scoreRangeError") : t("judges.scoreInvalid"));
      return;
    }
    setSavingId(subId);
    try {
      const res = await putJudgeHumanReviewAPI(roundId, judgeId, subId, {
        comment: d.comment,
        score: parsed.score,
      });
      setSubs((prev) =>
        prev.map((s) => {
          if (s.id !== subId) return s;
          const score =
            res.human_score === null || res.human_score === undefined ? undefined : res.human_score;
          return {
            ...s,
            human_comment: res.human_comment ?? "",
            human_score: score,
            human_updated_at: res.human_updated_at,
          };
        })
      );
      setDrafts((prev) => ({
        ...prev,
        [subId]: {
          comment: res.human_comment ?? "",
          scoreText:
            res.human_score !== null && res.human_score !== undefined ? String(res.human_score) : "",
        },
      }));
      toast.success(t("judges.reviewSaved"));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : t("judges.saveError"));
    } finally {
      setSavingId(null);
    }
  };

  if (!roundId || !judgeId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground text-sm">
        Invalid link.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-5">
      <div className="max-w-[900px] mx-auto border border-primary/40 p-8 bg-card shadow-[0_0_30px_hsl(var(--primary)/0.1)]">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div className="flex items-start gap-3">
            <Link
              to={`/rounds/${encodeURIComponent(roundId)}`}
              className="text-muted-foreground hover:text-primary transition-colors mt-1"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-lg font-display font-bold text-primary font-mono">{t("judges.workspaceTitle")}</h1>
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                <User className="w-3.5 h-3.5" />
                <span className="font-mono">{judgeId}</span>
                {judgeName ? <span>· {judgeName}</span> : null}
              </p>
              <p className="text-xs text-muted-foreground mt-2 font-mono">
                {t("judges.roundLabel")}: {roundId}
              </p>
            </div>
          </div>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground text-sm py-12 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" />
            …
          </div>
        )}

        {err && !loading && (
          <div className="border border-destructive/40 text-destructive text-sm p-6 text-center">{err}</div>
        )}

        {!loading && !err && (
          <>
            <p className="text-xs text-muted-foreground mb-4">
              {t("judges.workspaceCount", { count: String(subs.length) })}
            </p>
            <p className="text-xs text-muted-foreground mb-6 leading-relaxed">{t("judges.humanReviewHint")}</p>

            {subs.length === 0 ? (
              <div className="border border-dashed border-border p-12 text-center text-muted-foreground text-sm">
                {t("judges.workspaceEmpty")}
              </div>
            ) : (
              <ul className="space-y-6">
                {subs.map((s) => {
                  const draft = drafts[s.id] ?? { comment: "", scoreText: "" };
                  const busy = savingId === s.id;
                  return (
                    <li key={s.id} className="border border-border p-4 bg-muted/5 space-y-3">
                      <div className="flex flex-wrap gap-3 justify-between items-start">
                        <div className="min-w-0 flex-1">
                          <div className="text-[11px] font-mono text-muted-foreground">#{s.id}</div>
                          <div className="text-sm font-semibold">{s.project_title || "—"}</div>
                          {s.one_liner ? (
                            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{s.one_liner}</p>
                          ) : null}
                          <div className="flex flex-wrap gap-3 mt-2">
                            {s.github_url ? (
                              <a
                                href={s.github_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                              >
                                <ExternalLink className="w-3 h-3" /> GitHub
                              </a>
                            ) : null}
                            <Link
                              to={`/my-submission/${encodeURIComponent(s.id)}?round_id=${encodeURIComponent(roundId)}`}
                              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                            >
                              <ExternalLink className="w-3 h-3" /> {t("judges.submissionPage")}
                            </Link>
                          </div>
                        </div>
                        {s.human_updated_at ? (
                          <div className="text-[10px] text-muted-foreground whitespace-nowrap">
                            {t("judges.lastSaved")} {s.human_updated_at}
                          </div>
                        ) : null}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-[1fr_120px] sm:items-end">
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-bold text-muted-foreground tracking-wide">
                            {t("judges.humanComment")}
                          </label>
                          <Textarea
                            value={draft.comment}
                            onChange={(e) => setDraft(s.id, { comment: e.target.value })}
                            placeholder={t("judges.commentPlaceholder")}
                            className="min-h-[100px] text-sm"
                            disabled={busy}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-[11px] font-bold text-muted-foreground tracking-wide">
                            {t("judges.humanScore")}
                          </label>
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={draft.scoreText}
                            onChange={(e) => setDraft(s.id, { scoreText: e.target.value })}
                            placeholder="0–100"
                            className="font-mono text-sm"
                            disabled={busy}
                          />
                          <p className="text-[10px] text-muted-foreground">{t("judges.scoreHint")}</p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 justify-end">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={busy}
                          onClick={() =>
                            setDrafts((prev) => ({
                              ...prev,
                              [s.id]: draftsFromSubs([s])[s.id],
                            }))
                          }
                        >
                          {t("judges.resetDraft")}
                        </Button>
                        <Button type="button" size="sm" disabled={busy} onClick={() => void saveOne(s.id)}>
                          {busy ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Save className="w-3.5 h-3.5" />
                          )}
                          <span className="ml-1.5">{busy ? t("judges.saving") : t("judges.saveReview")}</span>
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
