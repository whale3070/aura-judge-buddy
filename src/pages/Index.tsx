import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { fetchFiles, submitAudit, fetchRankings, fetchAdminConfig, type AuditReport, type RankingItem } from "@/lib/api";
import JudgeDetail from "@/components/JudgeDetail";
import { JUDGE_PROMPT } from "@/lib/prompts";
import RankingTable from "@/components/RankingTable";
import FileSelector from "@/components/FileSelector";
import PromptEditor from "@/components/PromptEditor";
import ModelSelector from "@/components/ModelSelector";
import BatchControls from "@/components/BatchControls";
import ReportCard from "@/components/ReportCard";

interface ReportEntry {
  id: string;
  fileName: string;
  avgScore: number | null;
  statusText: string;
  reports: AuditReport[];
  error?: string;
  open: boolean;
}

function extractAvgScore(reports: AuditReport[]): number | null {
  const nums = reports.map((r) => Number(r.score)).filter(Number.isFinite);
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

export default function Index() {
  const [files, setFiles] = useState<string[]>([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState("");
  const [prompt, setPrompt] = useState(JUDGE_PROMPT);
  const [selectedModels, setSelectedModels] = useState(["deepseek", "doubao"]);
  const [rankings, setRankings] = useState<RankingItem[]>([]);
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

  const loadData = useCallback(async () => {
    try {
      const f = await fetchFiles();
      setFiles(f);
      if (f.length > 0) setSelectedFile(f[0]);
    } catch { /* offline */ }
    setFilesLoading(false);

    try {
      const r = await fetchRankings();
      setRankings(r);
    } catch { /* offline */ }
    setRankingsLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    fetchAdminConfig()
      .then((cfg) => setAdminHash(cfg.admin_hash ?? ""))
      .catch(() => setAdminHash(""));
  }, []);

  const addReport = (entry: ReportEntry) => {
    setReports((prev) => [entry, ...prev]);
  };

  const removeReport = (id: string) => {
    setReports((prev) => prev.filter((r) => r.id !== id));
  };

  // Single audit
  const runSingleAudit = async () => {
    if (!selectedFile || selectedModels.length === 0) return;
    setRunning(true);
    const id = crypto.randomUUID();
    addReport({ id, fileName: selectedFile, avgScore: null, statusText: "RUNNING", reports: [], open: true });

    try {
      const data = await submitAudit(selectedFile, prompt, selectedModels);
      const avg = extractAvgScore(data.reports);
      removeReport(id);
      addReport({ id: crypto.randomUUID(), fileName: selectedFile, avgScore: avg, statusText: "SINGLE_OK", reports: data.reports, open: true });
      const r = await fetchRankings();
      setRankings(r);
    } catch (err: any) {
      removeReport(id);
      addReport({ id: crypto.randomUUID(), fileName: selectedFile, avgScore: null, statusText: "SINGLE_FAIL", reports: [], error: err.message, open: true });
    }
    setRunning(false);
  };

  // Batch audit
  const runBatchAudit = async () => {
    if (selectedModels.length === 0) return;
    batchStopRef.current = false;
    setBatchRunning(true);

    let allFiles: string[] = [];
    try { allFiles = await fetchFiles(); } catch { setBatchRunning(false); return; }

    let analyzed = new Set<string>();
    try {
      const r = await fetchRankings();
      setRankings(r);
      analyzed = new Set(r.map((x) => x.file_name));
    } catch { /* continue */ }

    const pending = allFiles.filter((f) => !analyzed.has(f));
    const total = pending.length;
    let done = 0;
    setProgress({ done: 0, total });

    if (total === 0) {
      addReport({ id: crypto.randomUUID(), fileName: "[BATCH] 已完成", avgScore: null, statusText: "NO_PENDING_FILES", reports: [], open: false });
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
          const data = await submitAudit(file, prompt, selectedModels);
          const avg = extractAvgScore(data.reports);
          removeReport(placeholderId);
          addReport({ id: crypto.randomUUID(), fileName: file, avgScore: avg, statusText: `WORKER#${workerId} OK`, reports: data.reports, open: false });
        } catch (err: any) {
          removeReport(placeholderId);
          addReport({ id: crypto.randomUUID(), fileName: file, avgScore: null, statusText: `WORKER#${workerId} FAIL`, reports: [], error: err.message, open: false });
        }

        done++;
        setProgress({ done, total });
        if (done % 3 === 0 || done === total) {
          try { const r = await fetchRankings(); setRankings(r); } catch { /* */ }
        }
        if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
      }
    };

    await Promise.all(Array.from({ length: concurrency }, (_, i) => worker(i + 1)));
    setBatchRunning(false);
    addReport({
      id: crypto.randomUUID(),
      fileName: `[BATCH] ${batchStopRef.current ? "已停止" : "完成"}`,
      avgScore: null,
      statusText: batchStopRef.current ? "STOPPED" : "FINISHED",
      reports: [],
      open: false,
    });
    try { const r = await fetchRankings(); setRankings(r); } catch { /* */ }
  };

  return (
    <div className="min-h-screen bg-background p-5 relative overflow-hidden">
      {/* Scanline effect */}
      <div className="pointer-events-none fixed inset-0 z-50">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/[0.03] via-transparent to-primary/[0.03] animate-scanline" />
      </div>

      <div className="max-w-[1100px] mx-auto border border-primary/40 p-8 shadow-[0_0_30px_hsl(var(--primary)/0.1)] bg-card relative">
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
            📋 项目提交入口 (PROJECT SUBMISSION) →
          </Link>
          <Link
            to={
              adminHash === null
                ? "/admin/LOADING"
                : adminHash
                  ? `/admin/${adminHash}`
                  : "/admin/NO_ADMIN_HASH"
            }
            className="text-xs border border-secondary/40 px-4 py-2 text-secondary hover:bg-secondary/10 hover:shadow-[0_0_12px_hsl(var(--secondary)/0.3)] transition-all"
          >
            🛡️ 管理后台 (ADMIN) →
          </Link>
        </div>

        <RankingTable
          rankings={rankings}
          loading={rankingsLoading}
          selectedFile={selectedRankingFile ?? undefined}
          onSelect={(f) => setSelectedRankingFile(f === selectedRankingFile ? null : f)}
        />

        {selectedRankingFile && (
          <JudgeDetail
            fileName={selectedRankingFile}
            onClose={() => setSelectedRankingFile(null)}
          />
        )}

        <FileSelector files={files} selected={selectedFile} onChange={setSelectedFile} loading={filesLoading} />
        <PromptEditor value={prompt} onChange={setPrompt} />
        <ModelSelector selected={selectedModels} onChange={setSelectedModels} />

        {/* Action buttons */}
        <div className="flex gap-3 mb-2">
          <button
            onClick={runSingleAudit}
            disabled={running || batchRunning}
            className="flex-1 bg-primary text-primary-foreground font-bold py-4 text-sm tracking-wider hover:shadow-[0_0_20px_hsl(var(--primary)/0.6)] hover:-translate-y-px transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running ? "▶ 裁决中..." : "单文件裁决 (SINGLE EXECUTE)"}
          </button>
        </div>
        <div className="flex gap-3 mb-2">
          <button
            onClick={runBatchAudit}
            disabled={running || batchRunning}
            className="flex-1 bg-primary text-primary-foreground font-bold py-4 text-sm tracking-wider hover:shadow-[0_0_20px_hsl(var(--primary)/0.6)] hover:-translate-y-px transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {batchRunning ? "▶ 批量裁决中..." : "批量裁决 (BATCH EXECUTE)"}
          </button>
          <button
            onClick={() => { batchStopRef.current = true; }}
            disabled={!batchRunning}
            className="w-56 bg-destructive text-destructive-foreground font-bold py-4 text-sm tracking-wider hover:shadow-[0_0_18px_hsl(var(--destructive)/0.8)] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            停止批量 (STOP)
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

        {/* Output */}
        <div className="mt-5 border-t border-border pt-5">
          {reports.length === 0 ? (
            <div className="text-muted-foreground text-sm">等待指令流输入...</div>
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
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
