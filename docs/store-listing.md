# Chrome Web Store listing (copy and paste into the dashboard)

## Name
ASCII Animals New Tab

## Summary (max 132 characters)
A live ASCII wildlife scene for your new tab: seven animals that react to clicks, with a glass search box.

## Category
Fun (or Productivity)

## Detailed description
Turn every new tab into a little nature scene drawn entirely in text.

Seven animals cross your screen, each moving its own way:
• Butterflies: blue morphos that flutter, zigzag and glide
• Koi: lazy S-curves; click to drop food and nearby fish swim over to eat
• Jellyfish: glowing pulses and drifting arms
• Dragonflies: hover, dart and cruise
• Frogs: sit, blink, then leap with a splash
• Cranes: red-crowned cranes flapping and gliding
• Crabs: scuttle sideways and bolt when you click

Click anywhere and the animals react. Far ones are smaller and fade into the background.

A glass search box sits in the middle: type to search with your default search engine, or type an address to go straight there. Voice search works where your browser supports it.

Make it yours (everything below is optional and off until you turn it on):
• Your name in the greeting
• Shortcut tiles for your top sites or bookmarks bar
• A different animal on each new tab, or every few minutes
• Power saver mode for laptops on battery
• Sync your choices across devices
• Dozens of sliders per animal: speed, size, density, colour shift, trail and more

Private by design: no accounts, no tracking, no data collected, no network requests. Everything is stored in your browser.

Open source: https://github.com/akash-deepak-varma/ascii-animals

Credits: logo art, LOGO-CREDIT-HERE. Fonts: Geist (SIL Open Font License). Animal engine derived from ascii-sharks (MIT).

## Dashboard: Privacy practices tab

**Single purpose**
Replaces the New Tab page with an animated ASCII-animal scene and a search box.

**Permission justifications**
- `storage`: Saves your chosen animal, slider tweaks and settings.
- `search`: Runs what you type in the new tab's search box through your default search engine.
- `topSites` (optional): Only if you turn on "Top sites" shortcuts; read locally to draw tiles, never sent anywhere.
- `bookmarks` (optional): Only if you turn on "Bookmarks bar" shortcuts; read locally to draw tiles, never sent anywhere.
- Host permissions: none requested.
- Remote code: no, all code is in the package.

**Data usage**: tick none of the "collected data" boxes (the extension collects nothing). Certify the three
statements: no selling data, no unrelated use, no creditworthiness use.

**Privacy policy URL**
https://github.com/akash-deepak-varma/ascii-animals/blob/main/PRIVACY.md (the repo must be public, and
PRIVACY.md pushed to `main`, before you submit)

## Graphics
- Store icon: 128x128, `public/icons/icon-128.png` (already in the package)
- Screenshots: 1280x800, 1 to 5 (`npm run screenshots`)
- Small promo tile (optional): 440x280

## Distribution
First submission: **Unlisted**. After friends confirm it installs from the store link, switch to **Public**.
