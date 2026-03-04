import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import {
  fetchFilesAPI,
  submitAuditAPI,
  fetchRankingsAPI,
  fetchAdminConfigAPI,
  fetchFileTitlesAPI,
  type AuditReport,
  type SavedResult,
} from "@/lib/apiClient";
import JudgeDetail from "@/components/JudgeDetail";
import RankingTable from "@/components/RankingTable";
import ActiveRulePanel from "@/components/ActiveRulePanel";
import FileSelector from "@/components/FileSelector";
import ModelSelector from "@/components/ModelSelector";
import BatchControls from "@/components/BatchControls";
import ReportCard from "@/components/ReportCard";
import { useI18n, LanguageToggle } from "@/lib/i18n";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const COMMON_KEYWORDS = ["GoPlus","token security API","rug pull detection","address scan","contract risk scoring","honeypot detection","token risk API","address risk API"];

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

export default function Index() {
  const { t } = useI18n();
  const [files, setFiles] = useState<string[]>([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState("");
  const [prompt, setPrompt] = useState("");
  const [selectedModels, setSelectedModels] = useState(["deepseek", "doubao"]);
  const [rankings, setRankings] = useState<SavedResult[]>([]);
  const [titleMap, setTitleMap] = useState<Record<string, string>>({});
  const [rankingsLoading, setRankingsLoading] = useState(true);
  const [reports, setReports] = useState<ReportEntry[]>([]);
  const [selectedRankingFile, setSelectedRankingFile] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);
  const batchStopRef = useRef(false);
  const [concurrency, setConcurrency] = useState(1);
  const [delayMs, setDelayMs] = useState(200);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [adminHash, setAdminHash] = useState<string | null>(null);
  const [enableWebSearch, setEnableWebSearch] = useState(true);
  const [projectKeywords, setProjectKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState("");
  const [outputLang, setOutputLang] = useState<"en" | "zh">("en");

  const loadData = useCallback(async () => {
    const [f, r, t] = await Promise.all([
      fetchFilesAPI().catch(() => []),
      fetchRankingsAPI().catch(() => []),
      fetchFileTitlesAPI().catch(() => ({} as Record<string, string>)),
    ]);
    setFiles(f);
    if (f.length > 0) setSelectedFile(f[0]);
    setFilesLoading(false);
    setRankings(r);
    setTitleMap(t);
    setRankingsLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    fetchAdminConfigAPI()
      .then((cfg) => setAdminHash(cfg.admin_hash ?? ""))
      .catch(() => setAdminHash(""));
  }, []);

  const addReport = (entry: ReportEntry) => {
    setReports((prev) => [entry, ...prev]);
  };

  const removeReport = (id: string) => {
    setReports((prev) => prev.filter((r) => r.id !== id));
  };

  const runSingleAudit = async () => {
    if (!selectedFile || selectedModels.length === 0) return;
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
      });
      const r = await fetchRankingsAPI();
      setRankings(r);
    } catch (err: any) {
      removeReport(id);
      addReport({ id: crypto.randomUUID(), fileName: selectedFile, avgScore: null, statusText: "SINGLE_FAIL", reports: [], error: err.message, open: true });
    }
    setRunning(false);
  };

  const runBatchAudit = async () => {
    if (selectedModels.length === 0) return;
    batchStopRef.current = false;
    setBatchRunning(true);
    let allFiles: string[] = [];
    try { allFiles = await fetchFilesAPI(); } catch { setBatchRunning(false); return; }
    let analyzed = new Set<string>();
    try {
      const r = await fetchRankingsAPI();
      setRankings(r);
      analyzed = new Set(r.map((x) => x.file_name));
    } catch { /* continue */ }
    const pending = allFiles.filter((f) => !analyzed.has(f));
    const total = pending.length;
    let done = 0;
    setProgress({ done: 0, total });
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
        const placeholderId = crypto.randomUUID();
        addReport({ id: placeholderId, fileName: file, avgScore: null, statusText: `WORKER#${workerId} RUNNING`, reports: [], open: false });
        try {
          const data = await submitAuditAPI({
            target_file: file,
            custom_prompt: prompt,
            selected_models: selectedModels,
            output_lang: outputLang,
            enable_web_search: enableWebSearch || undefined,
            project_keywords: enableWebSearch ? projectKeywords : undefined,
          });
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
        }
        done++;
        setProgress({ done, total });
        if (done % 3 === 0 || done === total) {
          try { const r = await fetchRankingsAPI(); setRankings(r); } catch { /* */ }
        }
        if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      }
    };
    await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i + 1)));
    setBatchRunning(false);
    addReport({
      id: crypto.randomUUID(),
      fileName: `[BATCH]`,
      avgScore: null,
      statusText: batchStopRef.current ? "STOPPED" : "FINISHED",
      reports: [],
      open: false,
    });
    try { const r = await fetchRankingsAPI(); setRankings(r); } catch { /* */ }
  };

  // Convert SavedResult[] to RankingItem-like for RankingTable
  const rankingItems = rankings.map(r => ({
    file_name: r.file_name,
    avg_score: r.avg_score,
    timestamp: r.timestamp,
    rule_version_id: r.rule_version_id,
    rule_sha256: r.rule_sha256,
    competitor_results_count: r.competitor_results_count,
  }));

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

        <div className="flex justify-center gap-3 mb-6">
          <Link
            to="/submit"
            className="text-xs border border-primary/40 px-4 py-2 text-primary hover:bg-primary/10 hover:shadow-[0_0_12px_hsl(var(--primary)/0.3)] transition-all"
          >
            {t("nav.submitProject")}
          </Link>
          <Link
            to={adminHash ? `/?h=${encodeURIComponent(adminHash)}` : "/"}
            className="text-xs border border-secondary/40 px-4 py-2 text-secondary hover:bg-secondary/10 hover:shadow-[0_0_12px_hsl(var(--secondary)/0.3)] transition-all"
          >
            {t("nav.adminPanel")}
          </Link>
        </div>

        <ActiveRulePanel />

        <RankingTable
          rankings={rankingItems}
          loading={rankingsLoading}
          selectedFile={selectedRankingFile ?? undefined}
          onSelect={(f) => setSelectedRankingFile(f === selectedRankingFile ? null : f)}
          titleMap={titleMap}
        />

        {selectedRankingFile && (
          <JudgeDetail fileName={selectedRankingFile} onClose={() => setSelectedRankingFile(null)} />
        )}

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
            disabled={running || batchRunning}
            className="flex-1 bg-primary text-primary-foreground font-bold py-4 text-sm tracking-wider hover:shadow-[0_0_20px_hsl(var(--primary)/0.6)] hover:-translate-y-px transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running ? t("judge.singleRunning") : t("judge.singleBtn")}
          </button>
        </div>
        <div className="flex gap-3 mb-2">
          <button
            onClick={runBatchAudit}
            disabled={running || batchRunning}
            className="flex-1 bg-primary text-primary-foreground font-bold py-4 text-sm tracking-wider hover:shadow-[0_0_20px_hsl(var(--primary)/0.6)] hover:-translate-y-px transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {batchRunning ? t("judge.batchRunning") : t("judge.batchBtn")}
          </button>
          <button
            onClick={() => { batchStopRef.current = true; }}
            disabled={!batchRunning}
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
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
