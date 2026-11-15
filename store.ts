/**
 * Settings storage. One tiny key/value store with synchronous reads (from a cache filled at startup)
 * and debounced writes, so slider drags don't hit chrome.storage.sync's write quotas.
 *
 *   - In the extension: chrome.storage.local, or chrome.storage.sync once the user turns Sync on.
 *   - In a plain browser tab (npm run dev): localStorage, so the app still works.
 *
 * Device-only keys (like whether the tweak panel is open) always stay in chrome.storage.local.
 * Which area is in use is itself remembered in chrome.storage.local, because it has to be known
 * before the synced area can be read.
 */

export interface Settings {
  /** Shown in the greeting; empty means just "Good morning". */
  name: string;
  showGreeting: boolean;
  showSearch: boolean;
  /** Row of tiles under the search box. */
  shortcuts: "off" | "topSites" | "bookmarks";
  /** Switch animals on their own. */
  rotate: "off" | "newTab" | "timer";
  rotateMinutes: number;
  /** Render at 1x and 30 fps. */
  powerSaver: boolean;
}

export const SETTINGS_DEFAULTS: Settings = {
  name: "",
  showGreeting: true,
  showSearch: true,
  shortcuts: "off",
  rotate: "off",
  rotateMinutes: 10,
  powerSaver: false,
};

type Json = unknown;
type Area = "local" | "sync";

const PREFIX = "ascii-animals:";
const SYNC_FLAG = "useSync";
/** Keys that never leave this device, even with Sync on. */
const LOCAL_ONLY = new Set(["tweaks-open", SYNC_FLAG]);
const WRITE_DELAY = 400;

const hasChrome = typeof chrome !== "undefined" && !!chrome.storage?.local;

class Store {
  private cache = new Map<string, Json>();
  private pending = new Map<string, Json | undefined>();
  private timer = 0;
  private sync = false;
  private readyPromise: Promise<void> | null = null;
  /** Called when another tab or device changes a key we hold. */
  onExternalChange: ((key: string) => void) | null = null;

  /** Load everything into the cache. Await this once before reading. */
  ready() {
    return (this.readyPromise ??= this.load());
  }

  private async load() {
    if (!hasChrome) {
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k?.startsWith(PREFIX)) this.cache.set(k.slice(PREFIX.length), JSON.parse(localStorage.getItem(k)!));
        }
      } catch {
        // Unavailable or corrupt: start empty.
      }
      return;
    }
    const flag = await chrome.storage.local.get(SYNC_FLAG);
    this.sync = flag[SYNC_FLAG] === true && !!chrome.storage.sync;
    const [local, synced] = await Promise.all([
      chrome.storage.local.get(null),
      this.sync ? chrome.storage.sync.get(null) : Promise.resolve({}),
    ]);
    for (const [k, v] of Object.entries(local)) if (this.sync ? LOCAL_ONLY.has(k) : true) this.cache.set(k, v);
    for (const [k, v] of Object.entries(synced)) this.cache.set(k, v);

    chrome.storage.onChanged.addListener((changes, area) => {
      for (const [key, change] of Object.entries(changes)) {
        const wanted = LOCAL_ONLY.has(key) || !this.sync ? "local" : "sync";
        if (area !== wanted || key === SYNC_FLAG) continue;
        // Our own writes arrive here too; only a different value is news.
        const same = JSON.stringify(this.cache.get(key)) === JSON.stringify(change.newValue);
        if (same || this.pending.has(key)) continue;
        if (change.newValue === undefined) this.cache.delete(key);
        else this.cache.set(key, change.newValue);
        this.onExternalChange?.(key);
      }
    });
  }

  get<T>(key: string, fallback: T): T {
    return this.cache.has(key) ? (this.cache.get(key) as T) : fallback;
  }

  set(key: string, value: Json) {
    this.cache.set(key, value);
    this.pending.set(key, value);
    this.queue();
  }

  remove(key: string) {
    this.cache.delete(key);
    this.pending.set(key, undefined);
    this.queue();
  }

  get syncing() {
    return this.sync;
  }

  /** Whether chrome.storage.sync exists here (it doesn't in a plain browser tab). */
  get canSync() {
    return hasChrome && !!chrome.storage.sync;
  }

  /** Turn Sync on or off, moving the data to the new place. */
  async setSync(on: boolean) {
    if (!this.canSync || on === this.sync) return;
    await this.flush();
    const syncable = [...this.cache].filter(([k]) => !LOCAL_ONLY.has(k));
    if (on) {
      // Local data goes up; anything already in the cloud from another device wins for keys it has.
      const cloud = await chrome.storage.sync.get(null);
      const merged = Object.fromEntries(syncable);
      Object.assign(merged, cloud);
      await chrome.storage.sync.set(merged);
      for (const [k, v] of Object.entries(cloud)) this.cache.set(k, v);
      await chrome.storage.local.remove(syncable.map(([k]) => k));
    } else {
      // Keep this device's copy; the cloud copy is left for other devices.
      await chrome.storage.local.set(Object.fromEntries(syncable));
    }
    this.sync = on;
    await chrome.storage.local.set({ [SYNC_FLAG]: on });
  }

  private areaFor(key: string) {
    return LOCAL_ONLY.has(key) || !this.sync ? chrome.storage.local : chrome.storage.sync;
  }

  private queue() {
    clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.flush(), WRITE_DELAY);
  }

  /** Write anything waiting, now. */
  async flush() {
    clearTimeout(this.timer);
    const batch = [...this.pending];
    this.pending.clear();
    if (!batch.length) return;
    if (!hasChrome) {
      try {
        for (const [k, v] of batch) {
          if (v === undefined) localStorage.removeItem(PREFIX + k);
          else localStorage.setItem(PREFIX + k, JSON.stringify(v));
        }
      } catch {
        // Storage unavailable: settings still apply for this visit.
      }
      return;
    }
    const removes: Record<Area, string[]> = { local: [], sync: [] };
    const sets: Record<Area, Record<string, Json>> = { local: {}, sync: {} };
    for (const [k, v] of batch) {
      const area: Area = this.areaFor(k) === chrome.storage.local ? "local" : "sync";
      if (v === undefined) removes[area].push(k);
      else sets[area][k] = v;
    }
    try {
      for (const area of ["local", "sync"] as const) {
        const target = chrome.storage[area];
        if (removes[area].length) await target.remove(removes[area]);
        if (Object.keys(sets[area]).length) await target.set(sets[area]);
      }
    } catch (err) {
      // Most likely a sync quota: keep the page working, the value just won't be saved.
      console.warn("ascii-animals: couldn't save settings", err);
    }
  }
}

export const store = new Store();

// A tab that closes right after a change shouldn't lose it.
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => void store.flush());
}

/** The current settings, filled in with defaults for anything missing. */
export const getSettings = (): Settings => ({ ...SETTINGS_DEFAULTS, ...store.get<Partial<Settings>>("settings", {}) });

export function saveSettings(patch: Partial<Settings>) {
  store.set("settings", { ...getSettings(), ...patch });
}
