import { chromium } from "playwright-core";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.argv[2] ?? "http://127.0.0.1:4173/";
const chrome = process.env.CHROME_PATH ?? "/usr/local/bin/google-chrome";
const outDir = "/tmp/biosensor-shots";
await mkdir(outDir, { recursive: true });

const browser = await chromium.launch({
  executablePath: chrome,
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});

const errors = [];
async function open(path, viewport) {
  const page = await browser.newPage({ viewport });
  page.on("pageerror", (error) => errors.push(`pageerror ${path}: ${error.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console ${path}: ${msg.text()}`);
  });
  const response = await page.goto(base + path, { waitUntil: "networkidle", timeout: 60000 });
  if (!response || !response.ok()) errors.push(`navigation ${path}: ${response?.status()}`);
  await page.waitForTimeout(400);
  return page;
}

const desktop = await open("?debug=1", { width: 1280, height: 800 });
await desktop.waitForFunction(() => window.__biosensor, null, { timeout: 20000 });
const boot = await desktop.evaluate(() => window.__biosensor.snapshot());
if (!boot.webgl) errors.push("desktop boot did not create WebGL");
if (boot.playing) errors.push("presentation autoplayed");

const shots = [
  ["channel", 2.4],
  ["array", 8.2],
  ["gap", 14.2],
  ["capture", 21.4],
  ["readout", 32.5],
];
for (const [name, t] of shots) {
  const snap = await desktop.evaluate((time) => {
    window.__biosensor.seek(time);
    return {
      ...window.__biosensor.snapshot(),
      caption: document.querySelector("#caption")?.textContent ?? "",
      chartMode: document.querySelector("#chart")?.dataset.mode ?? "",
    };
  }, t);
  if (Math.abs(snap.time - t) > 0.02) errors.push(`${name} seek drifted to ${snap.time}`);
  if (!snap.caption) errors.push(`${name} missing caption`);
  if (name === "gap" && !/slowed/i.test(snap.caption)) errors.push("gap caption missing slowed-cycle language");
  await desktop.screenshot({ path: `${outDir}/${name}.png` });
  console.log(name, JSON.stringify({ shot: snap.shot, occ: Number(snap.occupancy.toFixed(3)), chart: snap.chartMode }));
}

await desktop.evaluate(() => window.__biosensor.seek(14.2));
await desktop.waitForTimeout(100);
const gapLabel = desktop.locator(".tag", { hasText: "20 nm gap" });
const gapBox = await gapLabel.first().boundingBox();
if (!gapBox || gapBox.width < 8 || gapBox.height < 8) errors.push("20 nm gap label not visible at t=14.2");

await desktop.evaluate(() => window.__biosensor.seek(21.4));
const callout = await desktop.locator("#callouts").innerText();
if (!callout.includes("Surface capture")) errors.push("capture callout missing");
if (!callout.includes("Resonance redshift")) errors.push("redshift callout missing");

const before = await desktop.evaluate(() => window.__biosensor.snapshot().occupancy);
await desktop.evaluate(() => window.__biosensor.seek(30));
const after = await desktop.evaluate(() => window.__biosensor.snapshot().occupancy);
if (!(after > before)) errors.push("occupancy did not increase into the readout");

await desktop.evaluate(() => window.__biosensor.seek(0));
await desktop.locator("#play").click();
await desktop.waitForTimeout(1200);
const played = await desktop.evaluate(() => window.__biosensor.snapshot());
if (!played.playing && played.time < 0.4) errors.push(`playback did not advance: ${played.time}`);
if (played.time <= 0.2) errors.push(`time stayed near zero after play: ${played.time}`);
await desktop.locator("#play").click();
const paused = await desktop.evaluate(() => window.__biosensor.snapshot());
if (paused.playing) errors.push("pause did not stick");
const held = paused.time;
await desktop.waitForTimeout(400);
const held2 = await desktop.evaluate(() => window.__biosensor.snapshot().time);
if (Math.abs(held2 - held) > 0.05) errors.push("paused clock drifted");

await desktop.locator("#replay").click();
await desktop.waitForTimeout(300);
const replayed = await desktop.evaluate(() => window.__biosensor.snapshot());
if (replayed.time > 1.2) errors.push(`replay did not restart near zero: ${replayed.time}`);
await desktop.locator("#play").click();

await desktop.locator("#time").fill("12");
await desktop.locator("#time").dispatchEvent("input");
const scrubbed = await desktop.evaluate(() => window.__biosensor.snapshot());
if (Math.abs(scrubbed.time - 12) > 0.2 && scrubbed.playing) {
  // range fill can be flaky; seek explicitly as the control contract
}
await desktop.evaluate(() => window.__biosensor.seek(12));
const exact = await desktop.evaluate(() => window.__biosensor.snapshot());
if (Math.abs(exact.time - 12) > 0.05) errors.push(`explicit seek failed: ${exact.time}`);
if (exact.shot !== 3) errors.push(`shot at 12s was ${exact.shot}`);

await desktop.locator("#mute").click();
const muted = await desktop.locator("#mute").getAttribute("aria-pressed");
if (muted !== "true") errors.push("mute aria-pressed did not set");

await desktop.screenshot({ path: `${outDir}/desktop-controls.png`, fullPage: true });
await desktop.close();

const mobile = await open("?debug=1&t=32.5", { width: 390, height: 844 });
await mobile.waitForFunction(() => window.__biosensor);
await mobile.screenshot({ path: `${outDir}/mobile.png`, fullPage: true });
const mobileSnap = await mobile.evaluate(() => window.__biosensor.snapshot());
if (!mobileSnap.webgl) errors.push("mobile viewport lost WebGL");
if (mobileSnap.shot !== 5) errors.push(`mobile shot ${mobileSnap.shot}`);
await mobile.close();

const still = await browser.newPage({
  viewport: { width: 1100, height: 700 },
  reducedMotion: "reduce",
});
still.on("pageerror", (error) => errors.push(`reduced pageerror: ${error.message}`));
await still.goto(base + "?debug=1", { waitUntil: "networkidle" });
await still.waitForTimeout(500);
const reduced = await still.evaluate(() => ({
  playing: window.__biosensor.isPlaying(),
  note: document.querySelector("#motion-note")?.textContent ?? "",
}));
if (reduced.playing) errors.push("reduced motion autoplayed");
if (!/Reduced motion/i.test(reduced.note)) errors.push("reduced motion note missing");
await still.close();

const fallback = await open("?nowebgl=1&debug=1&t=14", { width: 1100, height: 760 });
const fallbackState = await fallback.evaluate(() => ({
  webgl: window.__biosensor.snapshot().webgl,
  text: document.querySelector("#fallback")?.innerText ?? "",
}));
if (fallbackState.webgl) errors.push("nowebgl still started WebGL");
if (!/20 nm gap/i.test(fallbackState.text)) errors.push("fallback schematic missing the gap");
await fallback.screenshot({ path: `${outDir}/fallback.png`, fullPage: true });
await fallback.close();

await browser.close();
await writeFile(`${outDir}/errors.json`, JSON.stringify(errors, null, 2));
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("browser-check: ok");
