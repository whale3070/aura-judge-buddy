import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** HTTP 等非安全上下文中无 crypto.randomUUID；批量评审等 UI 需可用 ID。 */
export function randomUUIDCompat(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") {
    return c.randomUUID();
  }
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (ch) =>
    (Number(ch) ^ (Math.random() * 16) >> (Number(ch) / 4)).toString(16)
  );
}

/**
 * 从仓库 URL 取末尾仓库名，例如 https://github.com/owner/Aura-judgement-system → Aura-judgement-system
 */
export function githubRepoDisplayName(url: string | undefined | null): string {
  let raw = (url ?? "").trim();
  if (!raw) return "";
  raw = (raw.split("#")[0] ?? "").trim();
  raw = raw.replace(/\.git\s*$/i, "").replace(/\/+\s*$/, "");
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(withProto);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length === 0) return "";
    return parts[parts.length - 1] || "";
  } catch {
    const parts = raw.split("/").filter((p) => p.length > 0);
    const last = parts[parts.length - 1] || "";
    return last.replace(/\.git$/i, "") || "";
  }
}

/** 排名/管理台卡片标题：映射表中的项目名 → GitHub 仓库名 → 文件名 */
export function rankingItemDisplayLabel(
  item: { file_name: string; github_url?: string },
  titleMap: Record<string, string>,
  fileGithubMap: Record<string, string> = {}
): string {
  const mapped = (titleMap[item.file_name] ?? "").trim();
  if (mapped) return mapped;
  const ghUrl = (item.github_url || fileGithubMap[item.file_name] || "").trim();
  const fromGh = githubRepoDisplayName(ghUrl);
  if (fromGh) return fromGh;
  return item.file_name;
}
