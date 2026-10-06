# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rock Paper Scissors Advanced — a real-time, multiplayer, energy-based variant of Rock/Paper/Scissors. The
frontend is a static, framework-free site (plain HTML/CSS/JS with ES modules) served by GitHub Pages; the
backend is a Node.js/Express + Socket.IO server backed by MongoDB, deployed on Render.

## Architecture

- **Frontend (repo root `index.html`/`gameHistory.html`, JS in `frontend/js/`)**: `index.html` +
  `frontend/js/index.js` is the lobby/game screen; `gameHistory.html` + `frontend/js/gameHistory.js` is a
  paginated view of a player's past games. Both are ES modules that connect to the same Socket.IO backend
  at `https://rock-paper-scissors-advanced.onrender.com` (hardcoded, not configurable via env). Shared JS
  helpers live in `frontend/js/auth.js` (session handling) and `frontend/js/functions.js` (misc UI helpers).
  Choice data (matchups, energy costs, icons) is not duplicated into the frontend; it is fetched at
  page-init time from `server/choiceData.json`, relative to the HTML document (which is at the repo root),
  so it resolves the same way locally and once pushed to GitHub Pages. Styling is in `frontend/style.css`;
  Font Awesome is loaded from `https://core.ontavio.de/font-awesome/...`. GitHub Pages source stays `/`
  (repo root).
- **Auth (`frontend/js/auth.js`)**: Session handling is delegated entirely to an external, separate project
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

## Choices

All choices (matchups, energy costs, icons) are defined in `server/choiceData.json` — check this file for
the full, current list of choices and their rules. Some choices are commonly referred to by abbreviation:

- Energy Collector → EC
- Energy Collector Destroyer → ECD
- Energy Collector Destroyer Interrupter → ECDI (not implemented yet, planned)
