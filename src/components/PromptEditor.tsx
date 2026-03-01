import { PROMPT_TAGS } from "@/lib/prompts";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function PromptEditor({ value, onChange }: Props) {
  return (
    <div className="mb-5">
      <label className="block mb-2.5 font-bold text-foreground/90 text-sm border-l-[3px] border-primary pl-2.5">
        2. 注入审计指令 (Audit Command Injection)
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={8}
        className="w-full bg-muted border border-border text-foreground p-4 font-mono text-sm outline-none transition-all focus:border-primary focus:shadow-[var(--matrix-glow)] resize-y"
      />
      <div className="flex gap-2.5 mt-3 flex-wrap">
        {PROMPT_TAGS.map((tag) => (
          <button
            key={tag.label}
            onClick={() => onChange(tag.prompt)}
            className="border border-border px-3.5 py-1.5 text-xs text-muted-foreground hover:border-primary hover:text-primary hover:bg-primary/5 transition-all cursor-pointer"
          >
            {tag.label}
          </button>
        ))}
      </div>
    </div>
  );
}
