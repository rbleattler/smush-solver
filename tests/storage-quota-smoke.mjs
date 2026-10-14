import assert from "node:assert/strict";
import { webkit, devices } from "playwright";

// Reproduces the iPhone failure: /spub succeeds and contains a valid current
// puzzle, but localStorage refuses to save the oversized archive snapshot.
// Before the fix the page displayed "Cached archive" and "Loading…" forever.
const puzzle = {
  author: "Hank",
  chunks: ["Y","A","G","P","I","T","N","H","L"],
  required: "I",
  pangram: "plaything",
  wear: 5,
  words: ["plaything","playing","thing","hating","tip","pin"],
  best: 106
};
const browser = await webkit.launch({ headless: true });
try {
  const context = await browser.newContext({
    ...devices["iPhone 13"],
    serviceWorkers: "block"
  });
  // A genuinely fresh browsing context, with no existing archive.
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "smush-solver-feed") {
        throw new DOMException("Storage quota exceeded", "QuotaExceededError");
      }
      return original.call(this, key, value);
    };
  });
  await page.route("https://fourbythree-stats.hankmt.workers.dev/spub**", route =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ ok: true, puzzles: [{ date: "2026-10-13", puzzle }] })
    }));
  await page.goto("http://127.0.0.1:8765/?date=2026-10-13");
  await page.locator("#boardCard:not(.hidden)").waitFor({ timeout: 15000 });
  assert.equal(await page.locator("#dateSelect").inputValue(), "2026-10-13");
  assert.equal(await page.locator("#dateSelect").isEnabled(), true);
  assert.equal(await page.locator("#connectionBadge").innerText(), "Live archive");
  assert.equal(await page.locator("#tiles .tile").count(), 9);
  const message = await page.locator("#loadMessage").innerText();
  assert.match(message, /Live board loaded.*Offline storage is unavailable/);
  assert.deepEqual(pageErrors, []);
  console.log("Fresh iPhone WebKit startup succeeded despite localStorage QuotaExceededError.");
} finally {
  await browser.close();
}
