# PiHub Ambient Dashboard

<p align="center">
  <img src="https://github.com/user-attachments/assets/d85ae675-4055-44ef-911f-c70432a89ef8" width="45%" />
  <img src="https://github.com/user-attachments/assets/b1470697-d501-47eb-a765-ba9783f3974e" width="45%" />
</p>

<p align="center">
  <img src="https://github.com/user-attachments/assets/fcba7593-0137-4123-b2b7-a63608bfd14c" width="45%" />
  <img src="https://github.com/user-attachments/assets/d8496e22-cf1c-471f-a035-da93f71b244d" width="45%" />
</p>


A personal ambient dashboard built using HTML, CSS, JavaScript and Node.js. The application integrates GitHub, Spotify and Google Calendar into a clean, responsive interface designed for a Raspberry Pi-powered display.

---

## Overview

PiHub Ambient Dashboard is a full-stack web application developed as a personal software engineering project. It provides a centralised dashboard displaying GitHub activity, upcoming calendar events, Spotify playback information and Raspberry Pi system statistics in real time.

The project demonstrates frontend and backend development, REST API integration, responsive interface design and server-side development using Node.js and Express.

---

## Features

- GitHub profile and contribution statistics
- Google Calendar integration
- Spotify authentication and playback information
- Raspberry Pi system monitoring
- Responsive dashboard interface
- Express.js backend API
- Real-time data updates
- Environment variable configuration
- Modular JavaScript architecture

---

## Tech Stack

- HTML5
- CSS3
- JavaScript
- Node.js
- Express.js
- GitHub API
- Spotify Web API
- Google Calendar iCal API
- Node-ical

---

## Project Structure

```
css/                Stylesheets
js/                 Client-side JavaScript
server.js           Express backend
index.html          Dashboard homepage
calendar.html       Calendar page
github.html         GitHub statistics
spotify.html        Spotify integration
settings.html       Dashboard settings
```

---

## How to Run

### Install dependencies

```bash
npm install
```

### Configure environment variables

Create a `.env` file using `.env.example` and configure:

```text
PORT=
GITHUB_USERNAME=
GITHUB_TOKEN=
CALENDAR_ICS_URL=
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REDIRECT_URI=
SESSION_SECRET=
```

### Start the application

```bash
npm start
```

Open:

```
http://localhost:3000
```

---

## Software Engineering Concepts

- REST API development
- Third-party API integration
- Environment variable management
- Responsive web design
- Client-server architecture
- Modular JavaScript development
- Session management
- Asynchronous programming

---

## Future Improvements

- Weather integration
- Custom dashboard widgets
- Dark/light theme support
- Docker deployment
- Additional Raspberry Pi metrics
- User customisation options

---

## Notes

This project was developed as a personal software engineering portfolio project to demonstrate full-stack web development and API integration.

Sensitive credentials are excluded from the repository. Create a `.env` file using `.env.example` before running the application.
