import { useState } from "react";
import { submitDuel, type DuelResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

export interface DuelProjectOption {
  file_name: string;
  title: string;
}

interface Props {
  projects: DuelProjectOption[];
  adminWallet: string;
  enabled: boolean;
}

export default function STierDuelPanel({ projects, adminWallet, enabled }: Props) {
  const [fileA, setFileA] = useState<string>("");
  const [fileB, setFileB] = useState<string>("");
  const [model, setModel] = useState<string>("deepseek");
  const [outputLang, setOutputLang] = useState<"zh" | "en">("zh");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DuelResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const canRun =
    enabled &&
    !!adminWallet &&
    projects.length >= 2 &&
    fileA &&
    fileB &&
    fileA !== fileB;

  const run = async () => {
    if (!canRun) return;
    setLoading(true);
    setErr(null);
    setResult(null);
    try {
      const res = await submitDuel(adminWallet, {
        file_a: fileA,
        file_b: fileB,
        model,
        output_lang: outputLang,
      });
      setResult(res);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "对决失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-primary/30 bg-primary/5 p-4 space-y-4 mb-6">
      <div>
        <h3 className="text-sm font-bold text-primary tracking-wide">S 档擂台 · AI 两两评比</h3>
        <p className="text-xs text-muted-foreground mt-1">
          使用两份 README 全文请求模型选出更优项目并说明理由（管理员接口，需连接管理员钱包）。仅用于已进入 S 档的项目加赛排序。
        </p>
      </div>

      {!enabled && (
        <p className="text-xs text-muted-foreground">请连接管理员钱包后使用。</p>
      )}

      {enabled && projects.length < 2 && (
        <p className="text-xs text-muted-foreground">当前 S 档项目不足 2 个，无法进行两两评比。</p>
      )}

      {projects.length >= 2 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs">项目 A（README 文件）</Label>
            <Select value={fileA || undefined} onValueChange={setFileA}>
              <SelectTrigger className="text-xs font-mono">
                <SelectValue placeholder="选择文件 A" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.file_name} value={p.file_name} className="text-xs font-mono">
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">项目 B（README 文件）</Label>
            <Select value={fileB || undefined} onValueChange={setFileB}>
              <SelectTrigger className="text-xs font-mono">
                <SelectValue placeholder="选择文件 B" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={`b-${p.file_name}`} value={p.file_name} className="text-xs font-mono">
                    {p.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {projects.length >= 2 && (
        <div className="flex flex-wrap gap-4 items-end">
          <div className="space-y-2 w-40">
            <Label className="text-xs">模型</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="deepseek">deepseek</SelectItem>
                <SelectItem value="doubao">doubao</SelectItem>
                <SelectItem value="openai">openai</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 w-32">
            <Label className="text-xs">输出语言</Label>
            <Select value={outputLang} onValueChange={(v) => setOutputLang(v as "zh" | "en")}>
              <SelectTrigger className="text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zh">中文</SelectItem>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" disabled={!canRun || loading} onClick={run} className="font-bold tracking-wider">
            {loading ? "评审中…" : "开始对决"}
          </Button>
        </div>
      )}

      {err && <p className="text-xs text-destructive">{err}</p>}

      {result && (
        <div className="border border-border bg-card/50 p-3 space-y-2 text-sm">
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-muted-foreground text-xs">胜者（相对 A/B 标签）</span>
            <span className="font-bold text-primary uppercase">{result.winner || "（未解析到 DUEL_WINNER）"}</span>
            <span className="text-xs text-muted-foreground font-mono">model: {result.model}</span>
          </div>
          {result.reason && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">理由摘要</div>
              <div className="text-xs whitespace-pre-wrap max-h-48 overflow-y-auto text-foreground/90">{result.reason}</div>
            </div>
          )}
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">完整模型输出</summary>
            <pre className="mt-2 p-2 bg-muted/30 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap font-mono">
              {result.raw}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
