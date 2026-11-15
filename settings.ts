/**
 * Settings popover: the optional extras (name, greeting, shortcuts, auto-rotate, sync, power saver).
 * Everything starts off, so a fresh install looks exactly like the plain scene. It reuses the
 * Tweaks panel's glass look and sits beside its button.
 */
import { requestShortcuts } from "./shortcuts";
import { getSettings, saveSettings, store, type Settings } from "./store";

interface Hooks {
  /** Run after any setting changed, with the new values. */
  onChange(settings: Settings, changed: keyof Settings | "sync"): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function mountSettings({ onChange }: Hooks) {
  const panel = el("aside", "tweaks settings glass");
  panel.setAttribute("aria-label", "Settings");
  panel.hidden = true;

  const header = el("header", "tweaks-head");
  const close = el("button", "tweaks-close");
  close.setAttribute("aria-label", "Close settings");
  close.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>`;
  header.append(el("h2", "", "Settings"), close);
  const body = el("div", "tweaks-body");
  panel.append(header, body);

  const opener = el("button", "settings-open glass");
  opener.setAttribute("aria-label", "Settings");
  opener.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`;

  const note = el("p", "settings-note");
  note.hidden = true;
  const say = (text: string) => {
    note.textContent = text;
    note.hidden = !text;
  };

  const section = (title: string) => {
    const s = el("section", "tweaks-group");
    s.append(el("h3", "", title));
    body.append(s);
    return s;
  };

  const rows: (() => void)[] = [];
  const refresh = () => rows.forEach((r) => r());
  const apply = (patch: Partial<Settings>, key: keyof Settings) => {
    saveSettings(patch);
    onChange(getSettings(), key);
    refresh();
  };

  const toggle = (parent: HTMLElement, label: string, key: "showGreeting" | "showSearch" | "powerSaver", hint?: string) => {
    const row = el("label", "tweaks-row toggle");
    const box = el("input");
    box.type = "checkbox";
    if (hint) row.title = hint;
    box.addEventListener("change", () => apply({ [key]: box.checked }, key));
    rows.push(() => (box.checked = getSettings()[key]));
    row.append(el("span", "tweaks-label", label), box);
    parent.append(row);
  };

  const choice = <K extends "shortcuts" | "rotate">(
    parent: HTMLElement,
    label: string,
    key: K,
    options: [Settings[K], string][],
    beforeApply?: (value: Settings[K]) => Promise<boolean>,
  ) => {
    const row = el("label", "tweaks-row select");
    const select = el("select", "settings-select");
    for (const [value, text] of options) {
      const o = el("option", "", text);
      o.value = value;
      select.append(o);
    }
    select.addEventListener("change", async () => {
      const value = select.value as Settings[K];
      say("");
      if (beforeApply && !(await beforeApply(value))) {
        select.value = getSettings()[key];
        return;
      }
      apply({ [key]: value }, key);
    });
    rows.push(() => (select.value = getSettings()[key]));
    row.append(el("span", "tweaks-label", label), select);
    parent.append(row);
  };

  // ── Greeting ──
  const hello = section("Greeting");
  const nameRow = el("label", "tweaks-row text");
  const name = el("input", "settings-text");
  name.type = "text";
  name.maxLength = 40;
  name.placeholder = "Your name (optional)";
  name.autocomplete = "off";
  name.addEventListener("input", () => apply({ name: name.value }, "name"));
  rows.push(() => {
    if (document.activeElement !== name) name.value = getSettings().name;
  });
  nameRow.append(el("span", "tweaks-label", "Name"), name);
  hello.append(nameRow);
  toggle(hello, "Show greeting", "showGreeting");
  toggle(hello, "Show search box", "showSearch");

  // ── Shortcuts ──
  const links = section("Shortcuts");
  choice(
    links,
    "Under the search box",
    "shortcuts",
    [["off", "Off"], ["topSites", "Top sites"], ["bookmarks", "Bookmarks bar"]],
    async (value) => {
      if (await requestShortcuts(value)) return true;
      say("Chrome didn't grant access, so shortcuts stay off.");
      return false;
    },
  );

  // ── Animals ──
  const animals = section("Animals");
  choice(animals, "Auto-rotate", "rotate", [["off", "Off"], ["newTab", "Each new tab"], ["timer", "Every few minutes"]]);
  const minutesRow = el("label", "tweaks-row select");
  const minutes = el("select", "settings-select");
  for (const m of [1, 2, 5, 10, 15, 30, 60]) {
    const o = el("option", "", m === 60 ? "1 hour" : `${m} min`);
    o.value = String(m);
    minutes.append(o);
  }
  minutes.addEventListener("change", () => apply({ rotateMinutes: Number(minutes.value) }, "rotateMinutes"));
  rows.push(() => {
    minutes.value = String(getSettings().rotateMinutes);
    minutesRow.classList.toggle("off", getSettings().rotate !== "timer");
    minutes.disabled = getSettings().rotate !== "timer";
  });
  minutesRow.append(el("span", "tweaks-label", "Switch every"), minutes);
  animals.append(minutesRow);

  // ── Performance and sync ──
  const device = section("This device");
  toggle(device, "Power saver", "powerSaver", "Draws at 30 fps and standard resolution: lighter on battery and CPU.");

  const syncRow = el("label", "tweaks-row toggle");
  const syncBox = el("input");
  syncBox.type = "checkbox";
  syncBox.disabled = !store.canSync;
  syncRow.title = store.canSync
    ? "Keeps your animal, tweaks and settings the same on every Chrome you're signed in to."
    : "Needs Chrome sync, which isn't available here.";
  syncBox.addEventListener("change", async () => {
    syncBox.disabled = true;
    say("");
    try {
      await store.setSync(syncBox.checked);
    } catch {
      say("Couldn't switch sync (the synced storage may be full).");
    }
    syncBox.checked = store.syncing;
    syncBox.disabled = !store.canSync;
    onChange(getSettings(), "sync");
  });
  rows.push(() => (syncBox.checked = store.syncing));
  syncRow.append(el("span", "tweaks-label", "Sync across devices"), syncBox);
  device.append(syncRow);

  body.append(note);
  refresh();

  // ── open / close ──
  // The Tweaks panel sits in the same corner, so only one of the two is open at a time.
  const tweaksPanel = () => document.querySelector<HTMLElement>(".tweaks:not(.settings)");
  const setOpen = (open: boolean) => {
    panel.hidden = !open;
    opener.hidden = open;
    if (open) {
      const tweaks = tweaksPanel();
      if (tweaks && !tweaks.hidden) tweaks.querySelector<HTMLElement>(".tweaks-close")?.click();
      refresh();
      panel.querySelector<HTMLElement>("input, select")?.focus({ preventScroll: true });
    }
  };
  close.addEventListener("click", () => setOpen(false));
  opener.addEventListener("click", () => setOpen(true));
  // Opening Tweaks closes Settings (the Tweaks panel is rebuilt per animal, so listen on the page).
  document.addEventListener("click", (e) => {
    if (!panel.hidden && (e.target as HTMLElement).closest?.(".tweaks-open")) setOpen(false);
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !panel.hidden) setOpen(false);
  });

  document.body.append(panel, opener);
  // The extension's "Options" entry opens index.html?settings=1.
  if (new URLSearchParams(location.search).has("settings")) setOpen(true);

  return { refresh, open: () => setOpen(true) };
}
