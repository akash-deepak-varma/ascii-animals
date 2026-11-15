// Takes the Chrome Web Store screenshots (1280x800) and the small promo tile (440x280) from the
// built extension, using a headless Chrome/Edge/Chromium it finds on this machine. No dependencies.
//   npm run build && npm run screenshots        -> release/store/*.png
// Set CHROME_PATH to use a specific browser.
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const OUT = join(ROOT, "release", "store");
const PORT = 9341;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].filter(Boolean);
const browser = CANDIDATES.find((p) => existsSync(p));
if (!browser) throw new Error("No Chrome, Edge or Chromium found. Set CHROME_PATH.");
if (!existsSync(join(DIST, "manifest.json"))) throw new Error("dist/ is empty: run `npm run build` first.");

// A scratch copy of the build that already holds the optional permissions, so the shortcut tiles can be
// shot without a permission prompt. The real package is never touched.
const work = mkdtempSync(join(tmpdir(), "ascii-shots-"));
const ext = join(work, "ext");
cpSync(DIST, ext, { recursive: true });
const manifestPath = join(ext, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
manifest.permissions.push(...(manifest.optional_permissions ?? []));
delete manifest.optional_permissions;
writeFileSync(manifestPath, JSON.stringify(manifest));

const chrome = spawn(
  browser,
  ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(work, "profile")}`,
    "--enable-unsafe-extension-debugging", "--no-first-run", "--no-default-browser-check", "--force-dark-mode", "about:blank"],
  { stdio: "ignore" },
);

async function json(path, init) {
  for (let i = 0; i < 60; i++) {
    try {
      return await (await fetch(`http://127.0.0.1:${PORT}${path}`, init)).json();
    } catch {
      await sleep(200);
    }
  }
  throw new Error("the browser never came up");
}

function connect(url) {
  const ws = new WebSocket(url);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) {
      pending.get(d.id)(d);
      pending.delete(d.id);
    }
  };
  const ready = new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) =>
    new Promise((res) => {
      const i = ++id;
      pending.set(i, res);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    return r.result?.result?.value;
  };
  return { ready, send, evaluate, ws };
}

const closeTab = async (id) => {
  try {
    await fetch(`http://127.0.0.1:${PORT}/json/close/${id}`);
  } catch {
    // Already gone.
  }
};

try {
  mkdirSync(OUT, { recursive: true });
  const ver = await json("/json/version");
  await sleep(1000);
  const b = connect(ver.webSocketDebuggerUrl);
  await b.ready;
  const loaded = await b.send("Extensions.loadUnpacked", { path: ext });
  if (!loaded.result?.id) throw new Error("couldn't load the extension: " + JSON.stringify(loaded.error ?? loaded));
  const extId = loaded.result.id;
  await sleep(800);

  /** Open the new tab page at a size, with the given saved state and query string. */
  async function shoot(file, { w = 1280, h = 800, scale = 1, query = "", settings = {}, run = "", wait = 3000 }) {
    const t = await json(`/json/new?chrome-extension://${extId}/index.html`, { method: "PUT" });
    const c = connect(t.webSocketDebuggerUrl);
    await c.ready;
    await c.send("Runtime.enable");
    await c.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: scale, mobile: false });
    // Fresh state each time, then reload with the query string.
    await c.evaluate(`chrome.storage.local.clear().then(()=>chrome.storage.local.set({settings:${JSON.stringify(settings)}}))`);
    if (settings.shortcuts === "bookmarks") {
      await c.evaluate(`Promise.all([["Wikipedia","https://www.wikipedia.org/"],["GitHub","https://github.com/"],["Maps","https://maps.example.com/"],["News","https://news.example.com/"],["Music","https://music.example.com/"],["Mail","https://mail.example.com/"]].map(([title,url])=>chrome.bookmarks.create({parentId:"1",title,url})))`);
    }
    await c.send("Page.navigate", { url: `chrome-extension://${extId}/index.html${query}` });
    await sleep(wait);
    if (run) {
      await c.evaluate(run);
      await sleep(600);
    }
    const shot = await c.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(OUT, file), Buffer.from(shot.result.data, "base64"));
    console.log("  ", file);
    c.ws.close();
    await closeTab(t.id);
  }

  console.log("Writing to", OUT);
  const clean = { name: "", showGreeting: true };
  await shoot("1-butterflies-1280x800.png", { query: "?animal=butterflies", settings: clean });
  await shoot("2-koi-1280x800.png", { query: "?animal=koi", settings: clean });
  await shoot("3-jellyfish-1280x800.png", { query: "?animal=jellyfish", settings: clean });
  await shoot("4-cranes-1280x800.png", { query: "?animal=cranes", settings: clean });
  await shoot("5-shortcuts-and-settings-1280x800.png", {
    query: "?animal=dragonflies",
    settings: { ...clean, shortcuts: "bookmarks", name: "Sam" },
    run: "document.querySelector('.settings-open').click()",
  });
  // The small promo tile: a 880x560 page captured at half scale gives 440x280 with the full layout.
  await shoot("promo-tile-440x280.png", { w: 880, h: 560, scale: 0.5, query: "?animal=koi", settings: clean });
  b.ws.close();
} finally {
  chrome.kill();
  await sleep(500);
  try {
    rmSync(work, { recursive: true, force: true });
  } catch {
    // Windows may still hold the profile for a moment; the OS temp folder will clear it.
  }
}
