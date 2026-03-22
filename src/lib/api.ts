import { API_BASE } from "./apiClient";

const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID || "ffkmvdvpewsgenaxeouu";

export interface AuditReport {
  model_name: string;
  content: string;
  score?: number;
  error?: string;
}

export interface AuditResponse {
  file: string;
  reports: AuditReport[];
}

export interface RankingItem {
  file_name: string;
  avg_score: number;
  timestamp: string;
  reports?: AuditReport[];
  rule_version_id?: string;
  rule_sha256?: string;
  search_query?: string;
  competitor_results_count?: number;
}

export interface JudgeResult {
  file_name: string;
  avg_score: number;
  timestamp: string;
  reports: AuditReport[];
}

export interface SubmissionItem {
  id: string;
  created_at: string;
  project_title: string;
  one_liner: string;
  github_url: string;
  demo_url: string;
  why_this_chain: string;
  md_files: string[];
  /** GitHub 账号年限相关（后端异步拉取，可能暂时为空） */
  github_username?: string;
  github_account_created_at?: string;
  github_account_years?: number;
}

export type BuilderFilter = "all" | "beginner" | "longterm";

export interface AdminConfig {
  admin_hash?: string;
  admin_wallet?: string;
}

export async function fetchFiles(): Promise<string[]> {
  const res = await fetch(`${API_BASE}/api/files`);
  if (!res.ok) throw new Error("无法获取文件列表");
  return res.json();
}

export async function submitAudit(
  targetFile: string,
  customPrompt: string,
  selectedModels: string[]
): Promise<AuditResponse> {
  const res = await fetch(`${API_BASE}/api/audit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      target_file: targetFile,
      custom_prompt: customPrompt,
      selected_models: selectedModels,
    }),
  });
  if (!res.ok) throw new Error("审计请求失败");
  return res.json();
}

export async function fetchRankings(): Promise<RankingItem[]> {
  const res = await fetch(`${API_BASE}/api/ranking?prefer_search=1`);
  if (!res.ok) return [];
  return res.json();
}

export interface DuelResponse {
  winner: string;
  reason: string;
  raw: string;
  model: string;
}

export async function submitDuel(
  adminWallet: string,
  body: { file_a: string; file_b: string; model?: string; output_lang?: "en" | "zh" }
): Promise<DuelResponse> {
  const res = await fetch(`${API_BASE}/api/duel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Wallet": adminWallet,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "对决请求失败" }));
    throw new Error(err.error || err.message || "对决请求失败");
  }
  return res.json();
}

export async function fetchJudgeResult(fileName: string): Promise<JudgeResult> {
  const res = await fetch(`${API_BASE}/api/judge-result?file=${encodeURIComponent(fileName)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "请求失败" }));
    throw new Error(err.error || "请求失败");
  }
  return res.json();
}

export async function fetchSubmissionById(id: string): Promise<SubmissionItem | null> {
  try {
    const res = await fetch(`${API_BASE}/api/submission/${encodeURIComponent(id)}`);
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchSubmissions(
  adminWallet?: string,
  builderFilter?: BuilderFilter
): Promise<SubmissionItem[]> {
  if (!adminWallet) return [];
  const params = new URLSearchParams();
  if (builderFilter && builderFilter !== "all") params.set("builder_filter", builderFilter);
  const url = params.toString() ? `${API_BASE}/api/submissions?${params}` : `${API_BASE}/api/submissions`;
  const res = await fetch(url, {
    headers: { "X-Admin-Wallet": adminWallet },
  });
  if (!res.ok) {
    if (res.status === 401) console.warn("[Admin] 提交列表 401：请确认代理已转发 X-Admin-Wallet 请求头");
    return [];
  }
  return res.json();
}

export async function fetchFileTitles(): Promise<Record<string, string>> {
  try {
    const url = `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/file-titles`;
    const res = await fetch(url);
    if (!res.ok) return {};
    return res.json();
  } catch {
    return {};
  }
}

export async function deleteSubmission(id: string, adminWallet: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/submission/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "X-Admin-Wallet": adminWallet },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "删除失败" }));
    throw new Error(err.error || err.message || "删除失败");
  }
}

export async function fetchAdminConfig(): Promise<AdminConfig> {
  try {
    const res = await fetch(`${API_BASE}/api/admin-config`);
    if (!res.ok) return {};
    return res.json();
  } catch {
    return {};
  }
}
