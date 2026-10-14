import { normalizeArchive, finiteChunks, boardIdentity, cacheableArchive } from "./puzzle-data.js";
import { appendPlay, undoLatestPlay, historyRows } from "./play-session.js";
const FEED = "https://fourbythree-stats.hankmt.workers.dev/spub";
const $ = (id) => document.getElementById(id);
const state = { puzzles: [], puzzle: null, date: null, preferredDate: new URLSearchParams(location.search).get("date"), worker: null, spoilers: false, session: null, latestBest: null, latestResult: null };
const LETTER_VALUES = { a:1,b:3,c:3,d:2,e:1,f:4,g:2,h:4,i:1,j:8,k:5,l:1,m:3,n:1,o:1,p:3,q:10,r:1,s:1,t:1,u:1,v:4,w:4,x:8,y:4,z:10 };

function mortalChunks(puzzle) {
  return finiteChunks(puzzle);
}

function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDate(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function costOfWord(puzzle, rawWord) {
  const word = rawWord.toLowerCase();
  const hub = puzzle.required.toLowerCase();
  const mortal = mortalChunks(puzzle);
  let best = null;
  const counts = new Array(mortal.length).fill(0);
  function walk(position, total) {
    if (best && total >= best.total) return;
    if (position === word.length) { best = { counts: counts.slice(), total }; return; }
    if (word.startsWith(hub, position)) walk(position + hub.length, total);
    mortal.forEach((chunk, index) => {
      if (!word.startsWith(chunk, position)) return;
      counts[index]++;
      walk(position + chunk.length, total + 1);
      counts[index]--;
    });
  }
  walk(0, 0);
  return best?.counts || null;
}

function isPangram(word) {
  const alphabet = new Set((state.puzzle.pangram || state.puzzle.chunks.join("")).toLowerCase().replace(/[^a-z]/g, ""));
  return [...alphabet].every((letter) => word.includes(letter));
}

async function loadArchive() {
  // The offline snapshot is a fallback, not a prerequisite for rendering.
  // A browser can deny localStorage access (private mode, low quota, etc.).
  let cached = null;
  try { cached = localStorage.getItem("smush-solver-feed"); } catch { /* storage unavailable */ }
  if (cached && !state.puzzles.length) {
    try {
      const entries = normalizeArchive({ ok: true, puzzles: JSON.parse(cached) });
      state.puzzles = entries;
      populateDates();
      $("connectionBadge").textContent = "Cached archive";
      $("connectionBadge").className = "badge warn";
    } catch { /* invalid cache cannot block the live feed */ }
  }

  let livePuzzles;
  try {
    const response = await fetch(`${FEED}?d=${localDate()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Feed returned ${response.status}`);
    livePuzzles = normalizeArchive(await response.json());
  } catch (error) {
    if (state.date && state.puzzles.length) {
      $("connectionBadge").textContent = "Cached archive";
      $("connectionBadge").className = "badge warn";
      $("loadMessage").textContent = "Live feed unavailable; showing a previously saved offline board.";
    } else {
      $("connectionBadge").textContent = "Feed unavailable";
      $("connectionBadge").className = "badge warn";
      $("loadMessage").textContent = `Could not load the puzzle archive: ${error.message}`;
    }
    return;
  }

  // Render the current live board FIRST. Saving a local offline snapshot
  // may fail due to WebKit's localStorage quota even when the fetch succeeds.
  state.puzzles = livePuzzles;
  try {
    populateDates(true);
  } catch (error) {
    $("connectionBadge").textContent = "Board error";
    $("connectionBadge").className = "badge warn";
    $("loadMessage").textContent = `The live feed loaded, but the board could not render: ${error.message}`;
    return;
  }
  $("connectionBadge").textContent = "Live archive";
  $("connectionBadge").className = "badge good";
  $("loadMessage").textContent = "";
  try {
    localStorage.setItem("smush-solver-feed", JSON.stringify(cacheableArchive(livePuzzles, state.date)));
  } catch {
    // Remain online and playable; caching is strictly optional.
    $("loadMessage").textContent = "Live board loaded. Offline storage is unavailable on this device.";
  }
}

function populateDates(forceRefresh = false) {
  const select = $("dateSelect");
  const unique = [...new Map(state.puzzles.map((entry) => [entry.date, entry])).values()].sort((a, b) => b.date.localeCompare(a.date));
  const existing = state.date;
  select.innerHTML = unique.map((entry) => `<option value="${entry.date}">${formatDate(entry.date)}${entry.date === localDate() ? " · Today" : ""}</option>`).join("");
  select.disabled = !unique.length;
  const preferred = state.preferredDate || localDate();
  select.value = unique.some((x) => x.date === preferred) ? preferred
    : unique.some((x) => x.date === existing) ? existing
    : (unique.find((x) => x.date === localDate())?.date || unique[0]?.date || "");
  if (select.value && (forceRefresh || !state.puzzle || state.date !== select.value)) showPuzzle(select.value);
}

function showPuzzle(date) {
  cancelSolve();
  const entry = state.puzzles.find((x) => x.date === date);
  if (!entry) return;
  state.date = date;
  const previousSpice = $("currentSpice").value;
  state.puzzle = { ...entry.puzzle, release: date };
  state.session = loadSession(date, state.puzzle);
  state.latestBest = null;
  state.latestResult = null;
  state.spoilers = date !== localDate() || sessionStorage.getItem(`smush-spoilers-${date}`) === "1";
  history.replaceState(null, "", `${location.pathname}?date=${date}`);

  $("boardDate").textContent = formatDate(date);
  $("authorBadge").textContent = `by ${state.puzzle.author || "Hank"}`;
  $("wearValue").textContent = `${state.puzzle.wear || 5} each`;
  $("wordCount").textContent = state.puzzle.words.length.toLocaleString();
  $("firstSpice").textContent = "Select manually";
  renderSpiceOptions(previousSpice);

  renderBoardState();

  renderHints();
  $("spoilerGate").classList.toggle("hidden", state.spoilers);
  $("hintPanel").classList.toggle("hidden", !state.spoilers);
  $("solverCard").classList.toggle("hidden", !state.spoilers);
  $("boardCard").classList.remove("hidden");
  $("resultCard").classList.add("hidden");
}

function sessionKey(date) { return `smush-solver-session-v1-${date}`; }

function freshSession(puzzle) {
  return { boardId: boardIdentity(puzzle), remaining: mortalChunks(puzzle).map(() => puzzle.wear || 5), played: [], plays: [], score: 0, firstPangram: false };
}

function loadSession(date, puzzle) {
  try {
    const value = JSON.parse(localStorage.getItem(sessionKey(date)));
    const original = freshSession(puzzle);
    if (value && Array.isArray(value.remaining) &&
        value.remaining.length === original.remaining.length &&
        value.remaining.every((n) => Number.isInteger(n) && n >= 0 && n <= (puzzle.wear || 5)) &&
        Array.isArray(value.played)) {
      if (value.boardId === original.boardId) return value;

      // Sessions predating board fingerprints may be retained only if their
      // played words reconstruct their recorded inventory on this board.
      if (!value.boardId) {
        const expected = original.remaining.slice();
        const seen = new Set();
        let valid = true;
        for (const rawWord of value.played) {
          const word = String(rawWord).toLowerCase();
          const cost = costOfWord(puzzle, word);
          if (seen.has(word) || !word.includes(puzzle.required.toLowerCase()) ||
              !cost || !cost.every((n, i) => n <= expected[i])) {
            valid = false;
            break;
          }
          seen.add(word);
          cost.forEach((n, i) => { expected[i] -= n; });
        }
        if (valid && expected.every((n, i) => n === value.remaining[i])) {
          return { ...value, boardId: original.boardId };
        }
      }
    }
  } catch { /* start fresh if session is malformed */ }
  return freshSession(puzzle);
}

function saveSession() {
  localStorage.setItem(sessionKey(state.date), JSON.stringify(state.session));
}

function renderSpiceOptions(selected = "") {
  const options = mortalChunks(state.puzzle);
  const markup = `<option value="">Choose the spicy letter…</option>${options.map((letter) => `<option value="${letter}">${letter.toUpperCase()}</option>`).join("")}`;
  $("currentSpice").innerHTML = markup;
  $("customSpice").innerHTML = markup;
  $("currentSpice").value = options.includes(selected) ? selected : "";
  $("customSpice").value = options.includes(selected) ? selected : "";
}

function renderBoardState() {
  const chunks = state.puzzle.chunks;
  const mortal = mortalChunks(state.puzzle);
  const hubIndex = chunks.indexOf(state.puzzle.required);
  const display = chunks.filter((_, i) => i !== hubIndex);
  display.splice(4, 0, chunks[hubIndex]);
  $("tiles").innerHTML = display.map((chunk) => {
    const remaining = state.session.remaining[mortal.indexOf(chunk.toLowerCase())];
    return `<div class="tile ${chunk === state.puzzle.required ? "gold" : ""} ${remaining === 0 ? "spent" : ""}">${chunk}<small>${chunk === state.puzzle.required ? "REQUIRED · ∞" : `${remaining} ${remaining === 1 ? "USE" : "USES"} LEFT`}</small></div>`;
  }).join("");
  const left = state.session.remaining.reduce((sum, count) => sum + count, 0);
  $("sessionStatus").textContent = left === 0
    ? `Clean plate complete · ${state.session.played.length} words · ${state.session.score.toLocaleString()} word points recorded`
    : state.session.played.length
    ? `${state.session.played.length} ${state.session.played.length === 1 ? "word" : "words"} recorded · ${state.session.score.toLocaleString()} points · ${left} tile uses left`
    : `${left} tile uses left · no words recorded`;
  $("currentSpice").disabled = left === 0;
  $("solveButton").disabled = left === 0;
  renderPlayedWords();
}

function revealSpoilers() {
  state.spoilers = true;
  sessionStorage.setItem(`smush-spoilers-${state.date}`, "1");
  $("spoilerGate").classList.add("hidden");
  $("hintPanel").classList.remove("hidden");
  $("solverCard").classList.remove("hidden");
}

function renderHints() {
  const pangramRevealed = sessionStorage.getItem(`smush-hint-pangram-${state.date}`) === "1";
  const editorRevealed = sessionStorage.getItem(`smush-hint-editor-${state.date}`) === "1";
  $("pangramValue").textContent = pangramRevealed ? state.puzzle.pangram.toUpperCase() : "Tap to reveal";
  $("editorPick").textContent = editorRevealed ? (state.puzzle.ec?.toUpperCase() || "None listed") : "Tap to reveal";
  $("revealPangram").classList.toggle("revealed", pangramRevealed);
  $("revealEditor").classList.toggle("revealed", editorRevealed);
}

function revealHint(kind) {
  sessionStorage.setItem(`smush-hint-${kind}-${state.date}`, "1");
  renderHints();
}

function solve() {
  if (!state.puzzle) return;
  cancelSolve();
  const currentSpice = $("currentSpice").value;
  $("loadMessage").textContent = "";
  $("resultCard").classList.remove("hidden");
  $("searchProgress").classList.remove("hidden");
  $("resultBody").classList.add("hidden");
  $("resultHeading").textContent = "Searching…";
  $("proofBadge").textContent = "Working";
  $("proofBadge").className = "badge warn";
  $("solveButton").disabled = true;
  $("cancelButton").classList.remove("hidden");
  $("resultCard").scrollIntoView({ behavior: "smooth", block: "start" });

  state.worker = new Worker("solver-worker.js?v=6");
  state.worker.onmessage = ({ data }) => {
    if (data.type === "progress") {
      $("resultHeading").textContent = data.best ? `Best so far: ${data.best.score.toLocaleString()} points` : `Checking ${data.wordCount}-word routes…`;
      return;
    }
    if (data.type === "result") renderResult(data);
    if (data.type === "error") renderError(data.message);
  };
  state.worker.onerror = (event) => renderError(event.message || "The solver stopped unexpectedly.");
  state.worker.postMessage({
    puzzle: state.puzzle,
    currentSpice,
    remaining: state.session.remaining,
    played: state.session.played,
    priorScore: state.session.score,
    firstPangram: state.session.firstPangram,
    maxWords: Math.max(1, Number($("maxWords").value) - state.session.played.length),
    timeBudget: Number($("timeBudget").value)
  });
}

function finishWorker() {
  if (state.worker) state.worker.terminate();
  state.worker = null;
  $("solveButton").disabled = !!state.session?.remaining?.every((n) => n === 0);
  $("cancelButton").classList.add("hidden");
}

function cancelSolve() {
  finishWorker();
}

function escapeHtml(input) {
  return String(input).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[char]);
}

