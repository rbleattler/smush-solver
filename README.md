# Smush Solver

A static, mobile-first strategy solver for [Smush](https://www.hankgreen.com/smush/).

## Features

- Loads every released daily board from Smush's public puzzle feed.
- Hides the current day's pangram and solution controls behind a spoiler gate.
- Reproduces finite tile wear, the required gold letter, curated word validation, duplicate restrictions, spicy uses, smush multipliers, pangrams, Editor's Choice, and deterministic end-tally bonuses.
- Searches for clean-plate routes in a Web Worker.
- Recommends a full Golden Path for the current spicy letter, plus three viable full routes for each spicy-letter scenario and a balanced fallback.
- Shows ranked alternative next plays separately from the unranked fallback continuation.
- Records any tapped Golden Path word locally, updates the remaining tile lives, and keeps a visible Played Words ledger with safe undo.
- Records other words the player actually used, including valid board words outside the archived suggestion list.
- Keeps Pangram and Editor's Choice behind independent tap-to-reveal hint cards.
- Reports whether the displayed maximum was proven or is merely the best route found before the selected time limit.
- Caches the application shell and most recently loaded archive for use on a phone.


## October 2026 compatibility fixes

- Validates the actual public `/spub` response before displaying a board. Live checks on October 13, 2026 confirmed that the feed retains `ok/puzzles/date/puzzle/chunks/required/words`; the normal current board still has nine chunks and 359 accepted words.
- Supports special archived boards such as September 22, where the feed has **11 chunks**: nine normal tiles and two **one-time-use secret-sentence letters**. The two extras are excluded from the ordinary finite inventory; the secret sentence itself is not simulated.
- Detects replacement data for an already-selected date and refreshes that board, instead of silently keeping a stale cached board visible. Rechecks the archive when returning to the tab/PWA.
- Associates saved game progress with the actual board/dictionary fingerprint; compatible legacy sessions are migrated only when their recorded plays reconstruct the stored remaining tile counts.
- **Does not guess the first spicy letter.** The earlier pangram-hash algorithm was not based on Smush's actual current spicy tile and could bias recommendations. Select the spicy letter displayed in the real game before requesting a route.
- Includes Node regression tests, run automatically on pushes/PRs.
- Cloudflare may reject non-browser HTTP clients with error 1010; browser-origin tests from GitHub Pages succeed with CORS `*`. The static JSON view needs a real JS-capable browser and is not a server-side HTTP API.

## Golden Path and played-word history

Golden Path is a complete **exact-cover clean-plate route**, not merely a suggested next word. Choose the spicy letter Smush displays, press **Find Golden Path**, then:

- **Tap any word in the path** after playing it in Smush to record its live points and tile consumption. The app checks the required gold letter, remaining finite tile lives, and duplicate restriction again before recording.
- Expand **Top 3 paths for every spicy letter** to compare up to three **distinct first moves**, each with a full valid remaining path. If fewer than three valid starting moves were found, only those found are shown.
- Expand **Balanced path** to see the route with the highest mean projected score when each eligible starting spicy letter is weighted equally.
- **Played Words** lists completed plays and points from this browser, persists progress across reloads, and allows undo of the most recently tracked play. Legacy sessions remain visible, though old entries without a recorded tile vector cannot be undone.
- After each play, enter the **new real spicy letter** and recalculate. You may play a different word in a route first if it is currently valid; its score is computed using the real current inventory/spice.

**Scoring interpretation:** The solver can know the *current* spicy letter but not future spicy changes. Rankings include only deterministic score elements plus the known current spicy. A "proven" result means the highest projected score among exact-cover sets **within the chosen word cap** was checked before the deadline; a timed-out result is "best found", not optimal. Neither status guarantees a true maximum under future random spicy outcomes.

## Scoring scope

The displayed projection includes deterministic bonuses that can be calculated from the known state: recorded and projected word scores, the currently visible spicy letter, tile-smush bonuses, pangrams, Editor's Choice, Clean Plate, Unassisted, Beat the Robot, Heavy Lifter/Word Hoard, and Perfect. It intentionally assigns no spicy bonus to future plays because those letters have not yet been revealed.

It excludes bonuses whose values depend on live community statistics, elapsed time, streaks, or the player's prior browser history.


## Browser JSON solve page

GitHub Pages cannot provide a true server-side JSON API, but `json-solve.html` provides a browser-executed JSON interface that uses the same Web Worker solver as the main UI.

Example:

```text
https://<owner>.github.io/<repo>/json-solve.html?date=2026-10-01&spice=o&remaining=v:0,o:2,s:2,a:0,c:1,h:1,u:2,f:1&played=vouchsafe,hove,heave,sauce,faves,chafe,cue,eve,foe
```

The page fetches the requested daily puzzle, runs the solver client-side, and replaces the page body with JSON containing the resolved puzzle metadata, best clean-plate route, alternatives, proof status, and per-letter costs.

For machine-generated requests, pass a URL-encoded JSON object in `q` instead:

```text
json-solve.html?q={"date":"2026-10-01","spice":"o","remaining":{"v":0,"o":2,"s":2,"a":0,"c":1,"h":1,"u":2,"f":1},"played":["vouchsafe","hove","heave","sauce","faves","chafe","cue","eve","foe"]}
```

Because GitHub Pages is static hosting, a plain HTTP client receives the HTML shell rather than computed JSON; JavaScript must execute in a browser (or browser automation session) to obtain the result. A true HTTP JSON endpoint would require a serverless/runtime component such as a Cloudflare Worker.

## Local development

Serve the directory with any static web server. The app has no build step and no backend.

## GitHub Pages

Publish the repository root with GitHub Pages. All paths are relative, so it works at either a user site or a project site URL.

Smush and its puzzle data belong to their respective creators. This is an independent companion and fetches puzzle data at runtime rather than republishing the archive in this repository.
