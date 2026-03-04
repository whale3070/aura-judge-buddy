import { useI18n } from "@/lib/i18n";

export interface RankingItem {
  file_name: string;
  avg_score: number;
  timestamp: string;
  rule_version_id?: string;
  rule_sha256?: string;
  competitor_results_count?: number;
}

interface Props {
  rankings: RankingItem[];
  loading: boolean;
  selectedFile?: string;
  onSelect?: (fileName: string) => void;
  titleMap?: Record<string, string>;
}

export default function RankingTable({ rankings, loading, selectedFile, onSelect, titleMap }: Props) {
  const { t } = useI18n();

  const mergedRankings = (() => {
    if (!titleMap || Object.keys(titleMap).length === 0) return rankings;
    const projectMap = new Map<string, RankingItem>();
    for (const item of rankings) {
      const title = titleMap[item.file_name] || item.file_name;
      const existing = projectMap.get(title);
      if (!existing || item.avg_score > existing.avg_score) {
        projectMap.set(title, item);
      }
    }
    return Array.from(projectMap.values()).sort((a, b) => b.avg_score - a.avg_score);
  })();

  const scoreClass = (score: number) => {
    if (score >= 80) return "text-primary font-bold drop-shadow-[0_0_5px_hsl(var(--primary)/0.8)]";
    if (score < 60) return "text-destructive font-bold";
    return "text-warning font-bold";
  };

  return (
    <div className="border-2 border-secondary p-5 mb-6 relative bg-secondary/[0.03]">
      <div className="absolute -top-2.5 right-2.5 bg-secondary text-secondary-foreground text-[10px] px-1.5 py-0.5 font-bold tracking-wider">
        GOLD_VAULT_PROTOCOL
      </div>
      <h3 className="text-secondary text-center text-lg tracking-[4px] font-display font-bold drop-shadow-[0_0_5px_hsl(var(--secondary)/0.6)] mt-0 mb-4">
        {t("ranking.tableTitle")}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-secondary/50">
              <th className="p-3 text-left text-foreground/80 w-20">{t("ranking.rank")}</th>
              <th className="p-3 text-left text-foreground/80">{t("ranking.projectDoc")}</th>
              <th className="p-3 text-left text-foreground/80 w-36">{t("ranking.survivalRate")}</th>
              <th className="p-3 text-left text-foreground/80 w-32">{t("ranking.ruleVersion")}</th>
              <th className="p-3 text-left text-foreground/80 w-24">{t("ranking.competitorSearch")}</th>
              <th className="p-3 text-left text-foreground/80 w-48">{t("ranking.timestamp")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="p-3 text-center text-muted-foreground">{t("ranking.loading")}</td></tr>
            ) : rankings.length === 0 ? (
              <tr><td colSpan={6} className="p-3 text-center text-muted-foreground">{t("ranking.empty")}</td></tr>
            ) : (
              mergedRankings.map((item, i) => (
                <tr
                  key={item.file_name}
                  onClick={() => onSelect?.(item.file_name)}
                  className={`border-b border-secondary/10 transition-colors cursor-pointer ${
                    selectedFile === item.file_name
                      ? "bg-secondary/[0.12] border-l-2 border-l-secondary"
                      : "hover:bg-secondary/[0.05]"
                  }`}
                >
                  <td className="p-3 text-muted-foreground">{i + 1}</td>
                  <td className="p-3 text-foreground/90">
                    {titleMap?.[item.file_name] ? (
                      <div>
                        <div className="font-bold">{titleMap[item.file_name]}</div>
                        <div className="text-xs text-muted-foreground font-mono mt-0.5">{item.file_name}</div>
                      </div>
                    ) : (
                      <span className="font-mono text-xs">{item.file_name}</span>
                    )}
                  </td>
                  <td className={`p-3 ${scoreClass(item.avg_score)}`}>{item.avg_score.toFixed(1)}%</td>
                  <td className="p-3">
                    {item.rule_version_id ? (
                      <div>
                        <div className="text-xs font-mono text-foreground/80">{item.rule_version_id}</div>
                        {item.rule_sha256 && (
                          <div className="text-[10px] font-mono text-muted-foreground/60 truncate max-w-[120px]" title={item.rule_sha256}>
                            {item.rule_sha256.substring(0, 12)}...
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3 text-muted-foreground text-xs">{new Date(item.timestamp).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
