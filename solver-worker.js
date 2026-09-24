"use strict";

const VALUES = { a:1,b:3,c:3,d:2,e:1,f:4,g:2,h:4,i:1,j:8,k:5,l:1,m:3,n:1,o:1,p:3,q:10,r:1,s:1,t:1,u:1,v:4,w:4,x:8,y:4,z:10 };
const wordScore = (word) => [...word].reduce((sum, c) => sum + (VALUES[c] || 1), 0);

self.onmessage = ({ data }) => {
  try { solve(data); } catch (error) { self.postMessage({ type: "error", message: error.message || String(error) }); }
};

function solve({ puzzle, spiceOrder, maxWords, timeBudget }) {
  const started = performance.now();
  const deadline = started + timeBudget;
  const hub = puzzle.required.toLowerCase();
  const wear = puzzle.wear || 5;
  const chunks = puzzle.chunks.map((x) => x.toLowerCase());
  const mortal = chunks.filter((chunk) => chunk !== hub && puzzle.words.some((word) => word.toLowerCase().includes(chunk)));
  const target = mortal.map(() => wear);
  const alphabet = new Set((puzzle.pangram || chunks.join("")).toLowerCase().replace(/[^a-z]/g, ""));
  const isPangram = (word) => [...alphabet].every((letter) => word.includes(letter));

  function costOf(word) {
    let best = null;
    const counts = new Array(mortal.length).fill(0);
    function walk(position, total) {
      if (best && total >= best.total) return;
      if (position === word.length) { best = { counts: counts.slice(), total }; return; }
      if (hub && word.startsWith(hub, position)) walk(position + hub.length, total);
      mortal.forEach((chunk, index) => {
        if (word.startsWith(chunk, position)) {
          counts[index]++;
          walk(position + chunk.length, total + 1);
          counts[index]--;
        }
      });
    }
    walk(0, 0);
    return best?.counts || null;
  }

  let candidates = puzzle.words.map((raw, originalIndex) => {
    const word = raw.toLowerCase();
    const cost = costOf(word);
    return cost && cost.some(Boolean) && cost.every((n) => n <= wear) ? {
      word, cost, originalIndex, base: wordScore(word), pangram: isPangram(word), editor: puzzle.ec === word,
      totalCost: cost.reduce((a, b) => a + b, 0)
    } : null;
  }).filter(Boolean);

  // Words with an identical inventory vector behave identically for spice and smush
  // scoring. Retain enough distinct variants to fill the longest requested route.
  const grouped = new Map();
  for (const candidate of candidates) {
    const key = `${candidate.cost.join(",")}|${candidate.pangram ? 1 : 0}|${candidate.editor ? 1 : 0}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(candidate);
  }
  candidates = [...grouped.values()].flatMap((group) => group.sort((a, b) => b.base - a.base || a.word.localeCompare(b.word)).slice(0, maxWords));
  candidates.sort((a, b) => b.totalCost - a.totalCost || b.base - a.base || a.word.localeCompare(b.word));

  const minWords = Math.max(1, spiceOrder.length ? 1 : 1);
  let best = null;
  let covers = 0;
  let timedOut = false;
  let lastProgress = 0;

  for (let wordCount = minWords; wordCount <= maxWords; wordCount++) {
    if (performance.now() >= deadline) { timedOut = true; break; }
    self.postMessage({ type: "progress", wordCount, best });
    enumerateCovers(wordCount);
  }

  self.postMessage({ type: "result", best, covers, complete: !timedOut, elapsed: performance.now() - started });

  function enumerateCovers(wordCount) {
    const chosen = [];
    const remaining = target.slice();
    const globalMin = Math.min(...candidates.map((x) => x.totalCost));
    const globalMax = Math.max(...candidates.map((x) => x.totalCost));

    function visit(startIndex) {
      if ((covers & 255) === 0 && performance.now() >= deadline) { timedOut = true; return; }
      const slots = wordCount - chosen.length;
      const remainingTotal = remaining.reduce((a, b) => a + b, 0);
      if (remainingTotal < slots * globalMin || remainingTotal > slots * globalMax) return;
      if (slots === 0) {
        if (remainingTotal !== 0) return;
        covers++;
        if (performance.now() >= deadline) { timedOut = true; return; }
        const ordered = bestOrdering(chosen, target, spiceOrder, puzzle, deadline);
        if (!ordered) { timedOut = true; return; }
        if (!best || ordered.score > best.score) best = ordered;
        if (performance.now() - lastProgress > 600) {
          lastProgress = performance.now();
          self.postMessage({ type: "progress", wordCount, best });
        }
        return;
      }
      if (candidates.length - startIndex < slots) return;

      // Every still-needed tile must be coverable by the remaining number of words.
      for (let tile = 0; tile < remaining.length; tile++) {
        if (!remaining[tile]) continue;
        let maxCover = 0;
        for (let i = startIndex; i < candidates.length; i++) maxCover = Math.max(maxCover, candidates[i].cost[tile]);
        if (maxCover * slots < remaining[tile]) return;
      }

      for (let i = startIndex; i <= candidates.length - slots; i++) {
        const candidate = candidates[i];
        if (!candidate.cost.every((n, tile) => n <= remaining[tile])) continue;
        chosen.push(candidate);
        candidate.cost.forEach((n, tile) => remaining[tile] -= n);
        visit(i + 1);
        candidate.cost.forEach((n, tile) => remaining[tile] += n);
        chosen.pop();
        if (timedOut) return;
      }
    }
    visit(0);
  }
}

function bestOrdering(words, target, spiceOrder, puzzle, deadline) {
  const count = words.length;
  const fullMask = (1 << count) - 1;
  let states = new Map([["0|0|0", { mask: 0, score: 0, path: [], spiceTouched: false, firstPangram: false }]]);

  for (let position = 0; position < count; position++) {
    if (performance.now() >= deadline) return null;
    const next = new Map();
    for (const state of states.values()) {
      if (performance.now() >= deadline) return null;
      const spent = new Array(target.length).fill(0);
      for (let i = 0; i < count; i++) if (state.mask & (1 << i)) words[i].cost.forEach((n, tile) => spent[tile] += n);
      for (let i = 0; i < count; i++) {
        if (performance.now() >= deadline) return null;
        if (state.mask & (1 << i)) continue;
        const word = words[i];
        const spice = spiceOrder[position] || null;
        const mortal = puzzle.chunks.filter((chunk) => chunk !== puzzle.required && puzzle.words.some((w) => w.includes(chunk.toLowerCase()))).map((x) => x.toLowerCase());
        const spiceIndex = spice ? mortal.indexOf(spice) : -1;
        const spicyUses = spiceIndex >= 0 ? word.cost[spiceIndex] : 0;
        const kills = word.cost.filter((n, tile) => n > 0 && spent[tile] < target[tile] && spent[tile] + n >= target[tile]).length;
        const pangramBonus = word.pangram ? (position === 0 ? 4 : 2) : 0;
        const multiplier = 1 + spicyUses + kills + pangramBonus;
        const points = word.base * multiplier + (word.editor ? 15 : 0);
        const tags = [];
        if (spicyUses) tags.push(`🌶×${spicyUses}`);
        if (kills) tags.push(`🥞×${kills}`);
        if (word.pangram) tags.push(position === 0 ? "★★ pangram first" : "★ pangram");
        if (word.editor) tags.push("⭐ Editor’s Choice");
        const mask = state.mask | (1 << i);
        const spiceTouched = state.spiceTouched || spicyUses > 0;
        const firstPangram = state.firstPangram || (position === 0 && word.pangram);
        const key = `${mask}|${spiceTouched ? 1 : 0}|${firstPangram ? 1 : 0}`;
        const proposal = {
          mask,
          score: state.score + points,
          spiceTouched,
          firstPangram,
          path: [...state.path, { word: word.word, points, base: word.base, multiplier, tags, spice }]
        };
        const previous = next.get(key);
        if (!previous || proposal.score > previous.score) next.set(key, proposal);
      }
    }
    states = next;
  }

  let best = null;
  for (const state of states.values()) {
    if (state.mask !== fullMask) continue;
    const breakdown = [{ label: "Word scores", value: state.score }];
    let total = state.score;
    total += 50; breakdown.push({ label: "Clean Plate", value: "+50" });
    total += 25; breakdown.push({ label: "Unassisted", value: "+25" });
    if (puzzle.best && state.score > puzzle.best) { total += 5; breakdown.push({ label: "Beat the Robot", value: "+5" }); }
    if (count <= 6) { total += 25; breakdown.push({ label: `Heavy Lifter · ${count} words`, value: "+25" }); }
    else if (count >= 13) { total += 25; breakdown.push({ label: `Word Hoard · ${count} words`, value: "+25" }); }
    const perfect = state.firstPangram;
    if (perfect) { breakdown.push({ label: "Perfect Game", value: "×2" }); total *= 2; }
    const iceCold = count >= 5 && spiceOrder.length >= count && !state.spiceTouched;
    if (iceCold) { breakdown.push({ label: "ICE COLD", value: "×5" }); total *= 5; }
    breakdown.push({ label: "Deterministic total", value: total });
    const result = { score: total, path: state.path, breakdown, perfect, iceCold };
    if (!best || result.score > best.score) best = result;
  }
  return best;
}
