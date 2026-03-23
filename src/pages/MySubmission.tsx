import { useState, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { fetchSubmissionById, fetchJudgeResult, type SubmissionItem, type JudgeResult } from "@/lib/api";
import { roundNavSuffix } from "@/lib/apiClient";
import JudgeDetail from "@/components/JudgeDetail";
import PromptTransparency from "@/components/PromptTransparency";
import DimensionScoreTable from "@/components/DimensionScoreTable";
import { useI18n, LanguageToggle } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export default function MySubmission() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const roundQ = searchParams.get("round_id");
  const submitNavSuffix = roundNavSuffix(roundQ);
  const [submission, setSubmission] = useState<SubmissionItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [scores, setScores] = useState<Record<string, JudgeResult>>({});
  const [scoresLoading, setScoresLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const loadData = useCallback(() => {
    if (!id) return;
    setLoading(true);
    fetchSubmissionById(id, roundQ)
      .then((sub) => {
        setSubmission(sub ?? null);
      })
      .finally(() => setLoading(false));
  }, [id, roundQ]);

  useEffect(() => { loadData(); }, [loadData]);

  const loadScores = useCallback(() => {
    if (!submission?.md_files?.length) return;
    setScoresLoading(true);
    const promises = submission.md_files.map((file) =>
      fetchJudgeResult(file, roundQ).then((r) => ({ file, r })).catch(() => ({ file, r: null }))
    );
    Promise.all(promises).then((results) => {
      const next: Record<string, JudgeResult> = {};
      results.forEach(({ file, r }) => { if (r) next[file] = r; });
      setScores(next);
    }).finally(() => setScoresLoading(false));
  }, [submission?.id, submission?.md_files?.length, roundQ]);

  useEffect(() => { loadScores(); }, [loadScores]);

  const myFileSet = new Set(submission?.md_files ?? []);
  const hasAnyScore = Object.keys(scores).length > 0;
  const isPending = submission && submission.md_files?.length > 0 && !hasAnyScore && !scoresLoading;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">
        {t("my.loading")}
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="min-h-screen bg-background p-5 flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">{t("my.notFound")}</p>
          <Link to={`/submit${submitNavSuffix}`} className="text-primary hover:underline">{t("my.backToSubmit")}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-5 relative overflow-hidden">
      <div className="max-w-[900px] mx-auto border border-primary/40 p-8 shadow-[0_0_30px_hsl(var(--primary)/0.1)] bg-card relative">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
          <Link to={`/submit${submitNavSuffix}`} className="text-xs text-muted-foreground hover:text-primary transition-colors border border-border px-3 py-1.5">
            {t("nav.submit")}
          </Link>
          <LanguageToggle />
        </div>

        <h1 className="text-2xl font-display font-bold text-primary drop-shadow-[0_0_10px_hsl(var(--primary)/0.5)] mb-1">
          {t("my.title")}
        </h1>
        <p className="text-xs text-muted-foreground mb-6">{t("my.note")}</p>

        <div className="mb-6 p-4 bg-muted/30 border border-border rounded">
          <h2 className="text-sm font-bold text-foreground mb-2">{submission.project_title}</h2>
          {submission.one_liner?.trim() ? (
            <p className="text-xs text-muted-foreground">{submission.one_liner}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            {submission.github_url && (
              <a href={submission.github_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                {submission.github_username ? `@${submission.github_username}` : submission.github_url}
              </a>
            )}
            {(submission.github_account_years ?? 0) > 0 && (
              <span className="text-muted-foreground">
                {t("my.githubAccountYearsShort", { n: submission.github_account_years })}
              </span>
            )}
          </div>
        </div>

        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold text-foreground border-l-4 border-primary pl-3">
              {t("my.aiScores")}
            </h2>
            <button
              type="button"
              onClick={() => { loadData(); loadScores(); }}
              className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-primary hover:border-primary transition-colors"
            >
              🔄 {t("my.refresh")}
            </button>
          </div>

          {scoresLoading ? (
            <p className="text-sm text-muted-foreground">{t("my.loadingScores")}</p>
          ) : isPending ? (
            <div className="p-6 border border-border bg-muted/20 rounded text-center">
              <p className="text-sm text-muted-foreground mb-2">⏳ {t("my.pending")}</p>
              <p className="text-xs text-muted-foreground">{t("my.pendingNote")}</p>
            </div>
          ) : submission.md_files?.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("my.noFiles")}</p>
          ) : (
            <ul className="space-y-3">
              {(submission.md_files ?? []).map((file) => {
                const result = scores[file];
                return (
                  <li key={file} className="border border-border p-3 rounded">
                    <div className="flex justify-between items-center flex-wrap gap-2">
                      <span className="font-mono text-xs text-foreground/90">{file}</span>
                      {result ? (
                        <span className={`font-bold ${result.avg_score >= 80 ? "text-primary" : result.avg_score < 60 ? "text-destructive" : "text-warning"}`}>
                          {t("my.avgScore")} {result.avg_score.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">{t("my.noScore")}</span>
                      )}
                    </div>

                    {/* Metadata badges */}
                    {result && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {(result as any).rule_version_id && (
                          <Badge variant="outline" className="text-[10px]">
                            {t("my.ruleVersion")}: {((result as any).rule_version_id as string).slice(0, 8)}
                          </Badge>
                        )}
                        {(result as any).rule_sha256 && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className="text-[10px] cursor-help">
                                SHA256
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="font-mono text-[10px] break-all">{(result as any).rule_sha256}</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                        {(result as any).competitor_results_count != null ? (
                          <Badge variant="secondary" className="text-[10px]">
                            {t("judge.competitorSearch")}: {t("judge.on")} ({(result as any).competitor_results_count})
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">
                            {t("judge.competitorSearch")}: {t("judge.off")}
                          </Badge>
                        )}
                        {(result as any).search_query && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge variant="outline" className="text-[10px] cursor-help">
                                🔍 {t("judge.searchQuery")}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-sm">
                              <p className="text-xs">{(result as any).search_query}</p>
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    )}

                    {result && (
                      <button
                        type="button"
                        onClick={() => setSelectedFile(selectedFile === file ? null : file)}
                        className="mt-2 text-xs text-primary hover:underline"
                      >
                        {selectedFile === file ? t("my.hideDetail") : t("my.showDetail")}
                      </button>
                    )}
                    {selectedFile === file && result && (
                      <div className="mt-3 pt-3 border-t border-border space-y-4">
                        <DimensionScoreTable reports={result.reports ?? []} className="mb-4" />
                        {result.reports?.map((r, i) => (
                          <div key={i} className="mb-3">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xs font-semibold text-muted-foreground">{r.model_name}</span>
                              {r.score != null && (
                                <Badge variant="outline" className="text-[10px]">
                                  {r.score}
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs bg-muted/30 p-3 border border-border rounded text-foreground/80 leading-relaxed max-w-none prose prose-sm prose-invert prose-headings:text-foreground prose-strong:text-foreground prose-li:text-foreground/80 break-words overflow-x-auto">
                              {r.error ? (
                                <span className="text-destructive">ERROR: {r.error}</span>
                              ) : (
                                <ReactMarkdown>{r.content ?? ""}</ReactMarkdown>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        {/* Prompt Transparency Section */}
        <PromptTransparency
          result={(() => {
            const firstResult = Object.values(scores)[0];
            if (!firstResult) return null;
            return {
              rule_version_id: (firstResult as any).rule_version_id,
              rule_sha256: (firstResult as any).rule_sha256,
              search_query: (firstResult as any).search_query,
              competitor_results_count: (firstResult as any).competitor_results_count,
              reports: firstResult.reports,
            };
          })()}
        />

        <section className="border border-border p-5 bg-muted/10">
          <h2 className="text-lg font-bold text-foreground border-l-4 border-primary pl-3 mb-3">
            {t("my.systemRanking")}
          </h2>
          <p className="text-xs text-muted-foreground mb-4 leading-relaxed">{t("my.rankingNote")}</p>
          <Link
            to={`/ranking${submitNavSuffix}`}
            className="inline-flex items-center gap-2 text-sm font-bold bg-primary text-primary-foreground px-5 py-3 hover:shadow-[0_0_20px_hsl(var(--primary)/0.5)] transition-all"
          >
            {t("ranking.title")}
          </Link>
        </section>

        {selectedFile && myFileSet.has(selectedFile) && (
          <div className="mt-6">
            <JudgeDetail fileName={selectedFile} roundId={roundQ} onClose={() => setSelectedFile(null)} />
          </div>
        )}
      </div>
    </div>
  );
}
