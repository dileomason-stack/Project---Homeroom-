# Homeroom: where your school day starts

A full-screen, customizable dashboard for students, like phone home-screen widgets but as a
website. Users add widgets, drag them around, resize them, and the layout is still there the
next time they open the URL. No accounts, no login.

This is my entry for Build Day #1 (see BUILD_DAY.md in this folder for the rules).
**Deadline: Thursday, September 24, 11:59 PM PDT. It must be deployed on Vercel at a public URL.**

## About me (read this, agent)

I've built a little but have never deployed anything. Explain deploy steps one at a time,
tell me when I need to make an account or click something, and don't assume I know the
terms. When something breaks, tell me what to paste back to you.

## Stack

- Vite + React (JavaScript is fine, no TypeScript required)
- `react-grid-layout` for drag and resize
- Layout, widget list and widget settings saved in `localStorage`, so each visitor gets
  their own dashboard
- Vercel Functions in a top-level `api/` folder for anything that needs a server (Canvas)
- Deployed on Vercel from a GitHub repo, so every push redeploys. Live at https://thehomeroom.vercel.app (the app is named Homeroom; the old https://onlyonescreen.vercel.app redirects here)

## Important constraint

Most big sites (Claude, Canvas, Google, VS Code, Messages) block being embedded in an
iframe. Don't try to iframe them. Every widget is either an official embed, a widget that
fetches data and renders it ourselves, or a launcher that opens the real app.

## Must-have widgets for Friday

1. **To-do list.** Add, check off, delete. Saved in localStorage. Friendly empty state.
2. **Canvas assignments.** The user pastes their Canvas calendar feed URL (Canvas →
   Calendar → "Calendar Feed" link, an `.ics` URL). The browser can't fetch it directly
   because of CORS, so `api/canvas.js` fetches and parses it and returns upcoming
   assignments as JSON (title, course, due date). Show them sorted by due date and
   highlight what's due in the next 48 hours.
   - Security: the function must only fetch URLs from Canvas domains (`*.instructure.com`
     plus my school's Canvas domain). It must not be an open proxy.
   - The feed URL is private. Store it only in the user's localStorage; never log it.
   - Handle a bad or empty URL with a clear message, not a crash.
3. **Spotify.** The user pastes a Spotify playlist/album link; convert it to the official
   embed URL (`https://open.spotify.com/embed/playlist/<id>`) and show the player. Bonus if
   time allows: accept Apple Music links via `embed.music.apple.com`.
4. **Search.** A search box that opens `https://www.google.com/search?q=...` in a new tab.
5. **Claude quick-ask.** A text box that opens `https://claude.ai/new?q=...` in a new tab
   with the question filled in. If that parameter ever stops working, fall back to
   opening `https://claude.ai/new`.

## Nice-to-haves (only after the must-haves work and are deployed)

- Launcher widget: user-defined buttons with a name + URL (Messages, VS Code via
  `vscode.dev` or `vscode://`, Gmail, anything)
- Google Calendar official embed (user pastes their embed link)
- News headlines from a public RSS feed via another `api/` function
- Sports scores
- A small built-in game for the "fun" widget
- Light/dark theme

## Current design (decided Tuesday)

- **Layout:** a collapsible, resizable **left sidebar** (default: Spotify, To-do, Canvas,
  Google Calendar, stacked with draggable dividers) and a free **workspace** grid filling the
  rest of the page (default: Google search, Claude). Every widget looks like a small browser
  window (tab + address bar), can be removed (tab ×), moved between sidebar and workspace (⇄),
  or shown full screen (⤢). Double-clicking a tab bar opens the real site.
- **Example mode:** first-time visitors see a sample dashboard for "Alex Rivera", a fictional
  Cal Poly student (sample assignments/events dated relative to today, a Lofi Girl playlist).
  It lives in memory only and resets on reload. **"Build your own"** switches to the visitor's
  own dashboard (same layout, empty widgets with setup screens), saved in localStorage.
- **Demo context:** the club opens the link on a fresh browser for the judges, so the first
  screen must look complete with zero setup.
- **Google results inside the card:** uses Google's undocumented `igu=1` URL setting
  (`google.com/search?igu=1&q=...`), which drops the header that normally blocks embedding.
  `api/google-embed.js` checks hourly and the card falls back to a new tab if it stops working.
- **Feature wishlist (from Mason, Tuesday night):** multiple dashboards (e.g. "Daily check",
  a project dashboard, "Everything"), Desmos (embeds fine), weather (Open-Meteo, free, no key),
  news headlines (RSS via an api/ function), sports scores with a chosen team (ESPN's public
  scoreboard JSON, CORS-open), Sleeper fantasy football (public read-only API, CORS-open, by
  username), a links card (Gmail, Outlook, Docs...). Gmail/Drive previews need Google OAuth
  (testing mode: only hand-added accounts, re-consent about every 7 days) - stretch goal only.
- **Deferred to Thursday if time allows:** real Spotify playback control (needs Premium +
  Spotify app), marking assignments done in Canvas itself (needs a Canvas token), Google
  results preview via Programmable Search, mic button.

## Customization

- An "Add widget" menu listing every widget type
- Drag to move, drag the corner to resize, a remove button on each widget
- A "Reset layout" button
- A sensible default layout for first-time visitors so the page never opens blank

## Build order

- **Phase 0 (Tuesday):** Scaffold the Vite app, push to GitHub, deploy the empty app to
  Vercel. I confirm the URL loads on my phone before we build anything else.
- **Phase 1:** Grid with drag/resize/save, plus To-do and Search. Push and check the
  live URL.
- **Phase 2:** Canvas widget and the `api/canvas.js` function. Test on the live URL, not
  just locally.
- **Phase 3:** Spotify and Claude quick-ask. Empty states and bad-input handling for
  every widget.
- **Phase 4 (Thursday, before evening):** Nice-to-haves if there's time. Send the link to
  a friend and watch them use it. Submit the form.

## Judging reminders

Scored on usefulness, execution (works for someone who isn't me, handles empty states and
bad input), creativity, and demo clarity. A few widgets that fully work beat many that
half-work.
