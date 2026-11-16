# Privacy policy: ASCII Animals New Tab

_Last updated: 2026-11-16_

**ASCII Animals New Tab collects no data and sends nothing to anyone.** It has no servers, no accounts,
no analytics, no ads and no tracking, and it makes no network requests of its own (the fonts and artwork
are bundled inside the extension).

## What it stores, and where

On your device, in your browser's extension storage (`chrome.storage`):

- the animal you picked, your Tweaks slider values, and your Settings (name, shortcut choice, auto-rotate, power saver);
- whether the Tweaks panel is open.

If you turn on **Sync across devices**, those same values are kept in your browser's own synced storage
(`chrome.storage.sync`), which your browser vendor (for example Google or Microsoft) syncs between
browsers you are signed in to, under your account. The extension's author never sees them.

You can clear all of it by removing the extension.

## What it uses, and why

| Permission | Why |
|---|---|
| `storage` | Remember your animal, Tweaks and Settings. |
| `search` | When you type in the search box, run it through your browser's default search engine. The search goes to that engine, exactly as if you had used the address bar. The extension does not see or keep your results. |
| `topSites` (optional, asked only if you choose "Top sites") | Read your most-visited sites to draw shortcut tiles. Read locally, never sent anywhere. |
| `bookmarks` (optional, asked only if you choose "Bookmarks and folders") | Read your bookmarks bar and folders to draw shortcut tiles and folder menus, and keep them up to date when you change a bookmark. Read locally, never sent anywhere. |
| `favicon` (optional, asked together with one of the two above) | Show each site's small icon on your shortcut tiles. The icons come from your browser's own icon cache; the extension fetches nothing from the internet. If you decline, tiles show a coloured letter instead. |

You can revoke the optional permissions at any time in your browser's extension settings.

## Voice search

If you press the microphone button, your browser's built-in speech recognition may process your voice
(for example Chrome sends audio to Google's speech service). That is done by the browser, not by this
extension, and only when you press the button. The extension does not record or keep audio.

## Contact

Questions: open an issue at https://github.com/akash-deepak-varma/ascii-animals/issues
