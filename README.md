# Soundboard Mic

Windows soundboard (Electron) that plays sounds into a **virtual microphone**, so Discord / Teams / any call app hears them. Plays local files or audio downloaded from YouTube / web URLs.

## Features
- Sound grid: add local files (mp3, wav, ogg, m4a, flac) or paste a YouTube/web URL (downloaded with `yt-dlp`, auto-fetched on first use).
- Click a sound to play, click again to stop. Per-sound **■ stop**, **Stop all** (cuts immediately).
- Per-sound **boost** slider (×0.2 to ×4, saved) for quiet samples that don't trigger voice detection; a limiter on the mic path prevents clipping.
- Outputs: **Send to mic** (virtual cable), **Hear in headphones**, volume.
- **Mix my real mic**: sends your voice and the sounds together on one device.
- Live routing diagram: what plays, where it goes, level meters, real device names, and the input name Discord/Teams must select.
- Global hotkeys: `Ctrl+Alt+1..9` play/stop the first 9 sounds, `Ctrl+Alt+0` stops all.

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
1. In the app: **Virtual mic output** = `CABLE Input (VB-Audio Virtual Cable)`, tick **Send to mic**, **Headphones** = your real output.
2. To send your voice too: **Real mic** = your microphone, tick **Mix my real mic**.
3. In Discord (Voice & Video) or Teams (Devices): **Input / Microphone** = `CABLE Output (VB-Audio Virtual Cable)`; **Output / Speaker** = your headphones (never the cable).
4. Turn off noise suppression, echo cancellation and automatic input sensitivity for that input.

The two cable names look reversed but are correct: the app sends into *CABLE Input*, call apps read *CABLE Output*.

## Test the mic path
1. `Win+R` → `mmsys.cpl` → **Recording** tab → *CABLE Output* → **Listen** → tick *Listen to this device* → pick your headphones.
2. In the app, untick **Hear in headphones**, tick **Send to mic**, click a sound: you should hear it and see the CABLE Output bar move. Untick *Listen to this device* afterwards.

## Troubleshooting
- "No virtual cable found": VB-Cable not installed, or no reboot since the install.
- `Electron failed to install correctly`: delete `node_modules`, run `npm install` again from Windows (check `npm config get ignore-scripts` is `false`).
- Sounds fail to load / empty grid: delete `%APPDATA%\soundboard-mic\config.json` (a saved device that no longer exists can break startup).
- URL import fails: click **Update yt-dlp**; YouTube changes break old versions.
- Config and downloaded sounds live in `%APPDATA%\soundboard-mic`.

## Limits
- Windows only for real routing; WSL/Linux has no equivalent virtual device here.
- URL import has no start/end trim (would need `ffmpeg`).
- Download only audio you have the right to use.
