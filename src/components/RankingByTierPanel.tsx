import { useMemo, useState, useEffect } from "react";
import { letterTierFromReports, type LetterTier } from "@/lib/dimensionTier";
import type { SavedResult } from "@/lib/apiClient";
import {
  DUEL_BRACKET_STORAGE_KEY,
  loadDuelBracketSnapshot,
  getDuelMatchesForFileSet,
  buildFileNameAliasGroups,
  bracketRankIndexForAliases,
  usesRoundRobinLiteRanking,
  isPkRoundRobinArenaFormat,
  sortArenaTierItems,
  tierHasBracketEvidence,
  getBracketSliceForTier,
  type DuelBracketSnapshot,
} from "@/lib/duelBracketStorage";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useI18n } from "@/lib/i18n";
import { rankingItemDisplayLabel } from "@/lib/utils";
import { compareRankingScoreDesc } from "@/lib/scoreNorm";
import { ChevronDown } from "lucide-react";
import FiveDimRadarChart from "@/components/FiveDimRadarChart";
import DuelMatchDetail from "@/components/DuelMatchDetail";
import { syncDuelBracketFromServer } from "@/lib/duelBracketRemote";

const TIER_ORDER: LetterTier[] = ["S", "A", "B", "C", "D", "?"];

function mergeByTitle(
  rankings: SavedResult[],
  titleMap: Record<string, string>,
  fileGithubMap: Record<string, string>
): SavedResult[] {
  const map = new Map<string, SavedResult>();
  for (const item of rankings) {
    const title = rankingItemDisplayLabel(item, titleMap, fileGithubMap);
    const existing = map.get(title);
    if (!existing || compareRankingScoreDesc(existing, item) > 0) map.set(title, item);
  }
  return Array.from(map.values());
}

