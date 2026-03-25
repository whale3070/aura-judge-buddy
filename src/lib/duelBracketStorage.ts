import type { LetterTier } from "@/lib/dimensionTier";
import { rankingItemDisplayLabel } from "@/lib/utils";

export const DUEL_BRACKET_STORAGE_KEY = "aura_duel_bracket_snapshot_v1";

export type BracketPoolTier = Extract<LetterTier, "S" | "A" | "B">;

/** 淘汰赛（旧）| 旧版精简单循环存证 | 完整单循环（每对仅 1 场；擂台自动赛均写入 full，排序同下） */
export type ArenaFormat =
  | "elimination"
  | "round_robin_lite"
  | "round_robin_full"
  /** 跨档阶梯：每档项目与下一档「均分最强」各 PK 一场（不计组内循环） */
  | "cross_tier_ladder";

/** 是否用「基础分 + PK 胜场」排序（lite / full / 跨档一致） */
export function isPkRoundRobinArenaFormat(f?: ArenaFormat): boolean {
  return (
    f === "round_robin_lite" ||
    f === "round_robin_full" ||
    f === "cross_tier_ladder"
  );
}

/** 可序列化的单场对决（供排行榜展示理由） */
export interface StoredDuelMatch {
  id: string;
  round: number;
  title: string;
  status: string;
  fileA?: string;
  fileB?: string;
  titleA?: string;
  titleB?: string;
  winnerFile?: string;
  winnerLabel?: string;
  model?: string;
  reason?: string;
  error?: string;
  /** 来自 DuelResponse，供排行榜展示五维表 */
  dimension_winners?: { index: number; winner: string }[];
  dim_vote_counts?: { A: number; B: number };
}

/** 某一档位的擂台切片（与顶层 poolTier 字段同形，用于多档合并存证） */
export interface BracketTierSlice {
  arenaFormat?: ArenaFormat;
  rankedFileNames: string[];
  matches: StoredDuelMatch[];
}

export interface DuelBracketSnapshot {
  savedAt: string;
  poolTier: BracketPoolTier;
  /** 与管理员页 ?round_id= 一致；用于排名页只加载本轮存证，避免跨轮次误配 */
  roundId?: string;
  /** 未设置或为 elimination 时同档排序沿用淘汰赛快照序号；lite/full 单循环时按 AI 基础分 + PK 净胜场排序 */
  arenaFormat?: ArenaFormat;
  /** 冠军在首位，其后按淘汰轮次倒序展开的败者（同轮多场按对阵顺序） */
  rankedFileNames: string[];
  matches: StoredDuelMatch[];
  /** 同轮次其它 S/A/B 档（自动多档擂台）；缺省表示仅 poolTier 有数据 */
  otherPoolTiers?: Partial<Record<BracketPoolTier, BracketTierSlice>>;
}

/** 取某一档在存证中的切片（含顶层 poolTier 与 otherPoolTiers） */
export function getBracketSliceForTier(
  snap: DuelBracketSnapshot | null,
  tier: BracketPoolTier
): DuelBracketSnapshot | null {
  if (!snap) return null;
  if (snap.poolTier === tier) return snap;
  const slice = snap.otherPoolTiers?.[tier];
  if (!slice) return null;
  return {
    savedAt: snap.savedAt,
    roundId: snap.roundId,
    poolTier: tier,
    arenaFormat: slice.arenaFormat,
    rankedFileNames: slice.rankedFileNames,
    matches: slice.matches,
  };
}

/** 该档是否有可用于排序/展示的擂台数据（含完整单循环 0 场、仅 1 项记入存证） */
export function tierHasBracketEvidence(snap: DuelBracketSnapshot | null, tier: LetterTier): boolean {
  if (tier !== "S" && tier !== "A" && tier !== "B") return false;
  const slice = getBracketSliceForTier(snap, tier);
  if (!slice) return false;
  if (isPkRoundRobinArenaFormat(slice.arenaFormat)) return true;
  return slice.matches.some((m) => m.status === "done");
}

/** 同展示名下多份存证（不同 rule_version）→ 多个 readme 文件名，用于对齐擂台 fileA/fileB */
export function buildFileNameAliasGroups(
  rankings: { file_name: string; github_url?: string }[],
  titleMap: Record<string, string>,
  fileGithubMap: Record<string, string> = {}
): Map<string, string[]> {
  const byTitle = new Map<string, string[]>();
  for (const r of rankings) {
    const title = rankingItemDisplayLabel(r, titleMap, fileGithubMap).trim();
    const list = byTitle.get(title) ?? [];
    list.push(r.file_name);
    byTitle.set(title, list);
  }
  const out = new Map<string, string[]>();
  for (const names of byTitle.values()) {
    const dedup = [...new Set(names)];
    for (const n of dedup) out.set(n, dedup);
  }
  return out;
}

