// Shared helpers for talking to sunoapi.org from Netlify Functions.
const BASE_URL = "https://api.sunoapi.org";

export function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

// Returns an error Response if the request is not allowed, otherwise null.
export function guard(req) {
  if (!process.env.SUNO_API_KEY) {
    return json({ code: 500, msg: "Server is missing SUNO_API_KEY. Add it in Netlify environment variables and redeploy." }, 500);
  }
  const password = process.env.APP_PASSWORD;
  if (password && req.headers.get("x-app-password") !== password) {
    return json({ code: 401, msg: "Password required" }, 401);
  }
  return null;
}

export async function suno(path, { method = "GET", body } = {}) {
  const res = await fetch(BASE_URL + path, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.SUNO_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try {
    data = await res.json();
  } catch {
    data = { code: res.status, msg: `Upstream returned non-JSON response (HTTP ${res.status})` };
  }
  return data;
}

// sunoapi.org requires a callBackUrl; we point it at our own no-op endpoint and poll for status instead.
export function callbackUrl(req) {
  const origin = process.env.URL || new URL(req.url).origin;
  return `${origin}/api/callback`;
}
