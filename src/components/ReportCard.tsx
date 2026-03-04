import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { AuditReport } from "@/lib/apiClient";
import { useI18n } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";

interface Props {
  fileName: string;
  avgScore: number | null;
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
}

function scorePillClass(avg: number | null) {
  if (avg === null) return "bg-muted-foreground/60 text-primary-foreground border-muted-foreground/20";
  if (avg >= 80) return "bg-primary text-primary-foreground border-primary/40 shadow-[0_0_10px_hsl(var(--primary)/0.4)]";
  if (avg < 60) return "bg-destructive text-destructive-foreground border-destructive/40 shadow-[0_0_10px_hsl(var(--destructive)/0.3)]";
  return "bg-warning text-warning-foreground border-warning/40 shadow-[0_0_10px_hsl(var(--warning)/0.3)]";
}

export default function ReportCard({ fileName, avgScore, statusText, reports, error, defaultOpen = false, ruleVersionId, ruleSha256, enableWebSearch, outputLang, searchQuery, competitorResultsCount }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(defaultOpen);
  const [showSearchQuery, setShowSearchQuery] = useState(false);

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
        <div className={`px-2.5 py-0.5 text-sm font-bold border whitespace-nowrap ${scorePillClass(avgScore)}`}>
          {avgScore === null ? "N/A" : avgScore}
        </div>
      </button>
          {error ? (
      {open && (
        <div className="p-3.5 bg-card border-t border-border">
          {searchQuery && (
            <div className="mb-3">
              <button
                onClick={() => setShowSearchQuery(!showSearchQuery)}
                className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
              >
                {showSearchQuery ? "▼" : "▶"} {t("judge.searchQuery")}
              </button>
              {showSearchQuery && (
                <div className="mt-1 text-xs font-mono text-muted-foreground/80 bg-muted/30 border border-border p-2">
                  {searchQuery}
                </div>
              )}
            </div>
          )}
            <div className="text-destructive font-bold">ERROR: {error}</div>
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