import { useState, useEffect } from "react";
import { fetchJudgeResult, type JudgeResult } from "@/lib/api";
import ReportCard from "@/components/ReportCard";
import DocumentPanel from "@/components/DocumentPanel";
import { useI18n } from "@/lib/i18n";

interface Props {
  fileName: string;
  /** 与「我的提交」页 URL 的 round_id 一致，避免多轮次时拉错裁决 JSON */
  roundId?: string | null;
  onClose: () => void;
}

export default function JudgeDetail({ fileName, roundId, onClose }: Props) {
  const { t } = useI18n();
  const [result, setResult] = useState<JudgeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    setResult(null);
    fetchJudgeResult(fileName, roundId)
      .then(setResult)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [fileName, roundId]);

  return (
    <div className="border-2 border-primary/30 p-5 mb-6 bg-card relative animate-fade-in">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-primary text-lg tracking-[2px] font-display font-bold">
          {t("judgeDetail.title")}{fileName}
        </h3>
        <button
          onClick={onClose}
          className="text-xs border border-muted-foreground/40 px-3 py-1 text-muted-foreground hover:bg-muted transition-colors"
        >
          {t("judgeDetail.close")}
        </button>
      </div>

      {loading && (
        <div className="text-muted-foreground text-sm py-4 text-center">{t("judgeDetail.loading")}</div>
      )}

      {error && (
        <div className="text-destructive text-sm py-4 text-center">ERROR: {error}</div>
      )}

      {result && (
        <>
          <div className="flex gap-4 text-xs text-muted-foreground mb-3">
            <span>{t("judgeDetail.overallScore")}<span className="text-primary font-bold">{result.avg_score.toFixed(1)}</span></span>
            <span>{t("judgeDetail.reviewTime")}{new Date(result.timestamp).toLocaleString()}</span>
          </div>
          <DocumentPanel fileName={result.file_name} roundId={roundId} />
          <div className="mt-3">
            <ReportCard
              fileName={result.file_name}
              avgScore={result.avg_score}
              statusText="JUDGE_RESULT"
              reports={result.reports}
              defaultOpen={true}
            />
          </div>
        </>
      )}
    </div>
  );
}
