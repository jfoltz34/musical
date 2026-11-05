# Musical — AI Song Generator

A web app that lets anyone generate original songs with AI, powered by [sunoapi.org](https://docs.sunoapi.org).

**Features**
- **Simple mode** — describe a song; lyrics and music are created for you.
- **Custom mode** — set title, style tags, your own lyrics, excluded styles, vocal gender, duration, style adherence, weirdness and variety.
- **✨ Write lyrics with AI** — generates lyrics from a short idea.
- Instrumental toggle and model picker (V6, V6 Mini, V6 Wild).
- Live progress, streaming preview while tracks finish, built-in player, downloads, and lyrics view.
- Song history saved in the browser; remaining credits shown in the header.

## How it works

```
public/                 static frontend (HTML/CSS/JS, no build step)
netlify/lib/suno.mjs    shared helper (auth, password check, upstream fetch)
netlify/functions/      serverless proxy to api.sunoapi.org (keeps the API key secret)
  generate.mjs          POST /api/generate   -> /api/v1/generate
  status.mjs            GET  /api/status     -> /api/v1/generate/record-info
  lyrics.mjs            POST/GET /api/lyrics -> /api/v1/lyrics (+ record-info)
  credits.mjs           GET  /api/credits    -> /api/v1/generate/credit
  callback.mjs          no-op receiver for sunoapi.org's required callBackUrl
netlify.toml            publish dir, functions dir, /api/* redirect
```

The API key is **never** sent to the browser — it lives only in a Netlify environment variable.

## Deploy on Netlify

1. In Netlify, **Add new site → Import an existing project** and pick this repo/branch.
   Build settings are read from `netlify.toml` (no build command; publish directory `public`).
2. Go to **Site configuration → Environment variables** and add:
   - `SUNO_API_KEY` = your sunoapi.org API key (required)
   - `APP_PASSWORD` = any password (optional — if set, visitors must enter it before generating, so strangers can't spend your credits)
3. Trigger a redeploy so the functions pick up the variables.

## Local development

```bash
npm i -g netlify-cli
cp .env.example .env   # fill in SUNO_API_KEY
netlify dev
```
