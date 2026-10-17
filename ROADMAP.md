# Pixel Chess — Roadmap

Goal: make **Pixel Chess** the best version of itself. Single-player depth, frictionless
online play, and retention polish — on top of the existing zero-dependency, single-file
architecture and test-everything culture.

How to use this doc: check items off as they ship; each item notes the code hook it builds
on, so implementation details stay grounded in what exists. Tag meanings: **(S)** hours,
**(M)** a day or two, **(L)** multi-day.

---

## Current state (so we don't re-build what exists)

- 4 opponents (Mossback, Lady Vex, Old Dune, Nox) with per-opponent palettes, taunts, dialogue
- Local blitz (3/5 min, flag fall) — no increment yet; undo, hint, pause, resume saves
- Daily puzzle (`puz.last` day-keyed, +25 XP, streak) and Puzzle Survival
- Game review + accuracy report, opening banners, eval gauge, Kibitz commentary with expressions
- Online: WebRTC P2P, 4-letter room codes, rematch (`netRematch`), reconnect sync (`sync`/`sync-req`),
  localStorage signaling fallback for offline cross-tab play, standalone `server.js` for LAN
- World leaderboards (fast/mate/streak/ladder/region) on Upstash REST via `api/scores.js`
- Themes (4 boards + 3 pieces), 12 trophies, XP + ranks, HD vector artwork toggle
- PWA: `sw.js` precaches the shell, offline fully playable, Vercel-deployed
- 14 test suites in `npm test` (engine, API, P2P, server, matchmaking, SW, smoke, commentary, commentator,
  puzzle, startmenu, ladder, themes, layout)

## Principles (keep these true)

- Zero runtime dependencies; the game ships as a single file (`chess/index.html`).
- Opening `chess/index.html` via `file://` must keep working — offline cross-tab play is a feature.
- Every shipped feature gets a test in `tests/` (mirror an existing suite for style).
- Backend = Vercel functions + Upstash Redis REST (`KV_REST_API_*` with `UPSTASH_*`/`REDIS_REST_*` aliases).

---

## Phase 0 — Quick wins & guardrails

- [x] **(S)** `api/signal.js`: honor `UPSTASH_REDIS_REST_*` / `REDIS_REST_*` aliases like `api/scores.js`
      does — today a deploy using Upstash-native env names silently falls back to in-memory signaling.
- [x] **(S)** GitHub Actions CI: run `npm test` on push/PR (12 suites already pass headless).
- [x] **(S)** Decide `package-lock.json` policy and stick to it (commit it, or add to `.gitignore`).
- [ ] **(S)** Confirm production Vercel env: Redis URL/token set for the deployment, PW test online play.

## Phase 1 — Online play: friction to zero

The room-code flow is the weakest link. Everything here reuses the existing signaling pipeline.

- [x] **(M)** Matchmaking queue — `api/queue.js` with POST (join: pid, xp, blitz) and GET (poll: pid → `{room}`).
      Server pairs waiting players and hands both a room code; clients then run the existing
      host/join flow. Add a "PLAY ONLINE → QUICK MATCH" button next to "HOST / JOIN". Shipped: one
      POST endpoint both joins and polls; XP ±400 + blitz-mode pairing; local `server.js` mirrors it.
- [x] **(S)** TURN support — `api/turn.js` returns short-lived ICE credentials (Cloudflare Calls TURN or
      Metered free tier, decision below). Client fetches once per session and merges into `ICECFG`;
      keep the STUN list as fallback. Fixes the top "can't connect" failure (symmetric NAT / mobile).
      Shipped with Cloudflare Calls env vars (`CLOUDFLARE_TURN_KEY_ID`/`_TOKEN`); degrades to STUN-only.
- [x] **(S)** Emotes + quick chat over the existing data channel — `netSend({t:'emoji',d:'GG'})`, a small
      bar in online games (GG, 👑, 😅, NICE, OOPS). Cheap, big feel improvement. Shipped as `t:'em'`
      messages shown in the Kibitz bubble; the bar appears only during online games.
- [x] **(S)** Challenge deep links — `?room=ABCD` pre-fills the join field and auto-joins;
      use Web Share API where available so "challenge a friend" is one tap. Shipped: the host's
      address bar carries `?room=`, and SHARE uses Web Share (clipboard fallback).
- [x] **(M)** Online Elo — pid-keyed rating in Redis (`pc:elo:<pid>`), updated on online results,
      shown on the net screen + a small ranked board. Separate from arcade XP. Shipped as
      `api/elo.js` (K=32, start 1000, game-id idempotent); the local server mirrors it.

