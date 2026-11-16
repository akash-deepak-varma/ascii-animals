/**
 * Shortcut tiles under the search box: your bookmarks bar (folders and all) or your top sites.
 *
 *   - Link tiles show the site's icon (read from the browser's own icon cache; nothing is fetched),
 *     or a coloured letter when there's no icon or no permission for it.
 *   - Folder tiles open a glass popover with what's inside, nested folders expandable in place.
 *   - What doesn't fit in two rows goes behind a "More" tile, so nothing is ever cut off.
 *   - Bookmark changes show up live; revoking the permission, or an empty bar, says so.
 *
 * The permissions are optional: the extension only asks for them when this is turned on in Settings.
 */
import type { Settings } from "./store";

type Mode = Settings["shortcuts"];
type Active = Exclude<Mode, "off">;

interface Link {
  kind: "link";
  title: string;
  url: string;
}
interface Folder {
  kind: "folder";
  title: string;
  children: Item[];
}
type Item = Link | Folder;
type BookmarkNode = chrome.bookmarks.BookmarkTreeNode & { folderType?: string };

export interface Shortcuts {
  /** Stop listening, close anything open and hide the row. */
  dispose(): void;
}

const hasChrome = typeof chrome !== "undefined" && !!chrome.permissions;
const PERMISSION: Record<Active, string> = { topSites: "topSites", bookmarks: "bookmarks" };
const FAVICON = "favicon";
/** Tiles show in this many rows; the rest go behind "More". */
const ROWS = 2;
const POPOVER_MAX_HEIGHT = 420;
/** Ask before opening more tabs than this at once. */
const OPEN_ALL_CONFIRM = 10;
/** Edge calls bookmarks "favorites". */
const WORD = typeof navigator !== "undefined" && /Edg\//.test(navigator.userAgent) ? "favorites" : "bookmarks";
const ADD_KEY = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform) ? "⌘D" : "Ctrl+D";

// ── permissions ─────────────────────────────────────────────────────────

const asPerm = (permissions: string[]) => ({ permissions }) as unknown as chrome.permissions.Permissions;

async function has(permissions: string[]) {
  try {
    return await chrome.permissions.contains(asPerm(permissions));
  } catch {
    return false;
  }
}

/**
 * Ask for what a mode needs: its own permission plus site icons, in one prompt. Must be called from a
 * click. True if the mode's own permission is held afterwards (icons are a bonus: without them the
 * tiles show letters).
 */
export async function requestShortcuts(mode: Mode): Promise<boolean> {
  if (mode === "off") return true;
  if (!hasChrome) return false;
  const own = PERMISSION[mode];
  const missing: string[] = [];
  for (const p of [own, FAVICON]) if (!(await has([p]))) missing.push(p);
  if (!missing.length) return true;
  try {
    await chrome.permissions.request(asPerm(missing));
  } catch {
    // The icons permission isn't offered here: settle for the mode's own.
    try {
      if (missing.includes(own)) await chrome.permissions.request(asPerm([own]));
    } catch {
      return false;
    }
  }
  // The prompt is all-or-nothing, so judge by what we hold now rather than by its answer.
  return has([own]);
}

// ── reading bookmarks and top sites ─────────────────────────────────────

/** Bookmarklets and data: pages can't run from an extension page, so they're left out. */
const openable = (url: string) => !!url && !/^(javascript|data|vbscript):/i.test(url);

function toItems(nodes: BookmarkNode[] | undefined): Item[] {
  const out: Item[] = [];
  for (const n of nodes ?? []) {
    if (n.url !== undefined) {
      if (openable(n.url)) out.push({ kind: "link", title: n.title.trim(), url: n.url });
    } else {
      out.push({ kind: "folder", title: n.title.trim() || "Untitled folder", children: toItems(n.children as BookmarkNode[]) });
    }
  }
  return out;
}

const countLinks = (items: Item[]): number => items.reduce((n, i) => n + (i.kind === "link" ? 1 : countLinks(i.children)), 0);

