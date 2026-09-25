const FEED = "https://fourbythree-stats.hankmt.workers.dev/spub";
const $ = (id) => document.getElementById(id);
const state = { puzzles: [], puzzle: null, date: null, preferredDate: new URLSearchParams(location.search).get("date"), worker: null, spoilers: false, session: null, latestBest: null };
const LETTER_VALUES = { a:1,b:3,c:3,d:2,e:1,f:4,g:2,h:4,i:1,j:8,k:5,l:1,m:3,n:1,o:1,p:3,q:10,r:1,s:1,t:1,u:1,v:4,w:4,x:8,y:4,z:10 };

function mortalChunks(puzzle) {
  return puzzle.chunks.filter((c) => c !== puzzle.required && puzzle.words.some((w) => w.includes(c.toLowerCase()))).map((c) => c.toLowerCase());
}

function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDate(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function initialSpice(puzzle) {
  const mortal = mortalChunks(puzzle);
  let hash = 0;
  for (const c of puzzle.pangram || "") hash = ((hash * 31) + c.charCodeAt(0)) >>> 0;
  return mortal.length ? mortal[hash % mortal.length] : "—";
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
  const cached = localStorage.getItem("smush-solver-feed");
  if (cached) {
    try { state.puzzles = JSON.parse(cached); populateDates(); } catch { /* ignore stale cache */ }
  }
  try {
    const response = await fetch(`${FEED}?d=${localDate()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Feed returned ${response.status}`);
    const data = await response.json();
    if (!data.ok || !Array.isArray(data.puzzles)) throw new Error("Unexpected feed response");
    state.puzzles = data.puzzles;
    localStorage.setItem("smush-solver-feed", JSON.stringify(state.puzzles));
    $("connectionBadge").textContent = "Live archive";
    $("connectionBadge").className = "badge good";
    populateDates();
  } catch (error) {
    if (state.puzzles.length) {
      $("connectionBadge").textContent = "Cached archive";
      $("connectionBadge").className = "badge warn";
      $("loadMessage").textContent = "The live feed is unavailable, so this device’s last cached archive is shown.";
    } else {
      $("connectionBadge").textContent = "Feed unavailable";
      $("connectionBadge").className = "badge warn";
      $("loadMessage").textContent = `Could not load the puzzle archive: ${error.message}`;
    }
  }
}

function populateDates() {
  const select = $("dateSelect");
  const unique = [...new Map(state.puzzles.map((entry) => [entry.date, entry])).values()].sort((a, b) => b.date.localeCompare(a.date));
  const existing = state.date;
  select.innerHTML = unique.map((entry) => `<option value="${entry.date}">${formatDate(entry.date)}${entry.date === localDate() ? " · Today" : ""}</option>`).join("");
  select.disabled = !unique.length;
  const preferred = state.preferredDate || localDate();
  select.value = unique.some((x) => x.date === preferred) ? preferred
    : unique.some((x) => x.date === existing) ? existing
    : (unique.find((x) => x.date === localDate())?.date || unique[0]?.date || "");
  if (select.value && (!state.puzzle || state.date !== select.value)) showPuzzle(select.value);
}

function showPuzzle(date) {
  cancelSolve();
  const entry = state.puzzles.find((x) => x.date === date);
  if (!entry) return;
  state.date = date;
  state.puzzle = { ...entry.puzzle, release: date };
  state.session = loadSession(date, state.puzzle);
  state.latestBest = null;
  state.spoilers = date !== localDate() || sessionStorage.getItem(`smush-spoilers-${date}`) === "1";
  history.replaceState(null, "", `${location.pathname}?date=${date}`);

  $("boardDate").textContent = formatDate(date);
  $("authorBadge").textContent = `by ${state.puzzle.author || "Hank"}`;
  $("wearValue").textContent = `${state.puzzle.wear || 5} each`;
  $("wordCount").textContent = state.puzzle.words.length.toLocaleString();
  $("firstSpice").textContent = initialSpice(state.puzzle).toUpperCase();
  renderSpiceOptions(state.session.played.length === 0 ? initialSpice(state.puzzle).toLowerCase() : "");

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
  return { remaining: mortalChunks(puzzle).map(() => puzzle.wear || 5), played: [], score: 0, firstPangram: false };
}

function loadSession(date, puzzle) {
  try {
    const value = JSON.parse(localStorage.getItem(sessionKey(date)));
    if (value && Array.isArray(value.remaining) && value.remaining.length === mortalChunks(puzzle).length && Array.isArray(value.played)) return value;
  } catch { /* start fresh */ }
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
  if (!currentSpice) {
    $("loadMessage").textContent = "Choose the spicy letter Smush is currently showing.";
    return;
  }
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

  state.worker = new Worker("solver-worker.js?v=4");
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
  $("solveButton").disabled = false;
  $("cancelButton").classList.add("hidden");
}

function cancelSolve() {
  finishWorker();
}

function renderError(message) {
  finishWorker();
  $("searchProgress").classList.add("hidden");
  $("resultBody").classList.remove("hidden");
  $("resultHeading").textContent = "Solver stopped";
  $("proofBadge").textContent = "Error";
  $("maxScoreValue").textContent = "—";
  $("solvePath").innerHTML = "";
  $("continuationPath").innerHTML = "";
  $("alternativesSection").classList.add("hidden");
  $("playBestButton").classList.add("hidden");
  $("scoreBreakdown").innerHTML = "";
  $("resultNote").textContent = message;
}

function renderResult(data) {
  finishWorker();
  $("searchProgress").classList.add("hidden");
  $("resultBody").classList.remove("hidden");
  if (!data.best) {
    state.latestBest = null;
    $("resultHeading").textContent = "No clean plate found";
    $("proofBadge").textContent = data.complete ? "Proven" : "Time limit";
    $("proofBadge").className = `badge ${data.complete ? "good" : "warn"}`;
    $("maxScoreValue").textContent = "—";
    $("scoreScope").textContent = "Try allowing more words or a longer search.";
    $("solvePath").innerHTML = "";
    $("continuationPath").innerHTML = "";
    $("alternativesSection").classList.add("hidden");
    $("playBestButton").classList.add("hidden");
    $("scoreBreakdown").innerHTML = "";
    $("resultNote").textContent = data.complete ? "Every route within the selected word limit was checked." : "The search ended before it could prove that no route exists.";
    return;
  }
  const best = data.best;
  state.latestBest = best;
  $("resultHeading").textContent = `Play ${best.path[0].word.toUpperCase()} next`;
  $("proofBadge").textContent = data.complete ? "Optimal · proven" : "Best found";
  $("proofBadge").className = `badge ${data.complete ? "good" : "warn"}`;
  $("maxScoreValue").textContent = best.score.toLocaleString();
  $("scoreScope").textContent = "Known current spice only; future spicy bonuses are intentionally excluded.";
  $("solvePath").innerHTML = renderPlays(best.path.slice(0, 1), true);
  $("continuationPath").innerHTML = renderPlays(best.path.slice(1));
  $("continuationSection").classList.toggle("hidden", best.path.length < 2);
  const alternatives = (data.alternatives || []).filter((item) => item.path[0].word !== best.path[0].word).slice(0, 5);
  $("alternativePlays").innerHTML = alternatives.map((item, index) => `
    <li>
      <span class="alternative-rank">${index + 2}</span>
      <span><strong>${item.path[0].word.toUpperCase()}</strong><small>+${item.path[0].points} now</small></span>
      <b>${item.score.toLocaleString()} projected</b>
    </li>`).join("");
  $("alternativesSection").classList.toggle("hidden", alternatives.length === 0);
  $("playBestButton").textContent = `I played ${best.path[0].word.toUpperCase()}`;
  $("playBestButton").classList.remove("hidden");
  $("scoreBreakdown").innerHTML = best.breakdown.map((row) => `<p><span>${row.label}</span><strong>${row.value}</strong></p>`).join("");
  $("resultNote").textContent = data.complete
    ? `Best next play proven after checking ${data.covers.toLocaleString()} clean-plate word sets. The remaining words show one safe continuation, but recalculate after every new spicy letter.`
    : `Best next play found before the search budget expired, after checking ${data.covers.toLocaleString()} clean-plate word sets. A longer search may find a stronger recommendation.`;
}

function renderPlays(plays, highlightFirst = false) {
  return plays.map((play, index) => `
    <li class="${highlightFirst && index === 0 ? "next-play" : ""}">
      <div><span class="play-word">${play.word}</span><span class="play-detail">${play.tags.join(" · ") || "base score"}${play.spice ? ` · spicy ${play.spice.toUpperCase()}` : ""}</span></div>
      <span class="play-score">+${play.points}</span>
    </li>`).join("");
}

function recordPlay(play) {
  cancelSolve();
  play.cost.forEach((count, index) => { state.session.remaining[index] -= count; });
  if (state.session.played.length === 0) state.session.firstPangram = play.pangram;
  state.session.played.push(play.word);
  state.session.score += play.points;
  saveSession();
  state.latestBest = null;
  renderSpiceOptions("");
  renderBoardState();
  $("resultCard").classList.add("hidden");
  const finished = state.session.remaining.every((count) => count === 0);
  $("loadMessage").textContent = finished
    ? "Clean plate complete. Nice work."
    : "Play recorded. Choose the newly revealed spicy letter to get the next recommendation.";
  $("solverCard").scrollIntoView({ behavior: "smooth", block: "start" });
}

function recordBestPlay() {
  const play = state.latestBest?.path?.[0];
  if (!play) return;
  recordPlay(play);
}

function recordCustomPlay() {
  const word = $("customWord").value.trim().toLowerCase();
  const spice = $("customSpice").value;
  const message = $("customMessage");
  message.textContent = "";
  if (!/^[a-z]+$/.test(word)) { message.textContent = "Enter the played word using letters only."; return; }
  if (!spice) { message.textContent = "Choose the spicy letter that was active for this play."; return; }
  if (state.session.played.includes(word)) { message.textContent = `${word.toUpperCase()} was already recorded.`; return; }
  if (!word.includes(state.puzzle.required.toLowerCase())) { message.textContent = `The word must contain the required ${state.puzzle.required.toUpperCase()}.`; return; }
  const cost = costOfWord(state.puzzle, word);
  if (!cost || !cost.some(Boolean)) { message.textContent = "That word cannot be made from this board."; return; }
  if (!cost.every((count, index) => count <= state.session.remaining[index])) { message.textContent = "That word uses more tile lives than remain."; return; }
  const mortal = mortalChunks(state.puzzle);
  const spicyUses = cost[mortal.indexOf(spice)] || 0;
  const kills = cost.filter((count, index) => count > 0 && count === state.session.remaining[index]).length;
  const pangram = isPangram(word);
  const firstOverall = state.session.played.length === 0;
  const pangramBonus = pangram ? (firstOverall ? 4 : 2) : 0;
  const base = [...word].reduce((sum, letter) => sum + (LETTER_VALUES[letter] || 1), 0);
  const editor = state.puzzle.ec?.toLowerCase() === word;
  const points = base * (1 + spicyUses + kills + pangramBonus) + (editor ? 15 : 0);
  const listed = state.puzzle.words.some((candidate) => candidate.toLowerCase() === word);
  recordPlay({ word, cost, pangram, points });
  $("customWord").value = "";
  $("customMessage").textContent = listed
    ? `${word.toUpperCase()} recorded for ${points} points.`
    : `${word.toUpperCase()} recorded for ${points} points. It is not in the archived word list, so the solver will not suggest it.`;
}

function resetBoard() {
  cancelSolve();
  state.session = freshSession(state.puzzle);
  saveSession();
  state.latestBest = null;
  renderSpiceOptions(initialSpice(state.puzzle).toLowerCase());
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
$("currentSpice").addEventListener("change", (event) => { $("customSpice").value = event.target.value; });
$("solveButton").addEventListener("click", solve);
$("cancelButton").addEventListener("click", () => { cancelSolve(); $("resultHeading").textContent = "Search stopped"; $("proofBadge").textContent = "Cancelled"; });
$("playBestButton").addEventListener("click", recordBestPlay);
$("recordCustomButton").addEventListener("click", recordCustomPlay);
$("resetButton").addEventListener("click", resetBoard);

if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
loadArchive();
