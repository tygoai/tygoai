const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: CORS_HEADERS });
    }

    let body;
    try {
      body = await request.text();
    } catch (e) {
      return new Response("Invalid body", { status: 400, headers: CORS_HEADERS });
    }

    const authHeader = request.headers.get("Authorization") || "";

    let upstream;
    try {
      upstream = await fetch(NVIDIA_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader
        },
        body
      });
    } catch (e) {
      return new Response(
        JSON.stringify({ error: "Kon NVIDIA niet bereiken: " + e.message }),
        { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const responseHeaders = new Headers(upstream.headers);
    for (const [key, value] of Object.entries(CORS_HEADERS)) {
      responseHeaders.set(key, value);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders
    });
  }
};