# 🏈 ENDZONE KINGS
### A Habir Studios game

**▶ Play it free: https://hussainz2.github.io/endzone-kings/**

Endzone Kings is a 3D arcade football game that runs right in your browser. There's nothing to download, nothing to install and nothing to pay for. It's built to feel like a primetime broadcast: a packed stadium under the lights, a crowd that goes wild on big plays, a play-by-play announcer and a TV-style scoreboard.

## What's in it
- **A full 3D night-game stadium:** a packed crowd that jumps on big plays, light rigs, jumbotrons and LED ribbon boards.
- **A 32-team league:** teams go by their city, Retro Bowl style, with 448 made-up players. Ratings really matter: fast guys are fast, good QBs are accurate, and good tacklers don't miss.
- **Team playbooks:** every team has its own offense and defense built around a coaching style, plus a signature play. You get quick passes, deep shots, runs, play action, screens, special teams, man, zone and blitzes.
- **Real football moves:** throw to receivers with 1, 2 or 3. Juke, spin, stiff-arm and hurdle after the catch. Jump routes and play the ball on defense. Field goals, punts, fakes, extra points, two-point tries and sudden-death overtime are all in.
- **Play Now:** pick any two teams and a difficulty.
- **Season:** a 14-week schedule, live standings, a top-4 playoff and the Kings Bowl.
- **Online 1v1:** send your friend a 5-letter code and play live.
- **Ultimate Team:** open packs of player cards with coins you earn by playing (never real money), build and train your squad, and play with it against the CPU or online.
- **Progression:** coins and XP every game, levels with free packs, ranked divisions from Bronze to Kings, and daily and weekly challenges.
- **Public lobby and chat:** host a game anyone can join, or share a code. Press T to chat during online games.
- **Play Creator:** draw your own offense, defense and special teams plays and call them in any game.
- **Game day:** rain, snow, fog, day, dusk or night games, a halftime show with stats and leaders, and referees who throw flags for holding, pass interference, false starts, offsides, roughing and facemasks.
- **Practice & Drills:** no-clock practice for offense or defense, plus a two-minute drill with a leaderboard.
- **Instant replay, hot routes and momentum:** rewatch any play with R, change routes at the line with H, and ride the momentum meter.
- **Player of the Game, highlights, 24 achievements and custom TD celebrations.**
- **Rosters:** browse every team and player rating.
- **Accounts:** sign up and log in with the game's own accounts, not Google sign-in. Guests get Quick Play; a free account unlocks everything else and saves your progress.
- **Controls for any device:** keyboard and mouse on a computer, an on-screen joystick and buttons on phones and tablets.
- **Sound made in the browser:** play-by-play announcer, crowd chants, air horns, pad hits and menu music, with no sound files.

---

## Step 1: Put it on GitHub Pages (free)

1. Make a free account at [github.com](https://github.com) if you don't have one.
2. Click **+** (top right) → **New repository**. Name it `endzone-kings`, set it to **Public**, click **Create repository**.
3. On the new repo page click **uploading an existing file**, then drag in **everything inside this folder** (the `index.html` file plus the `css`, `js`, `assets`, `vendor` folders, and the other files). Click **Commit changes**.
4. Go to the repo's **Settings → Pages**. Under "Build and deployment", set **Source: Deploy from a branch**, **Branch: main**, folder **/ (root)**, then **Save**.
5. Wait about a minute and refresh. Your game is live at:
   `https://YOUR-GITHUB-NAME.github.io/endzone-kings/`

At this point **Play Now, Season and Rosters already work**. Accounts are saved on each device only, and Online 1v1 is turned off until you do Step 2.

---

## Step 2: Turn on real accounts + Online 1v1 (Supabase, free)

GitHub Pages can only host files; it can't run a login server. Supabase is a free service that handles the accounts and connects players for online games.

1. Go to [supabase.com](https://supabase.com), sign up, and click **New project** (any name, any password, pick the region closest to you). Wait for it to finish setting up.
2. In the project, click **Connect** at the top (or go to **Project Settings → API**). Copy two things:
   - the **Project URL** (looks like `https://abcdefgh.supabase.co`)
   - the **anon / public key** (or the **publishable key**, starts with `sb_publishable_`)
3. Open `js/config.js` in your GitHub repo (click the file → pencil icon to edit) and paste them in:
   ```js
   export const CONFIG = {
     SUPABASE_URL: 'https://abcdefgh.supabase.co',
     SUPABASE_ANON_KEY: 'paste-the-key-here',
   };
   ```
   Commit the change. (This key is *meant* to be public, it's fine to have it in your repo. Never paste the `service_role` / secret key.)
4. In Supabase go to **Authentication → URL Configuration** and set **Site URL** to your game's address from Step 1. This makes email links come back to your game.
5. Optional but recommended: in **Authentication → Sign In / Providers → Email**, turn **off "Confirm email"** so people can sign up and play instantly. If you leave it on, players must click a link in their email before logging in.

That's it. No database tables to set up: player records are saved on the account itself, and online games use Supabase Realtime, which is on by default.

### How online games connect
The host clicks **Online 1v1 → Create game** and gets a 5-letter code. The friend types the code under **Join a game**. The two browsers connect directly (peer-to-peer) for smooth play. If a network blocks that (some school/work Wi-Fi does), it automatically falls back to relaying through Supabase. You'll see "Online · direct" or "Online · relay" in the corner.

---

## Controls

| | Offense | Defense |
|---|---|---|
| Pick play | `1`–`6` (or click a card) | `1` Man · `2` Zone · `3` Blitz |
| Snap | `Space` | |
| Move | `W A S D` or arrows | `W A S D` or arrows |
| Sprint | `Shift` | `Shift` |
| Throw | `1` `2` `3` or click a receiver | |
| Juke (with ball) | `Space` | |
| Dive tackle | | `Space` |
| Switch player | | `Q` / `Tab` / click a defender |
| 4th down | `P` punt · `F` field goal | |

Other: `C` camera · `M` mute · `Esc` pause

---

## Make it yours
- **Teams, colors, player names:** `js/teams.js`. Rosters are generated from a seed, so everyone sees the same players.
- **Plays:** `OFF_PLAYS` in `js/sim.js`. Routes are simple waypoint lists.
- **Difficulty tuning:** `DIFF` in `js/sim.js`.

⚠️ **Keep it unlicensed-safe:** don't add real NFL team names, logos, or real players' names. That's licensed stuff and can get your repo taken down. City names + your own made-up players (how Retro Bowl does it) is fine.

---

## Run it on your own computer
Browsers block games like this from opening as a plain file, so use a tiny local server. In this folder run:
```
python -m http.server 8000
```
then open http://localhost:8000

Built with [three.js](https://threejs.org) and [Supabase](https://supabase.com). © Habir Studios
