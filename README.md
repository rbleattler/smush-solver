# Smush Solver

A static, mobile-first strategy solver for [Smush](https://www.hankgreen.com/smush/).

## Features

- Loads every released daily board from Smush's public puzzle feed.
- Hides the current day's pangram and solution controls behind a spoiler gate.
- Reproduces finite tile wear, the required gold letter, curated word validation, duplicate restrictions, spicy uses, smush multipliers, pangrams, Editor's Choice, and deterministic end-tally bonuses.
- Searches for clean-plate routes in a Web Worker.
- Recommends the best next word for the currently visible spicy letter while preserving a clean-plate continuation.
- Shows ranked alternative next plays separately from the unranked fallback continuation.
- Records each recommended play locally, updates the remaining tile lives, and recalculates when the next spicy letter appears.
- Records other words the player actually used, including valid board words outside the archived suggestion list.
- Keeps Pangram and Editor's Choice behind independent tap-to-reveal hint cards.
- Reports whether the displayed maximum was proven or is merely the best route found before the selected time limit.
- Caches the application shell and most recently loaded archive for use on a phone.

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
