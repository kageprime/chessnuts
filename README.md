# Pixel Chess

Standalone retro pixel-art chess game.

## Features
- **3-Tier AI Bot Ladder**: Challenge Mossback, Lady Vex, and Old Dune with dynamic tutor dialogue.
- **Online Multiplayer**: Real-time peer-to-peer WebRTC matchmaking with 6-character room codes.
- **Tactical Analytics**: Puzzle Survival mode, Game Review & Accuracy Report Card, Opening Banners, and Eval Gauge.
- **Unlockable Retro Themes**: Boards (Midnight, Candy, Glacier, Ember) and pieces (Jade, Gold, Neon).
- **Console Trophies**: 12 declarative achievements with XP awards.
- **Offline / PWA Ready**: `sw.js` caches the app shell, so the game installs and plays offline; 100% playable directly in a browser with no server dependencies.

## Quick Start
Open `chess/index.html` (or `index.html`) in any web browser.

## Running Tests
```bash
npm install
npm test
```

## Deploying to Vercel
This repo is Vercel-ready: the game is static (served from the repo root) and the serverless APIs in `api/` become `/api/scores` and `/api/signal`.

1. Import the GitHub repo at [vercel.com/new](https://vercel.com/new). Framework preset: **Other** — no build step is needed.
2. For world leaderboards and online P2P play, add a Redis store (e.g. Upstash Redis from the Vercel Marketplace) and set the environment variables:
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`

   Without them the game still runs; world boards show "WORLD OFFLINE" and online play is unavailable.
3. Deploy. The game is served at `/` and redirects to `/chess/index.html`.

`vercel.json` pins the install command to production deps (so Playwright browsers are not downloaded during deploys) and adds caching/security headers. `.vercelignore` keeps tests and dev files out of the deployment.
