import { useMemo, useState, useEffect } from "react";
import type { RankingItem } from "@/lib/api";
import JudgeDetail from "@/components/JudgeDetail";
import STierDuelPanel from "@/components/STierDuelPanel";
import { letterTierFromReports, type LetterTier } from "@/lib/dimensionTier";
import { fetchActiveRulesAPI } from "@/lib/apiClient";
import { parseAndValidateYAML, type RuleSet } from "@/lib/rulesApi";
import { inferJudgeRubricMode, tierFoldHeadline, type JudgeRubricMode } from "@/lib/judgeRubricDisplay";
import { syncDuelBracketFromServer } from "@/lib/duelBracketRemote";
import {
  loadDuelBracketSnapshot,
  sortArenaTierItems,
  usesRoundRobinLiteRanking,
  tierHasBracketEvidence,
} from "@/lib/duelBracketStorage";
import { rankingItemDisplayLabel } from "@/lib/utils";
import { compareRankingScoreDesc, formatPrimaryScoreLabel } from "@/lib/scoreNorm";

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

/** 四维 0–10 阶梯（与 dimensionTier / 规则 YAML notes 一致） */
const TIER_META_FOUR: Record<LetterTier, Omit<TierConfig, "tier">> = {
  S: {
    label: "S",
    desc: "≥4 维 ≥9（满分 10，阶梯互斥）",
    color: "text-primary",
    bgClass: "bg-primary/10",
    borderClass: "border-primary/40",
    glowClass: "shadow-[0_0_15px_hsl(var(--primary)/0.3)]",
  },
  A: {
    label: "A",
    desc: "≥3 维 ≥8",
    color: "text-secondary",
    bgClass: "bg-secondary/10",
    borderClass: "border-secondary/40",
    glowClass: "shadow-[0_0_15px_hsl(var(--secondary)/0.3)]",
  },
  B: {
    label: "B",
    desc: "≥2 维 ≥7",
    color: "text-warning",
    bgClass: "bg-[hsl(var(--warning)/0.1)]",
    borderClass: "border-[hsl(var(--warning)/0.4)]",
    glowClass: "shadow-[0_0_15px_hsl(var(--warning)/0.2)]",
  },
  C: {
    label: "C",
    desc: "≥1 维 ≥6",
    color: "text-orange-400",
    bgClass: "bg-orange-500/10",
    borderClass: "border-orange-500/30",
    glowClass: "shadow-[0_0_12px_rgba(251,146,60,0.15)]",
  },
  D: {
    label: "D",
    desc: "四维均 ＜6",
    color: "text-destructive",
    bgClass: "bg-destructive/10",
    borderClass: "border-destructive/40",
    glowClass: "shadow-[0_0_15px_hsl(var(--destructive)/0.2)]",
  },
  "?": {
    label: "?",
    desc: "缺少完整四维（满分 10）解析，请检查评审输出是否与 YAML 维度名一致",
    color: "text-muted-foreground",
    bgClass: "bg-muted/30",
    borderClass: "border-border",
    glowClass: "",
  },
};

