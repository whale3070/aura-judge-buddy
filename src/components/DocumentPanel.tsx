import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { ScrollArea } from "@/components/ui/scroll-area";
import { API_BASE, withRoundQuery } from "@/lib/apiClient";

interface Props {
  fileName: string;
  /** 与裁决轮次一致，否则多轮次时 /api/file-content 会落到默认 round */
  roundId?: string | null;
}

export default function DocumentPanel({ fileName, roundId }: Props) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const isMd = /\.(md|markdown|txt)$/i.test(fileName);
  const isPdf = /\.pdf$/i.test(fileName);

  useEffect(() => {
    if (!showPreview || !isMd) return;
    setLoading(true);
    fetch(
      `${API_BASE}${withRoundQuery(`/api/file-content?file=${encodeURIComponent(fileName)}`, roundId)}`
    )
      .then((r) => (r.ok ? r.text() : Promise.reject("无法获取文件内容")))
      .then(setContent)
      .catch(() => setContent("_⚠️ 无法加载文件内容_"))
      .finally(() => setLoading(false));
  }, [showPreview, fileName, isMd, roundId]);

  const handleDownload = () => {
    window.open(
      `${API_BASE}${withRoundQuery(`/api/file-content?file=${encodeURIComponent(fileName)}&download=1`, roundId)}`,
      "_blank"
    );
  };

  return (
    <div className="border border-border bg-muted/10 mt-3">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm">
            {isPdf ? "📑" : isMd ? "📝" : "📄"}
          </span>
          <span className="text-sm font-mono text-foreground/80 truncate">{fileName}</span>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="text-xs border border-primary/30 px-2.5 py-1 text-primary hover:bg-primary/10 transition-colors"
          >
            {showPreview ? "收起预览" : "📖 预览"}
          </button>
          <button
            onClick={handleDownload}
            className="text-xs border border-border px-2.5 py-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            ⬇ 下载
          </button>
        </div>
      </div>

      {/* Preview area */}
      {showPreview && (
        <div className="p-4">
          {loading && (
            <div className="text-muted-foreground text-xs text-center py-4">加载中...</div>
          )}
          {!loading && isMd && content && (
            <ScrollArea className="max-h-[400px]">
              <div className="prose prose-sm prose-invert max-w-none text-foreground/85 text-xs leading-relaxed">
                <ReactMarkdown>{content}</ReactMarkdown>
              </div>
            </ScrollArea>
          )}
          {!loading && isPdf && (
            <iframe
              src={`${API_BASE}${withRoundQuery(`/api/file-content?file=${encodeURIComponent(fileName)}`, roundId)}`}
              className="w-full h-[500px] border border-border/30 bg-background"
              title={fileName}
            />
          )}
          {!loading && !isMd && !isPdf && (
            <div className="text-muted-foreground text-xs text-center py-4">
              该文件类型暂不支持在线预览，请下载查看
            </div>
          )}
        </div>
      )}
    </div>
  );
}
