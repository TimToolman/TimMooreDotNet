import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system';

import { STORAGE_PREFIX } from './brand';
import { getApiKey } from './settings';

export interface PhotoAnalysis {
  caption: string;
  items: string[];
}

/** No way to run AI: neither the shared proxy nor a personal key is configured. */
export class MissingKeyError extends Error {
  constructor() {
    super('AI analysis is not configured');
    this.name = 'MissingKeyError';
  }
}

/** The user's own Anthropic key was rejected (BYO-key path only). */
export class AuthError extends Error {
  constructor() {
    super('Anthropic API key is invalid or was revoked');
    this.name = 'AuthError';
  }
}

/** The shared proxy hit its monthly spend cap — AI is paused until next month. */
export class BudgetExceededError extends Error {
  constructor() {
    super('AI analysis is paused until next month');
    this.name = 'BudgetExceededError';
  }
}

const DEVICE_ID_KEY = `${STORAGE_PREFIX}:deviceId:v1`;

/** Stable per-install id so the proxy can rate-limit fairly (not a secret). */
async function getDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

function proxyUrl(): string | null {
  const fromExtra = (Constants.expoConfig?.extra as { aiProxyUrl?: string } | undefined)?.aiProxyUrl;
  const url = process.env.EXPO_PUBLIC_AI_PROXY_URL || fromExtra || '';
  // Treat the scaffold placeholder as "not configured".
  if (!url || url.includes('REPLACE_WITH_YOUR_WORKER')) return null;
  return url.replace(/\/+$/, '');
}

/** True if analysis can run at all — via the user's own key or the shared proxy. */
export async function isAiAvailable(): Promise<boolean> {
  if (await getApiKey()) return true;
  return proxyUrl() !== null;
}

/** Pull { caption, items } out of an Anthropic Messages response body. */
function parseAnthropic(data: {
  stop_reason?: string;
  content?: { type: string; text?: string }[];
}): PhotoAnalysis {
  if (data.stop_reason === 'refusal') {
    throw new Error('The model declined to analyze this image.');
  }
  const text = (data.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('');
  const parsed = JSON.parse(text) as PhotoAnalysis;
  return {
    caption: parsed.caption || '',
    items: Array.isArray(parsed.items) ? parsed.items : [],
  };
}

/**
 * Ask Claude what's in a box photo.
 *
 * Default path: POST the image to the app's proxy (a Cloudflare Worker that
 * holds the Anthropic key and enforces the monthly spend cap) — no key needed
 * on-device. Power-user fallback: if the user pasted their own Anthropic key in
 * Settings, call Anthropic directly on their dime instead.
 */
export async function analyzePhoto(
  uri: string,
  boxNumber: number,
  boxLabel: string,
): Promise<PhotoAnalysis> {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const ownKey = await getApiKey();
  if (ownKey) return analyzeDirect(base64, boxNumber, boxLabel, ownKey);

  const proxy = proxyUrl();
  if (!proxy) throw new MissingKeyError();
  return analyzeViaProxy(base64, boxNumber, boxLabel, proxy);
}

async function analyzeViaProxy(
  base64: string,
  boxNumber: number,
  boxLabel: string,
  proxy: string,
): Promise<PhotoAnalysis> {
  const res = await fetch(`${proxy}/analyze`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      image: base64,
      boxNumber,
      boxLabel,
      deviceId: await getDeviceId(),
    }),
  });

  if (res.status === 402) throw new BudgetExceededError();
  if (!res.ok) {
    let msg = `Service error ${res.status}`;
    try {
      const body = await res.json();
      if (body?.message) msg = body.message;
      else if (body?.error) msg = body.error;
    } catch {
      /* keep default */
    }
    throw new Error(msg);
  }
  return parseAnthropic(await res.json());
}

/** BYO-key fallback — calls Anthropic directly with the user's own key. */
async function analyzeDirect(
  base64: string,
  boxNumber: number,
  boxLabel: string,
  key: string,
): Promise<PhotoAnalysis> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      output_config: {
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              caption: { type: 'string', description: 'Short caption for the photo, under 8 words' },
              items: {
                type: 'array',
                items: { type: 'string' },
                description: 'Distinct physical items visible in the photo, as short inventory names',
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
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
            {
              type: 'text',
              text:
                `This photo shows the contents of storage bin #${boxNumber}` +
                (boxLabel ? ` ("${boxLabel}")` : '') +
                '. List the distinct physical items visible, using short names suitable for an ' +
                'inventory list, and write a short caption for the photo.',
            },
          ],
        },
      ],
    }),
  });

  if (res.status === 401) throw new AuthError();
  if (!res.ok) {
    let msg = `API error ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error?.message) msg = body.error.message;
    } catch {
      /* keep default */
    }
    throw new Error(msg);
  }
  return parseAnthropic(await res.json());
}
