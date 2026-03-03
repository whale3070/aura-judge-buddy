import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchSubmissionById, fetchRankings, fetchJudgeResult, fetchFileTitles, type SubmissionItem, type RankingItem, type JudgeResult } from "@/lib/api";
import JudgeDetail from "@/components/JudgeDetail";
import { useI18n, LanguageToggle } from "@/lib/i18n";

export default function MySubmission() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const [submission, setSubmission] = useState<SubmissionItem | null>(null);
  const [rankings, setRankings] = useState<RankingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [scores, setScores] = useState<Record<string, JudgeResult>>({});
  const [scoresLoading, setScoresLoading] = useState(false);
  const [titleMap, setTitleMap] = useState<Record<string, string>>({});
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([fetchSubmissionById(id), fetchRankings(), fetchFileTitles()])
      .then(([sub, rank, titles]) => {
        setSubmission(sub ?? null);
        setRankings(rank ?? []);
        setTitleMap(titles);
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!submission?.md_files?.length) return;
    setScoresLoading(true);
    const promises = submission.md_files.map((file) =>
      fetchJudgeResult(file).then((r) => ({ file, r })).catch(() => ({ file, r: null }))
    );
    Promise.all(promises).then((results) => {
      const next: Record<string, JudgeResult> = {};
      results.forEach(({ file, r }) => { if (r) next[file] = r; });
      setScores(next);
    }).finally(() => setScoresLoading(false));
  }, [submission?.id, submission?.md_files?.length]);

  const myFileSet = new Set(submission?.md_files ?? []);

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
          <Link to="/submit" className="text-primary hover:underline">{t("my.backToSubmit")}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-5 relative overflow-hidden">
      <div className="max-w-[900px] mx-auto border border-primary/40 p-8 shadow-[0_0_30px_hsl(var(--primary)/0.1)] bg-card relative">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
          <Link to="/submit" className="text-xs text-muted-foreground hover:text-primary transition-colors border border-border px-3 py-1.5">
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
          <p className="text-xs text-muted-foreground">{submission.one_liner}</p>
          {submission.github_url && (
            <a href={submission.github_url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline mt-2 inline-block">
              {submission.github_url}
            </a>
          )}
        </div>

        <section className="mb-8">
          <h2 className="text-lg font-bold text-foreground border-l-4 border-primary pl-3 mb-3">
            {t("my.aiScores")}
          </h2>
          {scoresLoading ? (
            <p className="text-sm text-muted-foreground">{t("my.loadingScores")}</p>
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
                      <div className="mt-3 pt-3 border-t border-border">
                        {result.reports?.map((r, i) => (
                          <div key={i} className="mb-2">
                            <span className="text-xs font-semibold text-muted-foreground">{r.model_name}</span>
                            <p className="text-xs text-foreground/80 whitespace-pre-wrap mt-1">{r.content}</p>
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

        <section>
          <h2 className="text-lg font-bold text-foreground border-l-4 border-primary pl-3 mb-3">
            {t("my.systemRanking")}
          </h2>
          <p className="text-xs text-muted-foreground mb-3">{t("my.rankingNote")}</p>
          <div className="overflow-x-auto border border-border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-muted/50 border-b border-border">
                  <th className="p-3 text-left text-muted-foreground w-16">{t("my.rankCol")}</th>
                  <th className="p-3 text-left text-muted-foreground">{t("my.docCol")}</th>
                  <th className="p-3 text-left text-muted-foreground w-28">{t("my.scoreCol")}</th>
                  <th className="p-3 text-left text-muted-foreground w-40">{t("my.timeCol")}</th>
                </tr>
              </thead>
              <tbody>
                {rankings.length === 0 ? (
                  <tr><td colSpan={4} className="p-3 text-center text-muted-foreground">{t("my.noRanking")}</td></tr>
                ) : (
                  rankings.map((item, i) => {
                    const isMine = myFileSet.has(item.file_name);
                    const scoreClass = item.avg_score >= 80 ? "text-primary font-bold" : item.avg_score < 60 ? "text-destructive font-bold" : "text-warning font-bold";
                    return (
                      <tr
                        key={item.file_name}
                        onClick={() => isMine && setSelectedFile(selectedFile === item.file_name ? null : item.file_name)}
                        className={`border-b border-border/50 ${
                          isMine ? "cursor-pointer hover:bg-primary/[0.08]" : "cursor-default opacity-80"
                        } ${selectedFile === item.file_name ? "bg-primary/[0.12] border-l-2 border-l-primary" : ""}`}
                      >
                        <td className="p-3 text-muted-foreground">{i + 1}</td>
                        <td className="p-3 text-foreground/90 font-mono text-xs">
                          {titleMap[item.file_name] ? (
                            <div>
                              <div className="font-bold font-sans text-sm">{titleMap[item.file_name]}</div>
                              <div className="text-muted-foreground mt-0.5">{item.file_name}</div>
                            </div>
                          ) : (
                            item.file_name
                          )}
                          {isMine && <span className="ml-2 text-primary text-[10px]">{t("my.mine")}</span>}
                        </td>
                        <td className={`p-3 ${scoreClass}`}>{item.avg_score.toFixed(1)}</td>
                        <td className="p-3 text-muted-foreground text-xs">{new Date(item.timestamp).toLocaleString()}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {selectedFile && myFileSet.has(selectedFile) && (
          <div className="mt-6">
            <JudgeDetail fileName={selectedFile} onClose={() => setSelectedFile(null)} />
          </div>
        )}
      </div>
    </div>
  );
}
