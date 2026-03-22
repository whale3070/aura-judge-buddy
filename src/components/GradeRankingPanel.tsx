import { useMemo, useState } from "react";
import type { RankingItem } from "@/lib/api";
import JudgeDetail from "@/components/JudgeDetail";
import STierDuelPanel from "@/components/STierDuelPanel";
import { letterTierFromReports, type LetterTier } from "@/lib/dimensionTier";

interface TierConfig {
  tier: LetterTier;
  label: string;
  desc: string;
  color: string;
  bgClass: string;
  borderClass: string;
  glowClass: string;
}

const TIER_ORDER: LetterTier[] = ["S", "A", "B", "C", "D", "?"];

const TIER_META: Record<LetterTier, Omit<TierConfig, "tier">> = {
  S: {
    label: "S",
    desc: "五维均 ≥18（满分 20）",
    color: "text-primary",
    bgClass: "bg-primary/10",
    borderClass: "border-primary/40",
    glowClass: "shadow-[0_0_15px_hsl(var(--primary)/0.3)]",
  },
  A: {
    label: "A",
    desc: "至少三维 ≥15",
    color: "text-secondary",
    bgClass: "bg-secondary/10",
    borderClass: "border-secondary/40",
    glowClass: "shadow-[0_0_15px_hsl(var(--secondary)/0.3)]",
  },
  B: {
    label: "B",
    desc: "至少二维 ≥12",
    color: "text-warning",
    bgClass: "bg-[hsl(var(--warning)/0.1)]",
    borderClass: "border-[hsl(var(--warning)/0.4)]",
    glowClass: "shadow-[0_0_15px_hsl(var(--warning)/0.2)]",
  },
  C: {
    label: "C",
    desc: "至少一维 ≥12",
    color: "text-orange-400",
    bgClass: "bg-orange-500/10",
    borderClass: "border-orange-500/30",
    glowClass: "shadow-[0_0_12px_rgba(251,146,60,0.15)]",
  },
  D: {
    label: "D",
    desc: "无一维 ≥12",
    color: "text-destructive",
    bgClass: "bg-destructive/10",
    borderClass: "border-destructive/40",
    glowClass: "shadow-[0_0_15px_hsl(var(--destructive)/0.2)]",
  },
  "?": {
    label: "?",
    desc: "缺少完整五维（满分20）解析，请检查评审输出格式",
    color: "text-muted-foreground",
    bgClass: "bg-muted/30",
    borderClass: "border-border",
    glowClass: "",
  },
};

interface MergedProject {
  key: string;
  item: RankingItem;
  title: string;
  tier: LetterTier;
}

interface Props {
  rankings: RankingItem[];
  loading: boolean;
  titleMap: Record<string, string>;
  /** 管理员钱包地址，用于调用 /api/duel */
  adminWallet?: string | null;
}

