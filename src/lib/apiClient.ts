const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID || "ffkmvdvpewsgenaxeouu";

/**
 * 自建后端时设置 VITE_API_BASE（无尾部斜杠），例如 http://198.55.109.102:8888
 * 否则请求会发到 Supabase Edge Function api-proxy，你的 aura 进程上不会出现 /api/audit 日志。
 */
function resolveApiBase(): string {
  const custom = import.meta.env.VITE_API_BASE;
  if (typeof custom === "string") {
    const t = custom.trim().replace(/\/$/, "");
    if (t) return t;
  }
  return `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/api-proxy`;
}

export const API_BASE = resolveApiBase();

/** 与后端轮次目录对应；与 .env 中 AURA_DEFAULT_ROUND_ID 保持一致时可省略。多轮次部署时设置，例如 VITE_ROUND_ID=r1 */
export const AURA_ROUND_ID = (
  typeof import.meta.env.VITE_ROUND_ID === "string" ? import.meta.env.VITE_ROUND_ID : ""
).trim();

/** 与后端 sanitizeRoundIDStrict 一致，用于校验 URL ?round_id= */
const ROUND_ID_PARAM_RE = /^[a-zA-Z0-9._-]{1,80}$/;

export function sanitizeRoundIdParam(raw: string | null | undefined): string | undefined {
  const s = (raw ?? "").trim();
  if (!s || !ROUND_ID_PARAM_RE.test(s)) return undefined;
  return s;
}

/**
 * 优先使用 URL 查询中的 round_id（须通过校验），否则使用 VITE_ROUND_ID；皆空则不带轮次（走后端默认轮次）。
 */
export function effectiveRoundIdFromSearchParam(roundIdFromUrl: string | null | undefined): string | undefined {
  const fromUrl = sanitizeRoundIdParam(roundIdFromUrl);
  if (fromUrl) return fromUrl;
  const env = AURA_ROUND_ID.trim();
  return env || undefined;
}

/** 用于 <Link to={...}>：?round_id= 或空串 */
export function roundNavSuffix(roundIdFromUrl: string | null | undefined): string {
  const id = effectiveRoundIdFromSearchParam(roundIdFromUrl);
  return id ? `?round_id=${encodeURIComponent(id)}` : "";
}

