import type { LetterTier } from "@/lib/dimensionTier";

export const DUEL_BRACKET_STORAGE_KEY = "aura_duel_bracket_snapshot_v1";

export type BracketPoolTier = Extract<LetterTier, "S" | "A" | "B">;

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

export interface DuelBracketSnapshot {
  savedAt: string;
  poolTier: BracketPoolTier;
  /** 与管理员页 ?round_id= 一致；用于排名页只加载本轮存证，避免跨轮次误配 */
  roundId?: string;
  /** 冠军在首位，其后按淘汰轮次倒序展开的败者（同轮多场按对阵顺序） */
  rankedFileNames: string[];
  matches: StoredDuelMatch[];
}

/** 同展示名下多份存证（不同 rule_version）→ 多个 readme 文件名，用于对齐擂台 fileA/fileB */
export function buildFileNameAliasGroups(
  rankings: { file_name: string }[],
  titleMap: Record<string, string>
): Map<string, string[]> {
  const byTitle = new Map<string, string[]>();
  for (const r of rankings) {
    const title = (titleMap[r.file_name] || r.file_name).trim();
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
  for (const r of rounds) {
    for (const m of r.matches) {
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
        round: r.round,
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
export function getDuelMatchesForFileSet(fileNames: string[], snap: DuelBracketSnapshot | null): StoredDuelMatch[] {
  if (!snap || fileNames.length === 0) return [];
  const set = new Set(fileNames);
  return snap.matches
    .filter(
      (m) =>
        m.status === "done" && m.fileA && m.fileB && (set.has(m.fileA) || set.has(m.fileB))
    )
    .sort((a, b) => a.round - b.round);
}

/** 擂台名次序：取别名字在 rankedFileNames 中最靠前下标 */
export function bracketRankIndexForAliases(fileNames: string[], snap: DuelBracketSnapshot | null): number {
  if (!snap) return 1_000_000;
  let best = 1_000_000;
  for (const f of fileNames) {
    const i = snap.rankedFileNames.indexOf(f);
    if (i !== -1 && i < best) best = i;
  }
  return best;
}
