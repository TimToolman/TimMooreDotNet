# FetchBIN AI proxy (Cloudflare Worker)

A tiny Cloudflare Worker that sits between the FetchBIN app and Anthropic. It:

- **Holds your Anthropic API key server-side** — it never ships in the app.
- **Enforces a hard monthly spend cap** (`MONTHLY_BUDGET_USD`, default **$100**).
  Once the month's metered cost reaches the cap, `/analyze` returns HTTP `402`
  and the app hides the AI button until the month rolls over.
- **Rate-limits per device** (`RATE_PER_MIN`, default 20/min).
- **Meters spend** from Anthropic's reported token usage and stores the running
  monthly total in Workers KV.

## Endpoint

`POST /analyze` — body `{ image: <base64 jpeg>, boxNumber, boxLabel, deviceId }`
→ returns Anthropic's Messages response verbatim (the app parses it the same way
it would a direct call). `GET /health` → `{ ok: true }`.

Error responses: `402 {error:"budget_exceeded"}`, `429 {error:"rate_limited"}`,
`401 {error:"unauthorized"}`, `502 {error:"upstream_error"}`.

## Deploy

```bash
cd fetchit/server
npm install
npm install -g wrangler   # or use npx

wrangler login

# 1. Create the KV namespace and paste the printed id into wrangler.toml
wrangler kv namespace create BUDGET

# 2. Store secrets (never in wrangler.toml)
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put APP_TOKEN          # optional; see "Abuse protection"

# 3. Ship it
npm run deploy
```

`wrangler deploy` prints your Worker URL, e.g.
`https://fetchbin-ai-proxy.<subdomain>.workers.dev`. Put that URL in the app:
set `expo.extra.aiProxyUrl` in `fetchit/app.config.js` (and `EXPO_PUBLIC_AI_PROXY_URL`
locally if you prefer), then rebuild.

## The $100 cap

- Set the ceiling in `wrangler.toml` → `MONTHLY_BUDGET_USD` (or as a dashboard
  var). It resets automatically each calendar month (spend is keyed `spend:YYYY-MM`).
- **Keep `MODEL` and the two price vars in sync** so the metered cost matches
  what Anthropic actually bills:
  - **Haiku 4.5** (default — cheapest, great for photo→items): `MODEL=claude-haiku-4-5`,
    `PRICE_INPUT_PER_MTOK=1`, `PRICE_OUTPUT_PER_MTOK=5`.
  - **Opus 4.8** (highest quality, ≈5× the cost): `MODEL=claude-opus-4-8`,
    `PRICE_INPUT_PER_MTOK=5`, `PRICE_OUTPUT_PER_MTOK=25`.
- The cap is a safety valve, not accounting. Under bursts KV's eventual
  consistency can let spend overshoot by a few cents; for exact atomicity swap
  the KV counter for a Durable Object. Always confirm real spend in the
  Anthropic console and set a billing alert there too.

## Abuse protection

Because there's no per-user key, an open endpoint is spendable by anyone who
finds it. Defenses, weakest → strongest:

1. **`APP_TOKEN`** shared secret (this Worker) — a first filter. It ships in the
   app binary so it's extractable; the **$100 cap + rate limit bound the damage**.
2. **App attestation** (recommended for production) — verify Apple **App Attest**
   / Android **Play Integrity** (Firebase App Check wraps both) and reject
   anything else. Add the verification just after the `APP_TOKEN` check.
3. **Tie AI to the paid tier** — verify a RevenueCat entitlement or signed
   receipt server-side before forwarding, so only paying users spend your budget.

## Local dev

```bash
wrangler dev            # runs the Worker locally
curl localhost:8787/health
```
