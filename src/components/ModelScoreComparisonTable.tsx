import { useI18n } from "@/lib/i18n";

export interface ModelReport {
  model_name: string;
  score?: number;
  error?: string;
}

interface Props {
  reports: ModelReport[];
}

export default function ModelScoreComparisonTable({ reports }: Props) {
  const { t } = useI18n();

  if (!reports?.length) return null;

  const successfulScores = reports
    .map((r) => (r.error == null && r.score != null ? r.score : null))
    .filter((s): s is number => s != null);
  const needReview =
    successfulScores.length >= 2 &&
    Math.max(...successfulScores) - Math.min(...successfulScores) > 25;

  return (
    <div className="mb-4">
      <h3 className="text-sm font-bold text-foreground mb-2">
        {t("my.modelCompareTitle")}
      </h3>
      <div className="overflow-x-auto border border-border rounded">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="p-2 text-left text-muted-foreground w-24">
                {t("my.dimension")}
              </th>
              {reports.map((r) => (
                <th
                  key={r.model_name}
                  className="p-2 text-left text-muted-foreground font-medium"
                >
                  {r.model_name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border/50">
              <td className="p-2 text-foreground/90">{t("my.compare.totalScore")}</td>
              {reports.map((r) => (
                <td key={r.model_name} className="p-2">
                  {r.error != null ? (
                    <span className="text-destructive text-xs" title={r.error}>
                      {r.error.length > 40 ? `${r.error.slice(0, 40)}…` : r.error}
                    </span>
                  ) : r.score != null ? (
                    <span
                      className={
                        r.score >= 80
                          ? "text-primary font-medium"
                          : r.score < 60
                            ? "text-destructive font-medium"
                            : "text-warning font-medium"
                      }
                    >
                      {r.score}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {needReview && (
        <p className="mt-2 text-xs text-warning font-medium">
          ⚠ {t("my.modelCompareNeedReview")}
        </p>
      )}
    </div>
  );
}
