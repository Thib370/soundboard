# Soundboard Mic

Windows soundboard (Electron) that plays sounds into a **virtual microphone**, so Discord / Teams / any call app hears them. Plays local files or audio downloaded from YouTube / web URLs.

## Features
- Sound grid: add local files (mp3, wav, ogg, m4a, flac) or paste a YouTube/web URL (downloaded with `yt-dlp`, auto-fetched on first use).
- Click a sound to play, click again to stop. Per-sound **■ stop**, **Stop all** (cuts immediately).
- **Folders**: tabs (All / Unsorted / your folders) to show only the sounds you want; create, rename, delete folders (deleting moves sounds to Unsorted); move a sound with its dropdown. **List view** toggle (compact rows) or grid. New sounds, recordings and imports go into the folder you are viewing. Hotkeys still follow the global order of all sounds.
- **rename** a sound (Enter saves, Esc cancels, empty name ignored).
- **● Record**: record your own sample from the selected Real mic (max 60 s, optional name); it is saved as a new sound.
- Per-sound **boost** slider (×0.2 to ×4, default ×1.2, saved) for quiet samples that don't trigger voice detection; a limiter on the mic path prevents clipping.
- Outputs: **Send to mic** (virtual cable), **Monitor** (what you hear in your headphones: Off / Sounds only / Sounds + my voice / My voice only), volume.
- **Mix my real mic**: on by default and remembered. Sends your voice with the sounds to the virtual mic. What you hear is set separately by **Monitor**; including your voice there needs headphones (speakers would feed back).
- Live routing diagram: what plays, where it goes, level meters, real device names, and the input name Discord/Teams must select.
- Global hotkeys: `Ctrl+Alt+1..9` play/stop the first 9 sounds, `Ctrl+Alt+0` stops all.

## Teams mention approval (local, free)
Collapsible **Teams** panel. The app attaches to a Chrome you start with its button (debug port 9222, own profile in `%APPDATA%\soundboard-mic\chrome-teams`), reads Teams **live captions** through `playwright-core`, and when an alias (Thib, Thibault, ...) is spoken by someone else it shows an always-on-top popup: **Approve** plays the first sample of the chosen *Reply folder*, other samples can be clicked, **Cancel** dismisses. Keys: `Ctrl+Alt+Enter` approve, `Ctrl+Alt+Backspace` cancel. Nothing is ever sent without approval. Cooldown and popup timeout are configurable; "Ignore my own name" uses your Teams display name. No model, no API, nothing leaves the PC.
One click: **▶ Run Teams** (always visible above the panel) starts Chrome if needed, connects and turns listening on; **■ Stop Teams** disconnects. First time: sign in to Teams in that Chrome, join a call and turn on live captions. Manual controls (Launch / Connect / Listen) are in the panel.
**🔌 Connect via Playwright plugin** instead uses your own browser (Brave) through the *Playwright MCP Bridge* extension: the app starts `npx @playwright/mcp --extension` and reads the Teams tab through it (needs Node/npx and the extension; approve the connection in the browser if asked, or set `PLAYWRIGHT_MCP_EXTENSION_TOKEN`). Same popup, same approval. Caption selectors may need updating when Teams changes its page. Voice approve/cancel (local) is not built yet.

## Requirements
- Windows 10/11
- [Node.js](https://nodejs.org) 22 or newer (tested with 26)
- [VB-Cable](https://vb-audio.com/Cable/) virtual audio device (free, install as administrator, then reboot)

## Install and run
```
git clone https://github.com/Thib370/soundboard.git
cd soundboard
npm install
npm start
```
Run these from **Windows** (PowerShell), not WSL: `node_modules` holds the platform's Electron binary, so installing from WSL breaks it on Windows.

Optional: `npm run dist` builds a portable `.exe` (not tested). A desktop shortcut can point to `node_modules\electron\dist\electron.exe` with argument `.` and "Start in" set to the project folder.

## Setup (once)
The sound must go **into the cable**, not to your headset. Pick the plain `CABLE Input` entry (not "Default - …" / "Communications - …").

| Where | Setting | Value |
| --- | --- | --- |
| App | Virtual mic output | `CABLE Input (VB-Audio Virtual Cable)` |
| App | Send to mic | ticked |
| App | Monitor + Headphones | *Sounds only* (or your preference), your real headset/speakers |
| App | Mix my real mic + Real mic | ticked, your real microphone (so others hear your voice too) |
| Discord (Voice & Video) / Teams (Devices) | Input / Microphone | `CABLE Output (VB-Audio Virtual Cable)` |
| Discord / Teams | Output / Speaker | your real headset (never the cable) |

Also turn off noise suppression, echo cancellation and automatic input sensitivity in Discord/Teams for that input. If a sample is too quiet to trigger voice detection, raise its **boost** slider.

The two cable names look reversed but are correct: the app sends into *CABLE Input*, call apps read *CABLE Output*.
The app's routing diagram confirms it: the yellow line should read `Discord/Teams input must be: CABLE Output (…)`. If it says "Output is not the cable", the virtual mic output is still on a real device.

## Test the mic path
1. `Win+R` → `mmsys.cpl` → **Recording** tab → *CABLE Output* → **Listen** → tick *Listen to this device* → pick your headphones.
2. In the app, set **Monitor** to *Off*, tick **Send to mic**, click a sound: you should hear it and see the CABLE Output bar move. Untick *Listen to this device* afterwards.

## Troubleshooting
- "No virtual cable found": VB-Cable not installed, or no reboot since the install.
- `Electron failed to install correctly`: delete `node_modules`, run `npm install` again from Windows (check `npm config get ignore-scripts` is `false`).
- Nobody hears the sounds: Virtual mic output is not `CABLE Input`, Send to mic is unticked, or Discord/Teams input is not `CABLE Output`.
- Sounds fail to load / empty grid: delete `%APPDATA%\soundboard-mic\config.json` (a saved device that no longer exists can break startup).
- URL import fails: click **Update yt-dlp**; YouTube changes break old versions.
- Config and sounds live in `%APPDATA%\soundboard-mic` (open with `Win+R`).
  - `config.json`: sound list, names, boost values, settings.
  - `sounds\`: recordings (`rec-<id>.webm`) and URL downloads. The sound's name is only in `config.json`, not the filename.
  - Files added with **+ Add files** are not copied, only their path is kept: moving/deleting the original breaks that sound.
  - **remove** only removes the sound from the grid; its file stays in `sounds\` until you delete it by hand.

## Limits
- Windows only for real routing; WSL/Linux has no equivalent virtual device here.
- URL import has no start/end trim (would need `ffmpeg`).
- Download only audio you have the right to use.
