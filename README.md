# PiHub Ambient

A simplified, large-format PiHub interface designed for a 10.1-inch 1280×800 tablet.

## Pages

- `index.html` — big clock, weather, next event and now playing
- `calendar.html` — large today/tomorrow agenda
- `github.html` — simplified GitHub overview
- `spotify.html` — full-screen Spotify player
- `settings.html` — tablet settings and Raspberry Pi status

## Backend

This frontend expects the existing PiHub backend on port `3000` with:

- `/api/raspberry-pi/stats`
- `/api/calendar/events`
- `/api/github/contributions`
- `/api/spotify/playback`
- Spotify control routes

## Run locally

Serve this folder with any static server, for example:

```bash
python3 -m http.server 5500
```

Then open:

```text
http://127.0.0.1:5500/index.html
```

On the tablet, replace `127.0.0.1` with the Raspberry Pi IP address or use `raspberrypi.local`.
