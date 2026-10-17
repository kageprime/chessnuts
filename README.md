# Pixel Chess

Standalone retro pixel-art chess game.

## Features
- **The Tower**: Challenge Mossback, Lady Vex, Old Dune, and the secret NOX with dynamic tutor dialogue — then climb floor by floor: every rival returns past the campaign as a harder, roman-numbered tier, tower bosses (1800ms, zero blunders) guard every 8th floor, and floor 40 is the 3000-Elo ULTIMATE ELO. You climb on 3 lives: a loss on your current floor burns one, and the last life wipes you back to the current tower's base floor. Draws and rematches are free.
- **Online Multiplayer**: One-tap quick match with XP-based pairing, shareable challenge links, in-game emotes, online Elo ratings, real-time peer-to-peer WebRTC, and cross-tab offline play.
- **Tactical Analytics**: Daily Puzzle with a 30-day archive (past days replay as no-XP practice), Mistake Trainer (drills from your worst moves, +5 XP each once a day), Puzzle Survival mode, Game Review & Accuracy Report Card, Opening Banners, and Eval Gauge.
- **Ghost Replays**: World-board records keep the record holder's full game; "RACE THE GHOST" shadows their moves on your board while you try to mate faster.
- **Unlockable Retro Themes**: Boards (Midnight, Candy, Glacier, Ember) and pieces (Jade, Gold, Neon).
- **Console Trophies**: 12 declarative achievements with XP awards.
- **Color Assist**: A settings toggle swaps the green move dots for blue (capture squares keep their red, distinct shape), with always-available CONTRAST boards and MONO pieces for maximum readability.
- **Offline / PWA Ready**: `sw.js` caches the app shell, so the game installs and plays offline (a one-time ADD TO HOME SCREEN offer appears on the title screen after a few games); 100% playable directly in a browser with no server dependencies.

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
This repo is Vercel-ready: the game is static (served from the repo root) and the serverless APIs in `api/` become `/api/scores`, `/api/signal`, `/api/queue`, `/api/turn`, and `/api/elo`.

1. Import the GitHub repo at [vercel.com/new](https://vercel.com/new). Framework preset: **Other** — no build step is needed.
2. For world leaderboards and online play, add a Redis store (e.g. Upstash Redis from the Vercel Marketplace) and set its REST env vars — `KV_REST_API_URL` + `KV_REST_API_TOKEN` (the `UPSTASH_REDIS_REST_*` and `REDIS_REST_*` aliases also work):
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`

   Without them the game still runs; world boards show "WORLD OFFLINE" and online play is unavailable.
3. Optional: for players behind strict NATs, create a [Cloudflare Calls TURN](https://developers.cloudflare.com/calls/turn/) key and set `CLOUDFLARE_TURN_KEY_ID` + `CLOUDFLARE_TURN_API_TOKEN`. `/api/turn` then hands clients short-lived relay credentials; without it the game is STUN-only (works for most networks).
4. Deploy. The game is served at `/` and redirects to `/chess/index.html`.

`vercel.json` pins the install command to production deps (so Playwright browsers are not downloaded during deploys) and adds caching/security headers. `.vercelignore` keeps tests and dev files out of the deployment.
