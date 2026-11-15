// Builds the extension and zips it for sharing or for the Chrome Web Store.
//   npm run package            friends build (warns about unfinished credits)
//   npm run package -- --store refuses to package while the credits are unfinished
//
// The manifest's version is the source of truth: package.json is synced to it.
// The same ZIP goes to friends and to the store, so what they test is what you ship.
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "dist");
const RELEASE = join(ROOT, "release");
const STORE = process.argv.includes("--store");

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

// ── 1. sync versions, build ──
const manifestSrc = join(ROOT, "public", "manifest.json");
const sourceManifest = JSON.parse(readFileSync(manifestSrc, "utf8"));
const pkgPath = join(ROOT, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
if (pkg.version !== sourceManifest.version) {
  console.log(`package.json version ${pkg.version} -> ${sourceManifest.version} (the manifest wins)`);
  pkg.version = sourceManifest.version;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
}

console.log("Building...");
execSync("npm run build", { cwd: ROOT, stdio: "inherit" });

// The licence notices travel inside the extension (fonts and the engine require it).
copyFileSync(join(ROOT, "THIRD_PARTY_NOTICES.md"), join(DIST, "THIRD_PARTY_NOTICES.md"));

// ── 2. preflight ──
const walk = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
const files = walk(DIST).map((abs) => ({ abs, name: relative(DIST, abs).split(sep).join("/"), size: statSync(abs).size }));
const has = (name) => files.some((f) => f.name === name);

if (!has("manifest.json")) fail("manifest.json is not at the root of dist/");
const manifest = has("manifest.json") ? JSON.parse(readFileSync(join(DIST, "manifest.json"), "utf8")) : {};

if (manifest.manifest_version !== 3) fail("manifest_version must be 3");
if (!/^\d+(\.\d+){0,3}$/.test(manifest.version ?? "")) fail(`bad version "${manifest.version}" (use numbers and dots, e.g. 1.0.0)`);
if (!manifest.name || manifest.name.length > 75) fail("name is missing or longer than 75 characters");
if (/chrome/i.test(manifest.name ?? "")) fail('the store rejects names containing "Chrome"');
if (!manifest.description) fail("description is missing");
else if (manifest.description.length > 132) fail(`description is ${manifest.description.length} characters; the store allows 132`);

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
for (const [size, path] of Object.entries(manifest.icons ?? {})) {
  const f = files.find((x) => x.name === path);
  if (!f) {
    fail(`icon ${size} points at ${path}, which isn't in the build`);
    continue;
  }
  const head = readFileSync(f.abs).subarray(0, 24);
  if (!head.subarray(0, 8).equals(PNG)) fail(`${path} isn't a real PNG`);
  else if (head.readUInt32BE(16) !== Number(size) || head.readUInt32BE(20) !== Number(size)) {
    fail(`${path} is ${head.readUInt32BE(16)}x${head.readUInt32BE(20)}, not ${size}x${size}`);
  }
}
for (const need of ["16", "32", "48", "128"]) if (!manifest.icons?.[need]) fail(`icons.${need} is missing from the manifest`);

for (const f of files) {
  if (f.size > 1024 * 1024) fail(`${f.name} is ${(f.size / 1048576).toFixed(1)} MB (limit 1 MB per file here: did a source image slip into public/?)`);
  if (f.name.endsWith(".map")) fail(`${f.name} is a source map; leave those out of the package`);
  if (/(^|\/)dia-/i.test(f.name)) fail(`${f.name} still carries the old Dia name`);
}
for (const target of [manifest.chrome_url_overrides?.newtab, manifest.options_page]) {
  if (target && !has(target.split("?")[0])) fail(`manifest points at ${target}, which isn't in the build`);
}
if (!has("THIRD_PARTY_NOTICES.md")) fail("THIRD_PARTY_NOTICES.md didn't make it into the build");

const notices = readFileSync(join(ROOT, "THIRD_PARTY_NOTICES.md"), "utf8");
if (notices.includes("_______") || /TODO before sharing/i.test(notices)) {
  const msg = "THIRD_PARTY_NOTICES.md still has the logo credit to fill in";
  if (STORE) fail(msg + " (required for the store)");
  else warn(msg + ": fine for a few friends, not for the store");
}
const indexHtml = has("index.html") ? readFileSync(join(DIST, "index.html"), "utf8") : "";
if (/<script(?![^>]*\bsrc=)[^>]*>[^<]/i.test(indexHtml)) fail("index.html has an inline <script>; extension pages forbid it");
if (/https?:\/\/(fonts\.googleapis|fonts\.gstatic)/.test(indexHtml)) fail("index.html still loads fonts from the network");

if (errors.length) {
  console.error("\nNot packaged. Fix these first:\n" + errors.map((e) => "  x " + e).join("\n"));
  process.exit(1);
}

// ── 3. zip (forward slashes, manifest at the root) ──
const entries = {};
for (const f of files.sort((a, b) => a.name.localeCompare(b.name))) {
  entries[f.name] = [new Uint8Array(readFileSync(f.abs)), { level: f.name.endsWith(".woff2") || f.name.endsWith(".png") ? 0 : 9, mtime: new Date(2026, 0, 1) }];
}
const zip = zipSync(entries);
mkdirSync(RELEASE, { recursive: true });
const out = join(RELEASE, `ascii-animals-newtab-v${manifest.version}.zip`);
writeFileSync(out, zip);

// ── 4. report ──
const sha = createHash("sha256").update(zip).digest("hex");
console.log(`\nPackaged ${files.length} files:`);
for (const f of files) console.log(`  ${String(Math.round(f.size / 1024)).padStart(5)} KB  ${f.name}`);
console.log(`\n${relative(ROOT, out)}  ${(zip.length / 1024).toFixed(0)} KB`);
console.log(`sha256 ${sha}`);
writeFileSync(out + ".sha256", `${sha}  ${relative(RELEASE, out)}\n`);
for (const w of warnings) console.log(`\n! ${w}`);
if (!existsSync(out)) process.exit(1);
