import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { AuditReport } from "@/lib/api";

interface Props {
  fileName: string;
  avgScore: number | null;
  statusText: string;
  reports: AuditReport[];
  error?: string;
  defaultOpen?: boolean;
}

function scorePillClass(avg: number | null) {
  if (avg === null) return "bg-muted-foreground/60 text-primary-foreground border-muted-foreground/20";
  if (avg >= 80) return "bg-primary text-primary-foreground border-primary/40 shadow-[0_0_10px_hsl(var(--primary)/0.4)]";
  if (avg < 60) return "bg-destructive text-destructive-foreground border-destructive/40 shadow-[0_0_10px_hsl(var(--destructive)/0.3)]";
  return "bg-warning text-warning-foreground border-warning/40 shadow-[0_0_10px_hsl(var(--warning)/0.3)]";
}

export default function ReportCard({ fileName, avgScore, statusText, reports, error, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border border-border bg-card mb-3 shadow-[0_0_18px_hsl(var(--primary)/0.06)] transition-all">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-3 bg-muted/50 hover:bg-muted transition-colors cursor-pointer select-none text-left"
      >
        <div className="flex gap-2.5 items-baseline min-w-0">
          <span className="text-foreground/90 font-bold truncate max-w-[500px]" title={fileName}>
            {fileName}
          </span>
          <span className="text-muted-foreground text-xs whitespace-nowrap">
            {statusText} · {new Date().toLocaleString()}
          </span>
        </div>
        <div className={`px-2.5 py-0.5 text-sm font-bold border whitespace-nowrap ${scorePillClass(avgScore)}`}>
          {avgScore === null ? "N/A" : avgScore}
        </div>
      </button>

      {open && (
        <div className="p-3.5 bg-card border-t border-border">
          {error ? (
            <div className="text-destructive font-bold">ERROR: {error}</div>
          ) : reports.length === 0 ? (
            <div className="text-muted-foreground">等待数据...</div>
          ) : (
            reports.map((report, i) => (
              <div key={i} className="mt-2.5 first:mt-0">
                <div className="flex justify-between items-center p-2.5 bg-muted/80 border-l-[6px] border-l-primary font-bold text-foreground/90">
                  <span>▌ 判官节点: {report.model_name.toUpperCase()}</span>
                  {report.score != null && (
                    <span className="bg-primary text-primary-foreground px-2.5 py-0.5 text-sm shadow-[0_0_8px_hsl(var(--primary)/0.55)]">
                      {report.score}
                    </span>
                  )}
                </div>
                <div className="p-3.5 bg-background border border-border border-t-0 overflow-x-auto text-sm text-foreground/80 leading-relaxed prose prose-sm prose-invert max-w-none prose-headings:text-foreground prose-strong:text-foreground prose-li:text-foreground/80">
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
