const SUPABASE_PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID || "ffkmvdvpewsgenaxeouu";
const API_BASE = `https://${SUPABASE_PROJECT_ID}.supabase.co/functions/v1/api-proxy`;

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
}

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
  const res = await fetch(`${API_BASE}/api/ranking`);
  if (!res.ok) return [];
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

export async function fetchSubmissions(adminWallet?: string): Promise<SubmissionItem[]> {
  if (!adminWallet) return [];
  const res = await fetch(`${API_BASE}/api/submissions`, {
    headers: {
      "X-Admin-Wallet": adminWallet,
    },
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

export async function fetchAdminConfig(): Promise<AdminConfig> {
  try {
    const res = await fetch(`${API_BASE}/api/admin-config`);
    if (!res.ok) return {};
    return res.json();
  } catch {
    return {};
  }
}
