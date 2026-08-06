import { describe, it, expect, beforeEach } from "vitest";
import {
  get,
  set,
  remove,
  KEYS,
  DEFAULTS,
} from "../lib/storage.js";

// A minimal in-memory stand-in for chrome.storage.local. This is the storage
// backend, not the module under test, so faking it is allowed: the tests still
// exercise the real get/set/remove logic and its default handling.
function installFakeStorage() {
  const store = {};
  globalThis.chrome = {
    storage: {
      local: {
        async get(key) {
          return key in store ? { [key]: store[key] } : {};
        },
        async set(obj) {
          Object.assign(store, obj);
        },
        async remove(key) {
          delete store[key];
        },
      },
    },
  };
  return store;
}

describe("storage", () => {
  beforeEach(() => {
    installFakeStorage();
  });

  it("get returns the stored value", async () => {
    await set(KEYS.API_KEY, "sk-test-123");
    expect(await get(KEYS.API_KEY)).toBe("sk-test-123");
  });

  it("get returns the documented default when the key is absent", async () => {
    expect(await get(KEYS.LANGUAGE)).toBe(DEFAULTS[KEYS.LANGUAGE]);
    expect(await get(KEYS.API_KEY)).toBe(DEFAULTS[KEYS.API_KEY]);
  });

  it("remove clears the value so get falls back to the default", async () => {
    await set(KEYS.API_KEY, "sk-test-123");
    await remove(KEYS.API_KEY);
    expect(await get(KEYS.API_KEY)).toBe(DEFAULTS[KEYS.API_KEY]);
  });
});
