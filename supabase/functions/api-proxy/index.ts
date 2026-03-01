const TARGET_API_URL = "http://198.55.109.102:8888";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-admin-wallet, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    // Extract the path after /api-proxy, e.g. /api-proxy/api/files -> /api/files
    const pathMatch = url.pathname.match(/\/api-proxy(\/.*)/);
    const endpoint = pathMatch ? pathMatch[1] : "/";

    if (endpoint.includes("..")) {
      return new Response(JSON.stringify({ error: "Invalid path" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const backendUrl = `${TARGET_API_URL}${endpoint}${url.search}`;

    // Forward the request, preserving method, body, and admin auth header
    const forwardHeaders: Record<string, string> = {
      "Content-Type": req.headers.get("content-type") || "application/json",
    };
    const adminWallet = req.headers.get("x-admin-wallet");
    if (adminWallet) forwardHeaders["X-Admin-Wallet"] = adminWallet;

    const fetchOptions: RequestInit = {
      method: req.method,
      headers: forwardHeaders,
    };

    // For multipart (file uploads), forward the raw body and content-type
    if (req.method !== "GET" && req.method !== "HEAD") {
      const contentType = req.headers.get("content-type") || "";
      if (contentType.includes("multipart/form-data")) {
        fetchOptions.body = await req.arrayBuffer();
        fetchOptions.headers = { "Content-Type": contentType };
      } else {
        fetchOptions.body = await req.text();
      }
    }

    const response = await fetch(backendUrl, fetchOptions);
    const data = await response.arrayBuffer();

    return new Response(data, {
      status: response.status,
      headers: {
        ...corsHeaders,
        "Content-Type": response.headers.get("content-type") || "application/json",
      },
    });
  } catch (error) {
    console.error("Proxy error:", error);
    return new Response(JSON.stringify({ error: `代理错误: ${error.message}` }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
