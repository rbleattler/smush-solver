import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { performance } from "node:perf_hooks";
import { appendPlay, undoLatestPlay, historyRows } from "../play-session.js";

function solve(puzzle, currentSpice = "b") {
  const messages = [];
  const sandbox = {
    performance,
    self: {
      onmessage: null,
      postMessage(result) { if (result.type === "result" || result.type === "error") messages.push(result); }
    }
  };
  vm.runInNewContext(readFileSync(new URL("../solver-worker.js", import.meta.url), "utf8"), sandbox);
  const finite = puzzle.chunks.filter((chunk) => chunk.toLowerCase() !== puzzle.required.toLowerCase());
  sandbox.self.onmessage({ data: {
    puzzle, currentSpice, remaining: finite.map(() => puzzle.wear),
    played: [], priorScore: 0, firstPangram: false, maxWords: 4, timeBudget: 2500
  } });
  assert.equal(messages.length, 1);
  assert.notEqual(messages[0].type, "error", messages[0].message);
  return messages[0];
}

const puzzle = {
  chunks: ["A","B","C","E"], required: "E",
  wear: 1, pangram: "abce", words: ["abce", "abe", "ace", "be", "ce", "ae"]
};

test("Golden Path returns three exact-cover routes per spicy letter when available", () => {
  const result = solve(puzzle);
  assert.equal(result.complete, true);
  assert.equal(result.bySpice.length, 3);
  assert.ok(result.robust);
  assert.ok(result.best);
  for (const group of result.bySpice) {
    assert.equal(group.choices.length, 3);
    assert.equal(new Set(group.choices.map((x) => x.path[0].word)).size, 3);
    for (const option of group.choices) {
      const tally = Array(3).fill(0);
      const played = new Set();
      for (const play of option.path) {
        assert.ok(!played.has(play.word), "no word may repeat");
        assert.ok(play.word.includes("e"), "required center E");
        played.add(play.word);
        play.cost.forEach((n, i) => tally[i] += n);
      }
      assert.deepEqual(tally, [1,1,1], "each non-gold tile consumed once");
    }
    assert.ok(group.choices.every((x, i, arr) => !i || arr[i - 1].score >= x.score), "ranked by score");
    assert.equal(group.choices[0].path[0].spice, group.spice);
    assert.ok(group.choices[0].path.slice(1).every((word) => !word.spice), "no future spicy letter invented");
  }
  assert.equal(result.best.score, result.bySpice.find((group) => group.spice === "b").choices[0].score);
});

test("Golden Path can recommend a balanced route without knowing the current spicy letter", () => {
  const result = solve(puzzle, "");
  assert.ok(result.robust);
  assert.equal(result.best.path[0].word, result.robust.path[0].word);
  assert.ok(Number.isFinite(result.robust.averageScore));
  assert.deepEqual(result.bySpice.map((group) => group.spice), ["a","b","c"]);
});

test("recording a tapped word updates remaining inventory, history and score; undo reverses it", () => {
  const initial = {
    boardId: "stable", remaining: [3,2,1], played: [], plays: [],
    score: 0, firstPangram: false
  };
  const first = appendPlay(initial, {
    word: "abe", cost: [1,1,0], points: 18, pangram: false, spicy: "b"
  });
  assert.deepEqual(first.remaining, [2,1,1]);
  assert.deepEqual(first.played, ["abe"]);
  assert.deepEqual(historyRows(first).map(({ word, points, spicy }) => [word, points, spicy]), [["abe",18,"b"]]);
  assert.throws(() => appendPlay(first, {word:"ABE",cost:[1,1,0],points:9}), /already played/);
  assert.deepEqual(initial.remaining, [3,2,1], "immutable original session");
  const second = appendPlay(first, {
    word: "ce", cost: [0,0,1], points: 11, pangram: false, spicy: "c"
  });
  const undone = undoLatestPlay(second);
  assert.deepEqual(undone.remaining, first.remaining);
  assert.deepEqual(undone.played, ["abe"]);
  assert.equal(undone.score, 18);
  assert.equal(undone.plays.length, 1);
});

test("older tracked words are visible but cannot be undone without recorded tile vectors", () => {
  const legacy = {
    remaining: [1,1], played: ["older"], score: 31, firstPangram: true
  };
  assert.deepEqual(historyRows(legacy).map((x) => [x.word,x.points,x.trackable]), [["older",null,false]]);
  assert.throws(() => undoLatestPlay(legacy), /cannot be safely undone/);
});

test("Golden Path interface contains required interactive regions and live recorded history", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  for (const id of ["spiceMatrix","solvePath","playedCard","playedList","undoPlayButton","robustPath"]) {
    assert.ok(html.includes(`id="${id}"`), `missing ${id} element`);
  }
  assert.ok(app.includes("data-record-word"));
  assert.ok(app.includes("recordSuggestedWord(control.dataset.recordWord)"));
});