function renderPlayedWords() {
  if (!state.session) return;
  const entries = historyRows(state.session);
  $("playedCard").classList.remove("hidden");
  $("playedCount").textContent = `${entries.length} played`;
  $("playedEmpty").classList.toggle("hidden", entries.length > 0);
  $("playedList").innerHTML = entries.map((entry) => `
    <li>
      <span class="played-index">${entry.number}</span>
      <strong>${escapeHtml(entry.word).toUpperCase()}</strong>
      <span class="played-meta">${entry.spicy ? `🌶 ${entry.spicy.toUpperCase()}` : entry.trackable ? "No spicy" : "Older session"}</span>
      <span class="played-points">${entry.points == null ? "—" : `+${entry.points.toLocaleString()}`}</span>
    </li>`).join("");
  const last = state.session.played.at(-1);
  $("undoPlayButton").disabled = !last || (state.session.plays || []).at(-1)?.word !== last;
}

function renderError(message) {
  finishWorker();
  state.latestResult = null;
  state.latestBest = null;
  $("searchProgress").classList.add("hidden");
  $("resultBody").classList.remove("hidden");
  $("resultHeading").textContent = "Solver stopped";
  $("proofBadge").textContent = "Error";
  $("proofBadge").className = "badge warn";
  $("maxScoreValue").textContent = "—";
  $("scoreScope").textContent = "";
  $("solvePath").innerHTML = "";
  $("spiceComparison").classList.add("hidden");
  $("robustSection").classList.add("hidden");
  $("scoreBreakdown").innerHTML = "";
  $("resultNote").textContent = message;
}