function resolveGithubUrl(item: SavedResult, fileGithubMap: Record<string, string>): string | undefined {
  const u = (item.github_url || fileGithubMap[item.file_name] || "").trim();
  if (!u) return undefined;
  if (!/^https?:\/\//i.test(u)) return undefined;
  return u;
}

function displayLabel(
  item: SavedResult,
  titleMap: Record<string, string>,
  fileGithubMap: Record<string, string>
): string {
  return rankingItemDisplayLabel(item, titleMap, fileGithubMap);
}

/** 同档内：单循环存证按 AI 基础分 + PK 积分；淘汰赛存证按擂台名次；否则按展示名 */
function sortWithinTier(
  items: SavedResult[],
  tier: LetterTier,
  snap: DuelBracketSnapshot | null,
  titleMap: Record<string, string>,
  fileAliases: Map<string, string[]>,
  fileGithubMap: Record<string, string>
): SavedResult[] {
  const label = (it: SavedResult) => displayLabel(it, titleMap, fileGithubMap).toLowerCase();
  if (!snap || !tierHasBracketEvidence(snap, tier)) {
    return [...items].sort((a, b) => label(a).localeCompare(label(b), "zh-Hans-CN"));
  }
  if (usesRoundRobinLiteRanking(snap, tier)) {
    return sortArenaTierItems(items, tier, snap, true, fileAliases, label);
  }
  const idx = (it: SavedResult) => {
    const names = fileAliases.get(it.file_name) ?? [it.file_name];
    return bracketRankIndexForAliases(names, snap, tier);
  };
  return [...items].sort((a, b) => idx(a) - idx(b));
}

interface Props {
  /** 当前轮次 id（与管理员擂台页一致），用于读取 localStorage 擂台存证 */
  roundId: string;
  /**
   * 全量排名（勿用规则筛选后的子集）：用于把「同展示名、不同 rule 的 readme 文件名」与擂台 fileA/fileB 对齐
   */
  allRankingsForAliases: SavedResult[];
  rankings: SavedResult[];
  loading: boolean;
  titleMap: Record<string, string>;
  /** readme 文件名 -> fork 状态 */
  fileForkMap?: Record<string, boolean>;
  /** readme 文件名 → 提交时 GitHub 仓库 URL（可选接口 /api/file-github-urls） */
  fileGithubMap?: Record<string, string>;
  emptyHint?: string;
  /** 多赛道时与 ?track= 一致，用于读取对应擂台存证 */
  duelTrackId?: string | null;
}

export default function RankingByTierPanel({
  roundId,
  allRankingsForAliases,
  rankings,
  loading,
  titleMap,
  fileForkMap = {},
  fileGithubMap = {},
  emptyHint,
  duelTrackId,
}: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<SavedResult | null>(null);
  const [snapEpoch, setSnapEpoch] = useState(0);

  useEffect(() => {
    const bump = () => setSnapEpoch((e) => e + 1);
    window.addEventListener("aura-duel-snapshot-updated", bump);
    const onStorage = (ev: StorageEvent) => {
      if (ev.key?.startsWith(DUEL_BRACKET_STORAGE_KEY)) bump();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("aura-duel-snapshot-updated", bump);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    void syncDuelBracketFromServer(roundId, (duelTrackId ?? "").trim() || undefined);
  }, [roundId, duelTrackId]);

  const snap = useMemo(
    () => loadDuelBracketSnapshot(roundId, (duelTrackId ?? "").trim() || undefined),
    [roundId, duelTrackId, rankings.length, allRankingsForAliases.length, snapEpoch]
  );

  const fileAliases = useMemo(
    () => buildFileNameAliasGroups(allRankingsForAliases, titleMap, fileGithubMap),
    [allRankingsForAliases, titleMap, fileGithubMap]
  );

  const snapHasAnyArena = useMemo(() => {
    if (!snap) return false;
    return (["S", "A", "B"] as const).some((t) => tierHasBracketEvidence(snap, t));
  }, [snap]);

  const byTier = useMemo(() => {
    const merged = mergeByTitle(rankings, titleMap, fileGithubMap);
    const groups: Record<LetterTier, SavedResult[]> = {
      S: [],
      A: [],
      B: [],
      C: [],
      D: [],
      "?": [],
    };
    for (const item of merged) {
      const tier = letterTierFromReports(item.reports);
      groups[tier].push(item);
    }
    for (const tier of TIER_ORDER) {
      groups[tier] = sortWithinTier(groups[tier], tier, snap, titleMap, fileAliases, fileGithubMap);
    }
    return groups;
  }, [rankings, titleMap, snap, fileAliases, fileGithubMap]);

  const openDetail = (item: SavedResult) => {
    setSelected(item);
    setOpen(true);
  };

  const selectedLetterTier = selected ? letterTierFromReports(selected.reports) : null;
  const selectedPoolTier =
    selectedLetterTier === "S" || selectedLetterTier === "A" || selectedLetterTier === "B"
      ? selectedLetterTier
      : undefined;

  /** 与具体规则筛选下的分档无关：只要本地存证里本场有该 readme 的对决就展示（避免「全部规则」与单规则下档位不一致导致淘汰赛整块消失） */
  const matchesForSelected =
    selected && snap && selectedPoolTier && tierHasBracketEvidence(snap, selectedPoolTier)
      ? getDuelMatchesForFileSet(
          fileAliases.get(selected.file_name) ?? [selected.file_name],
          snap,
          selectedPoolTier
        )
      : [];
  const duelSectionVisible = matchesForSelected.length > 0;
  const selectedGithub = selected ? resolveGithubUrl(selected, fileGithubMap) : undefined;

  if (loading) {
    return <div className="text-muted-foreground text-sm py-8 text-center">{t("ranking.loading")}</div>;
  }
  if (rankings.length === 0) {
    return (
      <div className="text-muted-foreground text-sm py-8 text-center">
        {emptyHint ?? t("ranking.empty")}
      </div>
    );
  }

  return (
    <>
      {snapHasAnyArena && snap && (
        <div className="text-xs text-muted-foreground mb-4 border border-border/60 bg-muted/20 px-3 py-2 space-y-1">
          {(["S", "A", "B"] as const).map((tier) => {
            if (!tierHasBracketEvidence(snap, tier)) return null;
            const slice = getBracketSliceForTier(snap, tier);
            return (
              <p key={tier}>
                {isPkRoundRobinArenaFormat(slice?.arenaFormat)
                  ? t("ranking.bracketOrderHintRr", { tier })
                  : t("ranking.bracketOrderHint", { tier })}
              </p>
            );
          })}
        </div>
      )}
      {!snapHasAnyArena && (
        <p className="text-xs text-muted-foreground mb-4 border border-border/60 bg-muted/20 px-3 py-2">
          {t("ranking.noBracketUiHint")}
        </p>
      )}
      <div className="space-y-3">
        {TIER_ORDER.map((tier) => {
          const list = byTier[tier];
          if (list.length === 0) return null;
          const tierLabel = tier === "?" ? t("ranking.tierUnknown") : t("ranking.tierSection", { tier });
          return (
            <Collapsible key={tier} defaultOpen={false} className="group border border-secondary/40 bg-secondary/[0.04] rounded-md overflow-hidden">
              <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-secondary/10 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary/50">
                <div className="min-w-0">
                  <span className="text-secondary text-sm font-bold tracking-widest">{tierLabel}</span>
                  <span className="block text-xs text-muted-foreground font-normal mt-0.5">
                    {t("ranking.tierExpandHint", { n: String(list.length) })}
                  </span>
                </div>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 pb-4 pt-0 border-t border-secondary/20">
                  {snap && tierHasBracketEvidence(snap, tier) ? (
                    <ul className="space-y-1 pt-3">
                      {list.map((item, i) => {
                        const displayTitle = displayLabel(item, titleMap, fileGithubMap);
                        const showFile = displayTitle !== item.file_name;
                        return (
                          <li key={item.file_name}>
                            <button
                              type="button"
                              onClick={() => openDetail(item)}
                              className="w-full text-left flex gap-3 items-start px-2 py-2 rounded hover:bg-secondary/10 border border-transparent hover:border-secondary/30 transition-colors"
                            >
                              <span className="text-muted-foreground text-sm w-8 shrink-0 tabular-nums pt-0.5">
                                {i + 1}
                              </span>
                              <div className="min-w-0 flex-1">
                                <span className="font-bold text-foreground/90 block truncate flex items-center gap-2">
                                  <span className="truncate">{displayTitle}</span>
                                  {fileForkMap[item.file_name] ? (
                                    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-destructive/20 text-destructive border border-destructive/40 font-semibold">
                                      Forked
                                    </span>
                                  ) : null}
                                </span>
                                {showFile && (
                                  <span className="text-[10px] text-muted-foreground font-mono truncate block mt-0.5">
                                    {item.file_name}
                                  </span>
                                )}
                              </div>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 pt-3">
                      {list.map((item) => {
                        const displayTitle = displayLabel(item, titleMap, fileGithubMap);
                        const showFile = displayTitle !== item.file_name;
                        return (
                          <button
                            key={item.file_name}
                            type="button"
                            onClick={() => openDetail(item)}
                            className="text-left rounded-md border border-border bg-card/80 hover:bg-secondary/10 hover:border-secondary/40 px-4 py-3 min-h-[88px] transition-colors shadow-sm hover:shadow-[0_0_16px_hsl(var(--primary)/0.12)]"
                          >
                            <span className="font-bold text-foreground/90 block line-clamp-2 leading-snug flex items-center gap-2">
                              <span className="line-clamp-2">{displayTitle}</span>
                              {fileForkMap[item.file_name] ? (
                                <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-destructive/20 text-destructive border border-destructive/40 font-semibold">
                                  Forked
                                </span>
                              ) : null}
                            </span>
                            {showFile && (
                              <span className="text-[10px] text-muted-foreground font-mono truncate block mt-2">
                                {item.file_name}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-primary space-y-1">
              {selected && (
                <>
                  <span className="block flex items-center gap-2">
                    <span className="truncate">{displayLabel(selected, titleMap, fileGithubMap)}</span>
                    {fileForkMap[selected.file_name] ? (
                      <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-destructive/20 text-destructive border border-destructive/40 font-semibold">
                        Forked
                      </span>
                    ) : null}
                  </span>
                  {displayLabel(selected, titleMap, fileGithubMap) !== selected.file_name ? (
                    <span className="block text-xs font-mono text-muted-foreground font-normal">
                      {selected.file_name}
                    </span>
                  ) : null}
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 text-sm">
            {selected && (
              <div className="border-b border-border/50 pb-3">
                {selectedGithub ? (
                  <p className="text-sm leading-relaxed break-words">
                    <span className="text-muted-foreground">{t("ranking.sourceRepoLabel")}</span>
                    <a
                      href={selectedGithub}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline font-mono text-xs sm:text-sm"
                    >
                      {selectedGithub}
                    </a>
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">{t("ranking.sourceRepoUnknown")}</p>
                )}
              </div>
            )}

            <div className="space-y-3">{selected && <FiveDimRadarChart reports={selected.reports} />}</div>

            {duelSectionVisible && (
              <div className="space-y-3 pt-2 border-t border-border/40">
                <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  {t("ranking.duelSectionTitle")}
                </div>
                {matchesForSelected.length === 0 ? (
                  <p className="text-muted-foreground text-xs">{t("ranking.noDuelRationale")}</p>
                ) : (
                  matchesForSelected.map((m) => (
                    <div key={m.id} className="border border-border/60 p-3 space-y-3 bg-muted/10">
                      <div className="text-xs text-muted-foreground">
                        {t("ranking.duelRoundMeta", { n: String(m.round) })} · {m.title}
                      </div>
                      {m.winnerLabel && (
                        <div className="flex flex-wrap gap-2 items-center text-xs">
                          <span className="text-muted-foreground">{t("ranking.duelWinner")}</span>
                          <span className="font-bold text-primary">{m.winnerLabel}</span>
                          {m.model && (
                            <span className="font-mono text-muted-foreground">model: {m.model}</span>
                          )}
                        </div>
                      )}
                      <DuelMatchDetail match={m} />
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
