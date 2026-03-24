import { API_BASE, withRoundQuery, AURA_ROUND_ID, effectiveRoundIdFromSearchParam } from "./apiClient";

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
  github_url?: string;
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
  round_id?: string;
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
  /** 后端 GitHub enrich 失败原因（限流/权限/网络等），用于前端兜底提示 */
  github_enrich_error?: string;
  /** 后端稳定状态码：success|rate_limited|unauthorized|not_found|network|invalid_url|parse_error|unknown */
  github_enrich_status?: string;
  /** GitHub 仓库 owner 类型：user | organization */
  github_repo_owner_type?: string;
}

export type BuilderFilter = "all" | "beginner" | "longterm" | "org";

export interface AdminConfig {
  admin_hash?: string;
  admin_wallet?: string;
}

export async function fetchFiles(): Promise<string[]> {
  const res = await fetch(`${API_BASE}${withRoundQuery("/api/files")}`);
  if (!res.ok) throw new Error("无法获取文件列表");
  return res.json();
}

export async function submitAudit(
  targetFile: string,
  customPrompt: string,
  selectedModels: string[]
): Promise<AuditResponse> {
  const body: Record<string, unknown> = {
    target_file: targetFile,
    custom_prompt: customPrompt,
    selected_models: selectedModels,
  };
  if (AURA_ROUND_ID) body.round_id = AURA_ROUND_ID;
  const res = await fetch(`${API_BASE}/api/audit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("审计请求失败");
  return res.json();
}

export async function fetchRankings(queryRoundId?: string | null): Promise<RankingItem[]> {
  const path = withRoundQuery("/api/ranking?prefer_search=1", queryRoundId);
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) return [];
  return res.json();
}

export interface DuelDimWinner {
  /** 1–5 对应 创新性 / 技术实现 / 商业价值 / 用户体验 / 落地可行性 */
  index: number;
  winner: string;
}

export interface DuelResponse {
  winner: string;
  reason: string;
  raw: string;
  model: string;
  /** 服务端解析的五维胜负（新协议） */
  dimension_winners?: DuelDimWinner[];
  /** 各侧在已解析维度上获胜次数 */
  dim_vote_counts?: { A: number; B: number };
}

export async function submitDuel(
  adminWallet: string,
  body: {
    file_a: string;
    file_b: string;
    model?: string;
    output_lang?: "en" | "zh";
    /** 与管理台 URL ?round_id= 一致，否则后端在默认轮次 word 目录找文件会 404 */
    round_id?: string;
  },
  signal?: AbortSignal
): Promise<DuelResponse> {
  const res = await fetch(`${API_BASE}/api/duel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Wallet": adminWallet,
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "对决请求失败" }));
    throw new Error(err.error || err.message || "对决请求失败");
  }
  return res.json();
}

export async function fetchJudgeResult(fileName: string, queryRoundId?: string | null): Promise<JudgeResult> {
  const base = `/api/judge-result?file=${encodeURIComponent(fileName)}`;
  const res = await fetch(`${API_BASE}${withRoundQuery(base, queryRoundId)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "请求失败" }));
    throw new Error(err.error || "请求失败");
  }
  return res.json();
}

export async function fetchSubmissionById(id: string, queryRoundId?: string | null): Promise<SubmissionItem | null> {
  try {
    const res = await fetch(
      `${API_BASE}${withRoundQuery(`/api/submission/${encodeURIComponent(id)}`, queryRoundId)}`
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function fetchSubmissions(
  adminWallet?: string,
  builderFilter?: BuilderFilter,
  queryRoundId?: string | null
): Promise<SubmissionItem[]> {
  if (!adminWallet) return [];
  let path = withRoundQuery("/api/submissions", queryRoundId);
  if (builderFilter && builderFilter !== "all") {
    path += path.includes("?") ? "&" : "?";
    path += `builder_filter=${encodeURIComponent(builderFilter)}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "X-Admin-Wallet": adminWallet },
  });
  if (!res.ok) {
    if (res.status === 401) console.warn("[Admin] 提交列表 401：请确认代理已转发 X-Admin-Wallet 请求头");
    return [];
  }
  return res.json();
}

export async function fetchFileTitles(queryRoundId?: string | null): Promise<Record<string, string>> {
  try {
    const rid = effectiveRoundIdFromSearchParam(queryRoundId);
    const q = rid ? `?round_id=${encodeURIComponent(rid)}` : "";
    const url = `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/file-titles${q}`;
    const res = await fetch(url);
    if (!res.ok) return {};
    return res.json();
  } catch {
    return {};
  }
}

export async function deleteSubmission(
  id: string,
  adminWallet: string,
  queryRoundId?: string | null
): Promise<void> {
  const res = await fetch(`${API_BASE}${withRoundQuery(`/api/submission/${encodeURIComponent(id)}`, queryRoundId)}`, {
    method: "DELETE",
    headers: { "X-Admin-Wallet": adminWallet },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "删除失败" }));
    throw new Error(err.error || err.message || "删除失败");
  }
}

/** 管理员：删除本地 repo 缓存并重新 git clone，将最新 README 写入 word（再调 /api/audit 完成多模型评审） */
export async function refreshSubmissionFromGithub(
  submissionId: string,
  adminWallet: string,
  queryRoundId?: string | null
): Promise<{ target_file: string; readme_only: boolean; message?: string }> {
  const path = withRoundQuery(`/api/submission/${encodeURIComponent(submissionId)}/refresh-github`, queryRoundId);
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Wallet": adminWallet,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "刷新仓库失败" }));
    throw new Error(err.error || err.message || "刷新仓库失败");
  }
  return res.json();
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
