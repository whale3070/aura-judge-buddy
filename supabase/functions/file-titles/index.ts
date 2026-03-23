import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const adminWallet = Deno.env.get("ADMIN_WALLET");
    if (!adminWallet) {
      return new Response(JSON.stringify({ error: "ADMIN_WALLET not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const reqUrl = new URL(req.url);
    const roundId = reqUrl.searchParams.get("round_id");
    const backend = new URL("http://198.55.109.102:8888/api/submissions");
    if (roundId) backend.searchParams.set("round_id", roundId);

    const res = await fetch(backend.toString(), {
      headers: { "X-Admin-Wallet": adminWallet },
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: "Failed to fetch submissions" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const raw = await res.json();
    // Go/Gin 可能对 nil slice 编码为 JSON null；builder 筛选无结果时也可能为 null
    const submissions = Array.isArray(raw)
      ? raw
      : (raw && typeof raw === "object" && Array.isArray((raw as { submissions?: unknown }).submissions)
        ? (raw as { submissions: unknown[] }).submissions
        : []);
    const titleMap: Record<string, string> = {};

    for (const sub of submissions) {
      if (!sub || typeof sub !== "object") continue;
      const s = sub as { md_files?: unknown; project_title?: string };
      if (s.md_files && Array.isArray(s.md_files) && s.project_title) {
        for (const file of s.md_files) {
          if (typeof file === "string") titleMap[file] = s.project_title;
        }
      }
    }

    return new Response(JSON.stringify(titleMap), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
