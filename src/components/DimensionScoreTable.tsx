import { useI18n } from "@/lib/i18n";
import { parseDimensionScores, collectDimensionKeys } from "@/lib/parseDimensionScores";
import type { AuditReport } from "@/lib/api";

const VARIANCE_THRESHOLD = 15; // 同一维度下模型间分差超过此值高亮「需复核」

interface DimensionScoreTableProps {
  reports: AuditReport[];
  className?: string;
}

export default function DimensionScoreTable({ reports, className = "" }: DimensionScoreTableProps) {
  const { t } = useI18n();

  const perModel: Record<string, Record<string, number>> = {};
  for (const r of reports) {
    if (r.error) continue;
    const scores = parseDimensionScores(r.content ?? "");
    if (Object.keys(scores).length > 0) {
      perModel[r.model_name] = scores;
    }
  }

  const dimensions = collectDimensionKeys(perModel);
  const models = Object.keys(perModel);

  if (dimensions.length === 0 || models.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-2">{t("my.noDimensionData")}</p>
    );
  }

  return (
    <div className={className}>
      <h3 className="text-sm font-bold text-foreground mb-2">{t("my.dimensionTableTitle")}</h3>
      <div className="overflow-x-auto border border-border rounded">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="text-left p-2 font-semibold text-foreground">{t("my.dimensionCol")}</th>
              {models.map((m) => (
                <th key={m} className="text-left p-2 font-semibold text-foreground capitalize">
                  {m}
                </th>
              ))}
              <th className="text-left p-2 font-semibold text-muted-foreground">{t("my.varianceCol")}</th>
            </tr>
          </thead>
          <tbody>
            {dimensions.map((dim) => {
              const values = models.map((m) => perModel[m][dim] ?? null);
              const nums = values.filter((v): v is number => v !== null && v !== undefined);
              const min = nums.length ? Math.min(...nums) : 0;
              const max = nums.length ? Math.max(...nums) : 0;
              const spread = max - min;
              const needReview = spread > VARIANCE_THRESHOLD;
              return (
                <tr
                  key={dim}
                  className={`border-b border-border/60 ${needReview ? "bg-destructive/5" : ""}`}
                >
                  <td className="p-2 text-foreground/90">{dim}</td>
                  {models.map((m) => (
                    <td key={m} className="p-2">
                      {perModel[m][dim] != null ? (
                        <span className="font-medium">{perModel[m][dim]}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  ))}
                  <td className="p-2">
                    {nums.length >= 2 ? (
                      <span className={needReview ? "text-destructive font-medium" : "text-muted-foreground"}>
                        {spread}
                        {needReview && (
                          <span className="ml-1 text-destructive font-semibold" title={t("my.needReview")}>
                            ({t("my.needReview")})
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
