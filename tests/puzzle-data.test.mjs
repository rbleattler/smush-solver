import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { performance } from "node:perf_hooks";
import { normalizeArchive, finiteChunks, boardIdentity } from "../puzzle-data.js";

const puzzle = {
  author: "Hank",
  chunks: ["I", "A", "G", "H", "L", "N", "P", "T", "Y"],
  required: "I",
  pangram: "plaything",
  wear: 5,
  words: ["plaything", "pin", "tip"]
};

test("accepts the October 13 archive schema and returns all eight finite tiles", () => {
  const archive = normalizeArchive({ ok: true, puzzles: [{ date: "2026-10-13", puzzle }] });
  assert.equal(archive[0].puzzle.required, "I");
  assert.deepEqual(finiteChunks(archive[0].puzzle), ["a","g","h","l","n","p","t","y"]);
  assert.equal(archive[0].puzzle.words.length, 3);
});


test("special September board keeps the one-time H/W out of finite tile inventory", () => {
  const special = {
    ...puzzle,
    required: "O",
    chunks: ["O","D","E","G","I","L","N","P","Y","H","W"],
    sentence: "hollywood ending",
    pangram: "deploying",
    words: ["deploying", "doing", "peony"]
  };
  const normalized = normalizeArchive({ ok: true, puzzles: [{ date: "2026-09-22", puzzle: special }] })[0].puzzle;
  assert.deepEqual(normalized.extraLetters, ["H", "W"]);
  assert.deepEqual(finiteChunks(normalized), ["d","e","g","i","l","n","p","y"]);
  assert.equal(normalized.chunks.length, 9);
});

test("rejects malformed live feeds instead of quietly using stale puzzle data", () => {
  assert.throws(() => normalizeArchive({ ok: true, games: [] }), /format changed/);
  assert.throws(() => normalizeArchive({ ok: true, puzzles: [{ date: "2026-10-13", puzzle: { ...puzzle, words: undefined } }] }), /format changed/);
  assert.throws(() => normalizeArchive({ ok: true, puzzles: [{ date: "2026-10-13", puzzle: { ...puzzle, required: "Z" } }] }), /format changed/);
});

test("a change to the dictionary or tile layout changes the saved-board identity", () => {
  const board = normalizeArchive({ ok: true, puzzles: [{ date: "2026-10-13", puzzle }] })[0].puzzle;
  assert.notEqual(boardIdentity(board), boardIdentity({ ...board, words: [...board.words, "hilting"] }));
  assert.notEqual(boardIdentity(board), boardIdentity({ ...board, chunks: [...board.chunks].reverse() }));
});

test("worker exact cover still uses the real I-required puzzle constraints", () => {
  const oneUse = { ...puzzle, wear: 1 };
  const outcomes = [];
  const sandbox = {
    performance,
    self: { postMessage(message) { if (message.type === "result") outcomes.push(message); }, onmessage: null }
  };
  vm.runInNewContext(readFileSync(new URL("../solver-worker.js", import.meta.url), "utf8"), sandbox);
  sandbox.self.onmessage({ data: {
    puzzle: oneUse,
    currentSpice: "h",
    remaining: Array(8).fill(1),
    played: [],
    priorScore: 0,
    firstPangram: false,
    maxWords: 6,
    timeBudget: 2500
  } });
  assert.equal(outcomes.length, 1);
  const best = outcomes[0].best;
  assert.ok(best);
  assert.equal(best.path[0].word, "plaything");
  assert.deepEqual(Array.from(best.path[0].cost), Array(8).fill(1));
  assert.equal(best.path.length, 1);
});