function renderRoute(plays, compact = false) {
  return plays.map((play, index) => `
    <li class="${index === 0 && !compact ? "next-play" : ""}">
      <button class="path-word-button" type="button" data-record-word="${escapeHtml(play.word)}" aria-label="Record ${escapeHtml(play.word)} as played">
        <span class="play-word">${escapeHtml(play.word).toUpperCase()}</span>
        <span class="play-detail">${escapeHtml(play.tags.join(" · ") || (index ? "Future spicy unknown" : "Base score"))}</span>
      </button>
      <span class="play-score">+${play.points.toLocaleString()}</span>
    </li>`).join("");
}

function renderSpiceMatrix(data) {
  const groups = data.bySpice || [];
  $("spiceComparison").classList.toggle("hidden", !groups.length);
  const selected = $("currentSpice").value;
  $("spiceMatrix").innerHTML = groups.map((group) => `
    <details class="spice-group" ${group.spice === selected ? "open" : ""}>
      <summary><span class="spice-label">🌶 ${group.spice.toUpperCase()}</span>
        <span class="spice-preview">${group.choices.length
          ? group.choices.map((route) => escapeHtml(route.path[0].word).toUpperCase()).join(" · ")
          : "No route found"}</span>
      </summary>
      <div class="spice-options">
        ${group.choices.map((choice, index) => `
          <article class="spice-choice">
            <div class="spice-choice-head"><b>#${index + 1} · ${escapeHtml(choice.path[0].word).toUpperCase()}</b>
              <strong>${choice.score.toLocaleString()} pts</strong></div>
            <div class="spice-word-strip">${choice.path.map((play) =>
              `<button type="button" data-record-word="${escapeHtml(play.word)}" title="Record ${escapeHtml(play.word)} as played">${escapeHtml(play.word).toUpperCase()}</button>`
            ).join("")}</div>
          </article>`).join("")}
      </div>
    </details>`).join("");
}

