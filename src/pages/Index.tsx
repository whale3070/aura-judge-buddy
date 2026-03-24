import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  fetchFilesAPI,
  submitAuditAPI,
  fetchRankingsAPI,
  fetchAdminConfigAPI,
  fetchFileTitlesAPI,
  fetchFileForkStatusesAPI,
  fetchRuleVersionsAPI,
  type AuditReport,
  type SavedResult,
  type RuleVersionMeta,
  effectiveRoundIdFromSearchParam,
  roundNavSuffix,
} from "@/lib/apiClient";
import JudgeDetail from "@/components/JudgeDetail";
import ActiveRulePanel from "@/components/ActiveRulePanel";
import FileSelector from "@/components/FileSelector";
import ModelSelector from "@/components/ModelSelector";
import BatchControls from "@/components/BatchControls";
import ReportCard from "@/components/ReportCard";
import AuditIndeterminateProgress from "@/components/AuditIndeterminateProgress";
import GradeRankingPanel from "@/components/GradeRankingPanel";
import DuelLegacySnapshotBanner from "@/components/DuelLegacySnapshotBanner";
import { useI18n, LanguageToggle } from "@/lib/i18n";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  LEGACY_RULE_FILTER_VALUE,
  buildRuleFilterOptions,
  computeDefaultRuleFilterId,
  filterRankingsByRule,
} from "@/lib/rankingRuleFilter";

const COMMON_KEYWORDS = ["GoPlus","token security API","rug pull detection","address scan","contract risk scoring","honeypot detection","token risk API","address risk API"];
const BATCH_SINGLE_TIMEOUT_MS = 120000;

interface ReportEntry {
  id: string;
  fileName: string;
  avgScore: number | null;
  statusText: string;
  reports: AuditReport[];
  error?: string;
  open: boolean;
  ruleVersionId?: string;
  ruleSha256?: string;
  enableWebSearch?: boolean;
  outputLang?: "en" | "zh";
  searchQuery?: string;
  competitorResultsCount?: number;
  projectKeywords?: string[];
}

