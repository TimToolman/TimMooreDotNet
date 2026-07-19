/**
 * FetchIt AI proxy — Cloudflare Worker.
 *
 * Holds the Anthropic API key server-side so the app never ships it, and
 * enforces a HARD MONTHLY SPEND CAP: once the running cost for the current
 * month reaches MONTHLY_BUDGET_USD (default $100), analysis requests are
 * refused with HTTP 402 until the month rolls over. The app treats that as
 * "AI is temporarily unavailable" and hides the analyze button.
 *
 * Spend and rate-limit counters live in a KV namespace (binding: BUDGET).
 */

export interface Env {
  ANTHROPIC_API_KEY: string; // secret — wrangler secret put ANTHROPIC_API_KEY
  BUDGET: KVNamespace; // KV namespace for spend + rate-limit counters
  MONTHLY_BUDGET_USD?: string; // default "100"
  MODEL?: string; // default "claude-haiku-4-5"
  PRICE_INPUT_PER_MTOK?: string; // default "1" (Haiku 4.5 input)
  PRICE_OUTPUT_PER_MTOK?: string; // default "5" (Haiku 4.5 output)
  APP_TOKEN?: string; // optional shared secret; if set, callers must send x-app-token
  RATE_PER_MIN?: string; // default "20" requests/minute/device
}

interface AnalyzeBody {
  image?: string; // base64 JPEG (no data: prefix)
  boxNumber?: number;
  boxLabel?: string;
  deviceId?: string; // opaque per-install id for fair rate limiting
}

const JSON_HEADERS = { 'content-type': 'application/json' };

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } });
}

function monthKey(now: Date): string {
  return `spend:${now.toISOString().slice(0, 7)}`; // spend:YYYY-MM
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'content-type, x-app-token',
        },
      });
    }
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      return json({ ok: true });
    }
    if (request.method !== 'POST' || url.pathname !== '/analyze') {
      return json({ error: 'not_found' }, 404);
    }

    // 1. First-pass app check (weak — the $100 cap is the real backstop; add
    //    App Check / Play Integrity for production, see README).
    if (env.APP_TOKEN && request.headers.get('x-app-token') !== env.APP_TOKEN) {
      return json({ error: 'unauthorized' }, 401);
    }

    let body: AnalyzeBody;
    try {
      body = (await request.json()) as AnalyzeBody;
    } catch {
      return json({ error: 'bad_request', message: 'invalid JSON' }, 400);
    }
    if (!body.image) {
      return json({ error: 'bad_request', message: 'missing image' }, 400);
    }

    const now = new Date();

    // 2. Per-device rate limit (best-effort; KV is eventually consistent).
    const ratePerMin = parseInt(env.RATE_PER_MIN ?? '20', 10);
    const device = (body.deviceId || 'anon').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
    const rlKey = `rl:${device}:${Math.floor(now.getTime() / 60000)}`;
    const rlCount = parseInt((await env.BUDGET.get(rlKey)) ?? '0', 10);
    if (rlCount >= ratePerMin) {
      return json({ error: 'rate_limited' }, 429, { 'retry-after': '60' });
    }
    await env.BUDGET.put(rlKey, String(rlCount + 1), { expirationTtl: 120 });

    // 3. Hard monthly budget check.
    const budget = parseFloat(env.MONTHLY_BUDGET_USD ?? '100');
    const mKey = monthKey(now);
    const spent = parseFloat((await env.BUDGET.get(mKey)) ?? '0');
    if (spent >= budget) {
      return json(
        { error: 'budget_exceeded', message: 'AI analysis is paused until next month.' },
        402,
      );
    }

    // 4. Call Anthropic with the server-held key. The prompt + schema live here
    //    so they can be tuned without shipping an app update.
    const model = env.MODEL ?? 'claude-haiku-4-5';
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        output_config: {
          format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                caption: {
                  type: 'string',
                  description: 'Short caption for the photo, under 8 words',
                },
                items: {
                  type: 'array',
                  items: { type: 'string' },
                  description:
                    'Distinct physical items visible in the photo, as short inventory names',
                },
              },
              required: ['caption', 'items'],
              additionalProperties: false,
            },
          },
        },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: body.image } },
              {
                type: 'text',
                text:
                  `This photo shows the contents of storage bin #${body.boxNumber ?? '?'}` +
                  (body.boxLabel ? ` ("${body.boxLabel}")` : '') +
                  '. List the distinct physical items visible, using short names suitable for an ' +
                  'inventory list, and write a short caption for the photo.',
              },
            ],
          },
        ],
      }),
    });

    const data = (await anthropicRes.json()) as {
      usage?: { input_tokens?: number; output_tokens?: number };
      error?: { message?: string };
    };

    if (!anthropicRes.ok) {
      // Do not leak the upstream key/status detail beyond the message.
      return json(
        { error: 'upstream_error', message: data?.error?.message ?? `status ${anthropicRes.status}` },
        502,
      );
    }

    // 5. Meter spend from reported usage and persist the new monthly total.
    const priceIn = parseFloat(env.PRICE_INPUT_PER_MTOK ?? '1');
    const priceOut = parseFloat(env.PRICE_OUTPUT_PER_MTOK ?? '5');
    const inTok = data.usage?.input_tokens ?? 0;
    const outTok = data.usage?.output_tokens ?? 0;
    const cost = (inTok / 1e6) * priceIn + (outTok / 1e6) * priceOut;
    const newSpent = spent + cost;
    // ~40-day TTL so last month's counter auto-expires.
    await env.BUDGET.put(mKey, newSpent.toFixed(6), { expirationTtl: 60 * 60 * 24 * 40 });

    // 6. Return the Anthropic response verbatim (the app parses content the same
    //    way it would a direct call), plus budget headers for observability.
    return json(data, 200, {
      'x-fetchit-month-spend': newSpent.toFixed(4),
      'x-fetchit-month-budget': budget.toFixed(2),
    });
  },
};
