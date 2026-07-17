import * as FileSystem from 'expo-file-system';

import { getApiKey } from './settings';

export interface PhotoAnalysis {
  caption: string;
  items: string[];
}

export class MissingKeyError extends Error {
  constructor() {
    super('No Anthropic API key set');
    this.name = 'MissingKeyError';
  }
}

export class AuthError extends Error {
  constructor() {
    super('Anthropic API key is invalid or was revoked');
    this.name = 'AuthError';
  }
}

/**
 * Ask Claude what's in a box photo. Mirrors the AI analysis from the original
 * Garage Boxes web tab: same model, same structured-output schema, same prompt
 * shape. The image is read from its local file and sent as base64.
 *
 * Note: browsers require the `anthropic-dangerous-direct-browser-access` header;
 * React Native has no CORS restriction, so a plain fetch works from the device.
 */
export async function analyzePhoto(
  uri: string,
  boxNumber: number,
  boxLabel: string,
): Promise<PhotoAnalysis> {
  const key = await getApiKey();
  if (!key) throw new MissingKeyError();

  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

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
      /* keep default message */
    }
    throw new Error(msg);
  }

  const data = await res.json();
  if (data.stop_reason === 'refusal') {
    throw new Error('The model declined to analyze this image.');
  }
  const text: string = (data.content || [])
    .filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('');
  const parsed = JSON.parse(text) as PhotoAnalysis;
  return {
    caption: parsed.caption || '',
    items: Array.isArray(parsed.items) ? parsed.items : [],
  };
}