async function loadBookmarks(): Promise<Item[]> {
  const [root] = await chrome.bookmarks.getTree();
  const tops = (root.children ?? []) as BookmarkNode[];
  // folderType is the reliable marker; the ids are what Chrome and Edge use when it's missing.
  const bar = tops.find((n) => n.folderType === "bookmarks-bar") ?? tops.find((n) => n.id === "1") ?? tops[0];
  const other = tops.find((n) => n.folderType === "other") ?? tops.find((n) => n.id === "2" && n !== bar);
  const items = toItems(bar?.children as BookmarkNode[]);
  if (other) {
    const inside = toItems(other.children as BookmarkNode[]);
    if (inside.length) items.push({ kind: "folder", title: other.title.trim() || "Other bookmarks", children: inside });
  }
  return items;
}

async function loadTopSites(): Promise<Item[]> {
  const sites = await chrome.topSites.get();
  return sites.filter((s) => openable(s.url)).map((s): Link => ({ kind: "link", title: (s.title ?? "").trim(), url: s.url }));
}

// ── small helpers ───────────────────────────────────────────────────────

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || url;
  } catch {
    return url;
  }
};

const isWeb = (url: string) => /^https?:/i.test(url);
const nameOf = (item: Link) => item.title || hostOf(item.url);
const hueOf = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

const FOLDER_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`;
const DOTS_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5.5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="18.5" cy="12" r="1.8"/></svg>`;
const PLUS_SVG = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>`;
const CHEVRON_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>`;

function svgBox(className: string, svg: string) {
  const box = el("span", className);
  box.innerHTML = svg; // fixed markup above, no user text
  return box;
}

/** The site's icon on a light plate, or (no icon, no permission, load error) a coloured letter. */
function siteIcon(link: Link, icons: boolean, size: "tile" | "row") {
  const box = el("span", `site-icon ${size}`);
  box.setAttribute("aria-hidden", "true");
  const name = nameOf(link);
  const letter = () => {
    box.classList.remove("has-img");
    box.style.setProperty("--hue", String(hueOf(hostOf(link.url))));
    box.replaceChildren((name.match(/[\p{L}\p{N}]/u)?.[0] ?? "•").toUpperCase());
  };
  if (icons && isWeb(link.url)) {
    const img = el("img");
    const src = new URL(chrome.runtime.getURL("/_favicon/"));
    src.searchParams.set("pageUrl", link.url);
    src.searchParams.set("size", "32");
    img.src = src.href;
    img.alt = "";
    img.decoding = "async";
    img.draggable = false;
    img.addEventListener("error", letter, { once: true });
    box.classList.add("has-img");
    box.append(img);
  } else {
    letter();
  }
  return box;
}

/** chrome://, edge://, file: and the like can't be followed from an extension page: go through tabs. */
function wireLink(a: HTMLAnchorElement, url: string, onOpen?: () => void) {
  a.href = url;
  if (!isWeb(url) && typeof chrome !== "undefined" && chrome.tabs) {
    const open = (background: boolean) => {
      if (background) void chrome.tabs.create({ url, active: false });
      else void chrome.tabs.update({ url });
    };
    a.addEventListener("click", (e) => {
      e.preventDefault();
      open(e.ctrlKey || e.metaKey);
      onOpen?.();
    });
    a.addEventListener("auxclick", (e) => {
      if (e.button !== 1) return;
      e.preventDefault();
      open(true);
    });
  } else if (onOpen) {
    a.addEventListener("click", onOpen);
  }
}

function openAll(items: Item[]) {
  const urls: string[] = [];
  const walk = (list: Item[]) => list.forEach((i) => (i.kind === "link" ? urls.push(i.url) : walk(i.children)));
  walk(items);
  if (!urls.length || typeof chrome === "undefined" || !chrome.tabs) return;
  if (urls.length > OPEN_ALL_CONFIRM && !confirm(`Open ${urls.length} tabs?`)) return;
  for (const url of urls) void chrome.tabs.create({ url, active: false });
}

