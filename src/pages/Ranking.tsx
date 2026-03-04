import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { fetchRankingsAPI, fetchFileTitlesAPI, type SavedResult } from "@/lib/apiClient";
import RankingTable from "@/components/RankingTable";
import { useI18n, LanguageToggle } from "@/lib/i18n";

export default function Ranking() {
  const { t } = useI18n();
  const [rankings, setRankings] = useState<SavedResult[]>([]);
  const [titleMap, setTitleMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchRankingsAPI(), fetchFileTitlesAPI()])
      .then(([r, t]) => { setRankings(r); setTitleMap(t); })
      .finally(() => setLoading(false));
  }, []);

  const rankingItems = rankings.map(r => ({
    file_name: r.file_name,
    avg_score: r.avg_score,
    timestamp: r.timestamp,
    rule_version_id: r.rule_version_id,
    rule_sha256: r.rule_sha256,
  }));

  return (
    <div className="min-h-screen bg-background p-5 relative overflow-hidden">
      <div className="max-w-[1100px] mx-auto border border-primary/40 p-8 shadow-[0_0_30px_hsl(var(--primary)/0.1)] bg-card relative">
        <div className="flex justify-center gap-3 mb-6">
          <Link to="/submit" className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-primary transition-colors">
            {t("nav.submit")}
          </Link>
          <Link to="/judge" className="text-xs border border-primary/40 px-3 py-1.5 text-primary hover:bg-primary/10 transition-colors">
            {t("nav.judge")}
          </Link>
          <LanguageToggle />
        </div>
        <h1 className="text-center text-2xl font-display font-bold text-primary drop-shadow-[0_0_10px_hsl(var(--primary)/0.5)] mb-2">
          {t("ranking.title")}
        </h1>
        <p className="text-center text-xs text-muted-foreground mb-4">
          {t("ranking.note")}
        </p>
        <RankingTable rankings={rankingItems} loading={loading} titleMap={titleMap} />
      </div>
    </div>
  );
}
