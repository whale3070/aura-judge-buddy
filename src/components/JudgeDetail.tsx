import { useState, useEffect } from "react";
import { fetchJudgeResult, type JudgeResult } from "@/lib/api";
import ReportCard from "@/components/ReportCard";

interface Props {
  fileName: string;
  onClose: () => void;
}

export default function JudgeDetail({ fileName, onClose }: Props) {
  const [result, setResult] = useState<JudgeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    setResult(null);
    fetchJudgeResult(fileName)
      .then(setResult)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [fileName]);

  return (
    <div className="border-2 border-primary/30 p-5 mb-6 bg-card relative animate-fade-in">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-primary text-lg tracking-[2px] font-display font-bold">
          📄 评审详情：{fileName}
        </h3>
        <button
          onClick={onClose}
          className="text-xs border border-muted-foreground/40 px-3 py-1 text-muted-foreground hover:bg-muted transition-colors"
        >
          ✕ 关闭
        </button>
      </div>

      {loading && (
        <div className="text-muted-foreground text-sm py-4 text-center">正在加载评审数据...</div>
      )}

      {error && (
        <div className="text-destructive text-sm py-4 text-center">ERROR: {error}</div>
      )}

      {result && (
        <>
          <div className="flex gap-4 text-xs text-muted-foreground mb-3">
            <span>综合评分：<span className="text-primary font-bold">{result.avg_score.toFixed(1)}</span></span>
            <span>评审时间：{new Date(result.timestamp).toLocaleString()}</span>
          </div>
          <ReportCard
            fileName={result.file_name}
            avgScore={result.avg_score}
            statusText="JUDGE_RESULT"
            reports={result.reports}
            defaultOpen={true}
          />
        </>
      )}
    </div>
  );
}
