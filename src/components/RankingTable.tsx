import type { RankingItem } from "@/lib/api";

interface Props {
  rankings: RankingItem[];
  loading: boolean;
}

export default function RankingTable({ rankings, loading }: Props) {
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
        🏆 终焉大盘：逻辑生存率排行榜
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-secondary/50">
              <th className="p-3 text-left text-foreground/80 w-20">RANK</th>
              <th className="p-3 text-left text-foreground/80">项目文档</th>
              <th className="p-3 text-left text-foreground/80 w-36">逻辑生存率</th>
              <th className="p-3 text-left text-foreground/80 w-48">存证时间</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="p-3 text-center text-muted-foreground">正在同步金库协议历史存证...</td></tr>
            ) : rankings.length === 0 ? (
              <tr><td colSpan={4} className="p-3 text-center text-muted-foreground">VOID_DATA</td></tr>
            ) : (
              rankings.map((item, i) => (
                <tr key={item.file_name} className="border-b border-secondary/10 hover:bg-secondary/[0.05] transition-colors">
                  <td className="p-3 text-muted-foreground">{i + 1}</td>
                  <td className="p-3 text-foreground/90">{item.file_name}</td>
                  <td className={`p-3 ${scoreClass(item.avg_score)}`}>{item.avg_score.toFixed(1)}%</td>
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
