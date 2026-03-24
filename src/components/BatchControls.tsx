import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";

interface Props {
  concurrency: number;
  onConcurrencyChange: (v: number) => void;
  delayMs: number;
  onDelayChange: (v: number) => void;
  progress: { done: number; total: number; started?: number };
  isRunning?: boolean;
  startedAtMs?: number | null;
  lastProgressAtMs?: number | null;
  lastDurationMs?: number | null;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onClear: () => void;
}

export default function BatchControls({
  concurrency, onConcurrencyChange,
  delayMs, onDelayChange,
  progress,
  isRunning = false,
  startedAtMs = null,
  lastProgressAtMs = null,
  lastDurationMs = null,
  onCollapseAll, onExpandAll, onClear,
}: Props) {
  const { t } = useI18n();
  const pct = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100);
  const started = progress.started ?? progress.done;
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!isRunning) return;
    const id = window.setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, [isRunning]);

  const elapsedMs = useMemo(() => {
    void tick;
    if (isRunning && startedAtMs) return Date.now() - startedAtMs;
    if (!isRunning && lastDurationMs != null) return lastDurationMs;
    return null;
  }, [isRunning, startedAtMs, lastDurationMs, tick]);

  const idleMs = useMemo(() => {
    void tick;
    if (!isRunning || !lastProgressAtMs) return null;
    return Date.now() - lastProgressAtMs;
  }, [isRunning, lastProgressAtMs, tick]);

  const fmtHMS = (ms: number) => {
    const sec = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h}h ${m}m ${s}s`;
  };

  return (
    <div className="mt-2.5 p-3 border border-border bg-background/80">
      <div className="flex gap-3 flex-wrap items-center text-sm">
        <span className="text-muted-foreground">{t("batch.dirFilter")}</span>
        <code className="text-foreground/80 bg-muted px-1.5 border border-border">/root/aura/word/</code>
        <span className="text-muted-foreground">{t("batch.concurrency")}</span>
        <select
          value={concurrency}
          onChange={(e) => onConcurrencyChange(Number(e.target.value))}
          className="bg-muted border border-border text-foreground p-2 text-sm font-mono w-auto outline-none focus:border-primary"
        >
          <option value={1}>1 {t("batch.stable")}</option>
          <option value={2}>2</option>
          <option value={3}>3</option>
        </select>
        <span className="text-muted-foreground">{t("batch.delay")}</span>
        <input
          type="number"
          value={delayMs}
          onChange={(e) => onDelayChange(Number(e.target.value))}
          className="bg-muted border border-border text-foreground p-2 text-sm font-mono w-20 outline-none focus:border-primary"
        />
        <div className="flex-1" />
        <button onClick={onCollapseAll} className="bg-muted border border-border text-foreground/80 px-2.5 py-2 text-xs hover:bg-border transition-colors">{t("batch.collapseAll")}</button>
        <button onClick={onExpandAll} className="bg-muted border border-border text-foreground/80 px-2.5 py-2 text-xs hover:bg-border transition-colors">{t("batch.expandAll")}</button>
        <button onClick={onClear} className="bg-muted border border-border text-foreground/80 px-2.5 py-2 text-xs hover:bg-border transition-colors">{t("batch.clear")}</button>
      </div>
      <div className="mt-2.5 border border-border bg-background h-3 relative overflow-hidden">
        <div className="h-3 bg-primary transition-all duration-200" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-2 text-xs text-muted-foreground">
        {progress.total === 0 ? t("batch.notStarted") : `${t("batch.progress")}${progress.done}/${progress.total} (${pct}%)`}
      </div>
      {progress.total > 0 && (
        <div className="mt-1 text-xs text-muted-foreground">
          已派发任务：<span className="font-mono text-foreground/90">{started}/{progress.total}</span>
          {started > progress.done ? (
            <span className="ml-1">（进行中：{started - progress.done}）</span>
          ) : (
            <span className="ml-1">（进行中：0）</span>
          )}
        </div>
      )}
      {elapsedMs != null && (
        <div className="mt-1 text-xs text-muted-foreground">
          本次耗时：<span className="font-mono text-foreground/90">{fmtHMS(elapsedMs)}</span>
          {isRunning ? <span className="ml-1">（进行中）</span> : <span className="ml-1">（已结束）</span>}
        </div>
      )}
      {idleMs != null && (
        <div className={`mt-1 text-xs ${idleMs >= 120000 ? "text-destructive" : "text-muted-foreground"}`}>
          距离上次进度更新：<span className="font-mono">{fmtHMS(idleMs)}</span>
          {idleMs >= 120000 ? "（可能卡住或模型响应很慢）" : ""}
        </div>
      )}
    </div>
  );
}