function renderResultForSpice() {
  const data = state.latestResult;
  if (!data) return;
  const spice = $("currentSpice").value;
  const group = data.bySpice?.find((item) => item.spice === spice);
  const best = group?.choices[0] || data.robust || data.best;
  if (!best) return;
  state.latestBest = best;
  $("resultHeading").textContent = spice
    ? `Best full route with spicy ${spice.toUpperCase()} now`
    : "Balanced start across possible spicy letters";
  $("maxScoreValue").textContent = best.score.toLocaleString();
  $("scoreScope").textContent = spice
    ? "Uses today's known spicy letter for the next word; future spicy bonuses excluded."
    : "Baseline score excludes all spicy bonuses; see balanced-path average below.";
  $("solvePath").innerHTML = renderRoute(best.path);
  $("scoreBreakdown").innerHTML = best.breakdown.map((row) =>
    `<p><span>${escapeHtml(row.label)}</span><strong>${escapeHtml(row.value)}</strong></p>`).join("");
  $("pathMessage").textContent = "";
}

function renderResult(data) {
  finishWorker();
  $("searchProgress").classList.add("hidden");
  $("resultBody").classList.remove("hidden");
  if (!data.best) {
    state.latestResult = null;
    state.latestBest = null;
    $("resultHeading").textContent = "No clean plate found";
    $("proofBadge").textContent = data.complete ? "No route within limit" : "Search timed out";
    $("proofBadge").className = "badge warn";
    $("maxScoreValue").textContent = "—";
    $("scoreScope").textContent = "Try raising the maximum words or the search budget.";
    $("solvePath").innerHTML = "";
    $("spiceComparison").classList.add("hidden");
    $("robustSection").classList.add("hidden");
    $("scoreBreakdown").innerHTML = "";
    $("resultNote").textContent = data.complete
      ? "No exact clean plate exists within the selected word limit."
      : "No complete route was found before the search budget expired.";
    return;
  }
  state.latestResult = data;
  $("proofBadge").textContent = data.complete ? "Optimal within limit" : "Best found";
  $("proofBadge").className = `badge ${data.complete ? "good" : "warn"}`;
  renderResultForSpice();
  renderSpiceMatrix(data);
  const robust = data.robust;
  $("robustSection").classList.toggle("hidden", !robust);
  if (robust) {
    $("robustDescription").textContent = `Mean projected total across all ${data.bySpice.length} equally weighted starting spicy letters: ${robust.averageScore.toFixed(1)} pts. Future spicy bonuses remain unknown.`;
    $("robustPath").innerHTML = renderRoute(robust.path, true);
  }
  $("resultNote").textContent = data.complete
    ? `Checked ${data.covers.toLocaleString()} exact-cover sets. Score optimality is within your word limit and assumes no future spicy bonuses.`
    : `Found ${data.covers.toLocaleString()} exact-cover sets before the time limit. These are the best found, not proven global maxima. Increase search budget for more confidence.`;
}