export default function GradeRankingPanel({ rankings, loading, titleMap, adminWallet }: Props) {
  const [expandedTier, setExpandedTier] = useState<LetterTier | null>("S");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const mergedProjects = useMemo(() => {
    const projectMap = new Map<string, MergedProject>();
    for (const item of rankings) {
      const title = titleMap[item.file_name] || item.file_name;
      const tier = letterTierFromReports(item.reports);
      const existing = projectMap.get(title);
      if (!existing || item.avg_score > existing.item.avg_score) {
        projectMap.set(title, { key: title, item, title, tier });
      }
    }
    return Array.from(projectMap.values());
  }, [rankings, titleMap]);

  const tierGroups = useMemo(() => {
    const groups: Record<LetterTier, MergedProject[]> = {
      S: [],
      A: [],
      B: [],
      C: [],
      D: [],
      "?": [],
    };
    for (const p of mergedProjects) {
      groups[p.tier].push(p);
    }
    for (const t of TIER_ORDER) {
      groups[t].sort((a, b) => b.item.avg_score - a.item.avg_score);
    }
    return groups;
  }, [mergedProjects]);

  const sTierOptions = useMemo(
    () =>
      tierGroups.S.map((p) => ({
        file_name: p.item.file_name,
        title: p.title,
      })),
    [tierGroups.S]
  );

  const toggleTier = (g: LetterTier) => {
    setExpandedTier(expandedTier === g ? null : g);
    setSelectedFile(null);
  };

  if (loading) {
    return <div className="text-muted-foreground text-sm py-8 text-center">正在加载排名数据...</div>;
  }

  const duelEnabled = !!adminWallet;

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap mb-2">
        {TIER_ORDER.map((tier) => {
          const meta = TIER_META[tier];
          return (
            <div
              key={tier}
              className={`flex items-center gap-2 px-3 py-1.5 border ${meta.borderClass} ${meta.bgClass} text-xs`}
            >
              <span className={`font-bold text-sm ${meta.color}`}>{meta.label}</span>
              <span className="text-muted-foreground">{tierGroups[tier].length} 项目</span>
            </div>
          );
        })}
        <div className="flex items-center px-3 py-1.5 text-xs text-muted-foreground border border-border">
          共 {mergedProjects.length} 项目
        </div>
      </div>

      <STierDuelPanel projects={sTierOptions} adminWallet={adminWallet ?? ""} enabled={duelEnabled} />

      {TIER_ORDER.map((tier) => {
        const projects = tierGroups[tier];
        const meta = TIER_META[tier];
        const isOpen = expandedTier === tier;

        return (
          <div key={tier} className={`border ${meta.borderClass} transition-all ${isOpen ? meta.glowClass : ""}`}>
            <button
              type="button"
              onClick={() => toggleTier(tier)}
              className={`w-full flex items-center justify-between p-4 transition-colors hover:bg-muted/30 ${
                isOpen ? meta.bgClass : ""
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={`text-2xl font-display font-bold ${meta.color}`}>{meta.label}</span>
                <div className="text-left">
                  <div className="text-sm font-bold text-foreground/90">五维 0–20 分档</div>
                  <div className="text-xs text-muted-foreground">{meta.desc}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-lg font-bold ${meta.color}`}>{projects.length}</span>
                <span className="text-muted-foreground text-lg">{isOpen ? "▼" : "▶"}</span>
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-border/50">
                {projects.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground text-sm">该等级暂无项目</div>
                ) : (
                  <div className="divide-y divide-border/30">
                    {projects.map((p, i) => {
                      const isSelected = selectedFile === p.item.file_name;
                      return (
                        <div key={p.key}>
                          <button
                            type="button"
                            onClick={() => setSelectedFile(isSelected ? null : p.item.file_name)}
                            className={`w-full flex items-center gap-4 p-4 text-left transition-colors ${
                              isSelected
                                ? `${meta.bgClass} border-l-2 ${meta.borderClass}`
                                : "hover:bg-muted/20"
                            }`}
                          >
                            <span className="text-muted-foreground text-sm w-8 shrink-0">#{i + 1}</span>
                            <div className="min-w-0 flex-1">
                              <div className="font-bold text-foreground/90 truncate">{p.title}</div>
                              {p.title !== p.item.file_name && (
                                <div className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
                                  {p.item.file_name}
                                </div>
                              )}
                            </div>
                            <div className={`text-lg font-bold shrink-0 ${meta.color}`}>
                              {p.item.avg_score.toFixed(1)}
                            </div>
                            <div className="text-xs text-muted-foreground shrink-0 w-36 text-right">
                              {new Date(p.item.timestamp).toLocaleString()}
                            </div>
                            <span className="text-muted-foreground shrink-0">{isSelected ? "▼" : "▶"}</span>
                          </button>

                          {isSelected && (
                            <div className="px-4 pb-4">
                              <JudgeDetail fileName={p.item.file_name} onClose={() => setSelectedFile(null)} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
