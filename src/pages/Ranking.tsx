import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { fetchRankings, fetchFileTitles, type RankingItem } from "@/lib/api";
import RankingTable from "@/components/RankingTable";

export default function Ranking() {
  const [rankings, setRankings] = useState<RankingItem[]>([]);
  const [titleMap, setTitleMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchRankings(), fetchFileTitles()])
      .then(([r, t]) => { setRankings(r); setTitleMap(t); })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-background p-5 relative overflow-hidden">
      <div className="max-w-[1100px] mx-auto border border-primary/40 p-8 shadow-[0_0_30px_hsl(var(--primary)/0.1)] bg-card relative">
        <div className="flex justify-center gap-3 mb-6">
          <Link to="/submit" className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-primary transition-colors">
            ← 首页 / 项目提交
          </Link>
          <Link to="/judge" className="text-xs border border-primary/40 px-3 py-1.5 text-primary hover:bg-primary/10 transition-colors">
            裁决系统
          </Link>
        </div>
        <h1 className="text-center text-2xl font-display font-bold text-primary drop-shadow-[0_0_10px_hsl(var(--primary)/0.5)] mb-2">
          📊 项目排名
        </h1>
        <p className="text-center text-xs text-muted-foreground mb-4">
          仅可查看排名列表；查看自己项目的 AI 评分与详情请使用提交成功后收到的「我的项目」链接。
        </p>
        <RankingTable rankings={rankings} loading={loading} titleMap={titleMap} />
      </div>
    </div>
  );
}
