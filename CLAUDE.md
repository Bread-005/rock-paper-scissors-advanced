# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rock Paper Scissors Advanced — a real-time, multiplayer, energy-based variant of Rock/Paper/Scissors. The
frontend is a static, framework-free site (plain HTML/CSS/JS with ES modules) served by GitHub Pages; the
backend is a Node.js/Express + Socket.IO server backed by MongoDB, deployed on Render.

## Architecture

- **Frontend (repo root)**: `index.html` + `index.js` is the lobby/game screen; `gameHistory.html` +
  `gameHistory.js` is a paginated view of a player's past games. Both are ES modules that connect to the
  same Socket.IO backend at `https://rock-paper-scissors-advanced.onrender.com` (hardcoded, not
  configurable via env). Styling is in `style.css`; Font Awesome is loaded from
  `https://core.ontavio.de/font-awesome/...`.
- **Auth (`auth.js`)**: Session handling is delegated entirely to an external, separate project
  ("login-page", hosted at `https://bread-005.github.io/login-page/`) and an external user API
  (`https://hobby-projects-api.onrender.com`). `authenticate()` reads a `login-page` key from
  `localStorage`, verifies the token against `/session/verify`, and redirects to the login page if invalid.
  `logout()` simply redirects to the login page, which clears the session server-side on load. There is no
  local login/session code in this repo — do not add any; look at the login-page project for changes to the
  auth flow itself.
- **Backend (`server/server.js`)**: Single-file Express + Socket.IO server.
  - In-memory state: `players` (currently connected sockets/players) and `games` (cached list, mirrored from
    MongoDB) — there is no persistence layer/repository abstraction, state is just module-level arrays.
  - Game round flow: clients emit `chose-thing` with a card; `evaluateChoices()` runs once every connected
    player has chosen, computes pairwise Rock/Paper/Scissors energy gains for all players at once (not
    strictly 1v1), persists the resulting `game` document to the `games` collection, then broadcasts
    updated `games` to all clients. Player join/leave triggers the same evaluation path so a round can
    resolve on disconnect.
  - MongoDB: connects lazily via `connectDatabase()` before `server.listen`; database name `RockPaperScissors`,
    collections `players` and `games`. Connection string is built from `DATABASE_USERNAME` /
    `DATABASE_PASSWORD` env vars against a fixed Atlas cluster host.
  - CORS is restricted to two explicit origins (`localhost:63342` — PhpStorm's built-in server — and the
    GitHub Pages origin); update both the Socket.IO `cors.origin` list and, if needed, static hosting origin
    together when changing where the frontend is served from.

## Running Locally

All server-side commands (`npm install`, `npm start`, etc.) must be run inside Docker, never directly on
the host.

```bash
cd server
docker build -t rps-advanced-server .
docker run -p 3002:3002 -e DATABASE_USERNAME=... -e DATABASE_PASSWORD=... rps-advanced-server
```

The frontend has no build step; open `index.html` via a static server (e.g. PhpStorm's built-in server on
port 63342, which is already whitelisted in the backend CORS config).

There is no test suite configured (`npm test` is a placeholder that exits with an error).
