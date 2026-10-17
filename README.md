# Pixel Chess

Standalone retro pixel-art chess game.

## Features
- **3-Tier AI Bot Ladder**: Challenge Mossback, Lady Vex, and Old Dune with dynamic tutor dialogue.
- **Online Multiplayer**: One-tap quick match with XP-based pairing, 4-letter room codes, real-time peer-to-peer WebRTC, and cross-tab offline play.
- **Tactical Analytics**: Puzzle Survival mode, Game Review & Accuracy Report Card, Opening Banners, and Eval Gauge.
- **Unlockable Retro Themes**: Boards (Midnight, Candy, Glacier, Ember) and pieces (Jade, Gold, Neon).
- **Console Trophies**: 12 declarative achievements with XP awards.
- **Offline / PWA Ready**: `sw.js` caches the app shell, so the game installs and plays offline; 100% playable directly in a browser with no server dependencies.

## Quick Start

### Local Server & Multiplayer (Recommended)
Run the built-in server with P2P WebRTC signaling:
```bash
npm start
```
Then open `http://localhost:3000` (or your local IP address shown in the terminal to play with devices on the same Wi-Fi). QUICK MATCH pairs two players on the same server automatically; HOST/JOIN with a room code also works.

### Direct Browser / Offline Cross-Tab
You can also open `chess/index.html` (or `index.html`) directly in any browser. Local multiplayer across multiple browser windows or tabs works automatically offline.

## Running Tests
```bash
npm install
npm test
```

## Deploying to Vercel
This repo is Vercel-ready: the game is static (served from the repo root) and the serverless APIs in `api/` become `/api/scores`, `/api/signal`, `/api/queue`, and `/api/turn`.

1. Import the GitHub repo at [vercel.com/new](https://vercel.com/new). Framework preset: **Other** — no build step is needed.
2. For world leaderboards and online play, add a Redis store (e.g. Upstash Redis from the Vercel Marketplace) and set its REST env vars — `KV_REST_API_URL` + `KV_REST_API_TOKEN` (the `UPSTASH_REDIS_REST_*` and `REDIS_REST_*` aliases also work):
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`

   Without them the game still runs; world boards show "WORLD OFFLINE" and online play is unavailable.
3. Optional: for players behind strict NATs, create a [Cloudflare Calls TURN](https://developers.cloudflare.com/calls/turn/) key and set `CLOUDFLARE_TURN_KEY_ID` + `CLOUDFLARE_TURN_API_TOKEN`. `/api/turn` then hands clients short-lived relay credentials; without it the game is STUN-only (works for most networks).
4. Deploy. The game is served at `/` and redirects to `/chess/index.html`.

`vercel.json` pins the install command to production deps (so Playwright browsers are not downloaded during deploys) and adds caching/security headers. `.vercelignore` keeps tests and dev files out of the deployment.
