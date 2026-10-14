// Shared strict parsing and identity checks for Smush's public puzzle archive.
// Never quietly substitute an older board for a new, unrecognized feed shape.
export function normalizeArchive(data) {
  if (!data || data.ok !== true || !Array.isArray(data.puzzles)) {
    throw new Error("Smush feed format changed: expected { ok: true, puzzles: [...] }.");
  }

  const archive = data.puzzles.map((entry, index) => {
    if (!entry || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date || "") || !entry.puzzle) {
      throw new Error(`Invalid puzzle entry at index ${index}: missing date/puzzle.`);
    }
    const puzzle = entry.puzzle;
    const isSpecial = puzzle.chunks?.length === 11 && typeof puzzle.sentence === "string" && puzzle.sentence.trim().length > 0;
    const gameChunks = isSpecial ? puzzle.chunks.slice(0, 9) : puzzle.chunks;
    if (!Array.isArray(gameChunks) || gameChunks.length !== 9 ||
        !puzzle.chunks.every((chunk) => typeof chunk === "string" && /^[a-z]+$/i.test(chunk)) ||
        typeof puzzle.required !== "string" ||
        gameChunks.filter((chunk) => chunk.toLowerCase() === puzzle.required.toLowerCase()).length !== 1 ||
        !Array.isArray(puzzle.words) || !puzzle.words.length ||
        !puzzle.words.every((word) => typeof word === "string" && /^[a-z]+$/i.test(word))) {
      throw new Error(`Smush feed format changed for ${entry.date}: required/chunks/words are not usable.`);
    }
    if (puzzle.wear != null && (!Number.isInteger(puzzle.wear) || puzzle.wear < 1)) {
      throw new Error(`Smush feed format changed for ${entry.date}: invalid wear.`);
    }
    return {
      date: entry.date,
      puzzle: {
        ...puzzle,
        required: puzzle.required.toUpperCase(),
        // Special boards can carry two one-time sentence letters after the
        // nine normal tiles. They are NOT five-use finite tiles.
        chunks: gameChunks.map((chunk) => chunk.toUpperCase()),
        extraLetters: isSpecial ? puzzle.chunks.slice(9).map((chunk) => chunk.toUpperCase()) : [],
        words: puzzle.words.map((word) => word.toLowerCase()),
        wear: puzzle.wear || 5
      }
    };
  });

  if (!archive.length) throw new Error("Smush feed contained no puzzles.");
  return archive;
}

export function finiteChunks(puzzle) {
  const required = puzzle.required.toLowerCase();
  return puzzle.chunks.filter((chunk) => chunk.toLowerCase() !== required).map((chunk) => chunk.toLowerCase());
}

export function boardIdentity(puzzle) {
  // Dictionary revisions are board revisions too: invalidate earlier cached solves.
  const serialized = JSON.stringify([
    puzzle.chunks, puzzle.extraLetters, puzzle.required, puzzle.wear, puzzle.pangram,
    puzzle.ec, puzzle.words
  ]);
  let hash = 2166136261;
  for (let i = 0; i < serialized.length; i++) {
    hash ^= serialized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `${puzzle.chunks.join("")}:${(hash >>> 0).toString(16)}`;
}

/**
 * Store only a compact offline fallback, never the entire public archive.
 * The full archive remains available in memory whenever the live feed loads.
 * The most recent boards plus the explicitly viewed older board are retained
 * when they fit within a conservative character budget.
 */
export function cacheableArchive(puzzles, selectedDate = "", maxDays = 14, maxChars = 600000) {
  const sorted = [...puzzles].sort((a, b) => b.date.localeCompare(a.date));
  const wanted = sorted.slice(0, maxDays);
  const selected = sorted.find((entry) => entry.date === selectedDate);
  if (selected && !wanted.some((entry) => entry.date === selected.date)) wanted.push(selected);
  let chars = 2;
  const result = [];
  for (const entry of wanted) {
    const length = JSON.stringify(entry).length + 1;
    if (chars + length > maxChars) continue;
    chars += length;
    result.push(entry);
  }
  return result;
}
