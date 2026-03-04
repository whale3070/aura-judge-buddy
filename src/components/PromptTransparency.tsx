import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getRuleDownloadURL } from "@/lib/apiClient";

interface PromptTransparencyProps {
  /** First scored result to extract metadata from */
  result?: {
    rule_version_id?: string;
    rule_sha256?: string;
    search_query?: string;
    competitor_results_count?: number;
  } | null;
}

const PROMPT_TEMPLATE = `[LANGUAGE]
  output_lang = EN | ZH

[ACTIVE_RULES_YAML]
  ...(active judging rules YAML, if any)
[/ACTIVE_RULES_YAML]

[COMPETITOR_SEARCH_RESULTS]
  ...(web search results for competitor analysis, if enabled)
[/COMPETITOR_SEARCH_RESULTS]

[INSTRUCTION]
  <custom_prompt>

[OUTPUT_FORMAT]
  - Provide per-dimension scores based on the rules above.
  - Compute weighted total using dimension weights.
  - Map to grade using gradingBands.
  - LAST LINE: AI_SCORE: <0-100 integer>

[DOCUMENT]
  <the submitted file content is provided to the model here>`;

const DEFAULT_PROMPT_EN = "Score strictly based on rules. Pay special attention to novelty vs existing solutions.";
const DEFAULT_PROMPT_ZH = "严格按规则评分，并重点关注创新性与已有解决方案的差异。";

export default function PromptTransparency({ result }: PromptTransparencyProps) {
  const { t, lang } = useI18n();
  const [open, setOpen] = useState(false);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const customPrompt = lang === "zh" ? DEFAULT_PROMPT_ZH : DEFAULT_PROMPT_EN;
  const ruleId = result?.rule_version_id;
  const ruleSha = result?.rule_sha256;
  const hasCompetitor = result?.competitor_results_count != null;

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-foreground border-l-4 border-primary pl-3">
          {t("prompt.title")}
        </h2>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="text-xs border border-border px-3 py-1.5 text-muted-foreground hover:text-primary hover:border-primary transition-colors"
        >
          {open ? t("prompt.hide") : t("prompt.show")}
        </button>
      </div>

      {open && (
        <div className="border border-border rounded p-4 space-y-5 bg-muted/10">
          {/* A) Prompt Template */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-sm font-semibold text-foreground">{t("prompt.template")}</h3>
              <button
                type="button"
                onClick={() => copyToClipboard(PROMPT_TEMPLATE)}
                className="text-[10px] border border-border px-2 py-0.5 text-muted-foreground hover:text-primary hover:border-primary transition-colors"
              >
                📋 {t("prompt.copyTemplate")}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground mb-1.5">{t("prompt.templateNote")}</p>
            <pre className="text-xs text-foreground/80 whitespace-pre-wrap break-words bg-muted/30 p-3 border border-border rounded font-mono leading-relaxed max-h-64 overflow-y-auto">
              {PROMPT_TEMPLATE}
            </pre>
          </div>

          {/* B) Custom Instruction */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-sm font-semibold text-foreground">{t("prompt.customInstruction")}</h3>
              <button
                type="button"
                onClick={() => copyToClipboard(customPrompt)}
                className="text-[10px] border border-border px-2 py-0.5 text-muted-foreground hover:text-primary hover:border-primary transition-colors"
              >
                📋 {t("prompt.copyInstruction")}
              </button>
            </div>
            <pre className="text-xs text-foreground/80 whitespace-pre-wrap break-words bg-muted/30 p-3 border border-border rounded font-sans leading-relaxed">
              {customPrompt}
            </pre>
          </div>

          {/* C) Language */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">{t("prompt.language")}:</span>
            <Badge variant="outline" className="text-[10px]">
              {lang === "zh" ? "ZH (中文)" : "EN (English)"}
            </Badge>
          </div>

          {/* D) Competitor Search */}
          <div>
            <span className="text-xs font-semibold text-foreground">{t("prompt.competitorSearch")}:</span>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {hasCompetitor ? (
                <>
                  <Badge variant="secondary" className="text-[10px]">
                    {t("judge.on")} ({result!.competitor_results_count})
                  </Badge>
                  {result!.search_query && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="outline" className="text-[10px] cursor-help">
                          🔍 {t("judge.searchQuery")}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        <p className="text-xs">{result!.search_query}</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                </>
              ) : (
                <Badge variant="outline" className="text-[10px]">{t("judge.off")}</Badge>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">{t("prompt.keywordsNote")}</p>
          </div>

          {/* E) Active Rule Version */}
          <div>
            <span className="text-xs font-semibold text-foreground">{t("prompt.ruleVersion")}:</span>
            {ruleId ? (
              <div className="flex flex-wrap items-center gap-1.5 mt-1">
                <Badge variant="outline" className="text-[10px] font-mono">{ruleId.slice(0, 12)}…</Badge>
                {ruleSha && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="text-[10px] cursor-help">SHA256</Badge>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="font-mono text-[10px] break-all">{ruleSha}</p>
                    </TooltipContent>
                  </Tooltip>
                )}
                <a
                  href={getRuleDownloadURL(ruleId)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-primary hover:underline"
                >
                  ⬇ {t("prompt.downloadYAML")}
                </a>
              </div>
            ) : (
              <p className="text-[10px] text-muted-foreground mt-1">{t("prompt.noRule")}</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
