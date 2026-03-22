/**
 * 从单条 report 的 content 文本中解析「维度名: 分数」。
 * 支持 "key: 85"、"维度名：80"、Markdown 表等，排除 AI_SCORE 等非维度行。
 */
export function parseDimensionScores(content: string): Record<string, number> {
  const out: Record<string, number> = {};
  if (!content?.trim()) return out;

  const lines = content.split(/\r?\n/);
  const skipKeys = new Set(["ai_score", "score", "total", "weighted", "grade"]);

  for (const line of lines) {
    // "xxx: 85" or "xxx：85" or "| xxx | 85 |"
    const colonMatch = line.match(/\s*(.+?)\s*[:：]\s*(\d{1,3})\s*$/);
    if (colonMatch) {
      const key = colonMatch[1].trim().replace(/\*\*/g, "").replace(/^[-*]\s*/, "");
      const num = parseInt(colonMatch[2], 10);
      if (num >= 0 && num <= 100 && key.length > 0) {
        const lower = key.toLowerCase();
        if (!skipKeys.has(lower) && lower !== "ai") {
          out[key] = num;
        }
      }
      continue;
    }
    // Markdown table row: | Dimension | 85 | (second column as score)
    const tableMatch = line.match(/\|\s*(.+?)\s*\|\s*(\d{1,3})\s*\|/);
    if (tableMatch) {
      const key = tableMatch[1].trim();
      const num = parseInt(tableMatch[2], 10);
      if (num >= 0 && num <= 100 && key.length > 0) {
        const lower = key.toLowerCase();
        if (!skipKeys.has(lower) && !/^\d+$/.test(key)) {
          out[key] = num;
        }
      }
    }
  }
  return out;
}

/** 合并多份 report 的维度键，用于表格行（去重、排序） */
export function collectDimensionKeys(perModel: Record<string, Record<string, number>>): string[] {
  const set = new Set<string>();
  for (const scores of Object.values(perModel)) {
    for (const key of Object.keys(scores)) {
      set.add(key);
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
}
