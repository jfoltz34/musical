import { callbackUrl, guard, json, suno } from "../lib/suno.mjs";

const MODELS = ["V6", "V6_WILD", "V6_MINI"];

const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v, min, max) => {
  const n = Number(v);
  return v === "" || v === null || v === undefined || Number.isNaN(n) ? undefined : Math.min(max, Math.max(min, n));
};

export default async (req) => {
  const denied = guard(req);
  if (denied) return denied;
  if (req.method !== "POST") return json({ code: 405, msg: "Method not allowed" }, 405);

  let input;
  try {
    input = await req.json();
  } catch {
    return json({ code: 400, msg: "Invalid JSON body" }, 400);
  }

  const customMode = Boolean(input.customMode);
  const instrumental = Boolean(input.instrumental);
  const body = {
    customMode,
    instrumental,
    model: MODELS.includes(input.model) ? input.model : "V6",
    callBackUrl: callbackUrl(req),
  };

  if (!customMode) {
    // Simple mode: a description; lyrics are written automatically.
    const prompt = str(input.prompt, 3000);
    const style = str(input.style, 1000);
    if (!prompt && !style) return json({ code: 400, msg: "Describe the song you want" }, 400);
    if (prompt) body.prompt = prompt;
    if (style) body.style = style;
  } else {
    const title = str(input.title, 80);
    const style = str(input.style, 1000);
    const lyrics = instrumental ? "" : str(input.lyrics, 5000);
    const negativeTags = str(input.negativeTags, 1000);
    if (!style && !lyrics && !negativeTags) {
      return json({ code: 400, msg: "Custom mode needs at least a style or lyrics" }, 400);
    }
    if (title) body.title = title;
    if (style) body.style = style;
    if (lyrics) body.lyrics = lyrics;
    if (negativeTags) body.negativeTags = negativeTags;
    if (!instrumental && (input.vocalGender === "m" || input.vocalGender === "f")) body.vocalGender = input.vocalGender;

    const duration = num(input.duration, 10, 360);
    if (duration !== undefined) body.duration = Math.round(duration);
    const styleWeight = num(input.styleWeight, 0, 1);
    if (styleWeight !== undefined) body.styleWeight = Math.round(styleWeight * 100) / 100;
    const weirdness = num(input.weirdnessConstraint, 0, 1);
    if (weirdness !== undefined) body.weirdnessConstraint = Math.round(weirdness * 100) / 100;
    const variety = num(input.variety, 0, 4);
    if (variety !== undefined) body.variety = Math.round(variety);
  }

  return json(await suno("/api/v1/generate", { method: "POST", body }));
};
