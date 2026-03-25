import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { submitDuel, type DuelResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { LetterTier } from "@/lib/dimensionTier";
import { parseDuelWinnerFile } from "@/lib/parseDuelWinner";
import {
  serializeBracketRounds,
  saveDuelBracketSnapshot,
  loadDuelBracketSnapshot,
  rankedFileNamesByPkWins,
  type StoredDuelMatch,
  type BracketTierSlice,
} from "@/lib/duelBracketStorage";
import { putDuelBracketSnapshotToServer, syncDuelBracketFromServer } from "@/lib/duelBracketRemote";
import { toast } from "sonner";
import { formatPrimaryScoreLabel, scoreNorm100 } from "@/lib/scoreNorm";

export interface DuelProjectOption {
  file_name: string;
  title: string;
}

export type DuelPoolTier = Extract<LetterTier, "S" | "A" | "B">;

/** 自动擂台：从该档起做同档完整单循环；其下档跳过单循环，跨档代表用五维均分领先 */
export type AutoRrStartTier = DuelPoolTier;

export interface DuelCandidate extends DuelProjectOption {
  tier: DuelPoolTier;
  /** 五维评审均分：展示参考；与同档 PK 胜场持平时决擂台代表 */
  avg_score: number;
  rubric_raw_max?: number;
}

type DuelMode = "manual" | "auto";

/** skipped：同档单循环内连续告负淘汰，未发起评审以省 token */
type MatchStatus = "pending" | "running" | "done" | "error" | "bye" | "skipped";

const LOSS_STREAK_ELIM = 3;

interface BracketMatchRow {
  id: string;
  status: MatchStatus;
  title: string;
  fileA?: string;
  fileB?: string;
  titleA?: string;
  titleB?: string;
  winnerFile?: string;
  winnerLabel?: string;
  response?: DuelResponse;
  error?: string;
}

interface BracketRound {
  round: number;
  matches: BracketMatchRow[];
}

interface Props {
  candidates: DuelCandidate[];
  adminWallet: string;
  enabled: boolean;
  /** 与 ?round_id= 一致，POST /api/duel 时带上 */
  roundId?: string | null;
  /** 与 ?track= 一致；多赛道时擂台存证按赛道隔离 */
  duelTrackId?: string | null;
}

/** 与 ReportCard 评审正文一致：typography + 暗色可读 */
const DUEL_MD_PROSE =
  "prose prose-sm prose-invert max-w-none overflow-x-auto leading-relaxed break-words prose-headings:text-foreground prose-headings:text-sm prose-headings:my-2 prose-p:my-1 prose-li:text-foreground/90 prose-li:my-0.5 prose-ul:my-1 prose-ol:my-1 prose-strong:text-foreground prose-code:text-foreground prose-pre:bg-muted/50 prose-pre:text-xs";

function formatBracketDurationParts(totalMs: number): { h: number; m: number; s: number } {
  const secTotal = Math.floor(Math.max(0, totalMs) / 1000);
  const h = Math.floor(secTotal / 3600);
  const m = Math.floor((secTotal % 3600) / 60);
  const s = secTotal % 60;
  return { h, m, s };
}

function formatBracketDurationLabel(parts: { h: number; m: number; s: number }): string {
  const { h, m, s } = parts;
  if (h > 0) return `${h} 小时 ${m} 分 ${s} 秒`;
  if (m > 0) return `${m} 分 ${s} 秒`;
  return `${s} 秒`;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const TIER_AUTORUN_PRIORITY: DuelPoolTier[] = ["S", "A", "B"];
/** 自动擂台执行顺序：低档先内部决 PK 冠军，再与上一级跨档 */
const TIER_LADDER_BOTTOM_UP: DuelPoolTier[] = ["B", "A", "S"];

type RrBoardRow = { title: string; wins: number; eliminated?: boolean };
type RrTierBoard = { tier: DuelPoolTier; rows: RrBoardRow[] };

function strongestInTier(pool: DuelCandidate[]): DuelCandidate | null {
  if (pool.length === 0) return null;
  return [...pool].sort((a, b) => {
    const na = scoreNorm100(a.avg_score, a.rubric_raw_max);
    const nb = scoreNorm100(b.avg_score, b.rubric_raw_max);
    if (nb !== na) return nb - na;
    return a.file_name.localeCompare(b.file_name);
  })[0]!;
}

/** 完整单循环：无序对各 1 场；顺序打乱 */
function buildFullRoundRobinPairs(fileNames: string[]): [string, string][] {
  const files = [...fileNames];
  const n = files.length;
  const pairs: [string, string][] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      pairs.push([files[i], files[j]]);
    }
  }
  shuffle(pairs);
  return pairs;
}

