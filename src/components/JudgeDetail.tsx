import { useState, useEffect, useRef } from "react";
import { fetchJudgeResult, type JudgeResult } from "@/lib/api";
import { submitAuditAPI } from "@/lib/apiClient";
import ReportCard from "@/components/ReportCard";
import DocumentPanel from "@/components/DocumentPanel";
import { useI18n } from "@/lib/i18n";
import { formatPrimaryScoreLabel } from "@/lib/scoreNorm";

interface Props {
  fileName: string;
  /** 与「我的提交」页 URL 的 round_id 一致，避免多轮次时拉错裁决 JSON */
  roundId?: string | null;
  isForked?: boolean;
  onClose: () => void;
  onReauditDone?: () => void;
  /** 裁决 JSON 已不存在（如提交已删）时回调：可刷新排名并收起详情 */
  onResultMissing?: () => void;
}

export default function JudgeDetail({
  fileName,
  roundId,
  isForked = false,
  onClose,
  onReauditDone,
  onResultMissing,
}: Props) {
  const { t } = useI18n();
  const [result, setResult] = useState<JudgeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"detail" | "reaudit">("detail");
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState("");
  const [selectedModels, setSelectedModels] = useState<string[]>(["deepseek", "doubao"]);
  const [outputLang, setOutputLang] = useState<"zh" | "en">("zh");
  const [customPrompt, setCustomPrompt] = useState("");
  const [lastRuleVersionID, setLastRuleVersionID] = useState("");
  const onResultMissingRef = useRef(onResultMissing);
  onResultMissingRef.current = onResultMissing;

  useEffect(() => {
    setLoading(true);
    setError("");
    setResult(null);
    fetchJudgeResult(fileName, roundId)
      .then(setResult)
      .catch((e) => {
        const msg = String((e as Error)?.message ?? e);
        setError(msg);
        if (/not\s*found|judge result not found/i.test(msg)) {
          onResultMissingRef.current?.();
        }
      })
      .finally(() => setLoading(false));
  }, [fileName, roundId]);

  useEffect(() => {
    setActiveTab("detail");
    setRunning(false);
    setRunError("");
  }, [fileName, roundId]);

  const toggleModel = (model: string) => {
    setSelectedModels((prev) => {
      if (prev.includes(model)) return prev.filter((m) => m !== model);
      return [...prev, model];
    });
  };

  const runReaudit = async () => {
    if (selectedModels.length === 0) {
      setRunError("请至少选择一个模型");
      return;
    }
    setRunError("");
    setRunning(true);
    try {
      const data = await submitAuditAPI({
        target_file: fileName,
        custom_prompt: customPrompt,
        selected_models: selectedModels,
        output_lang: outputLang,
        round_id: roundId ?? undefined,
      });
      if (!data.rule_version_id) {
        setRunError("重评结果缺少 rule_version_id，请检查后端规则配置");
      } else {
        setLastRuleVersionID(data.rule_version_id);
      }
      setResult(data as unknown as JudgeResult);
      setActiveTab("detail");
      onReauditDone?.();
    } catch (e: any) {
      setRunError(e?.message || "再次评估失败");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="border-2 border-primary/30 p-5 mb-6 bg-card relative animate-fade-in">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-primary text-lg tracking-[2px] font-display font-bold flex items-center gap-2">
          <span>{t("judgeDetail.title")}{fileName}</span>
          {isForked ? (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/20 text-destructive border border-destructive/40 font-semibold">
              Forked
            </span>
          ) : null}
        </h3>
        <button
          onClick={onClose}
          className="text-xs border border-muted-foreground/40 px-3 py-1 text-muted-foreground hover:bg-muted transition-colors"
        >
          {t("judgeDetail.close")}
        </button>
      </div>

      <div className="mb-4 border-b border-border flex gap-0">
        <button
          type="button"
          onClick={() => setActiveTab("detail")}
          className={`px-4 py-2 text-xs font-bold tracking-wider transition-colors ${
            activeTab === "detail" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          评审详情
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("reaudit")}
          className={`px-4 py-2 text-xs font-bold tracking-wider transition-colors ${
            activeTab === "reaudit" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          再次AI评估
        </button>
      </div>

      {activeTab === "detail" && loading && (
        <div className="text-muted-foreground text-sm py-4 text-center">{t("judgeDetail.loading")}</div>
      )}

      {activeTab === "detail" && error && (
        <div className="text-destructive text-sm py-4 text-center">ERROR: {error}</div>
      )}

      {activeTab === "detail" && result && (
        <>
          <div className="flex gap-4 text-xs text-muted-foreground mb-3">
            <span>
              {t("judgeDetail.overallScore")}
              <span className="text-primary font-bold">
                {formatPrimaryScoreLabel(result.avg_score, result.rubric_raw_max)}
              </span>
            </span>
            <span>{t("judgeDetail.reviewTime")}{new Date(result.timestamp).toLocaleString()}</span>
          </div>
          <DocumentPanel fileName={result.file_name} roundId={roundId} />
          <div className="mt-3">
            <ReportCard
              fileName={result.file_name}
              avgScore={result.avg_score}
              rubricRawMax={result.rubric_raw_max}
              statusText="JUDGE_RESULT"
              reports={result.reports}
              defaultOpen={true}
            />
          </div>
        </>
      )}

      {activeTab === "reaudit" && (
        <div className="border border-border bg-muted/10 p-4 space-y-4">
          <div className="space-y-2">
            <div className="text-xs font-bold text-foreground/90">模型选择</div>
            <div className="flex flex-wrap gap-4 text-xs">
              {["deepseek", "doubao", "openai"].map((m) => (
                <label key={m} className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedModels.includes(m)}
                    onChange={() => toggleModel(m)}
                    disabled={running}
                  />
                  <span className="font-mono">{m}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-xs font-bold text-foreground/90">输出语言</div>
            <select
              value={outputLang}
              onChange={(e) => setOutputLang(e.target.value as "zh" | "en")}
              disabled={running}
              className="bg-background border border-border px-2 py-1 text-xs text-foreground"
            >
              <option value="zh">中文</option>
              <option value="en">English</option>
            </select>
          </div>
          <div className="space-y-2">
            <div className="text-xs font-bold text-foreground/90">自定义补充提示（可选）</div>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              disabled={running}
              rows={3}
              placeholder="可留空，默认使用系统评审提示词"
              className="w-full bg-background border border-border text-foreground p-3 text-xs outline-none resize-y"
            />
          </div>
          {runError ? <div className="text-destructive text-xs">ERROR: {runError}</div> : null}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={runReaudit}
              disabled={running}
              className="text-xs font-bold bg-primary text-primary-foreground px-4 py-2 hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {running ? "评估中..." : "开始再次AI评估"}
            </button>
          </div>
          {lastRuleVersionID ? (
            <div className="text-[11px] text-muted-foreground">
              本次重评规则版本：<span className="font-mono text-foreground/90">{lastRuleVersionID}</span>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
