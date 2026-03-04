const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID || "ffkmvdvpewsgenaxeouu";
const API_BASE = `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/api-proxy`;

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
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, admin = false } = opts;
  const headers: Record<string, string> = {};

  if (body && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  if (admin) {
    const wallet = getAdminWallet();
    if (!wallet) throw new Error("ADMIN_WALLET_REQUIRED");
    headers["X-Admin-Wallet"] = wallet;
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

export function fetchRuleVersionsAPI(): Promise<RulesVersionsResponse> {
  return request<RulesVersionsResponse>("/api/rules/versions");
}

export function uploadRulesAPI(rawYAML: string): Promise<{ versionId: string }> {
  return request("/api/rules/upload", { method: "POST", body: { rawYAML }, admin: true });
}

export function activateRulesAPI(versionId: string): Promise<any> {
  return request("/api/rules/activate", { method: "POST", body: { versionId }, admin: true });
}

export function deleteRuleVersionAPI(id: string): Promise<any> {
  return request(`/api/rules/version/${encodeURIComponent(id)}`, { method: "DELETE", admin: true });
}

export function getRuleDownloadURL(id: string): string {
  return `${API_BASE}/api/rules/version/${encodeURIComponent(id)}/download`;
}

// --- Files & Audit ---

export function fetchFilesAPI(): Promise<string[]> {
  return request<string[]>("/api/files");
}

export interface AuditOptions {
  target_file: string;
  custom_prompt: string;
  selected_models: string[];
  output_lang?: "en" | "zh";
  enable_web_search?: boolean;
  project_keywords?: string[];
}

export function submitAuditAPI(opts: AuditOptions): Promise<SavedResult> {
  const body: Record<string, any> = {
    target_file: opts.target_file,
    custom_prompt: opts.custom_prompt,
    selected_models: opts.selected_models,
    output_lang: opts.output_lang ?? "en",
  };
  if (opts.enable_web_search) {
    body.enable_web_search = true;
    if (opts.project_keywords?.length) {
      body.project_keywords = opts.project_keywords;
    }
  }
  return request<SavedResult>("/api/audit", { method: "POST", body });
}

export function fetchRankingsAPI(): Promise<SavedResult[]> {
  return request<SavedResult[]>("/api/ranking").catch(() => []);
}

export function fetchFileTitlesAPI(): Promise<Record<string, string>> {
  const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID || "ffkmvdvpewsgenaxeouu";
  return fetch(`https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/file-titles`)
    .then(r => r.ok ? r.json() : {})
    .catch(() => ({}));
}

export function fetchAdminConfigAPI(): Promise<{ admin_hash?: string; admin_wallet?: string }> {
  return request<any>("/api/admin-config").catch(() => ({}));
}
