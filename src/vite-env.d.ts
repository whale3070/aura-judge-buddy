/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 直连 Aura Go 服务根 URL，如 http://host:8888（不设则走 Supabase api-proxy） */
  readonly VITE_API_BASE?: string;
  readonly VITE_SUPABASE_PROJECT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
