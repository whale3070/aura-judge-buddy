import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getRuleDownloadURL } from "@/lib/apiClient";

interface PromptTransparencyProps {
  result?: {
    rule_version_id?: string;
    rule_sha256?: string;
    search_query?: string;
    competitor_results_count?: number;
    reports?: { model_name: string; content: string; score?: number; error?: string }[];
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

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
  };

  const customPrompt = lang === "zh" ? DEFAULT_PROMPT_ZH : DEFAULT_PROMPT_EN;
  const ruleId = result?.rule_version_id;
  const ruleSha = result?.rule_sha256;
  const hasCompetitor = result?.competitor_results_count != null;

  // Unique models from reports
  const models = result?.reports?.length
    ? [...new Set(result.reports.map((r) => r.model_name).filter(Boolean))]
    : null;

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
        <div className="space-y-5">
          {/* ========== A) This Run (Actual Values) ========== */}
          <div className="border border-border rounded p-4 bg-muted/10">
            <h3 className="text-sm font-bold text-foreground mb-3 border-b border-border pb-2">
              {t("prompt.thisRun")}
            </h3>

            <dl className="space-y-3 text-xs">
              {/* 1) Models used */}
              <div>
                <dt className="font-semibold text-foreground mb-1">{t("prompt.modelsUsed")}</dt>
                <dd className="flex flex-wrap gap-1.5">
                  {models && models.length > 0 ? (
                    models.map((m) => (
                      <Badge key={m} variant="secondary" className="text-[10px]">{m}</Badge>
                    ))
                  ) : (
                    <span className="text-muted-foreground">{t("prompt.unknown")}</span>
                  )}
                </dd>
              </div>

              {/* 2) Rule version */}
              <div>
                <dt className="font-semibold text-foreground mb-1">{t("prompt.ruleVersion")}</dt>
                <dd>
                  {ruleId ? (
                    <div className="flex flex-wrap items-center gap-1.5">
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
                    <p className="text-muted-foreground">{t("prompt.ruleNotRecorded")}</p>
                  )}
                </dd>
              </div>

              {/* 3) Competitor search */}
              <div>
                <dt className="font-semibold text-foreground mb-1">{t("prompt.competitorSearch")}</dt>
                <dd>
                  {hasCompetitor ? (
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Badge variant="secondary" className="text-[10px]">
                          {t("judge.on")} ({result!.competitor_results_count})
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-muted-foreground">{t("judge.searchQuery")}:</span>
                        {result!.search_query ? (
                          <>
                            <code className="text-[10px] bg-muted/50 border border-border px-1.5 py-0.5 rounded font-mono break-all">
                              {result!.search_query}
                            </code>
                            <button
                              type="button"
                              onClick={() => copy(result!.search_query!)}
                              className="text-[10px] text-primary hover:underline"
                            >
                              📋 {t("prompt.copyQuery")}
                            </button>
                          </>
                        ) : (
                          <span className="text-muted-foreground italic">{t("prompt.queryNotRecorded")}</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <Badge variant="outline" className="text-[10px]">{t("judge.off")}</Badge>
                      <p className="text-muted-foreground mt-1">{t("prompt.competitorNotAvailable")}</p>
                    </div>
                  )}
                </dd>
              </div>

              {/* 4) Output language */}
              <div>
                <dt className="font-semibold text-foreground mb-1">{t("prompt.language")}</dt>
                <dd>
                  <span className="text-muted-foreground">{t("prompt.langUnknown")}</span>
                </dd>
              </div>

              {/* 5) Custom instruction */}
              <div>
                <dt className="font-semibold text-foreground mb-1">
                  {t("prompt.instructionFallbackLabel")}
                </dt>
                <dd>
                  <pre className="text-xs text-foreground/80 whitespace-pre-wrap break-words bg-muted/30 p-3 border border-border rounded font-sans leading-relaxed">
                    {customPrompt}
                  </pre>
                  <p className="text-[10px] text-muted-foreground mt-1">{t("prompt.instructionFallbackNote")}</p>
                  <button
                    type="button"
                    onClick={() => copy(customPrompt)}
                    className="text-[10px] border border-border px-2 py-0.5 mt-1 text-muted-foreground hover:text-primary hover:border-primary transition-colors"
                  >
                    📋 {t("prompt.copyInstruction")}
                  </button>
                </dd>
              </div>
            </dl>
          </div>

          {/* ========== B) Prompt Template (Public) ========== */}
          <div className="border border-border rounded p-4 bg-muted/10">
            <div className="flex items-center justify-between mb-1.5">
              <h3 className="text-sm font-bold text-foreground">{t("prompt.template")}</h3>
              <button
                type="button"
                onClick={() => copy(PROMPT_TEMPLATE)}
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
        </div>
      )}
    </section>
  );
}