/** 在已产生的场次中按胜场数选出擂台代表；胜场相同则均分高者优先 */
function pickPkLeaderFromMatches(
  pool: DuelCandidate[],
  matches: BracketMatchRow[],
  relevant: (m: BracketMatchRow) => boolean
): DuelCandidate | null {
  if (pool.length === 0) return null;
  if (pool.length === 1) return pool[0]!;
  const files = new Set(pool.map((p) => p.file_name));
  const wins = new Map<string, number>();
  for (const p of pool) wins.set(p.file_name, 0);
  for (const m of matches) {
    if (!relevant(m) || m.status !== "done" || !m.winnerFile) continue;
    if (files.has(m.winnerFile)) {
      wins.set(m.winnerFile, (wins.get(m.winnerFile) ?? 0) + 1);
    }
  }
  return [...pool].sort((a, b) => {
    const wa = wins.get(a.file_name) ?? 0;
    const wb = wins.get(b.file_name) ?? 0;
    if (wb !== wa) return wb - wa;
    const na = scoreNorm100(a.avg_score, a.rubric_raw_max);
    const nb = scoreNorm100(b.avg_score, b.rubric_raw_max);
    if (nb !== na) return nb - na;
    return a.file_name.localeCompare(b.file_name);
  })[0]!;
}

/**
 * 手动对决成功后写入快照并同步服务端（自动淘汰本来就会存；此前手动路径未存，排名页读不到）。
 */
function persistManualDuelSnapshot(
  poolTier: DuelPoolTier,
  roundId: string | null | undefined,
  fileA: string,
  fileB: string,
  res: DuelResponse,
  poolProjects: DuelProjectOption[],
  adminWallet: string,
  duelTrackId?: string | null
): void {
  const wf = parseDuelWinnerFile(res, fileA, fileB);
  if (!wf) return;
  const rid = (roundId ?? "").trim();
  if (!rid || !adminWallet) return;

  const titleA = poolProjects.find((p) => p.file_name === fileA)?.title ?? fileA;
  const titleB = poolProjects.find((p) => p.file_name === fileB)?.title ?? fileB;
  const winnerLabel = wf === fileA ? titleA : titleB;

  const tid = (duelTrackId ?? "").trim();
  const existing = loadDuelBracketSnapshot(rid, tid || undefined);
  const canMerge =
    existing &&
    existing.poolTier === poolTier &&
    (existing.roundId ?? "").trim() === rid &&
    (existing.trackId ?? "").trim() === tid;

  const nextRound =
    canMerge && existing.matches.length > 0
      ? Math.max(...existing.matches.map((m) => m.round)) + 1
      : 1;

  const newMatch: StoredDuelMatch = {
    id: `manual-${Date.now()}`,
    round: nextRound,
    title: `${titleA} vs ${titleB}`,
    status: "done",
    fileA,
    fileB,
    titleA,
    titleB,
    winnerFile: wf,
    winnerLabel,
    model: res.model,
    reason: res.reason,
    dimension_winners: res.dimension_winners,
    dim_vote_counts: res.dim_vote_counts,
  };

  const matches = canMerge ? [...existing.matches, newMatch] : [newMatch];
  const poolFiles = [
    ...new Set([
      ...poolProjects.map((p) => p.file_name),
      ...matches.flatMap((m) => [m.fileA, m.fileB].filter(Boolean) as string[]),
    ]),
  ];
  const rankedFileNames = rankedFileNamesByPkWins(poolFiles, matches);

  const arenaFmt =
    canMerge && existing.arenaFormat ? existing.arenaFormat : "round_robin_full";

  const saved = saveDuelBracketSnapshot({
    poolTier,
    roundId: rid,
    ...(tid ? { trackId: tid } : {}),
    arenaFormat: arenaFmt,
    rankedFileNames,
    matches,
    ...(canMerge && existing?.otherPoolTiers ? { otherPoolTiers: existing.otherPoolTiers } : {}),
  });
  if (saved) {
    void putDuelBracketSnapshotToServer(adminWallet, rid, saved).catch((e) => {
      toast.error(
        e instanceof Error ? e.message : "擂台结果已写入本机，同步服务器失败，请检查网络或稍后重试"
      );
    });
  }
}

