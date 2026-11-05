import { guard, json, suno } from "../lib/suno.mjs";

export default async (req) => {
  const denied = guard(req);
  if (denied) return denied;
  return json(await suno("/api/v1/generate/credit"));
};
