import { useI18n } from "@/lib/i18n";

interface Props {
  files: string[];
  selected: string;
  onChange: (file: string) => void;
  loading: boolean;
}

export default function FileSelector({ files, selected, onChange, loading }: Props) {
  const { t } = useI18n();

  return (
    <div className="mb-5">
      <label className="block mb-2.5 font-bold text-foreground/90 text-sm border-l-[3px] border-primary pl-2.5">
        {t("fileSelector.label")}
      </label>
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-muted border border-border text-foreground p-4 font-mono text-sm outline-none transition-all focus:border-primary focus:shadow-[var(--matrix-glow)] appearance-none cursor-pointer"
      >
        {loading ? (
          <option value="">{t("fileSelector.loading")}</option>
        ) : files.length === 0 ? (
          <option value="">SERVER_OFFLINE</option>
        ) : (
          files.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))
        )}
      </select>
      <div className="mt-1.5 text-xs text-muted-foreground text-center">
        {t("fileSelector.note")} <code className="bg-muted px-1 border border-border text-foreground/80">/root/aura/word/</code> {t("fileSelector.noteDir")}
      </div>
    </div>
  );
}