function scoreActualPlay(word, spicy) {
  const message = (why) => { throw new Error(why); };
  if (!/^[a-z]+$/.test(word)) message("Enter a word using letters only.");
  if (!spicy || !mortalChunks(state.puzzle).includes(spicy)) message("Select the actual spicy letter for this play first.");
  if (state.session.played.includes(word)) message(`${word.toUpperCase()} was already played.`);
  if (!word.includes(state.puzzle.required.toLowerCase())) message("The required gold letter is missing.");
  const cost = costOfWord(state.puzzle, word);
  if (!cost || !cost.some(Boolean) || !cost.every((count, i) => count <= state.session.remaining[i])) {
    message("That word cannot be formed with the remaining tile lives.");
  }
  const mortal = mortalChunks(state.puzzle);
  const spicyUses = cost[mortal.indexOf(spicy)] || 0;
  const kills = cost.filter((n, i) => n > 0 && n === state.session.remaining[i]).length;
  const pangram = isPangram(word);
  const firstOverall = state.session.played.length === 0;
  const pangramBonus = pangram ? (firstOverall ? 4 : 2) : 0;
  const base = [...word].reduce((sum, letter) => sum + (LETTER_VALUES[letter] || 1), 0);
  const editor = state.puzzle.ec?.toLowerCase() === word;
  const points = base * (1 + spicyUses + kills + pangramBonus) + (editor ? 15 : 0);
  return { word, cost, pangram, points, spicy };
}

