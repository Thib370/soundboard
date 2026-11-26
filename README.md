# Soundboard Mic
Electron soundboard (Windows) that plays sounds into a virtual mic so Discord/Teams hear them.

## Setup
1. Install **VB-Cable** (https://vb-audio.com/Cable/), reboot.
2. `npm install` then `npm start` (run from Windows, not WSL). `npm run dist` builds a portable .exe.
3. In the app: "Virtual mic output" = *CABLE Input*, tick **Send to mic**.
4. In Discord/Teams: input device = *CABLE Output*; disable noise suppression / echo cancellation.
5. To also send your voice: tick **Mix my real mic**.

## Notes
- Add local files, or paste a YouTube/web URL (yt-dlp is auto-downloaded to the app data folder; no trim in v0.1).
- Hotkeys: Ctrl+Alt+1..9 = first 9 sounds, Ctrl+Alt+0 = stop.
- Config + sounds: `%APPDATA%/soundboard-mic`.