// ── folder popover ──────────────────────────────────────────────────────

let current: { pop: HTMLElement; anchor: HTMLElement; off: () => void } | null = null;

function closePopover(refocus = false) {
  if (!current) return;
  const { pop, anchor, off } = current;
  current = null;
  off();
  pop.remove();
  anchor.setAttribute("aria-expanded", "false");
  anchor.classList.remove("open");
  if (refocus && anchor.isConnected) anchor.focus();
}

function visibleRows(pop: HTMLElement) {
  return [...pop.querySelectorAll<HTMLElement>(".pop-row")].filter((r) => !r.closest("[hidden]"));
}

function fillRows(parent: HTMLElement, items: Item[], depth: number, icons: boolean) {
  if (!items.length) {
    parent.append(el("p", "pop-empty", "Empty folder"));
    return;
  }
  for (const item of items) {
    if (item.kind === "link") {
      const a = el("a", "pop-row");
      a.setAttribute("role", "menuitem");
      a.style.setProperty("--depth", String(depth));
      a.append(siteIcon(item, icons, "row"), el("span", "pop-title", nameOf(item)), el("span", "pop-host", hostOf(item.url)));
      a.title = item.url;
      wireLink(a, item.url, () => closePopover());
      parent.append(a);
      continue;
    }
    const row = el("button", "pop-row pop-folder");
    row.type = "button";
    row.setAttribute("role", "menuitem");
    row.setAttribute("aria-haspopup", "true");
    row.setAttribute("aria-expanded", "false");
    row.style.setProperty("--depth", String(depth));
    row.append(svgBox("pop-chevron", CHEVRON_SVG), svgBox("pop-glyph", FOLDER_SVG), el("span", "pop-title", item.title), el("span", "pop-host", String(countLinks(item.children))));
    const sub = el("div", "pop-sub");
    sub.setAttribute("role", "group");
    sub.hidden = true;
    let filled = false;
    row.addEventListener("click", () => {
      const open = sub.hidden;
      if (open && !filled) {
        filled = true;
        fillRows(sub, item.children, depth + 1, icons);
      }
      sub.hidden = !open;
      row.setAttribute("aria-expanded", String(open));
    });
    parent.append(row, sub);
  }
}

function placePopover(pop: HTMLElement, anchor: HTMLElement) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const r = anchor.getBoundingClientRect();
  const width = Math.min(320, vw - 24);
  pop.style.width = `${width}px`;
  pop.style.left = `${Math.max(12, Math.min(vw - width - 12, r.left + r.width / 2 - width / 2))}px`;
  pop.style.maxHeight = "none";
  const natural = Math.min(pop.offsetHeight, POPOVER_MAX_HEIGHT);
  const below = vh - r.bottom - 20;
  const above = r.top - 20;
  if (below >= Math.min(natural, 240) || below >= above) {
    pop.style.top = `${r.bottom + 8}px`;
    pop.style.bottom = "auto";
    pop.style.maxHeight = `${Math.min(POPOVER_MAX_HEIGHT, below)}px`;
  } else {
    pop.style.bottom = `${vh - r.top + 8}px`;
    pop.style.top = "auto";
    pop.style.maxHeight = `${Math.min(POPOVER_MAX_HEIGHT, above)}px`;
  }
}

