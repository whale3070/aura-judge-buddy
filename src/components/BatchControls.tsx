import { useI18n } from "@/lib/i18n";

interface Props {
  concurrency: number;
  onConcurrencyChange: (v: number) => void;
  delayMs: number;
  onDelayChange: (v: number) => void;
  progress: { done: number; total: number };
  onCollapseAll: () => void;
  onExpandAll: () => void;
  onClear: () => void;
}

export default function BatchControls({
  concurrency, onConcurrencyChange,
  delayMs, onDelayChange,
  progress,
  onCollapseAll, onExpandAll, onClear,
}: Props) {
  const { t } = useI18n();
  const pct = progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100);

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
    </div>
  );
}
