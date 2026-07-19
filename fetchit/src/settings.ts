import * as SecureStore from 'expo-secure-store';

const API_KEY_SLOT = 'fetchit_anthropic_key';

/**
 * The Anthropic API key (optional — only needed for AI photo analysis) is kept
 * in the device keychain/keystore via expo-secure-store, never in plain
 * AsyncStorage and never sent anywhere but Anthropic's own API.
 */
export async function getApiKey(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(API_KEY_SLOT);
  } catch {
    return null;
  }
}

export async function setApiKey(key: string): Promise<void> {
  const trimmed = key.trim();
  if (!trimmed) {
    await SecureStore.deleteItemAsync(API_KEY_SLOT);
    return;
  }
  await SecureStore.setItemAsync(API_KEY_SLOT, trimmed);
}

export async function clearApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(API_KEY_SLOT);
}
