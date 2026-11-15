/**
 * A row of glass tiles under the search box: the sites you visit most, or your bookmarks bar.
 * Both need a permission that the extension only asks for when you turn this on in Settings.
 */
import type { Settings } from "./store";

type Mode = Settings["shortcuts"];
interface Site {
  title: string;
  url: string;
}

const MAX_TILES = 8;
const PERMISSION: Record<Exclude<Mode, "off">, chrome.runtime.ManifestPermission> = {
  topSites: "topSites",
  bookmarks: "bookmarks",
};

const hasChrome = typeof chrome !== "undefined" && !!chrome.permissions;

/** Ask for the permission a mode needs (must be called from a click). True if we have it now. */
export async function requestShortcuts(mode: Mode): Promise<boolean> {
  if (mode === "off") return true;
  if (!hasChrome) return false;
  const perm = { permissions: [PERMISSION[mode]] };
  try {
    return (await chrome.permissions.contains(perm)) || (await chrome.permissions.request(perm));
  } catch {
    return false;
  }
}

async function load(mode: Mode): Promise<Site[]> {
  if (!hasChrome || mode === "off") return [];
  if (!(await chrome.permissions.contains({ permissions: [PERMISSION[mode]] }))) return [];
  if (mode === "topSites") {
    const sites = await chrome.topSites.get();
    return sites.map((s) => ({ title: s.title, url: s.url }));
  }
  const [root] = await chrome.bookmarks.getTree();
  // The bookmarks bar is the first folder of the tree (id "1" in Chrome).
  const bar = root.children?.find((n) => n.id === "1") ?? root.children?.[0];
  return (bar?.children ?? []).filter((n) => n.url).map((n) => ({ title: n.title, url: n.url! }));
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** Draw (or clear) the tiles. Safe to call again whenever the setting changes. */
export async function renderShortcuts(host: HTMLElement, mode: Mode) {
  host.dataset.mode = mode;
  host.replaceChildren();
  host.hidden = true;
  let sites: Site[] = [];
  try {
    sites = await load(mode);
  } catch {
    // Permission revoked or API missing: show nothing.
  }
  // A newer call may have run while this one was loading.
  if (host.dataset.mode !== mode) return;
  sites = sites.slice(0, MAX_TILES);
  if (!sites.length) return;

  for (const site of sites) {
    const name = site.title || hostOf(site.url);
    const a = document.createElement("a");
    a.className = "shortcut";
    a.href = site.url;
    a.title = site.url;

    const badge = document.createElement("span");
    badge.className = "shortcut-badge";
    badge.textContent = (name.match(/[\p{L}\p{N}]/u)?.[0] ?? "•").toUpperCase();
    badge.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = "shortcut-label";
    label.textContent = name;

    a.append(badge, label);
    host.append(a);
  }
  host.hidden = false;
}
