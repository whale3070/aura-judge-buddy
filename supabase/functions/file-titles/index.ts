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

    const res = await fetch("http://198.55.109.102:8888/api/submissions", {
      headers: { "X-Admin-Wallet": adminWallet },
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: "Failed to fetch submissions" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const submissions = await res.json();
    const titleMap: Record<string, string> = {};

    for (const sub of submissions) {
      if (sub.md_files && Array.isArray(sub.md_files) && sub.project_title) {
        for (const file of sub.md_files) {
          titleMap[file] = sub.project_title;
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