const TIER_META_FIVE: Record<LetterTier, Omit<TierConfig, "tier">> = {
  S: {
    label: "S",
    desc: "≥4 维 ≥18（满分 20，阶梯互斥）",
    color: "text-primary",
    bgClass: "bg-primary/10",
    borderClass: "border-primary/40",
    glowClass: "shadow-[0_0_15px_hsl(var(--primary)/0.3)]",
  },
  A: {
    label: "A",
    desc: "≥3 维 ≥16",
    color: "text-secondary",
    bgClass: "bg-secondary/10",
    borderClass: "border-secondary/40",
    glowClass: "shadow-[0_0_15px_hsl(var(--secondary)/0.3)]",
  },
  B: {
    label: "B",
    desc: "≥2 维 ≥14",
    color: "text-warning",
    bgClass: "bg-[hsl(var(--warning)/0.1)]",
    borderClass: "border-[hsl(var(--warning)/0.4)]",
    glowClass: "shadow-[0_0_15px_hsl(var(--warning)/0.2)]",
  },
  C: {
    label: "C",
    desc: "≥1 维 ≥12",
    color: "text-orange-400",
    bgClass: "bg-orange-500/10",
    borderClass: "border-orange-500/30",
    glowClass: "shadow-[0_0_12px_rgba(251,146,60,0.15)]",
  },
  D: {
    label: "D",
    desc: "五维均 ＜12",
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

function tierMetaForMode(mode: JudgeRubricMode): Record<LetterTier, Omit<TierConfig, "tier">> {
  if (mode === "four10") return TIER_META_FOUR;
  if (mode === "five20") return TIER_META_FIVE;
  const base = TIER_META_FIVE;
  const genericDesc =
    "档位由当前激活规则（/rules）中 notes 的阶梯互斥规则确定；avg_score 为加权总分 0–100";
  const out = {} as Record<LetterTier, Omit<TierConfig, "tier">>;
  for (const k of TIER_ORDER) {
    if (k === "?") {
      out[k] = {
        ...base["?"],
        desc: "无法解析完整维度分数，或规则为自定义维度集，请对照 /rules 与评审正文",
      };
    } else {
      out[k] = { ...base[k], desc: genericDesc };
    }
  }
  return out;
}

interface MergedProject {
  key: string;
  item: RankingItem;
  title: string;
  tier: LetterTier;
}

type MergedArenaRow = MergedProject & {
  file_name: string;
  avg_score: number;
  rubric_raw_max?: number;
};

interface Props {
  rankings: RankingItem[];
  loading: boolean;
  titleMap: Record<string, string>;
  /** file_name -> whether repo is forked */
  forkMap?: Record<string, boolean>;
  /** 管理员钱包地址，用于调用 /api/duel */
  adminWallet?: string | null;
  /** 与 URL ?round_id= 一致，拉取 judge-result / file-content 时用 */
  roundId?: string | null;
  /** 是否展示“擂台 · AI 两两评比（同档位内）” */
  showDuelPanel?: boolean;
  onReauditDone?: () => void;
  /** 展开详情的裁决存证缺失时刷新排名列表（例如提交已删） */
  onRankingDataStale?: () => void;
  /** 与 /judge?track= 一致；多赛道时擂台按赛道隔离 */
  duelTrackId?: string | null;
}

export default function GradeRankingPanel({
  rankings,
  loading,
  titleMap,
  forkMap = {},
  adminWallet,
  roundId,
  showDuelPanel = true,
  onReauditDone,
  onRankingDataStale,
  duelTrackId,
}: Props) {
  const [expandedTier, setExpandedTier] = useState<LetterTier | null>("S");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [snapEpoch, setSnapEpoch] = useState(0);
  const [activeRuleSet, setActiveRuleSet] = useState<RuleSet | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchActiveRulesAPI()
      .then((res) => {
        if (cancelled || !res.rawYAML) {
          if (!cancelled) setActiveRuleSet(null);
          return;
        }
        const { parsed } = parseAndValidateYAML(res.rawYAML);
        if (!cancelled) setActiveRuleSet(parsed);
      })
      .catch(() => {
        if (!cancelled) setActiveRuleSet(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rubricMode = useMemo(() => inferJudgeRubricMode(activeRuleSet), [activeRuleSet]);
  const tierMeta = useMemo(() => tierMetaForMode(rubricMode), [rubricMode]);
  const foldHeadline = useMemo(
    () => tierFoldHeadline(rubricMode, activeRuleSet?.dimensions?.length ?? 0),
    [rubricMode, activeRuleSet?.dimensions?.length]
  );

  useEffect(() => {
    const rid = (roundId ?? "").trim();
    if (!rid) return;
    void syncDuelBracketFromServer(rid, (duelTrackId ?? "").trim() || undefined);
  }, [roundId, duelTrackId]);

  useEffect(() => {
    const bump = () => setSnapEpoch((e) => e + 1);
    window.addEventListener("aura-duel-snapshot-updated", bump);
    return () => window.removeEventListener("aura-duel-snapshot-updated", bump);
  }, []);

  const duelSnap = useMemo(
    () => loadDuelBracketSnapshot(roundId ?? undefined, (duelTrackId ?? "").trim() || undefined),
    [roundId, duelTrackId, snapEpoch]
  );

  const mergedProjects = useMemo(() => {
    const projectMap = new Map<string, MergedProject>();
    for (const item of rankings) {
      const title = rankingItemDisplayLabel(item, titleMap, {});
      const tier = letterTierFromReports(item.reports);
      const existing = projectMap.get(title);
      if (!existing || compareRankingScoreDesc(existing.item, item) > 0) {
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
    const preferArena = Boolean(
      duelSnap &&
        (["S", "A", "B"] as const).some((tier) => tierHasBracketEvidence(duelSnap, tier))
    );
    const aliasSelf = new Map<string, string[]>(
      mergedProjects.map((p) => [p.item.file_name, [p.item.file_name]])
    );
    for (const t of TIER_ORDER) {
      if (
        preferArena &&
        (t === "S" || t === "A" || t === "B") &&
        usesRoundRobinLiteRanking(duelSnap, t)
      ) {
        const rows: MergedArenaRow[] = groups[t].map((p) => ({
          ...p,
          file_name: p.item.file_name,
          avg_score: p.item.avg_score,
          rubric_raw_max: p.item.rubric_raw_max,
        }));
        const sorted = sortArenaTierItems(rows, t, duelSnap, true, aliasSelf, (r) =>
          r.title.toLowerCase()
        );
        groups[t] = sorted.map(({ file_name: _f, avg_score: _a, ...rest }) => rest);
      } else {
        groups[t].sort((a, b) => compareRankingScoreDesc(b.item, a.item));
      }
    }
    return groups;
  }, [mergedProjects, duelSnap]);

  const duelCandidates = useMemo(
    () =>
      mergedProjects
        .filter((p) => p.tier === "S" || p.tier === "A" || p.tier === "B")
        .map((p) => ({
          file_name: p.item.file_name,
          title: p.title,
          tier: p.tier as "S" | "A" | "B",
          avg_score: p.item.avg_score,
          rubric_raw_max: p.item.rubric_raw_max,
        })),
    [mergedProjects]
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
          const meta = tierMeta[tier];
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

      {showDuelPanel && (
        <STierDuelPanel
          candidates={duelCandidates}
          adminWallet={adminWallet ?? ""}
          enabled={duelEnabled}
          roundId={roundId}
          duelTrackId={duelTrackId}
        />
      )}

      {TIER_ORDER.map((tier) => {
        const projects = tierGroups[tier];
        const meta = tierMeta[tier];
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
                  <div className="text-sm font-bold text-foreground/90">{foldHeadline}</div>
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
                              <div className="font-bold text-foreground/90 truncate flex items-center gap-2">
                                <span className="truncate">{p.title}</span>
                                {forkMap[p.item.file_name] ? (
                                  <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-destructive/20 text-destructive border border-destructive/40 font-semibold">
                                    Forked
                                  </span>
                                ) : null}
                              </div>
                              {p.title !== p.item.file_name && (
                                <div className="text-xs text-muted-foreground font-mono mt-0.5 truncate">
                                  {p.item.file_name}
                                </div>
                              )}
                            </div>
                            <div className={`text-lg font-bold shrink-0 ${meta.color}`}>
                              {formatPrimaryScoreLabel(p.item.avg_score, p.item.rubric_raw_max)}
                            </div>
                            <div className="text-xs text-muted-foreground shrink-0 w-36 text-right">
                              {new Date(p.item.timestamp).toLocaleString()}
                            </div>
                            <span className="text-muted-foreground shrink-0">{isSelected ? "▼" : "▶"}</span>
                          </button>

                          {isSelected && (
                            <div className="px-4 pb-4">
                              <JudgeDetail
                                fileName={p.item.file_name}
                                roundId={roundId}
                                isForked={!!forkMap[p.item.file_name]}
                                onClose={() => setSelectedFile(null)}
                                onReauditDone={onReauditDone}
                                onResultMissing={() => {
                                  setSelectedFile(null);
                                  onRankingDataStale?.();
                                }}
                              />
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
