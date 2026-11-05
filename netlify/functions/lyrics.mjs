import { callbackUrl, guard, json, suno } from "../lib/suno.mjs";

// POST { prompt } -> start lyrics task. GET ?taskId= -> lyrics task details.
export default async (req) => {
  const denied = guard(req);
  if (denied) return denied;

  if (req.method === "GET") {
    const taskId = new URL(req.url).searchParams.get("taskId");
    if (!taskId) return json({ code: 400, msg: "taskId is required" }, 400);
    return json(await suno(`/api/v1/lyrics/record-info?taskId=${encodeURIComponent(taskId)}`));
  }

  if (req.method !== "POST") return json({ code: 405, msg: "Method not allowed" }, 405);
  let input;
  try {
    input = await req.json();
  } catch {
    return json({ code: 400, msg: "Invalid JSON body" }, 400);
  }
  const prompt = String(input.prompt || "").trim().slice(0, 200);
  if (!prompt) return json({ code: 400, msg: "Describe what the lyrics should be about" }, 400);
  return json(await suno("/api/v1/lyrics", { method: "POST", body: { prompt, callBackUrl: callbackUrl(req) } }));
};