/** 为 API path（含已有 query）追加 round_id；queryRoundId 为页面 URL 的 round_id 原值（可空） */
export function withRoundQuery(path: string, queryRoundId?: string | null): string {
  const rid = effectiveRoundIdFromSearchParam(queryRoundId);
  if (!rid) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}round_id=${encodeURIComponent(rid)}`;
}

const ADMIN_WALLET_KEY = "aura_admin_wallet";

export function getAdminWallet(): string | null {
  return localStorage.getItem(ADMIN_WALLET_KEY);
}

export function setAdminWallet(wallet: string) {
  localStorage.setItem(ADMIN_WALLET_KEY, wallet);
}

interface RequestOptions {
  method?: string;
  body?: any;
  admin?: boolean;
  /** 已连接的钱包地址；若为空则回退 localStorage aura_admin_wallet */
  adminWalletAddress?: string;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, admin = false, adminWalletAddress } = opts;
  const headers: Record<string, string> = {};

  if (body && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  if (admin) {
    const w = (adminWalletAddress ?? "").trim() || getAdminWallet();
    if (!w) throw new Error("ADMIN_WALLET_REQUIRED");
    headers["X-Admin-Wallet"] = w;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(err.error || err.message || `HTTP ${res.status}`);
  }

  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json();
  }
  return res.text() as any;
}

// --- Types ---

export interface AuditReport {
  model_name: string;
  content: string;
  score?: number;
  error?: string;
}

export interface SavedResult {
  file_name: string;
  avg_score: number;
  timestamp: string;
  reports: AuditReport[];
  round_id?: string;
  /** 若后端在 /api/ranking 中附带提交时的 GitHub 仓库地址 */
  github_url?: string;
  rule_version_id?: string;
  rule_sha256?: string;
  search_query?: string;
  competitor_results_count?: number;
}

export interface RuleVersionMeta {
  id: string;
  file_name: string;
  name?: string;
  version?: string;
  uploaded_at: string;
  uploaded_by?: string;
  sha256: string;
  is_active: boolean;
  /** 仅出现在 judge-result 存证中，服务端 rules 目录无 YAML */
  is_orphan?: boolean;
}

export interface ActiveRuleResponse {
  meta: RuleVersionMeta | null;
  rawYAML: string;
}

export interface RulesVersionsResponse {
  versions: RuleVersionMeta[];
}

// --- Rules API ---

export function fetchActiveRulesAPI(): Promise<ActiveRuleResponse> {
  return request<ActiveRuleResponse>("/api/rules/active");
}

/** 传入 round_id 时，响应会合并该轮 judge-result 中出现但 index.json 未登记的 rule_version_id（is_orphan） */
export function fetchRuleVersionsAPI(queryRoundId?: string | null): Promise<RulesVersionsResponse> {
  const rid = effectiveRoundIdFromSearchParam(queryRoundId ?? undefined);
  const suffix = rid ? `?round_id=${encodeURIComponent(rid)}` : "";
  return request<RulesVersionsResponse>(`/api/rules/versions${suffix}`);
}

export function uploadRulesAPI(rawYAML: string): Promise<{ versionId: string }> {
  return request("/api/rules/upload", { method: "POST", body: { rawYAML }, admin: true });
}

export function activateRulesAPI(versionId: string, queryRoundId?: string | null): Promise<any> {
  const rid = effectiveRoundIdFromSearchParam(queryRoundId ?? undefined);
  const q = rid ? `?round_id=${encodeURIComponent(rid)}` : "";
  return request(`/api/rules/activate${q}`, { method: "POST", body: { versionId }, admin: true });
}

export function deleteRuleVersionAPI(id: string): Promise<any> {
  return request(`/api/rules/version/${encodeURIComponent(id)}`, { method: "DELETE", admin: true });
}

export function getRuleDownloadURL(id: string): string {
  return `${API_BASE}/api/rules/version/${encodeURIComponent(id)}/download`;
}

// --- Files & Audit ---

/** @param queryRoundId 与 URL ?round_id= 一致；不传则用 VITE_ROUND_ID / 后端默认轮次 */
export function fetchFilesAPI(queryRoundId?: string | null): Promise<string[]> {
  return request<string[]>(withRoundQuery("/api/files", queryRoundId));
}

export interface AuditOptions {
  target_file: string;
  custom_prompt: string;
  selected_models: string[];
  output_lang?: "en" | "zh";
  enable_web_search?: boolean;
  project_keywords?: string[];
  /** 覆盖 VITE_ROUND_ID */
  round_id?: string;
}

export function submitAuditAPI(opts: AuditOptions): Promise<SavedResult> {
  const body: Record<string, any> = {
    target_file: opts.target_file,
    custom_prompt: opts.custom_prompt,
    selected_models: opts.selected_models,
    output_lang: opts.output_lang ?? "en",
  };
  const rid = (opts.round_id ?? AURA_ROUND_ID).trim();
  if (rid) body.round_id = rid;
  if (opts.enable_web_search) {
    body.enable_web_search = true;
    if (opts.project_keywords?.length) {
      body.project_keywords = opts.project_keywords;
    }
  }
  return request<SavedResult>("/api/audit", { method: "POST", body });
}

export function fetchRankingsAPI(queryRoundId?: string | null): Promise<SavedResult[]> {
  return request<SavedResult[]>(withRoundQuery("/api/ranking?prefer_search=1", queryRoundId)).catch(() => []);
}

/**
 * 可选：GET /api/file-github-urls → { "readme文件名": "https://github.com/owner/repo" }
 * 无此接口时返回 {}，不影响页面。
 */
export async function fetchFileGithubUrlsAPI(queryRoundId?: string | null): Promise<Record<string, string>> {
  try {
    const data = await request<Record<string, string>>(withRoundQuery("/api/file-github-urls", queryRoundId));
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

/**
 * GET /api/file-project-titles?round_id= → { "1774…_00_README.md": "项目名称" }，来自各 submission.json。
 * 无此接口或失败时返回 {}。
 */
export async function fetchFileProjectTitlesAPI(queryRoundId?: string | null): Promise<Record<string, string>> {
  try {
    const data = await request<Record<string, string>>(withRoundQuery("/api/file-project-titles", queryRoundId));
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

/** @param queryRoundId 传给 Supabase file-titles，使其请求 /api/submissions?round_id=（与当前轮次一致） */
export function fetchFileTitlesAPI(queryRoundId?: string | null): Promise<Record<string, string>> {
  const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID || "ffkmvdvpewsgenaxeouu";
  const rid = effectiveRoundIdFromSearchParam(queryRoundId);
  const q = rid ? `?round_id=${encodeURIComponent(rid)}` : "";
  return fetch(`https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/file-titles${q}`)
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
}

export function fetchAdminConfigAPI(): Promise<{ admin_hash?: string; admin_wallet?: string }> {
  return request<any>("/api/admin-config").catch(() => ({}));
}

/** GET /api/rounds — 磁盘上的轮次目录 + 统计 */
export interface RoundListEntry {
  id: string;
  name?: string;
  /** 来自 .aura_round_meta.json，供列表展示 */
  mode?: string;
  start_at?: string;
  end_at?: string;
  status?: string;
  submission_count: number;
  audited_file_count: number;
}

export interface RoundDetailResponse {
  id: string;
  submission_count: number;
  audited_file_count: number;
  meta?: {
    name: string;
    description?: string;
    mode?: string;
    timezone?: string;
    start_at?: string;
    end_at?: string;
    status?: string;
    rules: {
      /** 创建轮次时选中的已上传规则版本 id */
      rule_version_id?: string;
      scoring_dimensions: { name: string; weight: number }[];
      grade_bands: { grade: string; min: number; max: number }[];
    };
    pitch: {
      enabled: boolean;
      weight: number;
      sub_scores: { name: string; weight: number }[];
    };
  };
}

export function fetchRoundDetailAPI(id: string): Promise<RoundDetailResponse> {
  return request<RoundDetailResponse>(`/api/rounds/${encodeURIComponent(id)}`);
}

/** 创建轮次：若 localStorage 有管理员钱包则带 X-Admin-Wallet（生产环境必填） */
export function createRoundAPI(body: Record<string, unknown>): Promise<{ id: string; message: string }> {
  return request("/api/rounds", { method: "POST", body, admin: Boolean(getAdminWallet()) });
}

/** 更新轮次元数据 */
export function updateRoundAPI(id: string, body: Record<string, unknown>): Promise<{ id: string; message: string }> {
  return request(`/api/rounds/${encodeURIComponent(id)}`, {
    method: "PUT",
    body,
    admin: Boolean(getAdminWallet()),
  });
}

export interface RoundsListResponse {
  rounds: RoundListEntry[];
  default_round_id: string;
}

export function fetchRoundsListAPI(): Promise<RoundsListResponse> {
  return request<RoundsListResponse>("/api/rounds");
}

/** POST /api/batch/ingest-github-urls（管理员）：按 URL 批量创建 submission、clone README 到 word，可选自动 LLM 裁决 */
export interface BatchIngestGithubResponse {
  message: string;
  round_id: string;
  queued_jobs: number;
  submission_ids: string[];
  invalid_urls: string[];
  skipped_duplicates: string[];
  auto_audit_llm: boolean;
  clone_concurrency: number;
}

export function postBatchIngestGithubURLs(
  body: {
    round_id: string;
    urls: string[];
    skip_duplicates?: boolean;
    auto_audit?: boolean;
    concurrency?: number;
  },
  adminWalletAddress: string
): Promise<BatchIngestGithubResponse> {
  return request<BatchIngestGithubResponse>("/api/batch/ingest-github-urls", {
    method: "POST",
    body,
    admin: true,
    adminWalletAddress,
  });
}

// --- Round judges panel (admin) & judge workspace (public link) ---

export interface JudgePanelRow {
  id: string;
  name: string;
}

export interface JudgesPanelResponse {
  round_id: string;
  judges: JudgePanelRow[];
  by_judge: Record<string, string[]>;
  counts: Record<string, number>;
  submission_total: number;
  updated_at?: string;
}

export function fetchJudgesPanelAPI(roundId: string): Promise<JudgesPanelResponse> {
  return request<JudgesPanelResponse>(`/api/rounds/${encodeURIComponent(roundId)}/judges-panel`, {
    admin: true,
  });
}

export function putJudgesPanelAPI(roundId: string, judges: JudgePanelRow[]): Promise<{ message: string }> {
  return request(`/api/rounds/${encodeURIComponent(roundId)}/judges-panel`, {
    method: "PUT",
    body: { judges },
    admin: true,
  });
}

export interface JudgesAutoAssignResponse {
  message: string;
  round_id: string;
  by_judge: Record<string, string[]>;
  counts: Record<string, number>;
  submission_total: number;
}

export function postJudgesAutoAssignAPI(roundId: string): Promise<JudgesAutoAssignResponse> {
  return request(`/api/rounds/${encodeURIComponent(roundId)}/judges-panel/auto-assign`, {
    method: "POST",
    admin: true,
  });
}

export interface JudgeWorkspaceSubmission {
  id: string;
  round_id?: string;
  created_at: string;
  project_title: string;
  one_liner: string;
  github_url: string;
  demo_url: string;
  why_this_chain: string;
  md_files: string[];
  /** 人工评语 */
  human_comment?: string;
  /** 人工打分 0–100 */
  human_score?: number;
  human_updated_at?: string;
}

export interface JudgeWorkspaceResponse {
  round_id: string;
  judge: { id: string; name: string };
  count: number;
  submissions: JudgeWorkspaceSubmission[];
}

export function fetchJudgeWorkspaceAPI(roundId: string, judgeId: string): Promise<JudgeWorkspaceResponse> {
  return request<JudgeWorkspaceResponse>(
    `/api/rounds/${encodeURIComponent(roundId)}/judge/${encodeURIComponent(judgeId)}/workspace`
  );
}

export interface PutHumanReviewResponse {
  message: string;
  submission_id: string;
  human_comment?: string;
  human_score?: number | null;
  human_updated_at?: string;
}

/** 保存评语与人工分；score 传 null 表示不设分（可仅写评语） */
export function putJudgeHumanReviewAPI(
  roundId: string,
  judgeId: string,
  submissionId: string,
  body: { comment: string; score: number | null }
): Promise<PutHumanReviewResponse> {
  return request<PutHumanReviewResponse>(
    `/api/rounds/${encodeURIComponent(roundId)}/judge/${encodeURIComponent(judgeId)}/submissions/${encodeURIComponent(submissionId)}/human-review`,
    { method: "PUT", body: { comment: body.comment, score: body.score } }
  );
}
