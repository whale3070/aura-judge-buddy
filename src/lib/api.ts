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

export interface JudgeResult {
  file_name: string;
  avg_score: number;
  timestamp: string;
  reports: AuditReport[];
}

export async function fetchJudgeResult(fileName: string): Promise<JudgeResult> {
  const res = await fetch(`${API_BASE}/api/judge-result?file=${encodeURIComponent(fileName)}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "请求失败" }));
    throw new Error(err.error || "请求失败");
  }
  return res.json();
}
