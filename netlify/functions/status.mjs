import { guard, json, suno } from "../lib/suno.mjs";

export default async (req) => {
  const denied = guard(req);
  if (denied) return denied;
  const taskId = new URL(req.url).searchParams.get("taskId");
  if (!taskId) return json({ code: 400, msg: "taskId is required" }, 400);
  return json(await suno(`/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`));
};