function notifyDuelSnapshotUpdated(): void {
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("aura-duel-snapshot-updated"));
    }
  } catch {
    /* ignore */
  }
}

/** 是否采用「基础分 + PK 积分」同档排序（单循环存证：full 或旧版 lite） */
export function usesRoundRobinLiteRanking(snap: DuelBracketSnapshot | null, tier: LetterTier): boolean {
  if (tier !== "S" && tier !== "A" && tier !== "B") return false;
  const slice = getBracketSliceForTier(snap, tier);
  if (!slice) return false;
  return isPkRoundRobinArenaFormat(slice.arenaFormat);
}

/** readme 别名集合在本快照已完成场次中的胜场数（赢 +1） */
export function pkWinCountForAliases(fileNames: string[], snap: DuelBracketSnapshot | null): number {
  if (!snap || fileNames.length === 0) return 0;
  const set = new Set(fileNames);
  let n = 0;
  for (const m of snap.matches) {
    if (m.status !== "done" || !m.winnerFile) continue;
    if (set.has(m.winnerFile)) n++;
  }
  return n;
}

export interface ArenaSortableRow {
  file_name: string;
  avg_score: number;
}

/** 同档内排序：lite/full 单循环为降序 (avg_score + PK)，否则按展示名 */
export function sortArenaTierItems<T extends ArenaSortableRow>(
  items: T[],
  tier: LetterTier,
  snap: DuelBracketSnapshot | null,
  preferArenaOrder: boolean,
  fileAliases: Map<string, string[]>,
  label: (row: T) => string
): T[] {
  const slice =
    tier === "S" || tier === "A" || tier === "B" ? getBracketSliceForTier(snap, tier) : null;
  const rr = prefersRoundRobinDisplay(snap, tier, preferArenaOrder);
  if (!rr || !slice) {
    return [...items].sort((a, b) => label(a).localeCompare(label(b), "zh-Hans-CN"));
  }
  return [...items].sort((a, b) => {
    const namesA = fileAliases.get(a.file_name) ?? [a.file_name];
    const namesB = fileAliases.get(b.file_name) ?? [b.file_name];
    const pkA = pkWinCountForAliases(namesA, slice);
    const pkB = pkWinCountForAliases(namesB, slice);
    const totalA = a.avg_score + pkA;
    const totalB = b.avg_score + pkB;
    if (totalB !== totalA) return totalB - totalA;
    if (pkB !== pkA) return pkB - pkA;
    if (b.avg_score !== a.avg_score) return b.avg_score - a.avg_score;
    return label(a).localeCompare(label(b), "zh-Hans-CN");
  });
}

/** 有存证且需按擂台定序时：淘汰赛看 matches；单循环亦看 matches */
export function prefersRoundRobinDisplay(
  snap: DuelBracketSnapshot | null,
  tier: LetterTier,
  preferArenaOrder: boolean
): boolean {
  if (!preferArenaOrder) return false;
  if (tier !== "S" && tier !== "A" && tier !== "B") return false;
  const slice = getBracketSliceForTier(snap, tier);
  return Boolean(slice && isPkRoundRobinArenaFormat(slice.arenaFormat));
}

/** 根据已完成对局的胜场生成 rankedFileNames（单循环快照落盘用） */
export function rankedFileNamesByPkWins(poolFileNames: string[], matches: StoredDuelMatch[]): string[] {
  const wins = new Map<string, number>();
  for (const f of poolFileNames) wins.set(f, 0);
  for (const m of matches) {
    if (m.status !== "done" || !m.winnerFile) continue;
    if (!wins.has(m.winnerFile)) wins.set(m.winnerFile, 0);
    wins.set(m.winnerFile, (wins.get(m.winnerFile) ?? 0) + 1);
  }
  const files = [...new Set([...poolFileNames, ...wins.keys()])];
  return files.sort((a, b) => (wins.get(b)! - wins.get(a)!) || a.localeCompare(b));
}

export function buildRankOrderFromBracket(
  rounds: { round: number; matches: Array<{ status: string; winnerFile?: string; fileA?: string; fileB?: string }> }[],
  championFile: string
): string[] {
  const order: string[] = [championFile];
  for (let ri = rounds.length - 1; ri >= 0; ri--) {
    for (const m of rounds[ri].matches) {
      if (m.status === "done" && m.winnerFile && m.fileA && m.fileB) {
        const loser = m.winnerFile === m.fileA ? m.fileB : m.fileA;
        order.push(loser);
      }
    }
  }
  return order;
}