function openPopover(anchor: HTMLElement, title: string, items: Item[], icons: boolean, withOpenAll: boolean) {
  closePopover();
  const pop = el("div", "shortcut-pop glass");
  pop.setAttribute("role", "menu");
  pop.setAttribute("aria-label", title);

  const head = el("div", "pop-head");
  head.append(el("h2", "", title));
  if (withOpenAll && countLinks(items) > 0) {
    const all = el("button", "pop-open", `Open all (${countLinks(items)})`);
    all.type = "button";
    all.addEventListener("click", () => {
      openAll(items);
      closePopover();
    });
    head.append(all);
  }
  const list = el("div", "pop-list");
  fillRows(list, items, 0, icons);
  pop.append(head, list);
  document.body.append(pop);
  placePopover(pop, anchor);
  anchor.setAttribute("aria-expanded", "true");
  anchor.classList.add("open");

  const onDown = (e: PointerEvent) => {
    const t = e.target as Node;
    if (!pop.contains(t) && !anchor.contains(t)) closePopover();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      closePopover(true);
    }
  };
  const onResize = () => closePopover();
  document.addEventListener("pointerdown", onDown, true);
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", onResize);
  const off = () => {
    document.removeEventListener("pointerdown", onDown, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", onResize);
  };
  current = { pop, anchor, off };

  pop.addEventListener("keydown", (e) => {
    const rows = visibleRows(pop);
    const at = rows.indexOf(document.activeElement as HTMLElement);
    const go = (i: number) => rows[Math.max(0, Math.min(rows.length - 1, i))]?.focus();
    const row = rows[at];
    const expanded = row?.getAttribute("aria-expanded");
    if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(rows.length - 1);
    else if (e.key === "ArrowRight" && expanded === "false") row.click();
    else if (e.key === "ArrowRight" && expanded === "true") go(at + 1);
    else if (e.key === "ArrowLeft" && expanded === "true") row.click();
    else if (e.key === "ArrowLeft" && row) {
      // Back to the folder this row sits in.
      const parent = row.closest(".pop-sub")?.previousElementSibling as HTMLElement | null;
      parent?.focus();
    } else return;
    e.preventDefault();
  });
  visibleRows(pop)[0]?.focus({ preventScroll: true });
}

// ── the row of tiles ────────────────────────────────────────────────────

