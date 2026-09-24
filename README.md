# Smush Solver

A static, mobile-first strategy solver for [Smush](https://www.hankgreen.com/smush/).

## Features

- Loads every released daily board from Smush's public puzzle feed.
- Hides the current day's pangram and solution controls behind a spoiler gate.
- Reproduces finite tile wear, the required gold letter, curated word validation, duplicate restrictions, spicy uses, smush multipliers, pangrams, Editor's Choice, and deterministic end-tally bonuses.
- Searches for clean-plate routes in a Web Worker.
- Accepts a hypothetical or observed spicy-letter order.
- Reports whether the displayed maximum was proven or is merely the best route found before the selected time limit.
- Caches the application shell and most recently loaded archive for use on a phone.

## Scoring scope

The displayed maximum includes deterministic bonuses that can be calculated from a route: word scores, spicy uses supplied by the user, tile-smush bonuses, pangrams, Editor's Choice, Clean Plate, Unassisted, Beat the Robot, Heavy Lifter/Word Hoard, Perfect, and ICE COLD when a complete spice order proves it.

It excludes bonuses whose values depend on live community statistics, elapsed time, streaks, or the player's prior browser history.

## Local development

Serve the directory with any static web server. The app has no build step and no backend.

## GitHub Pages

Publish the repository root with GitHub Pages. All paths are relative, so it works at either a user site or a project site URL.

Smush and its puzzle data belong to their respective creators. This is an independent companion and fetches puzzle data at runtime rather than republishing the archive in this repository.
