import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { submitDuel, type DuelResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import type { LetterTier } from "@/lib/dimensionTier";
import { parseDuelWinnerFile } from "@/lib/parseDuelWinner";
import {
  buildRankOrderFromBracket,
  serializeBracketRounds,
  saveDuelBracketSnapshot,
  loadDuelBracketSnapshot,
  type StoredDuelMatch,
} from "@/lib/duelBracketStorage";
import { putDuelBracketSnapshotToServer, syncDuelBracketFromServer } from "@/lib/duelBracketRemote";
import { toast } from "sonner";

export interface DuelProjectOption {
  file_name: string;
  title: string;
}

export type DuelPoolTier = Extract<LetterTier, "S" | "A" | "B">;

export interface DuelCandidate extends DuelProjectOption {
  tier: DuelPoolTier;
}

type DuelMode = "manual" | "auto";

type MatchStatus = "pending" | "running" | "done" | "error" | "bye";

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

/** 把本场胜负插到名次前部（二者从原序去掉），与自动淘汰赛快照格式兼容 */
function mergePairIntoRankedOrder(ranked: string[], winner: string, loser: string): string[] {
  const rest = ranked.filter((f) => f !== winner && f !== loser);
  return [winner, loser, ...rest];
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
  adminWallet: string
): void {
  const wf = parseDuelWinnerFile(res, fileA, fileB);
  if (!wf) return;
  const loser = wf === fileA ? fileB : fileA;
  const rid = (roundId ?? "").trim();
  if (!rid || !adminWallet) return;

  const titleA = poolProjects.find((p) => p.file_name === fileA)?.title ?? fileA;
  const titleB = poolProjects.find((p) => p.file_name === fileB)?.title ?? fileB;
  const winnerLabel = wf === fileA ? titleA : titleB;

  const existing = loadDuelBracketSnapshot(rid);
  const canMerge =
    existing &&
    existing.poolTier === poolTier &&
    (existing.roundId ?? "").trim() === rid;

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
  const rankedFileNames = canMerge
    ? mergePairIntoRankedOrder(existing.rankedFileNames, wf, loser)
    : [wf, loser];

  const saved = saveDuelBracketSnapshot({
    poolTier,
    roundId: rid,
    rankedFileNames,
    matches,
  });
  if (saved) {
    void putDuelBracketSnapshotToServer(adminWallet, rid, saved).catch((e) => {
      toast.error(
        e instanceof Error ? e.message : "擂台结果已写入本机，同步服务器失败，请检查网络或稍后重试"
      );
    });
  }
}

export default function STierDuelPanel({ candidates, adminWallet, enabled, roundId }: Props) {
  const [poolTier, setPoolTier] = useState<DuelPoolTier>("S");
  const [duelMode, setDuelMode] = useState<DuelMode>("manual");
  const [fileA, setFileA] = useState<string>("");
  const [fileB, setFileB] = useState<string>("");
  const [model, setModel] = useState<string>("deepseek");
  const [outputLang, setOutputLang] = useState<"zh" | "en">("zh");
  const [loading, setLoading] = useState(false);
  const [autoRunning, setAutoRunning] = useState(false);
  const [result, setResult] = useState<DuelResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [bracketRounds, setBracketRounds] = useState<BracketRound[]>([]);
  const [champion, setChampion] = useState<DuelProjectOption | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const bracketTimerStartRef = useRef<number | null>(null);
  const [bracketTimerTick, setBracketTimerTick] = useState(0);
  const [lastBracketDurationMs, setLastBracketDurationMs] = useState<number | null>(null);

  const poolProjects = useMemo(
    () =>
      candidates
        .filter((c) => c.tier === poolTier)
        .map(({ file_name, title }) => ({ file_name, title })),
    [candidates, poolTier]
  );

  useEffect(() => {
    setFileA("");
    setFileB("");
    setResult(null);
    setErr(null);
    setBracketRounds([]);
    setChampion(null);
    bracketTimerStartRef.current = null;
    setLastBracketDurationMs(null);
  }, [poolTier]);

  useEffect(() => {
    const rid = (roundId ?? "").trim();
    if (!rid) return;
    void syncDuelBracketFromServer(rid);
  }, [roundId]);

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
    enabled && !!adminWallet && poolProjects.length >= 2 && duelMode === "auto" && !busy;

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
      persistManualDuelSnapshot(poolTier, roundId, fileA, fileB, res, poolProjects, adminWallet);
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
    setChampion(null);

    type Row = DuelProjectOption;
    let roster: Row[] = shuffle(poolProjects.map((p) => ({ ...p })));
    let roundNum = 1;
    const finishedRounds: BracketRound[] = [];

    try {
      while (roster.length > 1) {
        const matches: BracketMatchRow[] = [];
        const nextRoster: Row[] = [];
        let i = 0;

        while (i < roster.length) {
          if (i === roster.length - 1) {
            const sole = roster[i];
            matches.push({
              id: `r${roundNum}-bye-${i}`,
              status: "bye",
              title: `${sole.title} 轮空晋级`,
              winnerFile: sole.file_name,
              titleA: sole.title,
            });
            nextRoster.push(sole);
            i += 1;
            setBracketRounds([...finishedRounds, { round: roundNum, matches: [...matches] }]);
            continue;
          }

          const pa = roster[i];
          const pb = roster[i + 1];
          const matchId = `r${roundNum}-m${matches.length}`;
          matches.push({
            id: matchId,
            status: "running",
            title: `${pa.title} vs ${pb.title}`,
            fileA: pa.file_name,
            fileB: pb.file_name,
            titleA: pa.title,
            titleB: pb.title,
          });
          setBracketRounds([...finishedRounds, { round: roundNum, matches: [...matches] }]);

          const res = await submitDuel(
            adminWallet,
            {
              file_a: pa.file_name,
              file_b: pb.file_name,
              model,
              output_lang: outputLang,
              round_id: roundId ?? undefined,
            },
            ac.signal
          );

          const wf = parseDuelWinnerFile(res, pa.file_name, pb.file_name);
          if (!wf) {
            matches[matches.length - 1] = {
              ...matches[matches.length - 1],
              status: "error",
              error: "未能解析胜者（需 DUEL_WINNER: A/B）",
              response: res,
            };
            setBracketRounds([...finishedRounds, { round: roundNum, matches: [...matches] }]);
            throw new Error("淘汰赛中止：单场未解析胜者");
          }

          const winner = wf === pa.file_name ? pa : pb;
          matches[matches.length - 1] = {
            ...matches[matches.length - 1],
            status: "done",
            winnerFile: wf,
            winnerLabel: winner.title,
            response: res,
          };
          nextRoster.push(winner);
          setBracketRounds([...finishedRounds, { round: roundNum, matches: [...matches] }]);
          i += 2;
        }

        finishedRounds.push({ round: roundNum, matches });
        setBracketRounds([...finishedRounds]);
        roster = nextRoster;
        roundNum += 1;
      }

      const champ = roster[0] ?? null;
      setChampion(champ);
      if (champ && finishedRounds.length > 0) {
        const ranked = buildRankOrderFromBracket(finishedRounds, champ.file_name);
        const rid = (roundId ?? "").trim();
        const saved = saveDuelBracketSnapshot({
          poolTier,
          roundId: rid,
          rankedFileNames: ranked,
          matches: serializeBracketRounds(
            finishedRounds as { round: number; matches: Array<Record<string, unknown>> }[]
          ),
        });
        if (saved && adminWallet && rid) {
          void putDuelBracketSnapshotToServer(adminWallet, rid, saved).catch((e) => {
            toast.error(
              e instanceof Error ? e.message : "擂台结果已写入本机，同步服务器失败，请检查网络或稍后重试"
            );
          });
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") {
        setErr("已中止");
      } else {
        setErr(e instanceof Error ? e.message : "淘汰赛失败");
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
    setChampion(null);
    setErr(null);
    bracketTimerStartRef.current = null;
    setLastBracketDurationMs(null);
  };

  return (
    <div className="border border-primary/30 bg-primary/5 p-4 space-y-4 mb-6">
      <div>
        <h3 className="text-sm font-bold text-primary tracking-wide">擂台 · AI 两两评比（同档位内）</h3>
        <p className="text-xs text-muted-foreground mt-1">
          使用两份 README 全文，按<strong className="text-foreground/80"> 创新性 / 技术实现 / 商业价值 / 用户体验 / 落地可行性 </strong>
          五维逐维对比；<strong className="text-foreground/80">至少赢得 3 个维度</strong>的项目为本场胜者。模型输出末尾含机器可读行；排行榜展示五维胜负表与完整分析正文（管理员接口，需连接管理员钱包）。选择
          S / A / B 档位池；手动对决或自动单败淘汰直至冠军。
        </p>
      </div>

      {!enabled && (
        <p className="text-xs text-muted-foreground">请连接管理员钱包后使用。</p>
      )}

      {enabled && !hasDuelTiers && (
        <p className="text-xs text-muted-foreground">当前排名中没有 S / A / B 档项目（或五维尚未解析完整），无法使用擂台。</p>
      )}

      {enabled && hasDuelTiers && poolProjects.length < 2 && (
        <p className="text-xs text-muted-foreground">
          当前「{poolTier} 档」项目不足 2 个，请切换档位或等待评审解析后再试。
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
          <div className="space-y-2 w-32">
            <Label className="text-xs">方式</Label>
            <Select value={duelMode} onValueChange={(v) => onModeChange(v as DuelMode)} disabled={busy}>
              <SelectTrigger className="text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">手动</SelectItem>
                <SelectItem value="auto">自动淘汰</SelectItem>
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
                {autoRunning ? "淘汰赛中…" : "开始淘汰赛"}
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
              <span className="text-muted-foreground">淘汰赛用时：</span>
              <span className="font-mono font-semibold text-primary tabular-nums">
                {bracketDurationSummary() ?? "—"}
              </span>
              {autoRunning && <span className="text-muted-foreground ml-2">（进行中）</span>}
              {!autoRunning && lastBracketDurationMs != null && champion && (
                <span className="text-muted-foreground ml-2">（已产生冠军）</span>
              )}
              {!autoRunning && lastBracketDurationMs != null && !champion && (
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

      {duelMode === "auto" && champion && !autoRunning && bracketRounds.length > 0 && (
        <div className="border border-border bg-card/50 p-3 space-y-2 text-sm">
          <div className="text-xs text-muted-foreground">冠军</div>
          <div className="font-bold text-primary text-sm">{champion.title}</div>
          {lastBracketDurationMs != null && (
            <div className="text-xs text-muted-foreground">
              全程耗时：<span className="font-mono text-foreground">{bracketDurationSummary()}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
