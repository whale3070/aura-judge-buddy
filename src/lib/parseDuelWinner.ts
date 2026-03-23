import type { DuelResponse } from "@/lib/api";

/** Normalize Latin / fullwidth A B to side letter */
function normalizeAbToken(tok: string): "A" | "B" | null {
  const t = tok.trim();
  if (/^[AaＡａ]$/.test(t)) return "A";
  if (/^[BbＢｂ]$/.test(t)) return "B";
  return null;
}

function sideToFile(side: "A" | "B", fileA: string, fileB: string): string {
  return side === "A" ? fileA : fileB;
}

/**
 * Map API duel response to winning file_name.
 * Models/backends may put DUEL_WINNER only in raw, use ：, fullwidth A/B, or wrap in markdown.
 */
export function parseDuelWinnerFile(res: DuelResponse, fileA: string, fileB: string): string | null {
  const winnerField = (res.winner ?? "").trim().replace(/^[`"'「]+|[`"'」]+$/g, "");
  const text = [res.winner, res.reason, res.raw].filter((s) => typeof s === "string" && s.trim()).join("\n");
  const plain = text.replace(/\*+/g, "");

  const trySide = (ch: string | undefined): string | null => {
    if (!ch) return null;
    const side = normalizeAbToken(ch);
    return side ? sideToFile(side, fileA, fileB) : null;
  };

  // 1) winner field: exact A/B or first meaningful token
  let fromField = trySide(winnerField);
  if (!fromField && winnerField.length > 0) {
    const oneChar = normalizeAbToken(winnerField.slice(0, 1));
    if (oneChar) fromField = sideToFile(oneChar, fileA, fileB);
  }
  if (!fromField) {
    const m = winnerField.match(/\b([ABabＡＢａｂ])\b/);
    fromField = m ? trySide(m[1]) : null;
  }
  if (fromField) return fromField;

  // 2) DUEL_WINNER : A / WINNER：B (use last occurrence — models sometimes repeat)
  const duelLine = /DUEL_WINNER\s*[:：=＝]\s*([ABabＡＢａｂ])/gi;
  let last: string | null = null;
  let m: RegExpExecArray | null;
  while ((m = duelLine.exec(plain)) !== null) last = m[1];
  if (last) {
    const side = normalizeAbToken(last);
    if (side) return sideToFile(side, fileA, fileB);
  }

  // 2b) DUEL_WINNER：项目A / 项目 B
  const projCn = /DUEL_WINNER\s*[:：=＝]\s*项目\s*([ABabＡＢａｂ])/gi;
  last = null;
  while ((m = projCn.exec(plain)) !== null) last = m[1];
  if (last) {
    const side = normalizeAbToken(last);
    if (side) return sideToFile(side, fileA, fileB);
  }

  // 3) Generic WINNER / 胜者 line
  const generic = /(?:^|\n)\s*(?:WINNER|胜者|选择)\s*[:：=＝]\s*([ABabＡＢａｂ])\b/im;
  const gm = plain.match(generic);
  if (gm) {
    const side = normalizeAbToken(gm[1]);
    if (side) return sideToFile(side, fileA, fileB);
  }

  // 4) Last few lines: bare "A"/"B" or trailing DUEL_WINNER
  const lines = plain.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const tail = lines.slice(-5);
  for (let i = tail.length - 1; i >= 0; i--) {
    const line = tail[i];
    const lm = line.match(/DUEL_WINNER\s*[:：=＝]\s*([ABabＡＢａｂ])\b/i);
    if (lm) {
      const side = normalizeAbToken(lm[1]);
      if (side) return sideToFile(side, fileA, fileB);
    }
    if (/^[ABabＡＢａｂ]$/.test(line)) {
      const side = normalizeAbToken(line);
      if (side) return sideToFile(side, fileA, fileB);
    }
  }

  return null;
}