export default function STierDuelPanel({ candidates, adminWallet, enabled, roundId, duelTrackId }: Props) {
  const [poolTier, setPoolTier] = useState<DuelPoolTier>("S");
  const [duelMode, setDuelMode] = useState<DuelMode>("manual");
  /** 自动模式：从哪一档开始跑「同档完整单循环」（其下档不跑单循环，省 token） */
  const [autoRrStartTier, setAutoRrStartTier] = useState<AutoRrStartTier>("B");
  const [fileA, setFileA] = useState<string>("");
  const [fileB, setFileB] = useState<string>("");
  const [model, setModel] = useState<string>("deepseek");
  const [outputLang, setOutputLang] = useState<"zh" | "en">("zh");
  const [loading, setLoading] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const [result, setResult] = useState<DuelResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [bracketRounds, setBracketRounds] = useState<BracketRound[]>([]);
  const [rrTierBoards, setRrTierBoards] = useState<RrTierBoard[] | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bracketTimerStartRef = useRef<number | null>(null);
  const [bracketTimerTick, setBracketTimerTick] = useState(0);
  const [lastBracketDurationMs, setLastBracketDurationMs] = useState<number | null>(null);

  const hasAutorunPool = useMemo(
    () => TIER_AUTORUN_PRIORITY.some((t) => candidates.filter((c) => c.tier === t).length >= 1),
    [candidates]
  );

  const poolProjects = useMemo(() => {
    if (duelMode === "auto") return [];
    return candidates
      .filter((c) => c.tier === poolTier)
      .map(({ file_name, title }) => ({ file_name, title }));
  }, [candidates, duelMode, poolTier]);

  useEffect(() => {
    setFileA("");
    setFileB("");
    setResult(null);
    setErr(null);
    setBracketRounds([]);
    setRrTierBoards(null);
    bracketTimerStartRef.current = null;
    setLastBracketDurationMs(null);
  }, [poolTier]);

  useEffect(() => {
    const rid = (roundId ?? "").trim();
    if (!rid) return;
    void syncDuelBracketFromServer(rid, (duelTrackId ?? "").trim() || undefined);
  }, [roundId, duelTrackId]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!autoRunning || bracketTimerStartRef.current == null) return;
    const id = window.setInterval(() => setBracketTimerTick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [autoRunning]);

  const bracketDurationLiveMs = useMemo(() => {
    void bracketTimerTick;
    if (!autoRunning || bracketTimerStartRef.current == null) return null;
    return Date.now() - bracketTimerStartRef.current;
  }, [autoRunning, bracketTimerTick]);

  const bracketDurationSummary = useCallback(() => {
    const ms = bracketDurationLiveMs ?? lastBracketDurationMs;
    if (ms == null) return null;
    return formatBracketDurationLabel(formatBracketDurationParts(ms));
  }, [bracketDurationLiveMs, lastBracketDurationMs]);

  const canRun =
    enabled &&
    !!adminWallet &&
    poolProjects.length >= 2 &&
    fileA &&
    fileB &&
    fileA !== fileB &&
    duelMode === "manual";

  const busy = loading || autoRunning;
  const canAutoStart =
    enabled && !!adminWallet && duelMode === "auto" && !busy && hasAutorunPool;

  const run = async () => {
    if (!canRun) return;
    setLoading(true);
    setErr(null);
    setResult(null);
    try {
      const res = await submitDuel(adminWallet, {
        file_a: fileA,
        file_b: fileB,
        model,
        output_lang: outputLang,
        round_id: roundId ?? undefined,
      });
      setResult(res);
      persistManualDuelSnapshot(poolTier, roundId, fileA, fileB, res, poolProjects, adminWallet, duelTrackId);
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") return;
      setErr(e instanceof Error ? e.message : "对决失败");
    } finally {
      setLoading(false);
    }
  };

  const stopBracket = () => {
    abortRef.current?.abort();
  };

  const runAutoBracket = async () => {
    if (!canAutoStart) return;
    const ac = new AbortController();
    abortRef.current = ac;
    bracketTimerStartRef.current = Date.now();
    setLastBracketDurationMs(null);
    setBracketTimerTick(0);
    setAutoRunning(true);
    setErr(null);
    setResult(null);
    setBracketRounds([]);
    setRrTierBoards([]);

    /** 自下而上 B→A→S：同档单循环与跨档混合，统一按 round_robin_full 参与「均分+PK」排序 */
    const arenaFormat = "round_robin_full" as const;
    const allUiMatches: BracketMatchRow[] = [];
    const tierSliceMap = new Map<DuelPoolTier, BracketTierSlice>();
    const boardsAcc: RrTierBoard[] = [];
    const eliminatedByTier = new Map<DuelPoolTier, Set<string>>();

    const tierPools: Record<DuelPoolTier, DuelCandidate[]> = {
      S: candidates.filter((c) => c.tier === "S"),
      A: candidates.filter((c) => c.tier === "A"),
      B: candidates.filter((c) => c.tier === "B"),
    };

    try {
      let idx = 0;

      const runCrossDuel = async (
        fa: string,
        fb: string,
        titleA: string,
        titleB: string,
        tag: string
      ) => {
        idx++;
        const matchId = `xt-${idx}`;
        const runningRow: BracketMatchRow = {
          id: matchId,
          status: "running",
          title: `${tag}${titleA} vs ${titleB}`,
          fileA: fa,
          fileB: fb,
          titleA,
          titleB,
        };
        allUiMatches.push(runningRow);
        setBracketRounds([{ round: 1, matches: [...allUiMatches] }]);

        const res = await submitDuel(
          adminWallet,
          {
            file_a: fa,
            file_b: fb,
            model,
            output_lang: outputLang,
            round_id: roundId ?? undefined,
          },
          ac.signal
        );

        const wf = parseDuelWinnerFile(res, fa, fb);
        if (!wf) {
          const errRow: BracketMatchRow = {
            ...runningRow,
            status: "error",
            error: "未能解析胜者（需 DUEL_WINNER: A/B）",
            response: res,
          };
          allUiMatches[allUiMatches.length - 1] = errRow;
          setBracketRounds([{ round: 1, matches: [...allUiMatches] }]);
          throw new Error("擂台中止：单场未解析胜者");
        }
        const winTitle = wf === fa ? titleA : titleB;
        const doneRow: BracketMatchRow = {
          ...runningRow,
          status: "done",
          winnerFile: wf,
          winnerLabel: winTitle,
          response: res,
        };
        allUiMatches[allUiMatches.length - 1] = doneRow;
        setBracketRounds([{ round: 1, matches: [...allUiMatches] }]);
      };

      const runIntraTierRoundRobin = async (tier: DuelPoolTier, pool: DuelCandidate[]) => {
        if (pool.length < 2) {
          eliminatedByTier.set(tier, new Set());
          return;
        }

        const roster = shuffle(
          pool.map((p) => ({ file_name: p.file_name, title: p.title }))
        );
        const files = roster.map((p) => p.file_name);
        const pairs = buildFullRoundRobinPairs(files);
        const tag = `[${tier}·单循环] `;
        const lossStreak = new Map<string, number>();
        for (const f of files) lossStreak.set(f, 0);
        const eliminated = new Set<string>();

        let rrIdx = 0;
        for (const [fa, fb] of pairs) {
          rrIdx++;
          const pa = roster.find((p) => p.file_name === fa)!;
          const pb = roster.find((p) => p.file_name === fb)!;
          const matchId = `${tier}-rr-${rrIdx}`;

          if (eliminated.has(fa) || eliminated.has(fb)) {
            const parts: string[] = [];
            if (eliminated.has(fa)) parts.push(pa.title);
            if (eliminated.has(fb)) parts.push(pb.title);
            const row: BracketMatchRow = {
              id: matchId,
              status: "skipped",
              title: `${tag}${pa.title} vs ${pb.title}`,
              fileA: fa,
              fileB: fb,
              titleA: pa.title,
              titleB: pb.title,
              error: `已跳过（${parts.join("、")} 已连续 ${LOSS_STREAK_ELIM} 场负出局），未调用模型`,
            };
            allUiMatches.push(row);
            setBracketRounds([{ round: 1, matches: [...allUiMatches] }]);
            continue;
          }

          const runningRow: BracketMatchRow = {
            id: matchId,
            status: "running",
            title: `${tag}${pa.title} vs ${pb.title}`,
            fileA: fa,
            fileB: fb,
            titleA: pa.title,
            titleB: pb.title,
          };
          allUiMatches.push(runningRow);
          setBracketRounds([{ round: 1, matches: [...allUiMatches] }]);

          const res = await submitDuel(
            adminWallet,
            {
              file_a: fa,
              file_b: fb,
              model,
              output_lang: outputLang,
              round_id: roundId ?? undefined,
            },
            ac.signal
          );

          const wf = parseDuelWinnerFile(res, fa, fb);
          if (!wf) {
            const errRow: BracketMatchRow = {
              ...runningRow,
              status: "error",
              error: "未能解析胜者（需 DUEL_WINNER: A/B）",
              response: res,
            };
            allUiMatches[allUiMatches.length - 1] = errRow;
            setBracketRounds([{ round: 1, matches: [...allUiMatches] }]);
            throw new Error("擂台中止：单场未解析胜者");
          }

          const winner = wf === fa ? pa : pb;
          const loserFile = wf === fa ? fb : fa;
          lossStreak.set(wf, 0);
          const nextStreak = (lossStreak.get(loserFile) ?? 0) + 1;
          lossStreak.set(loserFile, nextStreak);
          if (nextStreak >= LOSS_STREAK_ELIM) eliminated.add(loserFile);

          const doneRow: BracketMatchRow = {
            ...runningRow,
            status: "done",
            winnerFile: wf,
            winnerLabel: winner.title,
            response: res,
          };
          allUiMatches[allUiMatches.length - 1] = doneRow;
          setBracketRounds([{ round: 1, matches: [...allUiMatches] }]);
        }

        eliminatedByTier.set(tier, new Set(eliminated));
      };

      /* 自下而上跨档顺序不变；「单循环起点」决定 B/A 是否跑同档 RR（其下档用均分代表） */
      const runBrr = autoRrStartTier === "B";
      const runArr = autoRrStartTier === "B" || autoRrStartTier === "A";

      if (runBrr) {
        await runIntraTierRoundRobin("B", tierPools.B);
      } else if (tierPools.B.length >= 2) {
        eliminatedByTier.set("B", new Set());
      }

      const bLeader =
        tierPools.B.length === 0
          ? null
          : tierPools.B.length === 1
            ? tierPools.B[0]!
            : runBrr
              ? pickPkLeaderFromMatches(
                  tierPools.B,
                  allUiMatches,
                  (m) => m.title.startsWith("[B·单循环] ")
                )
              : strongestInTier(tierPools.B);

      if (bLeader && tierPools.A.length > 0) {
        for (const a of shuffle([...tierPools.A])) {
          await runCrossDuel(
            a.file_name,
            bLeader.file_name,
            a.title,
            bLeader.title,
            `[跨档 A×B] `
          );
        }
      }

      if (runArr) {
        await runIntraTierRoundRobin("A", tierPools.A);
      } else if (tierPools.A.length >= 2) {
        eliminatedByTier.set("A", new Set());
      }

      const aLeader =
        tierPools.A.length === 0
          ? null
          : tierPools.A.length === 1
            ? tierPools.A[0]!
            : runArr
              ? pickPkLeaderFromMatches(
                  tierPools.A,
                  allUiMatches,
                  (m) =>
                    m.title.startsWith("[跨档 A×B] ") ||
                    m.title.startsWith("[A·单循环] ")
                )
              : pickPkLeaderFromMatches(
                  tierPools.A,
                  allUiMatches,
                  (m) => m.title.startsWith("[跨档 A×B] ")
                );

      if (aLeader && tierPools.S.length > 0) {
        for (const s of shuffle([...tierPools.S])) {
          await runCrossDuel(
            s.file_name,
            aLeader.file_name,
            s.title,
            aLeader.title,
            `[跨档 S×A] `
          );
        }
      }

      await runIntraTierRoundRobin("S", tierPools.S);

      const finishedRounds: BracketRound[] = [{ round: 1, matches: allUiMatches }];
      const stored = serializeBracketRounds(
        finishedRounds as { round: number; matches: Array<Record<string, unknown>> }[]
      );

      for (const tier of TIER_LADDER_BOTTOM_UP) {
        const pool = tierPools[tier];
        if (pool.length === 0) continue;
        const files = pool.map((p) => p.file_name);
        const ranked = rankedFileNamesByPkWins(files, stored);
        const tierMatches = stored.filter(
          (m) =>
            (m.fileA && files.includes(m.fileA)) || (m.fileB && files.includes(m.fileB))
        );
        tierSliceMap.set(tier, {
          arenaFormat,
          rankedFileNames: ranked,
          matches: tierMatches,
        });

        const titleOf = (fn: string) => pool.find((p) => p.file_name === fn)?.title ?? fn;
        const eliminatedSet = eliminatedByTier.get(tier) ?? new Set<string>();
        const winCount = new Map<string, number>();
        for (const f of files) winCount.set(f, 0);
        for (const m of allUiMatches) {
          if (m.status !== "done" || !m.winnerFile) continue;
          if (winCount.has(m.winnerFile)) {
            winCount.set(m.winnerFile, (winCount.get(m.winnerFile) ?? 0) + 1);
          }
        }
        const board = [...winCount.entries()]
          .map(([fn, wins]) => ({
            title: titleOf(fn),
            wins,
            eliminated: eliminatedSet.has(fn),
          }))
          .sort((a, b) => {
            if (b.wins !== a.wins) return b.wins - a.wins;
            if (a.eliminated !== b.eliminated) return Number(a.eliminated) - Number(b.eliminated);
            return a.title.localeCompare(b.title, "zh-Hans-CN");
          });
        boardsAcc.push({ tier, rows: board });
        setRrTierBoards([...boardsAcc]);
      }

      const orderedWithData = TIER_AUTORUN_PRIORITY.filter((t) => tierSliceMap.has(t));
      if (orderedWithData.length === 0) {
        setErr("没有可参与的 S、A、B 档项目");
        return;
      }
      const primaryTier = orderedWithData[0]!;
      const primarySlice = tierSliceMap.get(primaryTier)!;
      const otherPoolTiers: Partial<Record<DuelPoolTier, BracketTierSlice>> = {};
      for (const t of orderedWithData) {
        if (t === primaryTier) continue;
        otherPoolTiers[t] = tierSliceMap.get(t)!;
      }
      const rid = (roundId ?? "").trim();
      const tid = (duelTrackId ?? "").trim();
      const saved = saveDuelBracketSnapshot({
        poolTier: primaryTier,
        roundId: rid,
        ...(tid ? { trackId: tid } : {}),
        arenaFormat: primarySlice.arenaFormat,
        rankedFileNames: primarySlice.rankedFileNames,
        matches: stored,
        otherPoolTiers: Object.keys(otherPoolTiers).length ? otherPoolTiers : undefined,
      });
      if (saved && adminWallet && rid) {
        void putDuelBracketSnapshotToServer(adminWallet, rid, saved).catch((e) => {
          toast.error(
            e instanceof Error ? e.message : "擂台结果已写入本机，同步服务器失败，请检查网络或稍后重试"
          );
        });
      }
      setBracketRounds([{ round: 1, matches: allUiMatches }]);
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") {
        setErr("已中止");
      } else {
        setErr(e instanceof Error ? e.message : "擂台赛失败");
      }
    } finally {
      const t0 = bracketTimerStartRef.current;
      if (t0 != null) {
        setLastBracketDurationMs(Date.now() - t0);
        bracketTimerStartRef.current = null;
      }
      setAutoRunning(false);
      if (abortRef.current === ac) abortRef.current = null;
    }
  };

  const hasDuelTiers = candidates.length > 0;

  const onModeChange = (v: DuelMode) => {
    setDuelMode(v);
    setResult(null);
    setBracketRounds([]);
    setRrTierBoards(null);
    setErr(null);
    bracketTimerStartRef.current = null;
    setLastBracketDurationMs(null);
  };

  return (
    <div className="border border-primary/30 bg-primary/5 p-4 space-y-4 mb-6">
      <div>
        <h3 className="text-sm font-bold text-primary tracking-wide">擂台 · AI 两两评比</h3>
        {(duelTrackId ?? "").trim() ? (
          <p className="text-[11px] text-accent/90 mt-0.5 font-mono">
            track_id={(duelTrackId ?? "").trim()}（与同页排名列表口径一致，与其它赛道擂台互不干扰）
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground mt-1">
          使用两份 README 全文，按<strong className="text-foreground/80"> 创新性 / 技术实现 / 商业价值 / 用户体验 / 落地可行性 </strong>
          五维逐维对比；<strong className="text-foreground/80">至少赢得 3 个维度</strong>者为本场胜者（胜 +1 PK 分，负 0）。模型输出末尾含机器可读行。
          <strong className="text-foreground/80">手动模式</strong>：在「档位池」自选 S、A、B，同档内任选两项对决。
          <strong className="text-foreground/80">自动跨档多擂台</strong>：按<strong className="text-foreground/80"> B → A → S </strong>
          自下而上推进。可在界面选择<strong className="text-foreground/80">「单循环起点」</strong>：从<strong className="text-foreground/80"> B </strong>起则三档都跑完整单循环（最彻底，但 B 人多时最耗 token）；从<strong className="text-foreground/80"> A </strong>或<strong className="text-foreground/80"> S </strong>起则跳过更低档的单循环，该档跨档代表改为<strong className="text-foreground/80"> 五维均分领先项</strong>。
          凡实际跑了单循环的档：≥2 人、<strong className="text-foreground/80"> 三连败淘汰</strong>、代表优先按<strong className="text-foreground/80"> PK 胜场</strong>（平手再比均分）。跨档仍为 B 代表对 A 全员、再 A 代表对 S 全员，最后 S 档单循环（≥2 人）。仅 1 人的档不跑单循环。
          排名页同档按<strong className="text-foreground/80"> AI 基础均分 + PK 胜场 </strong>排序。
        </p>
      </div>

      {!enabled && (
        <p className="text-xs text-muted-foreground">请连接管理员钱包后使用。</p>
      )}

      {enabled && !hasDuelTiers && (
        <p className="text-xs text-muted-foreground">
          当前排名中没有 S、A、B 档项目（或五维尚未解析完整），无法使用擂台。
        </p>
      )}

      {enabled && hasDuelTiers && duelMode === "manual" && poolProjects.length < 2 && (
        <p className="text-xs text-muted-foreground">
          当前「{poolTier} 档」项目不足 2 个，请切换档位或等待评审解析后再试。
        </p>
      )}

      {enabled && hasDuelTiers && duelMode === "auto" && !hasAutorunPool && (
        <p className="text-xs text-muted-foreground">
          自动擂台需至少有一个 S、A、B 档项目；当前不满足，请等待评审解析后再试。
        </p>
      )}

      {enabled && hasDuelTiers && poolProjects.length >= 2 && duelMode === "manual" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs">项目 A（README 文件）</Label>
            <Select value={fileA || undefined} onValueChange={setFileA} disabled={busy}>
              <SelectTrigger className="text-xs font-mono">
                <SelectValue placeholder="选择文件 A" />
              </SelectTrigger>
              <SelectContent>
                {poolProjects.map((p) => (
                  <SelectItem key={p.file_name} value={p.file_name} className="text-xs font-mono">
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">项目 B（README 文件）</Label>
            <Select value={fileB || undefined} onValueChange={setFileB} disabled={busy}>
              <SelectTrigger className="text-xs font-mono">
                <SelectValue placeholder="选择文件 B" />
              </SelectTrigger>
              <SelectContent>
                {poolProjects.map((p) => (
                  <SelectItem key={`b-${p.file_name}`} value={p.file_name} className="text-xs font-mono">
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {enabled && hasDuelTiers && (
        <div className="flex flex-wrap gap-4 items-end">
          {duelMode === "manual" ? (
            <div className="space-y-2 w-24">
              <Label className="text-xs">档位池</Label>
              <Select
                value={poolTier}
                onValueChange={(v) => setPoolTier(v as DuelPoolTier)}
                disabled={busy}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="S">S</SelectItem>
                  <SelectItem value="A">A</SelectItem>
                  <SelectItem value="B">B</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="space-y-1 min-w-[14rem] max-w-[24rem]">
              <Label className="text-xs">单循环起点（跨档顺序仍为 B→A→S）</Label>
              <Tabs
                value={autoRrStartTier}
                onValueChange={(v) => setAutoRrStartTier(v as AutoRrStartTier)}
                className="w-full"
              >
                <TabsList className="grid h-8 w-full grid-cols-3 gap-0.5 p-0.5 text-[10px]">
                  <TabsTrigger value="B" className="px-1 py-1 text-[10px]" disabled={busy}>
                    自 B 档
                  </TabsTrigger>
                  <TabsTrigger value="A" className="px-1 py-1 text-[10px]" disabled={busy}>
                    自 A 档
                  </TabsTrigger>
                  <TabsTrigger value="S" className="px-1 py-1 text-[10px]" disabled={busy}>
                    自 S 档
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <p className="text-[9px] text-muted-foreground leading-snug">
                {autoRrStartTier === "B" &&
                  "三档均单循环。适合低档人数少、要全盘 PK 定代表。"}
                {autoRrStartTier === "A" &&
                  "跳过 B 档单循环，B 代表＝均分领先。适合 B 档极多、省 token。"}
                {autoRrStartTier === "S" &&
                  "跳过 B、A 单循环，两档代表均＝均分领先；仅 S 档单循环，场次最少。"}
              </p>
              <ul className="text-[10px] text-muted-foreground space-y-0.5 rounded-md border border-border bg-muted/30 px-2 py-2">
                {TIER_LADDER_BOTTOM_UP.map((t) => {
                  const n = candidates.filter((c) => c.tier === t).length;
                  if (n === 0) return null;
                  const strong = strongestInTier(candidates.filter((c) => c.tier === t));
                  return (
                    <li key={t} className="flex flex-col gap-0.5 border-b border-border/30 last:border-0 pb-1 last:pb-0">
                      <span className="flex justify-between gap-2">
                        <span>{t} 档</span>
                        <span className="text-foreground/80 shrink-0">{n} 项</span>
                      </span>
                      {strong && (
                        <span className="text-[9px] text-foreground/70 line-clamp-2" title={strong.title}>
                          五维均分领先：{strong.title}（
                          {formatPrimaryScoreLabel(strong.avg_score, strong.rubric_raw_max)}）
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="text-[9px] text-muted-foreground mt-1 leading-snug">
                流程：（可选）B 单循环 → A 全 vs B 代表 →（可选）A 单循环 → S 全 vs A 代表 → S 单循环。未单循环的档，代表＝左栏均分领先。
              </p>
            </div>
          )}
          <div className="space-y-2 w-32">
            <Label className="text-xs">方式</Label>
            <Select value={duelMode} onValueChange={(v) => onModeChange(v as DuelMode)} disabled={busy}>
              <SelectTrigger className="text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">手动</SelectItem>
                <SelectItem value="auto">自动跨档擂台</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 w-40">
            <Label className="text-xs">模型</Label>
            <Select value={model} onValueChange={setModel} disabled={busy}>
              <SelectTrigger className="text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="deepseek">deepseek</SelectItem>
                <SelectItem value="doubao">doubao</SelectItem>
                <SelectItem value="openai">openai</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 w-32">
            <Label className="text-xs">输出语言</Label>
            <Select value={outputLang} onValueChange={(v) => setOutputLang(v as "zh" | "en")} disabled={busy}>
              <SelectTrigger className="text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zh">中文</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {duelMode === "manual" ? (
            <Button size="sm" disabled={!canRun || loading} onClick={run} className="font-bold tracking-wider">
              {loading ? "评审中…" : "开始对决"}
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                disabled={!canAutoStart}
                onClick={runAutoBracket}
                className="font-bold tracking-wider"
              >
                {autoRunning ? "擂台赛中…" : "开始擂台"}
              </Button>
              {autoRunning && (
                <Button size="sm" type="button" onClick={stopBracket} className="font-bold tracking-wider">
                  中止
                </Button>
              )}
            </>
          )}
          {duelMode === "auto" && (autoRunning || lastBracketDurationMs != null) && (
            <div className="w-full basis-full border border-border/60 bg-muted/20 px-3 py-2 text-xs">
              <span className="text-muted-foreground">擂台用时：</span>
              <span className="font-mono font-semibold text-primary tabular-nums">
                {bracketDurationSummary() ?? "—"}
              </span>
              {autoRunning && <span className="text-muted-foreground ml-2">（进行中）</span>}
              {!autoRunning && lastBracketDurationMs != null && rrTierBoards && rrTierBoards.length > 0 && (
                <span className="text-muted-foreground ml-2">（已完成积分局）</span>
              )}
              {!autoRunning && lastBracketDurationMs != null && (!rrTierBoards || rrTierBoards.length === 0) && (
                <span className="text-muted-foreground ml-2">（已结束）</span>
              )}
            </div>
          )}
        </div>
      )}

      {err && <p className="text-xs text-destructive">{err}</p>}

      {duelMode === "manual" && result && (
        <div className="border border-border bg-card/50 p-3 space-y-2 text-sm">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-muted-foreground text-xs">胜者（相对 A/B 标签）</span>
            <span className="font-bold text-primary uppercase">{result.winner || "（未解析到 DUEL_WINNER）"}</span>
            <span className="text-xs text-muted-foreground font-mono">model: {result.model}</span>
          </div>
          {result.reason?.trim() && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">理由摘要</div>
              <div className={`max-h-48 overflow-y-auto text-xs ${DUEL_MD_PROSE}`}>
                <ReactMarkdown>{result.reason}</ReactMarkdown>
              </div>
            </div>
          )}
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">完整模型输出</summary>
            <div className={`mt-2 p-2 bg-muted/30 max-h-64 overflow-y-auto ${DUEL_MD_PROSE}`}>
              <ReactMarkdown>{result.raw || ""}</ReactMarkdown>
            </div>
          </details>
        </div>
      )}

      {duelMode === "auto" && bracketRounds.length > 0 && (
        <div className="space-y-4">
          {bracketRounds.map((r) => (
            <details key={r.round} className="border border-border bg-card/50 p-3 text-sm group">
              <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground list-none flex items-center gap-2 [&::-webkit-details-marker]:hidden">
                <span className="text-muted-foreground group-open:hidden">▶</span>
                <span className="text-muted-foreground hidden group-open:inline">▼</span>
                <span>
                  第 {r.round} 轮 · {r.matches.length} 场
                </span>
              </summary>
              <div className="mt-3 space-y-0">
                {r.matches.map((m, idx) => (
                  <div
                    key={m.id}
                    className={`text-xs space-y-2 ${idx > 0 ? "border-t border-border/30 pt-3 mt-3" : ""}`}
                  >
                    <div className="text-foreground/90">{m.title}</div>
                    {m.status === "running" && (
                      <p className="text-muted-foreground">评审中…</p>
                    )}
                    {m.status === "bye" && (
                      <p className="text-muted-foreground">轮空晋级</p>
                    )}
                    {m.status === "done" && m.response && (
                      <>
                        <div className="flex flex-wrap gap-2 items-center">
                          <span className="text-muted-foreground text-xs">胜者</span>
                          <span className="font-bold text-primary">{m.winnerLabel}</span>
                          <span className="text-xs text-muted-foreground font-mono">model: {m.response.model}</span>
                        </div>
                        {m.response.reason?.trim() && (
                          <div>
                            <div className="text-xs text-muted-foreground mb-1">理由摘要</div>
                            <div className={`max-h-48 overflow-y-auto ${DUEL_MD_PROSE}`}>
                              <ReactMarkdown>{m.response.reason}</ReactMarkdown>
                            </div>
                          </div>
                        )}
                        <details className="text-xs">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                            完整模型输出
                          </summary>
                          <div className={`mt-2 p-2 bg-muted/30 max-h-64 overflow-y-auto ${DUEL_MD_PROSE}`}>
                            <ReactMarkdown>{m.response.raw || ""}</ReactMarkdown>
                          </div>
                        </details>
                      </>
                    )}
                    {m.status === "skipped" && (
                      <p className="text-muted-foreground">{m.error ?? "已跳过"}</p>
                    )}
                    {m.status === "error" && (
                      <p className="text-destructive">{m.error}</p>
                    )}
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}

      {duelMode === "auto" &&
        rrTierBoards &&
        rrTierBoards.length > 0 &&
        !autoRunning &&
        bracketRounds.length > 0 && (
          <div className="border border-border bg-card/50 p-3 space-y-4 text-sm">
            {rrTierBoards.map((tb) => (
              <div key={tb.tier}>
                <div className="text-xs font-semibold text-foreground/90">
                  {tb.tier} 档 · PK 胜场（排名 = AI 均分 + 此项）
                </div>
                <ul className="text-xs space-y-1 mt-2">
                  {tb.rows.map((row, i) => (
                    <li key={`${tb.tier}-${row.title}-${i}`} className="flex justify-between gap-2">
                      <span className="flex min-w-0 items-baseline gap-1.5">
                        <span
                          className={`truncate ${row.eliminated ? "text-muted-foreground line-through" : "text-foreground/90"}`}
                        >
                          {row.title}
                        </span>
                        {row.eliminated && (
                          <span className="text-destructive/90 shrink-0 text-[10px]">三连败淘汰｜不再出赛</span>
                        )}
                      </span>
                      <span className="font-mono text-primary shrink-0">{row.wins} 胜</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {lastBracketDurationMs != null && (
              <div className="text-xs text-muted-foreground pt-1 border-t border-border/40">
                全程耗时：<span className="font-mono text-foreground">{bracketDurationSummary()}</span>
              </div>
            )}
          </div>
        )}
    </div>
  );
}
