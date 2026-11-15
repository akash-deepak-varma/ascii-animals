# ascii animals: New Tab

A Chrome extension that replaces your New Tab page with a live scene: animals drawn as ASCII on a canvas, crossing the screen along one course, with a glass search box in the middle. The animal engine has no runtime dependencies.

## Install (unpacked)

```sh
npm install
npm run build
```

Then open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick the `dist/` folder. Open a new tab.

A Chrome *theme* can only hold still images and colours, so it cannot animate or react to clicks; a New Tab extension can, which is why this is one.

Pick one from the row of animals in the top bar. Dark mode only, and each animal has its own colour:

| Animal | How it moves |
|---|---|
| Butterfly | blue morphos on migration: flutter, zigzag, glide with wings flat |
| Koi | lazy S-curves on bendy spines; kohaku, sanke, showa, ogon and chagoi; tap to drop food and koi close by swim over to eat |
| Jellyfish | bioluminescent magenta: each pulse lights the bell up, then the glow eases out; frilly twisting arms, marine snow (made for dark mode) |
| Dragonfly | emerald hawkers: hover, dart, cruise along for a while; white eyes with black pupils on the nearer ones, a striped green thorax, a dark body banded emerald, clear veined wings with a sweeping glint (made for dark mode) |
| Frog | spotted leopard frogs that sit, breathe and blink, then leap in an arc (bigger at the top), with a splash on landing |
| Crane | red-crowned, after the paintings: each flies its own way along the course, flapping at its own pace and gliding now and then (Folding flap in Tweaks for a slow downstroke and a quick, wrist-folding upstroke); broad white wings with splayed fingers and black secondaries, a red crown, dark eyes on the nearer ones |
| Crab | scuttle sideways in bursts, legs stepping, footprints in the sand; tap and they bolt away, claws up |

Everywhere:

- smaller ones are farther away: they move slower and fade into the background
- whoever leaves downstream comes back in upstream
- **click** to startle the ones nearby (each animal reacts its own way)
- the last animal picked is remembered between visits (in `chrome.storage`)
- a liquid-glass **search box** in the middle, with the logo above it as glass:
  type a search and Enter runs it through your browser's default search engine, type an address and it opens that;
  the mic button does voice search where the browser supports it. Above it, a greeting by the time of day;
  the refraction uses an SVG filter in Chromium and falls back to frosted glass elsewhere
- a **Tweaks** panel (top right): shared Movement and Look sliders plus each animal's own,
  saved per animal; double-click a label to reset it, **Copy** exports what you changed as JSON

Optional extras, all off until you turn them on in **Settings** (the gear, top right; also the extension's Options page):

| Setting | What it does |
|---|---|
| Name | adds your name to the greeting ("Good morning, Sam"); empty leaves it out |
| Show greeting / search box | hide either one |
| Shortcuts | a row of tiles under the search box: your top sites or your bookmarks bar. Chrome asks for permission only when you pick one |
| Auto-rotate | a different animal on each new tab, or every few minutes |
| Power saver | 30 fps at standard resolution, lighter on battery and CPU |
| Sync across devices | keeps your animal, tweaks and settings the same on every Chrome you're signed in to (`chrome.storage.sync`) |

For development, `npm run dev` runs the page in a normal browser tab (settings then use `localStorage`, and there's no Chrome search or shortcuts), and `npm run typecheck` checks the types.
`?animal=koi` picks an animal, `?count=60` pins how many.

```ts
import { AnimalEngine } from "./src";

const engine = new AnimalEngine(canvas, { animal: "jellyfish", theme: "dark", tuning: { speed: 1.4 } });
engine.setAnimal("cranes");
engine.set("density", 2);
```

## How it's put together

- `src/flock.ts`: the world every animal shares (population, depth, the course, re-entry,
  startle, steering helpers) and the shared knobs
- `src/renderer.ts`: the ASCII renderer and the `Pen` animals draw with (supersampled
  silhouettes, line glyphs, dots, the trail)
- `src/animals/*.ts`: one file per animal: its behaviour, shape, paint and its own knobs
- `src/engine.ts`: the loop, resizing, input and switching animals
- `store.ts`: settings storage (`chrome.storage.local` or `.sync`, `localStorage` outside Chrome)
- `settings.ts`, `shortcuts.ts`, `ui.ts`, `panel.ts`, `demo.ts`: the page around the scene: Settings, shortcut tiles, search box and greeting, Tweaks panel, and the startup that ties them together
- `public/manifest.json`: the extension manifest (Manifest V3; permissions `storage` and `search`, optional `topSites` and `bookmarks`)

## Packaging and sharing

```sh
npm run package              # build + checks + release/ascii-animals-newtab-v<version>.zip (+ .sha256)
npm run package -- --store   # same, but refuses while the logo credit is unfinished
npm run screenshots          # 1280x800 store screenshots + 440x280 promo tile -> release/store/
npm run logo                 # re-make public/logo.png from assets-src/ (kept out of git)
```

The manifest's `version` is the source of truth. Friends get the ZIP with `docs/INSTALL-FRIENDS.md`;
the store gets the same ZIP, with copy-paste text in `docs/store-listing.md` and the policy in `PRIVACY.md`.

## Before publishing to the Chrome Web Store

- Credit the logo art (see `THIRD_PARTY_NOTICES.md`) in the store description, and replace it if its licence doesn't allow use in a published extension.
- Replace the generated icons in `public/icons/` (`npm run icons` redraws the defaults) and add store screenshots and a promo tile.
- The extension collects and sends nothing: settings stay in `chrome.storage` (and Chrome's own sync, if you turn it on). Say so in the privacy policy, and justify `search` (runs your searches), `storage`, and the optional `topSites` and `bookmarks` (the shortcut tiles).

Built on the engine and renderer from [ascii-sharks](https://github.com/stackedlol/ascii-sharks). MIT
