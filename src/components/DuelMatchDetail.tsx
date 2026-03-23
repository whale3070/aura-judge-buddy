import ReactMarkdown from "react-markdown";
import { useI18n } from "@/lib/i18n";
import { FIVE_DIM_KEYS_ZH } from "@/lib/dimensionTier";
import type { StoredDuelMatch } from "@/lib/duelBracketStorage";

const DUEL_MD_PROSE =
  "prose prose-sm prose-invert max-w-none overflow-x-auto leading-relaxed break-words prose-headings:text-foreground prose-headings:text-sm prose-headings:my-2 prose-p:my-1 prose-li:text-foreground/90 prose-li:my-0.5 prose-ul:my-1 prose-ol:my-1 prose-strong:text-foreground prose-code:text-foreground prose-pre:bg-muted/50 prose-pre:text-xs";

const DIM_EN = ["Innovation", "Technical execution", "Business value", "User experience", "Feasibility"] as const;

function dimLabel(index: number, lang: "zh" | "en"): string {
  const i = index - 1;
  if (i < 0 || i >= 5) return `Dim ${index}`;
  return lang === "zh" ? FIVE_DIM_KEYS_ZH[i] : DIM_EN[i];
}

function sideProjectLabel(side: string, match: StoredDuelMatch): string {
  const s = side.toUpperCase();
  if (s === "A" && match.titleA) return match.titleA;
  if (s === "B" && match.titleB) return match.titleB;
  return side;
}

interface Props {
  match: StoredDuelMatch;
}

export default function DuelMatchDetail({ match }: Props) {
  const { t, lang } = useI18n();

  if (match.status === "error" && match.error) {
    return <p className="text-xs text-destructive">{match.error}</p>;
  }

  const dims = match.dimension_winners;
  const counts = match.dim_vote_counts;

  return (
    <div className="space-y-3 text-xs">
      {dims && dims.length > 0 && (
        <div className="space-y-2">
          <div className="font-bold text-muted-foreground uppercase tracking-wider">{t("ranking.duelFiveDimTitle")}</div>
          {counts && (
            <p className="text-muted-foreground">
              {t("ranking.duelFiveDimScoreAB", { a: String(counts.A), b: String(counts.B) })}
            </p>
          )}
          <div className="overflow-x-auto border border-border/60 rounded">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="py-1.5 px-2 font-normal">{t("ranking.duelFiveDimColDim")}</th>
                  <th className="py-1.5 px-2 font-normal">{t("ranking.duelFiveDimColWinner")}</th>
                </tr>
              </thead>
              <tbody>
                {dims.map((d) => (
                  <tr key={d.index} className="border-b border-border/40">
                    <td className="py-1.5 px-2 text-foreground/90">{dimLabel(d.index, lang)}</td>
                    <td className="py-1.5 px-2 font-medium text-primary">{sideProjectLabel(d.winner, match)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {match.reason?.trim() && (
        <div>
          <div className="text-muted-foreground mb-1">{t("ranking.duelReason")}</div>
          <div className={`max-h-56 overflow-y-auto ${DUEL_MD_PROSE}`}>
            <ReactMarkdown>{match.reason}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