function recordPlay(play) {
  cancelSolve();
  state.session = appendPlay(state.session, play);
  saveSession();
  state.latestBest = null;
  state.latestResult = null;
  renderSpiceOptions("");
  renderBoardState();
  $("resultCard").classList.add("hidden");
  const finished = state.session.remaining.every((count) => count === 0);
  $("loadMessage").textContent = finished
    ? "Clean plate complete. Nice work."
    : `${play.word.toUpperCase()} recorded (+${play.points} points). Select the newly revealed spicy letter and recompute your Golden Path.`;
  $("historyMessage").textContent = "";
  $("solverCard").scrollIntoView({ behavior: "smooth", block: "start" });
}

function recordSuggestedWord(rawWord) {
  const word = String(rawWord).toLowerCase();
  const spice = $("currentSpice").value;
  try {
    // Recompute live from the CURRENT board, not from a projected route that
    // deliberately ignored future spicy letters.
    const play = scoreActualPlay(word, spice);
    recordPlay(play);
  } catch (error) {
    $("pathMessage").textContent = error.message;
  }
}

function recordCustomPlay() {
  const word = $("customWord").value.trim().toLowerCase();
  const spice = $("customSpice").value;
  try {
    const play = scoreActualPlay(word, spice);
    const listed = state.puzzle.words.some((candidate) => candidate.toLowerCase() === word);
    recordPlay(play);
    $("customWord").value = "";
    $("customMessage").textContent = listed
      ? `${word.toUpperCase()} recorded for ${play.points} points.`
      : `${word.toUpperCase()} recorded as an unlisted accepted word. It won't be recommended by the solver.`;
  } catch (error) {
    $("customMessage").textContent = error.message;
  }
}

function undoLastRecordedPlay() {
  try {
    cancelSolve();
    const last = state.session.plays?.at(-1);
    state.session = undoLatestPlay(state.session);
    saveSession();
    state.latestBest = null;
    state.latestResult = null;
    renderSpiceOptions(last?.spicy || "");
    renderBoardState();
    $("resultCard").classList.add("hidden");
    $("historyMessage").textContent = "Last recorded play undone. Check Smush's actual current spicy letter before your next solve.";
    $("loadMessage").textContent = "";
  } catch (error) {
    $("historyMessage").textContent = error.message;
  }
}

function resetBoard() {
  cancelSolve();
  state.session = freshSession(state.puzzle);
  saveSession();
  state.latestBest = null;
  state.latestResult = null;
  renderSpiceOptions("");
  renderBoardState();
  $("resultCard").classList.add("hidden");
  $("customWord").value = "";
  $("customMessage").textContent = "";
  $("loadMessage").textContent = "Board progress reset.";
}

$("dateSelect").addEventListener("change", (event) => { state.preferredDate = event.target.value; showPuzzle(event.target.value); });
$("revealSpoilers").addEventListener("click", revealSpoilers);
$("revealPangram").addEventListener("click", () => revealHint("pangram"));
$("revealEditor").addEventListener("click", () => revealHint("editor"));
$("currentSpice").addEventListener("change", (event) => {
  $("customSpice").value = event.target.value;
  if (state.latestResult) {
    renderResultForSpice();
    renderSpiceMatrix(state.latestResult);
  }
});
$("solveButton").addEventListener("click", solve);
$("cancelButton").addEventListener("click", () => { cancelSolve(); $("resultHeading").textContent = "Search stopped"; $("proofBadge").textContent = "Cancelled"; });
$("resultCard").addEventListener("click", (event) => {
  const control = event.target.closest("button[data-record-word]");
  if (control) recordSuggestedWord(control.dataset.recordWord);
});
$("undoPlayButton").addEventListener("click", undoLastRecordedPlay);
$("recordCustomButton").addEventListener("click", recordCustomPlay);
$("resetButton").addEventListener("click", resetBoard);

if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
loadArchive();
document.addEventListener("visibilitychange", () => { if (!document.hidden) loadArchive(); });