export function mountShortcuts(host: HTMLElement, mode: Active): Shortcuts {
  let disposed = false;
  let token = 0;
  let timer = 0;
  let subscribed = false;
  let lastColumns = 0;
  let state: "loading" | "ok" | "empty" | "denied" = "loading";
  let deniedNote = "";
  let items: Item[] = [];
  let icons = false;
  const unsubscribe: (() => void)[] = [];

  const schedule = () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => void refresh(), 250);
  };

  function subscribeBookmarks() {
    if (subscribed || mode !== "bookmarks" || !chrome.bookmarks) return;
    const b = chrome.bookmarks;
    const events = [b.onCreated, b.onRemoved, b.onChanged, b.onMoved, b.onChildrenReordered, b.onImportEnded] as unknown as chrome.events.Event<() => void>[];
    for (const e of events) {
      e.addListener(schedule);
      unsubscribe.push(() => e.removeListener(schedule));
    }
    subscribed = true;
  }

  async function refresh() {
    const mine = ++token;
    const granted = await has([PERMISSION[mode]]);
    const withIcons = granted && (await has([FAVICON]));
    let loaded: Item[] = [];
    if (granted) {
      if (mode === "bookmarks") subscribeBookmarks();
      try {
        loaded = mode === "bookmarks" ? await loadBookmarks() : await loadTopSites();
      } catch {
        loaded = [];
      }
    }
    if (disposed || mine !== token) return;
    icons = withIcons;
    items = loaded;
    state = !granted ? "denied" : loaded.length ? "ok" : "empty";
    paint();
  }

  function columns() {
    // The grid reports its resolved tracks; auto-fit lists unused ones as 0px, which don't count.
    const tracks = getComputedStyle(host).gridTemplateColumns.split(" ").filter((t) => parseFloat(t) > 0);
    return tracks.length || Math.max(1, Math.floor(host.clientWidth / 96));
  }

  function tile(kind: string, label: string, badge: HTMLElement, tag: "a" | "button" = "button") {
    const t = el(tag, `shortcut ${kind}`);
    if (t instanceof HTMLButtonElement) t.type = "button";
    t.append(badge, el("span", "shortcut-label", label));
    return t;
  }

  function folderTile(folder: Folder) {
    const wrap = el("span", "badge-wrap");
    wrap.append(svgBox("site-icon tile folder", FOLDER_SVG), el("span", "shortcut-count", String(countLinks(folder.children))));
    const t = tile("shortcut-folder", folder.title, wrap);
    t.title = folder.title;
    t.setAttribute("aria-haspopup", "menu");
    t.setAttribute("aria-expanded", "false");
    t.addEventListener("click", () => {
      if (current?.anchor === t) closePopover();
      else openPopover(t, folder.title, folder.children, icons, true);
    });
    return t;
  }

  function paint() {
    closePopover();
    host.replaceChildren();
    host.hidden = false; // the grid must be laid out to know how many columns fit
    host.dataset.mode = mode;

    if (state === "loading") {
      host.hidden = true;
      return;
    }
    if (state === "denied") {
      const cta = tile("shortcut-cta", mode === "bookmarks" ? `Allow ${WORD}` : "Allow top sites", svgBox("site-icon tile cta", PLUS_SVG));
      cta.title = mode === "bookmarks" ? `Let this page read your ${WORD}` : "Let this page read your most visited sites";
      cta.addEventListener("click", async () => {
        deniedNote = "";
        if (await requestShortcuts(mode)) {
          void refresh();
        } else {
          deniedNote = "Not allowed, so there is nothing to show. Click again to be asked once more.";
          paint();
        }
      });
      host.append(cta);
      if (deniedNote) host.append(el("p", "shortcut-hint", deniedNote));
      return;
    }
    if (state === "empty") {
      host.append(
        el("p", "shortcut-hint", mode === "bookmarks" ? `Your ${WORD} bar is empty. Press ${ADD_KEY} on a page to add one.` : "Your most visited sites will show up here as you browse."),
      );
      return;
    }

    const cols = columns();
    lastColumns = cols;
    const capacity = cols * ROWS;
    const fits = items.length <= capacity;
    const shown = fits ? items : items.slice(0, capacity - 1);
    for (const item of shown) {
      if (item.kind === "folder") {
        host.append(folderTile(item));
        continue;
      }
      const a = tile("shortcut-link", nameOf(item), siteIcon(item, icons, "tile"), "a");
      a.title = item.url;
      wireLink(a as HTMLAnchorElement, item.url);
      host.append(a);
    }
    if (!fits) {
      const rest = items.slice(capacity - 1);
      const more = tile("shortcut-more", `More (${rest.length})`, svgBox("site-icon tile more", DOTS_SVG));
      more.title = "The rest of your shortcuts";
      more.setAttribute("aria-haspopup", "menu");
      more.setAttribute("aria-expanded", "false");
      more.addEventListener("click", () => {
        if (current?.anchor === more) closePopover();
        else openPopover(more, "More", rest, icons, false);
      });
      host.append(more);
    }
  }

  // Window size changes how many tiles fit.
  const observer = new ResizeObserver(() => {
    if (state === "ok" && columns() !== lastColumns) paint();
  });
  observer.observe(host);

  if (hasChrome) {
    chrome.permissions.onAdded.addListener(schedule);
    chrome.permissions.onRemoved.addListener(schedule);
    unsubscribe.push(() => chrome.permissions.onAdded.removeListener(schedule), () => chrome.permissions.onRemoved.removeListener(schedule));
    void refresh();
  } else {
    host.hidden = true; // a plain browser tab (npm run dev): nothing to read
  }

  return {
    dispose() {
      disposed = true;
      clearTimeout(timer);
      observer.disconnect();
      for (const off of unsubscribe) {
        try {
          off();
        } catch {
          // The API may already be gone with its permission.
        }
      }
      closePopover();
      host.replaceChildren();
      host.hidden = true;
      delete host.dataset.mode;
    },
  };
}