## Phase 2 — Single-player depth

- [ ] **(L)** Ghost replays — clients already send full SAN on score submit, but `api/scores.js`
      validates and **discards** it. Persist the record-holder's game (`pc:replay:<board>`), and add
      "RACE THE GHOST": replay their moves on a shadow overlay while you play the same position line.
      Reuses review-mode stepping UI.
- [ ] **(M)** Mistake Trainer — from your last N games (review data exists), auto-generate 5-position
      drills from your worst eval swings; score them like puzzles; feed the daily XP loop.
- [x] **(S/M)** Daily puzzle archive — 7/30-day grid of past `puzDayStr` puzzles, replayable for XP-less
      practice; keeps streak display but adds history (uses the date-seeded generator, so it works offline).
      Shipped: calendar button beside DAILY PUZZLE, 30-day grid from `prof.puz.days` (capped at 120 keys),
      past days auto-run as practice (no XP, no streak, no history write).
- [ ] **(M/L)** Endless ladder — after Nox, procedurally unlock rivals: reuse the `OPPS` shape
      (palette + taunts + `sty`), scale engine strength with XP, tease names ahead. Gives the ladder
      an infinite ceiling using systems that already exist.
- [ ] **(S)** Time controls — add increment (3+2, 5+3) and bullet (1 min) to `blitzCycle`; clocks
      already tick correctly, so this is mostly UI + a couple of edge cases in `clockTick`/`flagFall`.

## Phase 3 — Retention & growth

- [ ] **(M)** Web push notifications — `sw.js` already exists: add a `push` handler + subscription
      store (`/api/push`, Upstash list) and trigger on "friend beat your record" and "daily puzzle ready".
      Needs VAPID keys in Vercel env; ask permission after game 3, not on first load.
- [ ] **(M)** Dynamic OG images for share/challenge links — Vercel edge function rendering the board +
      result to PNG (borrow the `shareCard` canvas renderer) so links look alive when pasted in chat.
- [ ] **(S)** Install prompt flow — capture `beforeinstallprompt`, offer "ADD TO HOME SCREEN" after a
      few games; falls back to iOS "Share → Add to Home Screen" hint.
- [ ] **(M)** Leaderboard seasons — monthly resets with permanent "SEASON 1 CHAMP" badges next to names;
      gives lapsed players a return hook.
- [ ] **(S)** Colorblind-safe theme option — the theme system is data-driven (`PAL`, board themes);
      add a high-contrast palette + a colorblind-friendly piece set toggle.

## Phase 4 — Engineering & quality

- [ ] **(M)** Error visibility — wire a lightweight error hook (Sentry free tier or custom `/api/log`)
      and progressively replace silent `catch(e){}` blocks in risky paths (network, storage, audio)
      with one logger call. A 3,000-line single-file game currently fails invisibly.
- [ ] **(L, decision)** Authoring vs shipping — optionally author `chess/` as modules and bundle to the
      current single file with esbuild at commit time. Zero runtime deps preserved, saner diffs.
      Only worth it if the single-file diff churn keeps hurting.
- [ ] **(S)** HD-mode performance pass — measure on a low-end phone; drop supersample factor if
      frame times regress during animations.

---

## Decisions needed

| # | Decision | Options | Notes |
|---|----------|---------|-------|
| 1 | TURN provider | Cloudflare Calls (free 1TB/mo) · Metered free tier · self-host coturn on a VPS | Credentials must be short-lived; endpoint is provider-specific. |
| 2 | Redis env naming | Keep `KV_REST_API_*` · standardize `UPSTASH_REDIS_REST_*` | Phase 0 aligns both APIs either way. |
| 3 | Push notifications | Yes/no + VAPID keys | Biggest retention lever, small privacy ask. |
| 4 | Ghost replay cap | per board: top 1? top 3? TTL? | Storage trivial either way; policy affects UI. |
| 5 | `package-lock.json` | Commit · gitignore | Reproducibility vs. repo cleanliness. |

**Decided (Oct 2026):** TURN = Cloudflare Calls (env-driven, graceful STUN fallback); Redis env naming = support all aliases; `package-lock.json` = committed (required by CI `npm ci`).

## Recommended first sprint

1. Phase 0 entirely (~half a day) — guards the codebase before bigger work lands.
2. Matchmaking queue + TURN (Phase 1, the two items that make online play actually usable).
3. Emotes + challenge links if time remains — they ride the same signal pipeline.

Ship checkpoint after each item: tests green, screenshots refreshed if visuals change, push.
