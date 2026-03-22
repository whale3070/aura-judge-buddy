import type { AuditReport } from "@/lib/api";
import {
  parseDimensionScores,
  getAllDimensionNames,
} from "@/lib/parseDimensionScores";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const REVIEW_SPREAD_THRESHOLD = 20;

export interface ModelScoreCompareTableProps {
  reports: AuditReport[];
  className?: string;
}

/** 从各 report 解析维度分数，跳过 AI_SCORE 与标签过长行（parseDimensionScores 已限制 2-50 字符） */
function getDimensionScoresByReport(
  reports: AuditReport[]
): Record<string, Record<string, number>> {
  const byReport: Record<string, Record<string, number>> = {};
  for (const r of reports) {
    if (r.error) continue;
    byReport[r.model_name] = parseDimensionScores(r.content ?? "");
  }
  return byReport;
}

export default function ModelScoreCompareTable({
  reports,
  className,
}: ModelScoreCompareTableProps) {
  if (!reports?.length) return null;

  const dimensionNames = getAllDimensionNames(reports);
  const dimensionScoresByModel = getDimensionScoresByReport(reports);
  const validReports = reports.filter((r) => !r.error);

  const rowKeys = ["总分", ...dimensionNames];

  const getReviewCell = (rowKey: string) => {
    if (rowKey === "总分") {
      const scores = validReports
        .map((r) => r.score)
        .filter((s): s is number => s != null);
      const spread =
        scores.length >= 2
          ? Math.max(...scores) - Math.min(...scores)
          : 0;
      return spread > REVIEW_SPREAD_THRESHOLD ? (
        <Badge variant="destructive" className="text-[10px]">
          需复核
        </Badge>
      ) : (
        "—"
      );
    }
    const dimName = rowKey;
    const scores = validReports.map(
      (r) => dimensionScoresByModel[r.model_name]?.[dimName] ?? null
    );
    const validScores = scores.filter((s): s is number => s != null);
    const spread =
      validScores.length >= 2
        ? Math.max(...validScores) - Math.min(...validScores)
        : 0;
    return spread > REVIEW_SPREAD_THRESHOLD ? (
      <Badge variant="destructive" className="text-[10px]">
        需复核
      </Badge>
    ) : (
      "—"
    );
  };

  return (
    <div className={cn("overflow-x-auto border border-border rounded", className)}>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="text-muted-foreground text-xs min-w-[6rem]">
              维度
            </TableHead>
            {validReports.map((r, i) => (
              <TableHead
                key={i}
                className="text-muted-foreground text-xs w-20 capitalize"
              >
                {r.model_name}
              </TableHead>
            ))}
            <TableHead className="text-muted-foreground text-xs w-20">
              复核
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rowKeys.map((rowKey) => (
            <TableRow key={rowKey} className="border-b border-border/50">
              <TableCell className="text-foreground/90 text-xs font-medium">
                {rowKey}
              </TableCell>
              {validReports.map((r, i) => {
                if (rowKey === "总分") {
                  const score = r.score;
                  return (
                    <TableCell key={i} className="text-xs">
                      {score != null ? score : "—"}
                    </TableCell>
                  );
                }
                const val =
                  dimensionScoresByModel[r.model_name]?.[rowKey] ?? null;
                return (
                  <TableCell key={i} className="text-xs">
                    {val != null ? val : "—"}
                  </TableCell>
                );
              })}
              <TableCell className="text-xs">
                {getReviewCell(rowKey)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
