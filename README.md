# Simple Pi Dashboard

<p align="center">
  <img src="https://github.com/user-attachments/assets/d7fb52be-39ec-47e5-8d46-5e99963191bd" width="45%" />
  <img src="https://github.com/user-attachments/assets/8b9f8819-09df-4e1f-b785-27e37b8375f7" width="45%" />
</p>

<p align="center">
  <img src="https://github.com/user-attachments/assets/71f9707c-bc8e-4295-8b90-894d63d37e01" width="45%" />
  <img src="https://github.com/user-attachments/assets/0e3b5c8c-b44e-4191-b7e1-908c54274ec7" width="45%" />
</p>

A full-stack simplified dashboard designed for a 10.1-inch Raspberry Pi display, providing GitHub, Spotify, Google Calendar and system monitoring in a responsive interface.

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
