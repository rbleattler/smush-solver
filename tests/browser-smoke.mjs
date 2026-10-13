import assert from "node:assert/strict";
import { chromium } from "playwright";

const puzzle = {
  author: "Test",
  chunks: ["I","A","G","H","L","N","P","T","Y"],
  required: "I",
  pangram: "plaything",
  wear: 1,
  words: ["playing","hit"],
  ec: "",
  best: 0
};
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", (error) => { throw error; });
  await page.route("https://fourbythree-stats.hankmt.workers.dev/spub**", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    headers: { "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify({ ok: true, puzzles: [{ date: "2026-10-13", puzzle }] })
  }));
  await page.goto("http://127.0.0.1:8765/?date=2026-10-13");
  await page.locator("#boardCard:not(.hidden)").waitFor();
  await page.locator("#revealSpoilers").click();
  await page.locator("#currentSpice").selectOption("h");
  await page.locator("#solveButton").click();
  await page.locator("#solvePath button[data-record-word]").first().waitFor({ timeout: 10000 });
  assert.equal(await page.locator("#solvePath button[data-record-word]").count(), 2, "Golden Path must show complete 2-word exact cover");
  assert.equal(await page.locator("#spiceMatrix .spice-group").count(), 8, "All eight spicy letters should be represented");
  const tappedWord = await page.locator("#solvePath button[data-record-word]").last().getAttribute("data-record-word");
  await page.locator("#solvePath button[data-record-word]").last().click();
  await page.locator("#playedList li").first().waitFor();
  assert.equal(await page.locator("#playedList li").count(), 1);
  assert.ok((await page.locator("#playedList").innerText()).toLowerCase().includes(tappedWord));
  assert.ok((await page.locator("#playedList").innerText()).includes("+"), "Earned score shown");
  await page.reload();
  await page.locator("#playedList li").first().waitFor();
  assert.equal(await page.locator("#playedList li").count(), 1, "Tracked play survives reload");
  await page.locator("#undoPlayButton").click();
  assert.equal(await page.locator("#playedList li").count(), 0, "Undo removes the latest play");
  assert.ok((await page.locator("#sessionStatus").innerText()).includes("8 tile uses left"));
  console.log("Golden Path browser smoke passed: responsive route, all spice groups, tap any path word, history persistence, undo.");
} finally {
  await browser.close();
}
