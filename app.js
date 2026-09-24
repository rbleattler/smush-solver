const FEED = "https://fourbythree-stats.hankmt.workers.dev/spub";
const $ = (id) => document.getElementById(id);
const state = { puzzles: [], puzzle: null, date: null, worker: null, spoilers: false };

function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDate(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function initialSpice(puzzle) {
  const mortal = puzzle.chunks.filter((c) => c !== puzzle.required && puzzle.words.some((w) => w.includes(c.toLowerCase())));
  let hash = 0;
  for (const c of puzzle.pangram || "") hash = ((hash * 31) + c.charCodeAt(0)) >>> 0;
  return mortal.length ? mortal[hash % mortal.length] : "—";
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
  const requested = new URLSearchParams(location.search).get("date");
  select.value = unique.some((x) => x.date === existing) ? existing
    : unique.some((x) => x.date === requested) ? requested
    : (unique.find((x) => x.date === localDate())?.date || unique[0]?.date || "");
  if (select.value && (!state.puzzle || state.date !== select.value)) showPuzzle(select.value);
}

function showPuzzle(date) {
  cancelSolve();
  const entry = state.puzzles.find((x) => x.date === date);
  if (!entry) return;
  state.date = date;
  state.puzzle = { ...entry.puzzle, release: date };
  state.spoilers = date !== localDate() || sessionStorage.getItem(`smush-spoilers-${date}`) === "1";
  history.replaceState(null, "", `${location.pathname}?date=${date}`);

  $("boardDate").textContent = formatDate(date);
  $("authorBadge").textContent = `by ${state.puzzle.author || "Hank"}`;
  $("wearValue").textContent = `${state.puzzle.wear || 5} each`;
  $("wordCount").textContent = state.puzzle.words.length.toLocaleString();
  $("firstSpice").textContent = initialSpice(state.puzzle).toUpperCase();
  $("spiceOrder").placeholder = `Example: ${initialSpice(state.puzzle).toUpperCase()}, …`;

  const chunks = state.puzzle.chunks;
  const hubIndex = chunks.indexOf(state.puzzle.required);
  const display = chunks.filter((_, i) => i !== hubIndex);
  display.splice(4, 0, chunks[hubIndex]);
  $("tiles").innerHTML = display.map((chunk) => `<div class="tile ${chunk === state.puzzle.required ? "gold" : ""}">${chunk}<small>${chunk === state.puzzle.required ? "REQUIRED · ∞" : `${state.puzzle.wear || 5} USES`}</small></div>`).join("");

  $("pangramValue").textContent = state.puzzle.pangram;
  $("editorPick").textContent = state.puzzle.ec ? `Editor’s Choice: ${state.puzzle.ec.toUpperCase()} (+15)` : "";
  $("spoilerGate").classList.toggle("hidden", state.spoilers);
  $("pangramPanel").classList.toggle("hidden", !state.spoilers);
  $("solverCard").classList.toggle("hidden", !state.spoilers);
  $("boardCard").classList.remove("hidden");
  $("resultCard").classList.add("hidden");
}

function revealSpoilers() {
  state.spoilers = true;
  sessionStorage.setItem(`smush-spoilers-${state.date}`, "1");
  $("spoilerGate").classList.add("hidden");
  $("pangramPanel").classList.remove("hidden");
  $("solverCard").classList.remove("hidden");
}

function parseSpiceOrder() {
  return $("spiceOrder").value.toLowerCase().split(/[^a-z]+/).filter(Boolean);
}

function solve() {
  if (!state.puzzle) return;
  cancelSolve();
  const spiceOrder = parseSpiceOrder();
  const mortal = new Set(state.puzzle.chunks.filter((c) => c !== state.puzzle.required).map((c) => c.toLowerCase()));
  const invalid = spiceOrder.find((x) => !mortal.has(x));
  if (invalid) {
    $("loadMessage").textContent = `“${invalid.toUpperCase()}” is not a finite letter on this board.`;
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

  state.worker = new Worker("solver-worker.js?v=2");
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
    spiceOrder,
    maxWords: Number($("maxWords").value),
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
  $("scoreBreakdown").innerHTML = "";
  $("resultNote").textContent = message;
}

function renderResult(data) {
  finishWorker();
  $("searchProgress").classList.add("hidden");
  $("resultBody").classList.remove("hidden");
  if (!data.best) {
    $("resultHeading").textContent = "No clean plate found";
    $("proofBadge").textContent = data.complete ? "Proven" : "Time limit";
    $("proofBadge").className = `badge ${data.complete ? "good" : "warn"}`;
    $("maxScoreValue").textContent = "—";
    $("scoreScope").textContent = "Try allowing more words or a longer search.";
    $("solvePath").innerHTML = "";
    $("scoreBreakdown").innerHTML = "";
    $("resultNote").textContent = data.complete ? "Every route within the selected word limit was checked." : "The search ended before it could prove that no route exists.";
    return;
  }
  const best = data.best;
  $("resultHeading").textContent = `${best.path.length}-word clean plate`;
  $("proofBadge").textContent = data.complete ? "Optimal · proven" : "Best found";
  $("proofBadge").className = `badge ${data.complete ? "good" : "warn"}`;
  $("maxScoreValue").textContent = best.score.toLocaleString();
  $("scoreScope").textContent = "Official deterministic bonuses; excludes time, streak, community and personal-history bonuses.";
  $("solvePath").innerHTML = best.path.map((play, index) => `
    <li>
      <div><span class="play-word">${play.word}</span><span class="play-detail">${play.tags.join(" · ") || "base score"}${play.spice ? ` · spicy ${play.spice.toUpperCase()}` : ""}</span></div>
      <span class="play-score">+${play.points}</span>
    </li>`).join("");
  $("scoreBreakdown").innerHTML = best.breakdown.map((row) => `<p><span>${row.label}</span><strong>${row.value}</strong></p>`).join("");
  $("resultNote").textContent = data.complete
    ? `Maximum proven after checking ${data.covers.toLocaleString()} clean-plate word sets. Post-first spice is random in the live game; the specified order is a scenario, not a prediction.`
    : `Best route found before the search budget expired, after checking ${data.covers.toLocaleString()} clean-plate word sets. Increase the budget to try to prove optimality.`;
}

$("dateSelect").addEventListener("change", (event) => showPuzzle(event.target.value));
$("revealSpoilers").addEventListener("click", revealSpoilers);
$("solveButton").addEventListener("click", solve);
$("cancelButton").addEventListener("click", () => { cancelSolve(); $("resultHeading").textContent = "Search stopped"; $("proofBadge").textContent = "Cancelled"; });

if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
loadArchive();