function extractAvgScore(reports: AuditReport[]): number | null {
  const nums = reports.map((r) => Number(r.score)).filter(Number.isFinite);
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

async function withTimeout<T>(p: Promise<T>, timeoutMs: number, onTimeout?: () => void): Promise<T> {
  let timer: number | undefined;
  try {
    return await Promise.race<T>([
      p,
      new Promise<T>((_, reject) => {
        timer = window.setTimeout(() => {
          onTimeout?.();
          reject(new Error(`timeout after ${Math.floor(timeoutMs / 1000)}s`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}

export default function Index() {
  const { t } = useI18n();
  const [searchParams] = useSearchParams();
  const roundQ = searchParams.get("round_id");
  const effectiveRound = effectiveRoundIdFromSearchParam(roundQ);
  const navSuffix = roundNavSuffix(roundQ);
  const [files, setFiles] = useState<string[]>([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState("");
  const [prompt, setPrompt] = useState("");
  const [selectedModels, setSelectedModels] = useState(["deepseek", "doubao"]);
  const [rankings, setRankings] = useState<SavedResult[]>([]);
  const [titleMap, setTitleMap] = useState<Record<string, string>>({});
  const [forkMap, setForkMap] = useState<Record<string, boolean>>({});
  const [rankingsLoading, setRankingsLoading] = useState(true);
  const [reports, setReports] = useState<ReportEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const [rejudgeAllRunning, setRejudgeAllRunning] = useState(false);
  const batchStopRef = useRef(false);
  const inflightAbortControllersRef = useRef<Set<AbortController>>(new Set());
  const [concurrency, setConcurrency] = useState(1);
  const [delayMs, setDelayMs] = useState(200);
  const [progress, setProgress] = useState({ done: 0, total: 0, started: 0 });
  const [batchStartedAtMs, setBatchStartedAtMs] = useState<number | null>(null);
  const [lastProgressAtMs, setLastProgressAtMs] = useState<number | null>(null);
  const [lastBatchDurationMs, setLastBatchDurationMs] = useState<number | null>(null);
  const [adminHash, setAdminHash] = useState<string | null>(null);
  const [enableWebSearch, setEnableWebSearch] = useState(true);
  const [projectKeywords, setProjectKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [outputLang, setOutputLang] = useState<"en" | "zh">("en");
  const [ruleFilterOverride, setRuleFilterOverride] = useState<string | undefined>(undefined);
  const [versionMetas, setVersionMetas] = useState<RuleVersionMeta[]>([]);
  const [adminWalletForDuel, setAdminWalletForDuel] = useState<string>("");

  useEffect(() => {
    setRuleFilterOverride(undefined);
  }, [roundQ]);

  const loadData = useCallback(async () => {
    const [f, r, t, fk, ver] = await Promise.all([
      fetchFilesAPI(roundQ).catch(() => []),
      fetchRankingsAPI(roundQ).catch(() => []),
      fetchFileTitlesAPI(roundQ).catch(() => ({} as Record<string, string>)),
      fetchFileForkStatusesAPI(roundQ).catch(() => ({} as Record<string, boolean>)),
      fetchRuleVersionsAPI(roundQ).catch(() => ({ versions: [] as RuleVersionMeta[] })),
    ]);
    setFiles(f);
    if (f.length > 0) setSelectedFile(f[0]);
    setFilesLoading(false);
    setRankings(r);
    setTitleMap(t);
    setForkMap(fk);
    setVersionMetas(ver.versions ?? []);
    setRankingsLoading(false);
  }, [roundQ]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    fetchAdminConfigAPI()
      .then((cfg) => setAdminHash(cfg.admin_hash ?? ""))
      .catch(() => setAdminHash(""));
  }, []);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("aura_admin_wallet") || "";
      setAdminWalletForDuel(saved);
    } catch {
      setAdminWalletForDuel("");
    }
  }, []);

  const addReport = (entry: ReportEntry) => {
    setReports((prev) => [entry, ...prev]);
  };

  const removeReport = (id: string) => {
    setReports((prev) => prev.filter((r) => r.id !== id));
  };

  const runSingleAudit = async () => {
    if (!selectedFile || selectedModels.length === 0) {
      toast.error(t("judge.selectFileAndModels"));
      return;
    }
    setRunning(true);
    const id = crypto.randomUUID();
    addReport({ id, fileName: selectedFile, avgScore: null, statusText: "RUNNING", reports: [], open: true });
    try {
      const data = await submitAuditAPI({
        target_file: selectedFile,
        custom_prompt: prompt,
        selected_models: selectedModels,
        output_lang: outputLang,
        enable_web_search: enableWebSearch || undefined,
        project_keywords: enableWebSearch ? projectKeywords : undefined,
        round_id: effectiveRound,
      });
      const avg = extractAvgScore(data.reports);
      removeReport(id);
      addReport({
        id: crypto.randomUUID(),
        fileName: selectedFile,
        avgScore: avg,
        statusText: "SINGLE_OK",
        reports: data.reports,
        open: true,
        ruleVersionId: data.rule_version_id,
        ruleSha256: data.rule_sha256,
        enableWebSearch,
        outputLang,
        searchQuery: data.search_query,
        competitorResultsCount: data.competitor_results_count,
        projectKeywords: enableWebSearch ? projectKeywords : undefined,
      });
      const r = await fetchRankingsAPI(roundQ);
      setRankings(r);
    } catch (err: any) {
      removeReport(id);
      addReport({ id: crypto.randomUUID(), fileName: selectedFile, avgScore: null, statusText: "SINGLE_FAIL", reports: [], error: err.message, open: true });
    }
    setRunning(false);
  };

  const runBatchAudit = async () => {
    if (selectedModels.length === 0) {
      toast.error(t("judge.selectFileAndModels"));
      return;
    }
    batchStopRef.current = false;
    setBatchRunning(true);
    const startedAt = Date.now();
    setBatchStartedAtMs(startedAt);
    setLastProgressAtMs(startedAt);
    setLastBatchDurationMs(null);
    let allFiles: string[] = [];
    try {
      allFiles = await fetchFilesAPI(roundQ);
    } catch {
      setBatchRunning(false);
      return;
    }
    let analyzed = new Set<string>();
    try {
      const r = await fetchRankingsAPI(roundQ);
      setRankings(r);
      analyzed = new Set(r.map((x) => x.file_name));
    } catch { /* continue */ }
    const pending = allFiles.filter((f) => !analyzed.has(f));
    const total = pending.length;
    let done = 0;
    let started = 0;
    setProgress({ done: 0, total, started: 0 });
    if (total === 0) {
      addReport({ id: crypto.randomUUID(), fileName: "[BATCH]", avgScore: null, statusText: "NO_PENDING_FILES", reports: [], open: false });
      setBatchRunning(false);
      return;
    }
    let index = 0;
    const worker = async (workerId: number) => {
      while (!batchStopRef.current) {
        const myIdx = index++;
        if (myIdx >= pending.length) return;
        const file = pending[myIdx];
        started++;
        setProgress({ done, total, started });
        addReport({ id: crypto.randomUUID(), fileName: file, avgScore: null, statusText: `WORKER#${workerId} START`, reports: [], open: false });
        const placeholderId = crypto.randomUUID();
        addReport({ id: placeholderId, fileName: file, avgScore: null, statusText: `WORKER#${workerId} RUNNING`, reports: [], open: false });
        const ac = new AbortController();
        inflightAbortControllersRef.current.add(ac);
        try {
          const data = await withTimeout(
            submitAuditAPI({
              target_file: file,
              custom_prompt: prompt,
              selected_models: selectedModels,
              output_lang: outputLang,
              enable_web_search: enableWebSearch || undefined,
              project_keywords: enableWebSearch ? projectKeywords : undefined,
              round_id: effectiveRound,
            }, ac.signal),
            BATCH_SINGLE_TIMEOUT_MS,
            () => ac.abort()
          );
          inflightAbortControllersRef.current.delete(ac);
          const avg = extractAvgScore(data.reports);
          removeReport(placeholderId);
          addReport({
            id: crypto.randomUUID(),
            fileName: file,
            avgScore: avg,
            statusText: `WORKER#${workerId} OK`,
            reports: data.reports,
            open: false,
            ruleVersionId: data.rule_version_id,
            ruleSha256: data.rule_sha256,
          });
        } catch (err: any) {
          removeReport(placeholderId);
          addReport({ id: crypto.randomUUID(), fileName: file, avgScore: null, statusText: `WORKER#${workerId} FAIL`, reports: [], error: err.message, open: false });
        } finally {
          inflightAbortControllersRef.current.delete(ac);
        }
        done++;
        setProgress({ done, total, started });
        setLastProgressAtMs(Date.now());
        if (done % 3 === 0 || done === total) {
          try {
            const r = await fetchRankingsAPI(roundQ);
            setRankings(r);
          } catch {
            /* */
          }
        }
        if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      }
    };
    await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i + 1)));
    setBatchRunning(false);
    setLastBatchDurationMs(Date.now() - startedAt);
    addReport({
      id: crypto.randomUUID(),
      fileName: `[BATCH]`,
      avgScore: null,
      statusText: batchStopRef.current ? "STOPPED" : "FINISHED",
      reports: [],
      open: false,
    });
    try {
      const r = await fetchRankingsAPI(roundQ);
      setRankings(r);
    } catch {
      /* */
    }
  };

  const runBatchRejudgeAll = async () => {
    if (selectedModels.length === 0) {
      toast.error(t("judge.selectFileAndModels"));
      return;
    }
    batchStopRef.current = false;
    setRejudgeAllRunning(true);
    const startedAt = Date.now();
    setBatchStartedAtMs(startedAt);
    setLastProgressAtMs(startedAt);
    setLastBatchDurationMs(null);
    let allFiles: string[] = [];
    try {
      allFiles = await fetchFilesAPI(roundQ);
    } catch {
      setRejudgeAllRunning(false);
      return;
    }
    const total = allFiles.length;
    let done = 0;
    let started = 0;
    setProgress({ done: 0, total, started: 0 });
    if (total === 0) {
      addReport({ id: crypto.randomUUID(), fileName: "[REJUDGE_ALL]", avgScore: null, statusText: "NO_FILES", reports: [], open: false });
      setRejudgeAllRunning(false);
      return;
    }
    let index = 0;
    const worker = async (workerId: number) => {
      while (!batchStopRef.current) {
        const myIdx = index++;
        if (myIdx >= allFiles.length) return;
        const file = allFiles[myIdx];
        started++;
        setProgress({ done, total, started });
        addReport({ id: crypto.randomUUID(), fileName: file, avgScore: null, statusText: `REJUDGE#${workerId} START`, reports: [], open: false });
        const placeholderId = crypto.randomUUID();
        addReport({ id: placeholderId, fileName: file, avgScore: null, statusText: `REJUDGE#${workerId} RUNNING`, reports: [], open: false });
        const ac = new AbortController();
        inflightAbortControllersRef.current.add(ac);
        try {
          const data = await withTimeout(
            submitAuditAPI({
              target_file: file,
              custom_prompt: prompt,
              selected_models: selectedModels,
              output_lang: outputLang,
              enable_web_search: enableWebSearch || undefined,
              project_keywords: enableWebSearch ? projectKeywords : undefined,
              round_id: effectiveRound,
            }, ac.signal),
            BATCH_SINGLE_TIMEOUT_MS,
            () => ac.abort()
          );
          inflightAbortControllersRef.current.delete(ac);
          const avg = extractAvgScore(data.reports);
          removeReport(placeholderId);
          addReport({
            id: crypto.randomUUID(),
            fileName: file,
            avgScore: avg,
            statusText: `REJUDGE#${workerId} OK`,
            reports: data.reports,
            open: false,
            ruleVersionId: data.rule_version_id,
            ruleSha256: data.rule_sha256,
          });
        } catch (err: any) {
          removeReport(placeholderId);
          addReport({ id: crypto.randomUUID(), fileName: file, avgScore: null, statusText: `REJUDGE#${workerId} FAIL`, reports: [], error: err.message, open: false });
        } finally {
          inflightAbortControllersRef.current.delete(ac);
        }
        done++;
        setProgress({ done, total, started });
        setLastProgressAtMs(Date.now());
        if (done % 3 === 0 || done === total) {
          try {
            const r = await fetchRankingsAPI(roundQ);
            setRankings(r);
          } catch {
            /* */
          }
        }
        if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      }
    };
    await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i + 1)));
    setRejudgeAllRunning(false);
    setLastBatchDurationMs(Date.now() - startedAt);
    addReport({
      id: crypto.randomUUID(),
      fileName: `[REJUDGE_ALL]`,
      avgScore: null,
      statusText: batchStopRef.current ? "STOPPED" : "FINISHED",
      reports: [],
      open: false,
    });
    try {
      const r = await fetchRankingsAPI(roundQ);
      setRankings(r);
    } catch {
      /* */
    }
  };

  const ruleOptions = useMemo(() => buildRuleFilterOptions(rankings, versionMetas), [rankings, versionMetas]);

  const stopBatchNow = () => {
    batchStopRef.current = true;
    inflightAbortControllersRef.current.forEach((ac) => ac.abort());
    inflightAbortControllersRef.current.clear();
    if (batchRunning || rejudgeAllRunning) {
      setBatchRunning(false);
      setRejudgeAllRunning(false);
      if (batchStartedAtMs != null) setLastBatchDurationMs(Date.now() - batchStartedAtMs);
      addReport({
        id: crypto.randomUUID(),
        fileName: `[BATCH]`,
        avgScore: null,
        statusText: "STOPPED",
        reports: [],
        open: false,
      });
    }
  };

  const effectiveRuleFilterId = useMemo(() => {
    if (ruleOptions.length === 0) return LEGACY_RULE_FILTER_VALUE;
    const ok = ruleFilterOverride != null && ruleOptions.some((o) => o.value === ruleFilterOverride);
    if (ok) return ruleFilterOverride!;
    return computeDefaultRuleFilterId(rankings, versionMetas);
  }, [ruleFilterOverride, ruleOptions, rankings, versionMetas]);

  const filteredRankings = useMemo(() => {
    if (ruleOptions.length === 0) return rankings;
    return filterRankingsByRule(rankings, effectiveRuleFilterId);
  }, [rankings, effectiveRuleFilterId, ruleOptions.length]);

  return (
    <div className="min-h-screen bg-background p-5 relative overflow-hidden">
      {/* Scanline */}
      <div className="pointer-events-none fixed inset-0 z-50">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.03] via-transparent to-primary/[0.03] animate-scanline" />
      </div>

      <div className="max-w-[1100px] mx-auto border border-primary/40 p-8 shadow-[0_0_30px_hsl(var(--primary)/0.1)] bg-card relative">
        <div className="flex justify-end mb-2">
          <LanguageToggle />
        </div>
        <h1 className="text-center text-4xl font-display font-bold text-primary drop-shadow-[0_0_10px_hsl(var(--primary)/0.5)] animate-flicker mb-1">
          ⚖️ AURA JUDGMENT SYSTEM
        </h1>
        <p className="text-center text-xs text-muted-foreground mb-4 pb-2.5 border-b border-border">
          PREDICTIVE AUDIT ENGINE // 2026 VER. // MULTI-AGENT HACKATHON JUDGE
        </p>
        {effectiveRound ? (
          <p className="text-center text-[11px] font-mono text-accent mb-2">
            round_id={effectiveRound}
          </p>
        ) : null}

        <div className="flex justify-center gap-3 mb-6">
          <Link
            to={`/submit${navSuffix}`}
            className="text-xs border border-primary/40 px-4 py-2 text-primary hover:bg-primary/10 hover:shadow-[0_0_12px_hsl(var(--primary)/0.3)] transition-all"
          >
            {t("nav.submitProject")}
          </Link>
          <Link
            to={
              adminHash
                ? `/?h=${encodeURIComponent(adminHash)}${effectiveRound ? `&round_id=${encodeURIComponent(effectiveRound)}` : ""}`
                : "/"
            }
            className="text-xs border border-secondary/40 px-4 py-2 text-secondary hover:bg-secondary/10 hover:shadow-[0_0_12px_hsl(var(--secondary)/0.3)] transition-all"
          >
            {t("nav.adminPanel")}
          </Link>
          <Link
            to={`/ranking${navSuffix}`}
            className="text-xs border border-border px-4 py-2 text-muted-foreground hover:text-primary transition-all"
          >
            {t("nav.ranking")}
          </Link>
        </div>

        <ActiveRulePanel />
        <DuelLegacySnapshotBanner expectedRoundId={effectiveRound ?? ""} />
        <div className="mb-6">
          <GradeRankingPanel
            rankings={filteredRankings}
            loading={rankingsLoading}
            titleMap={titleMap}
            forkMap={forkMap}
            adminWallet={adminWalletForDuel || null}
            roundId={effectiveRound}
            showDuelPanel={true}
            onReauditDone={() => {
              void fetchRankingsAPI(roundQ).then(setRankings).catch(() => {});
            }}
          />
        </div>

        {/* judge 页面移除“终焉大盘”排行榜区，保留下方裁决操作区 */}

        <FileSelector files={files} selected={selectedFile} onChange={setSelectedFile} loading={filesLoading} />
        {/* Custom prompt (optional) */}
        <div className="mb-5">
          <label className="block mb-2.5 font-bold text-foreground/90 text-sm border-l-[3px] border-primary pl-2.5">
            {t("judge.customPromptLabel")}
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder={t("judge.customPromptPlaceholder")}
            className="w-full bg-muted border border-border text-foreground p-4 font-mono text-sm outline-none transition-all focus:border-primary focus:shadow-[var(--matrix-glow)] resize-y placeholder:text-muted-foreground"
          />
          <p className="text-xs text-muted-foreground mt-1.5">{t("judge.customPromptHint")}</p>
        </div>
        <ModelSelector selected={selectedModels} onChange={setSelectedModels} />

        {/* Competitor Search + Output Language */}
        <div className="border border-border p-4 mb-4 bg-muted/30 space-y-4">
          <div className="flex items-center gap-3">
            <Switch id="web-search" checked={enableWebSearch} onCheckedChange={setEnableWebSearch} />
            <Label htmlFor="web-search" className="text-sm font-bold text-foreground/90">
              {t("judge.competitorSearch")}
            </Label>
          </div>
          {enableWebSearch && (
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">{t("judge.competitorKeywords")}</Label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {projectKeywords.map((kw, i) => (
                  <Badge key={i} variant="secondary" className="cursor-pointer" onClick={() => setProjectKeywords(prev => prev.filter((_, j) => j !== i))}>
                    {kw} ✕
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  className="flex-1 bg-background border border-border px-2 py-1.5 text-sm text-foreground placeholder:text-muted-foreground"
                  placeholder={t("judge.keywordsPlaceholder")}
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && keywordInput.trim()) {
                      e.preventDefault();
                      const newKws = keywordInput.split(",").map(s => s.trim()).filter(Boolean);
                      setProjectKeywords(prev => [...new Set([...prev, ...newKws])]);
                      setKeywordInput("");
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => setProjectKeywords(prev => [...new Set([...prev, ...COMMON_KEYWORDS])])}
                  className="text-xs border border-primary/40 px-3 py-1.5 text-primary hover:bg-primary/10 transition-colors whitespace-nowrap"
                >
                  {t("judge.addCommonKeywords")}
                </button>
              </div>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Label className="text-xs text-muted-foreground">{t("judge.outputLang")}:</Label>
            <select
              value={outputLang}
              onChange={(e) => setOutputLang(e.target.value as "en" | "zh")}
              className="bg-background border border-border px-2 py-1 text-sm text-foreground"
            >
              <option value="en">{t("judge.langEn")}</option>
              <option value="zh">{t("judge.langZh")}</option>
            </select>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mb-2 border-l-2 border-primary/40 pl-2">
          {t("judge.rubricNote")}
        </p>
        <div className="flex gap-3 mb-2">
          <button
            onClick={runSingleAudit}
            disabled={running || batchRunning || rejudgeAllRunning}
            className="flex-1 bg-primary text-primary-foreground font-bold py-4 text-sm tracking-wider hover:shadow-[0_0_20px_hsl(var(--primary)/0.6)] hover:-translate-y-px transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running ? t("judge.singleRunning") : t("judge.singleBtn")}
          </button>
        </div>
        {running && (
          <div className="mb-4 border border-primary/35 bg-primary/[0.06] px-4 py-3 shadow-[0_0_16px_hsl(var(--primary)/0.12)]">
            <AuditIndeterminateProgress
              title={t("judge.singleProgressTitle")}
              hint={t("judge.singleProgressHint", { n: String(selectedModels.length) })}
            />
          </div>
        )}
        <div className="flex gap-3 mb-2">
          <button
            onClick={runBatchAudit}
            disabled={running || batchRunning || rejudgeAllRunning}
            className="flex-1 bg-primary text-primary-foreground font-bold py-4 text-sm tracking-wider hover:shadow-[0_0_20px_hsl(var(--primary)/0.6)] hover:-translate-y-px transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {batchRunning ? t("judge.batchRunning") : t("judge.batchBtn")}
          </button>
          <button
            onClick={runBatchRejudgeAll}
            disabled={running || batchRunning || rejudgeAllRunning}
            className="w-72 bg-secondary text-secondary-foreground font-bold py-4 text-sm tracking-wider hover:shadow-[0_0_18px_hsl(var(--secondary)/0.8)] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {rejudgeAllRunning ? "▶ 批量重评中..." : "批量重评（包含已有项目）"}
          </button>
          <button
            onClick={stopBatchNow}
            disabled={!batchRunning && !rejudgeAllRunning}
            className="w-56 bg-destructive text-destructive-foreground font-bold py-4 text-sm tracking-wider hover:shadow-[0_0_18px_hsl(var(--destructive)/0.8)] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {t("judge.stopBtn")}
          </button>
        </div>

        <BatchControls
          concurrency={concurrency}
          onConcurrencyChange={setConcurrency}
          delayMs={delayMs}
          onDelayChange={setDelayMs}
          progress={progress}
          isRunning={batchRunning || rejudgeAllRunning}
          startedAtMs={batchStartedAtMs}
          lastProgressAtMs={lastProgressAtMs}
          lastDurationMs={lastBatchDurationMs}
          onCollapseAll={() => setReports((r) => r.map((x) => ({ ...x, open: false })))}
          onExpandAll={() => setReports((r) => r.map((x) => ({ ...x, open: true })))}
          onClear={() => setReports([])}
        />

        <div className="mt-5 border-t border-border pt-5">
          {reports.length === 0 ? (
            <div className="text-muted-foreground text-sm">{t("judge.waitingInput")}</div>
          ) : (
            reports.map((r) => (
              <ReportCard
                key={r.id}
                fileName={r.fileName}
                avgScore={r.avgScore}
                statusText={r.statusText}
                reports={r.reports}
                error={r.error}
                defaultOpen={r.open}
                ruleVersionId={r.ruleVersionId}
                ruleSha256={r.ruleSha256}
                enableWebSearch={r.enableWebSearch}
                outputLang={r.outputLang}
                searchQuery={r.searchQuery}
                competitorResultsCount={r.competitorResultsCount}
                projectKeywords={r.projectKeywords}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
