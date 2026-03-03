import { MODELS } from "@/lib/prompts";
import { useI18n } from "@/lib/i18n";

interface Props {
  selected: string[];
  onChange: (models: string[]) => void;
}

export default function ModelSelector({ selected, onChange }: Props) {
  const { t } = useI18n();

  const toggle = (id: string) => {
    onChange(
      selected.includes(id)
        ? selected.filter((m) => m !== id)
        : [...selected, id]
    );
  };

  return (
    <div className="mb-5">
      <label className="block mb-2.5 font-bold text-foreground/90 text-sm border-l-[3px] border-primary pl-2.5">
        {t("modelSelector.label")}
      </label>
      <div className="flex gap-5 p-4 border border-border bg-muted flex-wrap">
        {MODELS.map((m) => (
          <label
            key={m.id}
            className="flex items-center gap-2 cursor-pointer text-foreground/80 text-sm hover:text-foreground transition-colors"
          >
            <input
              type="checkbox"
              checked={selected.includes(m.id)}
              onChange={() => toggle(m.id)}
              className="accent-primary w-4 h-4"
            />
            {m.label}
          </label>
        ))}
      </div>
    </div>
  );
}
