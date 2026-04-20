/**
 * Shared device id utility (persisted in AsyncStorage).
 * For anonymous users, this stable id scopes their conversations + projects
 * so data survives app restarts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'laila_device_id';
let cached: string | null = null;

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  let id = await AsyncStorage.getItem(KEY);
  if (!id) {
    id = 'device-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    await AsyncStorage.setItem(KEY, id);
  }
  cached = id;
  return id;
}

/** Sync fallback — returns cached id if available, else a placeholder. Prefer async version. */
export function getDeviceIdSync(): string {
  return cached || 'device-pending';
}
