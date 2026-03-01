interface Props {
  files: string[];
  selected: string;
  onChange: (file: string) => void;
  loading: boolean;
}

export default function FileSelector({ files, selected, onChange, loading }: Props) {
  return (
    <div className="mb-5">
      <label className="block mb-2.5 font-bold text-foreground/90 text-sm border-l-[3px] border-primary pl-2.5">
        1. 目标文档 (Target Document Selection)
      </label>
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-muted border border-border text-foreground p-4 font-mono text-sm outline-none transition-all focus:border-primary focus:shadow-[var(--matrix-glow)] appearance-none cursor-pointer"
      >
        {loading ? (
          <option value="">正在调取服务器文件列表...</option>
        ) : files.length === 0 ? (
          <option value="">SERVER_OFFLINE</option>
        ) : (
          files.map((f) => (
            <option key={f} value={f}>{f}</option>
          ))
        )}
      </select>
      <div className="mt-1.5 text-xs text-muted-foreground text-center">
        单文件裁决仍可用；批量裁决会自动处理 <code className="bg-muted px-1 border border-border text-foreground/80">/root/aura/word/</code> 下全部未分析文件。
      </div>
    </div>
  );
}
