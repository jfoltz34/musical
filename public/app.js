(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const STORE_KEY = "musical.tasks.v1";
  const PW_KEY = "musical.password";
  const POLL_MS = 8000;
  const MAX_POLL_MINUTES = 15;

  const DONE = new Set(["SUCCESS"]);
  const FAILED = new Set(["CREATE_TASK_FAILED", "GENERATE_AUDIO_FAILED", "CALLBACK_EXCEPTION", "SENSITIVE_WORD_ERROR"]);
  const STATUS_TEXT = {
    SUBMITTED: "Submitting…",
    PENDING: "Queued…",
    TEXT_SUCCESS: "Writing lyrics & composing…",
    FIRST_SUCCESS: "First track ready, finishing the second…",
    SUCCESS: "Done",
    CREATE_TASK_FAILED: "Failed to create the task",
    GENERATE_AUDIO_FAILED: "Audio generation failed",
    CALLBACK_EXCEPTION: "Generation error",
    SENSITIVE_WORD_ERROR: "Blocked: the prompt contains prohibited words",
    TIMEOUT: "Timed out — try refreshing later",
  };

  const IDEAS = [
    "Lo-fi hip hop beat for late-night studying, rain sounds",
    "Epic orchestral trailer music with choir",
    "Upbeat 80s synth-pop love song",
    "Acoustic folk ballad about coming home",
    "Funky disco track that makes you dance",
    "Dark trap beat with heavy 808s",
  ];
  const STYLES = ["pop", "rock", "hip hop", "lo-fi", "edm", "jazz", "r&b", "country", "cinematic", "acoustic", "synthwave", "metal"];

  // ---------- state ----------
  let mode = "simple";
  let tasks = load();
  let password = safeGet(PW_KEY) || "";
  let currentTrackId = null;
  let pollTimer = null;

  function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
  function safeSet(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }
  function load() { try { return JSON.parse(safeGet(STORE_KEY)) || []; } catch { return []; } }
  function save() { safeSet(STORE_KEY, JSON.stringify(tasks)); }

  // ---------- api ----------
  async function api(path, opts = {}) {
    const headers = { "Content-Type": "application/json" };
    if (password) headers["x-app-password"] = password;
    const res = await fetch(`/api/${path}`, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
    let data;
    try { data = await res.json(); } catch { data = { code: res.status, msg: `Request failed (HTTP ${res.status})` }; }
    if (res.status === 401 && data.msg === "Password required") {
      await askPassword();
      return api(path, opts);
    }
    return data;
  }

  function askPassword() {
    return new Promise((resolve) => {
      const dlg = $("#pwDialog");
      $("#pwInput").value = "";
      dlg.showModal();
      dlg.addEventListener("close", function onClose() {
        dlg.removeEventListener("close", onClose);
        password = $("#pwInput").value;
        safeSet(PW_KEY, password);
        resolve();
      });
    });
  }

  function errorMessage(data) {
    const byCode = {
      401: "Unauthorized — check the API key configured on the server.",
      405: "Rate limit exceeded. Please wait a moment.",
      413: "Your prompt or lyrics are too long.",
      429: "Out of credits. Top up your sunoapi.org account.",
      430: "Too many requests. Please try again shortly.",
      455: "The music service is under maintenance. Try again later.",
    };
    return byCode[data.code] || data.msg || "Something went wrong";
  }

  // ---------- ui helpers ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDur = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "");
  const timeAgo = (t) => {
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return "just now";
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
  };

  let toastTimer;
  function toast(msg, isErr = false) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.toggle("err", isErr);
    el.classList.remove("hidden");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add("hidden"), 5000);
  }

  function setMode(m) {
    mode = m;
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.mode === m));
    document.querySelector(".mode.simple").classList.toggle("hidden", m !== "simple");
    document.querySelector(".mode.custom").classList.toggle("hidden", m !== "custom");
    syncInstrumental();
  }

  function syncInstrumental() {
    const inst = $("#instrumental").checked;
    $(".lyrics-block").classList.toggle("hidden", inst);
    $("#vocalGender").disabled = inst;
  }

  function renderChips() {
    $("#ideaChips").innerHTML = IDEAS.map((i) => `<button type="button" class="chip" data-idea="${esc(i)}">${esc(i.split(",")[0])}</button>`).join("");
    $("#styleChips").innerHTML = STYLES.map((s) => `<button type="button" class="chip" data-style="${esc(s)}">+ ${esc(s)}</button>`).join("");
  }

  function renderVals() {
    document.querySelectorAll(".val").forEach((el) => { el.textContent = $("#" + el.dataset.for).value; });
  }

  // ---------- rendering ----------
  function render() {
    const wrap = $("#tasks");
    $("#empty").classList.toggle("hidden", tasks.length > 0);
    wrap.innerHTML = tasks.map(renderTask).join("");
  }

  function renderTask(t) {
    const failed = FAILED.has(t.status) || t.status === "TIMEOUT" || t.status === "ERROR";
    const working = !failed && !DONE.has(t.status);
    const statusText = t.status === "ERROR" ? t.error : (t.error && failed ? `${STATUS_TEXT[t.status] || t.status}: ${t.error}` : STATUS_TEXT[t.status] || t.status);
    const tracks = t.tracks && t.tracks.length ? t.tracks : working ? [{ pending: true }, { pending: true }] : [];
    return `
      <article class="task" data-task="${esc(t.taskId || t.localId)}">
        <div class="task-head">
          <div>
            <div class="task-prompt">${esc(t.label)}</div>
            ${working || failed ? `<div class="status ${failed ? "err" : ""}">${working ? '<span class="spinner"></span>' : "⚠️"} ${esc(statusText)}</div>` : ""}
          </div>
          <div class="task-time">${timeAgo(t.createdAt)} · <button class="link-btn" data-remove="${esc(t.taskId || t.localId)}">Remove</button></div>
        </div>
        ${tracks.length ? `<div class="tracks">${tracks.map((tr) => renderTrack(tr, t)).join("")}</div>` : ""}
      </article>`;
  }

  function renderTrack(tr, t) {
    if (tr.pending) {
      return `<div class="track pending"><div class="cover"></div><div class="track-info"><div class="track-title">Generating…</div><div class="track-tags">&nbsp;</div></div></div>`;
    }
    const src = tr.audio_url || tr.stream_audio_url;
    const playing = currentTrackId === tr.id && !$("#audio").paused;
    const title = tr.title || t.title || "Untitled";
    return `
      <div class="track ${playing ? "playing" : ""}" data-track="${esc(tr.id)}">
        <button class="cover" data-play="${esc(tr.id)}" ${src ? "" : "disabled"} aria-label="Play ${esc(title)}">
          ${tr.image_url ? `<img src="${esc(tr.image_url)}" alt="" loading="lazy" onerror="this.remove()" />` : ""}
          <span class="play">${playing ? "❚❚" : "▶"}</span>
        </button>
        <div class="track-info">
          <div class="track-title" title="${esc(title)}">${esc(title)}</div>
          <div class="track-tags" title="${esc(tr.tags)}">${esc([fmtDur(tr.duration), tr.tags].filter(Boolean).join(" · ")) || (src ? "Streaming preview" : "Composing…")}</div>
          <div class="track-actions">
            ${tr.audio_url ? `<a href="${esc(tr.audio_url)}" target="_blank" rel="noopener" download>Download</a>` : ""}
            ${tr.prompt && !t.instrumental ? `<button data-lyrics="${esc(tr.id)}">Lyrics</button>` : ""}
          </div>
          <div class="lyrics-view hidden" data-lyrics-view="${esc(tr.id)}">${esc(tr.prompt)}</div>
        </div>
      </div>`;
  }

  function findTrack(id) {
    for (const t of tasks) for (const tr of t.tracks || []) if (tr.id === id) return { tr, t };
    return null;
  }

  function play(id) {
    const audio = $("#audio");
    if (currentTrackId === id) {
      if (audio.paused) audio.play(); else audio.pause();
      return;
    }
    const found = findTrack(id);
    if (!found) return;
    const { tr, t } = found;
    currentTrackId = id;
    audio.src = tr.audio_url || tr.stream_audio_url;
    audio.play().catch(() => toast("Couldn't play this track yet. Try again in a moment.", true));
    $("#playerCover").src = tr.image_url || "";
    $("#playerTitle").textContent = tr.title || t.title || "Untitled";
    $("#playerTags").textContent = tr.tags || "";
    $("#player").classList.remove("hidden");
    render();
  }

  // ---------- generation ----------
  function collect() {
    const instrumental = $("#instrumental").checked;
    const model = $("#model").value;
    if (mode === "simple") {
      const prompt = $("#prompt").value.trim();
      return { customMode: false, instrumental, model, prompt };
    }
    return {
      customMode: true,
      instrumental,
      model,
      title: $("#title").value.trim(),
      style: $("#style").value.trim(),
      lyrics: instrumental ? "" : $("#lyrics").value.trim(),
      negativeTags: $("#negativeTags").value.trim(),
      vocalGender: $("#vocalGender").value,
      duration: $("#duration").value,
      styleWeight: $("#styleWeight").value,
      weirdnessConstraint: $("#weirdnessConstraint").value,
      variety: $("#variety").value,
    };
  }

  async function onSubmit(e) {
    e.preventDefault();
    const params = collect();
    if (!params.customMode && !params.prompt) return toast("Describe the song you want first.", true);
    if (params.customMode && !params.style && !params.lyrics && !params.negativeTags) {
      return toast("Add a style or some lyrics.", true);
    }

    const btn = $("#createBtn");
    btn.disabled = true;
    btn.querySelector(".btn-label").textContent = "Submitting…";

    const label = params.customMode
      ? [params.title, params.style].filter(Boolean).join(" — ") || "Custom song"
      : params.prompt;
    const task = {
      localId: "local-" + Date.now(),
      taskId: null,
      createdAt: Date.now(),
      label: (params.instrumental ? "🎹 " : "") + label,
      title: params.title || "",
      instrumental: params.instrumental,
      status: "SUBMITTED",
      tracks: [],
    };
    tasks.unshift(task);
    save();
    render();

    try {
      const data = await api("generate", { method: "POST", body: JSON.stringify(params) });
      if (data.code !== 200 || !data.data?.taskId) throw new Error(errorMessage(data));
      task.taskId = data.data.taskId;
      task.status = "PENDING";
      toast("Song is being created! This usually takes 1–3 minutes.");
      schedulePoll(3000);
    } catch (err) {
      task.status = "ERROR";
      task.error = err.message;
      toast(err.message, true);
    } finally {
      save();
      render();
      btn.disabled = false;
      btn.querySelector(".btn-label").textContent = "Create 🔥";
      refreshCredits();
    }
  }

  function schedulePoll(delay = POLL_MS) {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(poll, delay);
  }

  async function poll() {
    const active = tasks.filter((t) => t.taskId && !DONE.has(t.status) && !FAILED.has(t.status) && t.status !== "TIMEOUT" && t.status !== "ERROR");
    if (!active.length) return;

    await Promise.all(active.map(async (t) => {
      try {
        const data = await api(`status?taskId=${encodeURIComponent(t.taskId)}`);
        if (data.code !== 200 || !data.data) return;
        const d = data.data;
        if (d.status) t.status = d.status;
        if (d.errorMessage) t.error = d.errorMessage;
        const sunoData = d.response?.sunoData;
        if (Array.isArray(sunoData) && sunoData.length) t.tracks = sunoData;
        if (!DONE.has(t.status) && !FAILED.has(t.status) && Date.now() - t.createdAt > MAX_POLL_MINUTES * 60000) {
          t.status = "TIMEOUT";
        }
      } catch { /* network blip; retry next round */ }
    }));

    save();
    render();
    if (active.some((t) => DONE.has(t.status))) refreshCredits();
    schedulePoll();
  }

  // ---------- AI lyrics ----------
  async function generateLyrics() {
    const prompt = $("#lyricsPrompt").value.trim();
    if (!prompt) return toast("Tell the AI what the lyrics should be about.", true);
    const btn = $("#lyricsGo");
    btn.disabled = true;
    btn.textContent = "Writing…";
    try {
      const start = await api("lyrics", { method: "POST", body: JSON.stringify({ prompt }) });
      if (start.code !== 200 || !start.data?.taskId) throw new Error(errorMessage(start));
      const taskId = start.data.taskId;
      const deadline = Date.now() + 3 * 60000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 4000));
        const res = await api(`lyrics?taskId=${encodeURIComponent(taskId)}`);
        if (res.code !== 200 || !res.data) continue;
        const { status, errorMessage: em, response } = res.data;
        if (FAILED.has(status) || status === "GENERATE_LYRICS_FAILED") throw new Error(em || STATUS_TEXT[status] || "Lyrics generation failed");
        if (status === "SUCCESS") {
          const item = (response?.data || []).find((x) => x.status !== "failed" && x.text) || response?.data?.[0];
          if (!item?.text) throw new Error("No lyrics returned");
          $("#lyrics").value = item.text.replace(/^\|-?\s*\n/, "").trim();
          if (!$("#title").value.trim() && item.title) $("#title").value = item.title;
          $("#aiLyrics").classList.add("hidden");
          toast("Lyrics ready! Edit them however you like.");
          refreshCredits();
          return;
        }
      }
      throw new Error("Lyrics took too long. Please try again.");
    } catch (err) {
      toast(err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = "Generate";
    }
  }

  // ---------- credits ----------
  async function refreshCredits() {
    try {
      const data = await api("credits");
      $("#credits").textContent = data.code === 200 ? `${data.data} credits` : "credits unavailable";
    } catch {
      $("#credits").textContent = "offline";
    }
  }

  // ---------- events ----------
  document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => setMode(t.dataset.mode)));
  $("#form").addEventListener("submit", onSubmit);
  $("#instrumental").addEventListener("change", syncInstrumental);
  document.querySelectorAll("input[type=range]").forEach((r) => r.addEventListener("input", renderVals));
  $("#aiLyricsBtn").addEventListener("click", () => {
    $("#aiLyrics").classList.toggle("hidden");
    $("#lyricsPrompt").focus();
  });
  $("#lyricsGo").addEventListener("click", generateLyrics);
  $("#lyricsPrompt").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); generateLyrics(); } });

  $("#ideaChips").addEventListener("click", (e) => {
    const idea = e.target.closest("[data-idea]")?.dataset.idea;
    if (idea) $("#prompt").value = idea;
  });
  $("#styleChips").addEventListener("click", (e) => {
    const s = e.target.closest("[data-style]")?.dataset.style;
    if (!s) return;
    const input = $("#style");
    const parts = input.value.split(",").map((x) => x.trim()).filter(Boolean);
    if (!parts.includes(s)) parts.push(s);
    input.value = parts.join(", ");
  });

  $("#tasks").addEventListener("click", (e) => {
    const playId = e.target.closest("[data-play]")?.dataset.play;
    if (playId) return play(playId);
    const lyricsId = e.target.closest("[data-lyrics]")?.dataset.lyrics;
    if (lyricsId) return document.querySelector(`[data-lyrics-view="${CSS.escape(lyricsId)}"]`)?.classList.toggle("hidden");
    const removeId = e.target.closest("[data-remove]")?.dataset.remove;
    if (removeId) {
      tasks = tasks.filter((t) => (t.taskId || t.localId) !== removeId);
      save();
      render();
    }
  });

  $("#clearBtn").addEventListener("click", () => {
    if (!tasks.length || !confirm("Remove all songs from this browser?")) return;
    tasks = [];
    save();
    render();
  });

  const audio = $("#audio");
  audio.addEventListener("play", render);
  audio.addEventListener("pause", render);

  // ---------- init ----------
  // Tasks left mid-submit from a previous session can't be recovered.
  tasks.forEach((t) => { if (!t.taskId && t.status === "SUBMITTED") { t.status = "ERROR"; t.error = "Interrupted before submission"; } });
  renderChips();
  renderVals();
  setMode("simple");
  render();
  refreshCredits();
  poll();
  setInterval(() => render(), 60000); // refresh "x minutes ago"
})();
