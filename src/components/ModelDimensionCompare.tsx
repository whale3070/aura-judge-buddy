import { useI18n } from "@/lib/i18n";
import {
  parseDimensionScores,
  getAllDimensionNames,
  REVIEW_GAP_THRESHOLD,
} from "@/lib/parseDimensionScores";
import type { AuditReport } from "@/lib/api";

type JudgeResultLike = {
  file_name: string;
  avg_score: number;
  reports: AuditReport[];
};

function getSuccessfulScores(reports: AuditReport[]): number[] {
  return reports
    .filter((r) => r.error == null && r.score != null)
    .map((r) => r.score!);
}

function needsReview(score: number, allScores: number[]): boolean {
  if (allScores.length <= 1) return false;
  const min = Math.min(...allScores);
  const max = Math.max(...allScores);
  return max - min > REVIEW_GAP_THRESHOLD;
}

export default function ModelDimensionCompare({
  result,
  onViewDetail,
}: {
  result: JudgeResultLike;
  onViewDetail?: () => void;
}) {
  const { t } = useI18n();
  const reports = result.reports ?? [];
  const successfulScores = getSuccessfulScores(reports);
  const dimensionNames = getAllDimensionNames(reports);

  return (
    <div className="border border-border rounded overflow-hidden bg-muted/10">
      <div className="p-3 border-b border-border flex items-center justify-between flex-wrap gap-2">
        <span className="font-mono text-xs text-foreground/90">{result.file_name}</span>
        {onViewDetail && (
          <button
            type="button"
            onClick={onViewDetail}
            className="text-xs text-primary hover:underline"
          >
            {t("my.compare.viewDetail")}
          </button>
        )}
      </div>

      {/* 模型对比表：模型 | 总分 | 复核建议 */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="p-2 text-left text-muted-foreground text-xs">{t("my.compare.model")}</th>
              <th className="p-2 text-left text-muted-foreground text-xs w-20">{t("my.compare.totalScore")}</th>
              <th className="p-2 text-left text-muted-foreground text-xs w-24">{t("my.compare.review")}</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r, i) => {
              const score = r.score ?? 0;
              const hasError = !!r.error;
              const needReview = !hasError && needsReview(score, successfulScores);
              return (
                <tr key={i} className="border-b border-border/50">
                  <td className="p-2 font-medium text-foreground/90 capitalize">{r.model_name}</td>
                  <td className="p-2">
                    {hasError ? (
                      <span className="text-destructive text-xs">{t("my.compare.error")}</span>
                    ) : (
                      <span className={score >= 80 ? "text-primary font-bold" : score < 60 ? "text-destructive font-bold" : "text-warning font-bold"}>
                        {score}
                      </span>
                    )}
                  </td>
                  <td className="p-2">
                    {needReview && (
                      <span className="text-destructive text-xs font-medium">{t("my.compare.needReview")}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 维度对比表：仅当解析到维度时展示 */}
      {dimensionNames.length > 0 && (
        <div className="border-t border-border">
          <div className="p-2 bg-muted/30 text-xs font-medium text-muted-foreground">
            {t("my.compare.byDimension")}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border">
                  <th className="p-2 text-left text-muted-foreground text-xs min-w-[8rem]">{t("my.compare.dimension")}</th>
                  {reports.filter((r) => !r.error).map((r, i) => (
                    <th key={i} className="p-2 text-left text-muted-foreground text-xs w-20 capitalize">
                      {r.model_name}
                    </th>
                  ))}
                  <th className="p-2 text-left text-muted-foreground text-xs w-20">{t("my.compare.review")}</th>
                </tr>
              </thead>
              <tbody>
                {dimensionNames.map((dimName) => {
                  const scoresByModel = reports
                    .filter((r) => !r.error)
                    .map((r) => parseDimensionScores(r.content ?? "")[dimName] ?? null);
                  const validScores = scoresByModel.filter((s): s is number => s != null);
                  const gap = validScores.length >= 2
                    ? Math.max(...validScores) - Math.min(...validScores)
                    : 0;
                  const rowNeedsReview = gap > REVIEW_GAP_THRESHOLD;
                  return (
                    <tr key={dimName} className="border-b border-border/50">
                      <td className="p-2 text-foreground/90 text-xs">{dimName}</td>
                      {reports.filter((r) => !r.error).map((r, i) => {
                        const dimScores = parseDimensionScores(r.content ?? "");
                        const val = dimScores[dimName];
                        return (
                          <td key={i} className="p-2 text-xs">
                            {val != null ? val : "—"}
                          </td>
                        );
                      })}
                      <td className="p-2">
                        {rowNeedsReview && (
                          <span className="text-destructive text-xs font-medium">{t("my.compare.needReview")}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="p-2 text-[10px] text-muted-foreground border-t border-border">
        {t("my.compare.reviewHint")}
      </p>
    </div>
  );
}
