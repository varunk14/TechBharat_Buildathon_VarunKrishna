// Thin wrappers over chrome.storage.local for the API key, language preference
// and, later, local summary history. The only module that touches
// chrome.storage. Callers use the named helpers; the generic get/set/remove
// keep the storage keys and their documented defaults in one place.

export const KEYS = {
  API_KEY: "apiKey",
  LANGUAGE: "language",
};

// The value returned when a key has never been written. get() promises the
// caller a usable value, never undefined, so every reader can skip an
// existence check.
export const DEFAULTS = {
  [KEYS.API_KEY]: "",
  [KEYS.LANGUAGE]: "en",
};

export async function get(key) {
  const stored = await chrome.storage.local.get(key);
  const value = stored[key];
  if (value === undefined) {
    return Object.prototype.hasOwnProperty.call(DEFAULTS, key)
      ? DEFAULTS[key]
      : null;
  }
  return value;
}

export async function set(key, value) {
  await chrome.storage.local.set({ [key]: value });
}

export async function remove(key) {
  await chrome.storage.local.remove(key);
}

export async function getApiKey() {
  return get(KEYS.API_KEY);
}

export async function setApiKey(value) {
  await set(KEYS.API_KEY, value);
}

export async function removeApiKey() {
  await remove(KEYS.API_KEY);
}

export async function getLanguage() {
  return get(KEYS.LANGUAGE);
}

export async function setLanguage(value) {
  await set(KEYS.LANGUAGE, value);
}
