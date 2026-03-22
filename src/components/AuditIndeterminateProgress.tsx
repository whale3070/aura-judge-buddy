/**
 * 单请求无服务端进度时使用的不确定进度条，提示用户后台仍在工作。
 */
interface Props {
  title?: string;
  hint?: string;
  className?: string;
}

export default function AuditIndeterminateProgress({ title, hint, className = "" }: Props) {
  return (
    <div
      className={`space-y-2.5 py-1 ${className}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      {title && (
        <p className="text-xs font-bold text-primary tracking-wide flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary animate-pulse shadow-[0_0_8px_hsl(var(--primary)/0.8)]" />
          {title}
        </p>
      )}
      {hint && <p className="text-[11px] text-muted-foreground leading-relaxed">{hint}</p>}
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary relative border border-border/60" aria-hidden>
        <div className="aura-audit-indeterminate-bar absolute top-0 left-0 h-full w-[34%] rounded-full bg-primary" />
      </div>
    </div>
  );
}