export function serializeBracketRounds(
  rounds: { round: number; matches: Array<Record<string, unknown>> }[]
): StoredDuelMatch[] {
  const out: StoredDuelMatch[] = [];
  /** 按时间顺序递增：单循环常把所有场塞进 round=1 的容器，这里用场次序号避免排名页一律「第 1 轮」 */
  let matchSeq = 0;
  for (const r of rounds) {
    for (const m of r.matches) {
      matchSeq += 1;
      const row = m as {
        id: string;
        status: string;
        title: string;
        fileA?: string;
        fileB?: string;
        titleA?: string;
        titleB?: string;
        winnerFile?: string;
        winnerLabel?: string;
        response?: {
          model?: string;
          reason?: string;
          dimension_winners?: { index: number; winner: string }[];
          dim_vote_counts?: { A: number; B: number };
        };
        error?: string;
      };
      out.push({
        id: row.id,
        round: matchSeq,
        title: row.title,
        status: row.status,
        fileA: row.fileA,
        fileB: row.fileB,
        titleA: row.titleA,
        titleB: row.titleB,
        winnerFile: row.winnerFile,
        winnerLabel: row.winnerLabel,
        model: row.response?.model,
        reason: row.response?.reason,
        error: row.error,
        dimension_winners: row.response?.dimension_winners,
        dim_vote_counts: row.response?.dim_vote_counts,
      });
    }
  }
  return out;
}

export function saveDuelBracketSnapshot(payload: Omit<DuelBracketSnapshot, "savedAt">): DuelBracketSnapshot | null {
  try {
    const snap: DuelBracketSnapshot = { ...payload, savedAt: new Date().toISOString() };
    localStorage.setItem(DUEL_BRACKET_STORAGE_KEY, JSON.stringify(snap));
    notifyDuelSnapshotUpdated();
    return snap;
  } catch {
    /* quota / private mode */
    return null;
  }
}

/**
 * @param expectedRoundId 排名页传入当前 URL 的 round_id：与快照内 roundId 一致才采纳；若快照无 roundId（旧版存证）则仍加载，避免排行页与管理员页同轮却读不到擂台数据
 */
export function loadDuelBracketSnapshot(expectedRoundId?: string | null): DuelBracketSnapshot | null {
  try {
    const raw = localStorage.getItem(DUEL_BRACKET_STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as DuelBracketSnapshot;
    if (!o?.poolTier || !Array.isArray(o.rankedFileNames) || !Array.isArray(o.matches)) return null;
    const want = (expectedRoundId ?? "").trim();
    const got = (o.roundId ?? "").trim();
    if (want !== "" && got !== "" && got !== want) return null;
    return o;
  } catch {
    return null;
  }
}

/** 旧版存证未写入 roundId：与当前 URL 轮次无法严格对应，存在跨轮串档风险 */
export function isLegacyUnscopedBracketSnapshot(snap: DuelBracketSnapshot | null): boolean {
  if (!snap) return false;
  return (snap.roundId ?? "").trim() === "";
}

export function clearDuelBracketSnapshot(): void {
  try {
    localStorage.removeItem(DUEL_BRACKET_STORAGE_KEY);
    notifyDuelSnapshotUpdated();
  } catch {
    /* ignore */
  }
}

export function getDuelMatchesForFile(fileName: string, snap: DuelBracketSnapshot | null): StoredDuelMatch[] {
  return getDuelMatchesForFileSet([fileName], snap);
}

/** 任一 readme 文件名命中即视为该项目参与本场对决（解决规则筛选下合并主键与擂台存证文件名不一致） */
export function getDuelMatchesForFileSet(
  fileNames: string[],
  snap: DuelBracketSnapshot | null,
  restrictTier?: BracketPoolTier
): StoredDuelMatch[] {
  if (!snap || fileNames.length === 0) return [];
  const set = new Set(fileNames);
  const tiers: BracketPoolTier[] = restrictTier
    ? [restrictTier]
    : (["S", "A", "B"] as const).filter((t) => getBracketSliceForTier(snap, t));
  const out: StoredDuelMatch[] = [];
  for (const t of tiers) {
    const slice = getBracketSliceForTier(snap, t);
    if (!slice) continue;
    for (const m of slice.matches) {
      if (
        m.fileA &&
        m.fileB &&
        (set.has(m.fileA) || set.has(m.fileB)) &&
        (m.status === "done" || m.status === "skipped")
      ) {
        out.push(m);
      }
    }
  }
  return out.sort((a, b) => a.round - b.round || a.id.localeCompare(b.id));
}

/** 擂台名次序：取别名字在 rankedFileNames 中最靠前下标 */
export function bracketRankIndexForAliases(
  fileNames: string[],
  snap: DuelBracketSnapshot | null,
  tier?: LetterTier
): number {
  const slice =
    tier === "S" || tier === "A" || tier === "B" ? getBracketSliceForTier(snap, tier) : snap;
  if (!slice) return 1_000_000;
  let best = 1_000_000;
  for (const f of fileNames) {
    const i = slice.rankedFileNames.indexOf(f);
    if (i !== -1 && i < best) best = i;
  }
  return best;
}
