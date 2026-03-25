import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { AuditReport } from "@/lib/apiClient";
import { useI18n } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import AuditIndeterminateProgress from "@/components/AuditIndeterminateProgress";
import { formatPrimaryScoreLabel, scoreNorm100 } from "@/lib/scoreNorm";

interface Props {
  fileName: string;
  avgScore: number | null;
  /** 与 SavedResult.rubric_raw_max 一致；有则 avgScore 为原始分总和 */
  rubricRawMax?: number;
  statusText: string;
  reports: AuditReport[];
  error?: string;
  defaultOpen?: boolean;
  ruleVersionId?: string;
  ruleSha256?: string;
  enableWebSearch?: boolean;
  outputLang?: "en" | "zh";
  searchQuery?: string;
  competitorResultsCount?: number;
  projectKeywords?: string[];
}

function scorePillClass(normPct: number | null) {
  if (normPct === null) return "bg-muted-foreground/60 text-primary-foreground border-muted-foreground/20";
  if (normPct >= 80) return "bg-primary text-primary-foreground border-primary/40 shadow-[0_0_10px_hsl(var(--primary)/0.4)]";
  if (normPct < 60) return "bg-destructive text-destructive-foreground border-destructive/40 shadow-[0_0_10px_hsl(var(--destructive)/0.3)]";
  return "bg-warning text-warning-foreground border-warning/40 shadow-[0_0_10px_hsl(var(--warning)/0.3)]";
}

export default function ReportCard({ fileName, avgScore, rubricRawMax, statusText, reports, error, defaultOpen = false, ruleVersionId, ruleSha256, enableWebSearch, outputLang, searchQuery, competitorResultsCount, projectKeywords }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(defaultOpen);
  const [showSearchQuery, setShowSearchQuery] = useState(false);
  const [copiedQuery, setCopiedQuery] = useState(false);

  const copyQuery = () => {
    if (searchQuery) {
      navigator.clipboard.writeText(searchQuery);
      setCopiedQuery(true);
      setTimeout(() => setCopiedQuery(false), 2000);
    }
  };

  return (
    <div className="border border-border bg-card mb-3 shadow-[0_0_18px_hsl(var(--primary)/0.06)] transition-all">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3 bg-muted/50 hover:bg-muted transition-colors cursor-pointer select-none text-left"
      >
        <div className="flex gap-2.5 items-baseline min-w-0 flex-wrap">
          <span className="text-foreground/90 font-bold truncate max-w-[500px]" title={fileName}>
            {fileName}
          </span>
          <span className="text-muted-foreground text-xs whitespace-nowrap">
            {statusText} · {new Date().toLocaleString()}
          </span>
          {ruleVersionId && (
            <span className="text-[10px] font-mono text-muted-foreground/60 whitespace-nowrap" title={ruleSha256 || ""}>
              rule: {ruleVersionId}
            </span>
          )}
          {outputLang !== undefined && (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5">
              {t("judge.badgeLang")}: {outputLang.toUpperCase()}
            </Badge>
          )}
          {enableWebSearch !== undefined && (
            <Badge variant={enableWebSearch ? "default" : "secondary"} className="text-[10px] py-0 px-1.5">
              {t("judge.badgeSearch")}: {enableWebSearch ? t("judge.on") : t("judge.off")}
              {enableWebSearch && competitorResultsCount != null && ` (${competitorResultsCount})`}
            </Badge>
          )}
        </div>
        <div className={`px-2.5 py-0.5 text-sm font-bold border whitespace-nowrap ${scorePillClass(avgScore === null ? null : scoreNorm100(avgScore, rubricRawMax))}`}>
          {avgScore === null ? "N/A" : formatPrimaryScoreLabel(avgScore, rubricRawMax)}
        </div>
      </button>

      {open && (
        <div className="p-3.5 bg-card border-t border-border">
          {/* Competitor Search Details */}
          {enableWebSearch !== undefined && (
            <div className="mb-3 border border-border bg-muted/20 p-3">
              <h4 className="text-xs font-bold text-foreground/90 mb-2">{t("judge.competitorSearchDetails")}</h4>
              {enableWebSearch && competitorResultsCount != null ? (
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <div>
                    <span className="font-semibold text-foreground/80">{t("judge.resultsCount")}:</span>{" "}
                    <span className="text-primary font-bold">{competitorResultsCount}</span>
                  </div>
                  <div className="flex items-start gap-1.5">
                    <span className="font-semibold text-foreground/80 shrink-0">{t("judge.queryLabel")}:</span>
                    {searchQuery ? (
                      <code className="font-mono text-[11px] bg-muted border border-border px-1.5 py-0.5 break-all">{searchQuery}</code>
                    ) : (
                      <span className="italic text-muted-foreground/60">{t("judge.queryNotRecorded")}</span>
                    )}
                  </div>
                  {searchQuery && (
                    <button
                      onClick={copyQuery}
                      className="text-[11px] border border-primary/40 px-2 py-0.5 text-primary hover:bg-primary/10 transition-colors"
                    >
                      {copiedQuery ? t("judge.copied") : t("judge.copyQuery")}
                    </button>
                  )}
                  {projectKeywords && projectKeywords.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      <span className="font-semibold text-foreground/80">{t("judge.keywordsUsed")}:</span>
                      {projectKeywords.map((kw, i) => (
                        <Badge key={i} variant="outline" className="text-[10px] py-0 px-1.5">{kw}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{t("judge.competitorSearchOff")}</p>
              )}
            </div>
          )}
          {error ? (
            <div className="text-destructive font-bold">ERROR: {error}</div>
          ) : reports.length === 0 && statusText === "RUNNING" ? (
            <AuditIndeterminateProgress title={t("judge.singleProgressTitle")} hint={t("report.auditInProgress")} />
          ) : reports.length === 0 ? (
            <div className="text-muted-foreground">{t("report.waiting")}</div>
          ) : (
            reports.map((report, i) => (
              <div key={i} className="mt-2.5 first:mt-0">
                <div className="flex justify-between items-center p-2.5 bg-muted/80 border-l-[6px] border-l-primary font-bold text-foreground/90">
                  <span>▌ {t("report.judgeNode")} {report.model_name.toUpperCase()}</span>
                  {report.score != null && (
                    <span className="bg-primary text-primary-foreground px-2.5 py-0.5 text-sm shadow-[0_0_8px_hsl(var(--primary)/0.55)]">
                      {report.score}
                    </span>
                  )}
                </div>
                <div className="p-3.5 bg-background border border-border border-t-0 overflow-x-auto text-sm text-foreground/80 leading-relaxed max-w-none whitespace-pre-wrap break-words prose prose-sm prose-invert prose-headings:text-foreground prose-strong:text-foreground prose-li:text-foreground/80">
                  {report.error ? (
                    <span className="text-destructive">ERROR: {report.error}</span>
                  ) : (
                    <ReactMarkdown>{report.content}</ReactMarkdown>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
