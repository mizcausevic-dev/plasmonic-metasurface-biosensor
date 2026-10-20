import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import { Score } from "./audio";
import { drawSpectrum, spectrumSummary } from "./chart";
import { Experience, type Quality } from "./experience";
import { mountFallback, updateFallback } from "./fallback";
import {
  DURATION,
  callouts,
  caption,
  chartMode,
  clamp,
  frameIndex,
  occupancy,
  parameterNote,
  scaleNote,
  shotNumber,
  statusLine,
} from "./model";
import "./style.css";

const params = new URLSearchParams(location.search);
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function required<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing ${selector}`);
  return node;
}

const stage = required<HTMLElement>("#stage");
const canvas = required<HTMLCanvasElement>("#view");
const labels = required<HTMLElement>("#labels");
const leaders = required<SVGSVGElement>("#leaders");
const chart = required<HTMLCanvasElement>("#chart");
const captionEl = required<HTMLElement>("#caption");
const scaleEl = required<HTMLElement>("#scale-note");
const statusEl = required<HTMLElement>("#status-line");
const paramEl = required<HTMLElement>("#param-note");
const calloutEl = required<HTMLElement>("#callouts");
const legendEl = required<HTMLElement>("#legend");
const summaryEl = required<HTMLElement>("#chart-summary");
const loader = required<HTMLElement>("#loader");
const errorEl = required<HTMLElement>("#error");
const playBtn = required<HTMLButtonElement>("#play");
const bigPlay = required<HTMLButtonElement>("#big-play");
const replayBtn = required<HTMLButtonElement>("#replay");
const muteBtn = required<HTMLButtonElement>("#mute");
const fullBtn = required<HTMLButtonElement>("#fullscreen");
const timeInput = required<HTMLInputElement>("#time");
const readout = required<HTMLElement>("#readout");
const musicInput = required<HTMLInputElement>("#music");
const sfxInput = required<HTMLInputElement>("#sfx");
const motionNote = required<HTMLElement>("#motion-note");
const live = required<HTMLElement>("#live");
const dialog = required<HTMLDialogElement>("#about");
const aboutBtn = required<HTMLButtonElement>("#about-btn");
const aboutClose = required<HTMLButtonElement>("#about-close");

const audio = new Score();
let experience: Experience | null = null;
let playing = false;
let playOriginPerf = 0;
let playOriginTime = 0;
let lastAudioSync = 0;
let time = clamp(Number(params.get("t") ?? "0"), 0, DURATION);
if (!Number.isFinite(time)) time = 0;
let lastCaption = "";
let lastSummaryKey = "";

function quality(): Quality {
  const cores = navigator.hardwareConcurrency || 8;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  const narrow = window.matchMedia("(max-width: 800px)").matches;
  if (narrow || cores <= 4 || memory <= 4) return "low";
  return "high";
}

function webglOk(): boolean {
  if (params.has("nowebgl")) return false;
  try {
    const probe = document.createElement("canvas");
    return Boolean(probe.getContext("webgl2") || probe.getContext("webgl"));
  } catch {
    return false;
  }
}

function showError(message: string): void {
  errorEl.hidden = false;
  errorEl.textContent = message;
}

function resizeChart(): void {
  const rect = chart.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(2, Math.floor(rect.width * ratio));
  const height = Math.max(2, Math.floor(rect.height * ratio));
  if (chart.width !== width || chart.height !== height) {
    chart.width = width;
    chart.height = height;
  }
}

function renderCallouts(items: readonly string[]): void {
  calloutEl.replaceChildren(
    ...items.map((text) => {
      const item = document.createElement("li");
      item.textContent = text;
      return item;
    }),
  );
  calloutEl.hidden = items.length === 0;
}

function announce(text: string): void {
  live.textContent = text;
}

function updateHud(): void {
  const shot = shotNumber(time);
  const nextCaption = caption(time);
  if (nextCaption !== lastCaption) {
    captionEl.textContent = nextCaption;
    lastCaption = nextCaption;
  }
  scaleEl.textContent = scaleNote(time);
  const status = statusLine(time);
  statusEl.textContent = status;
  statusEl.hidden = status.length === 0;
  const note = parameterNote(time);
  paramEl.textContent = note;
  paramEl.hidden = note.length === 0;
  renderCallouts(callouts(time));
  const showLegend = time >= 11.6 && time < 18.2;
  legendEl.hidden = !showLegend;
  const mode = chartMode(time);
  chart.dataset.mode = mode;
  chart.toggleAttribute("aria-hidden", mode === "hidden");
  resizeChart();
  const ctx = chart.getContext("2d");
  if (ctx && mode !== "hidden") {
    const rect = chart.getBoundingClientRect();
    const ratio = chart.width / Math.max(1, rect.width);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawSpectrum(ctx, rect.width, rect.height, time, { compact: rect.width < 460 });
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  } else if (ctx) ctx.clearRect(0, 0, chart.width, chart.height);
  const summaryKey = `${shot}:${mode}:${Math.round(occupancy(time) * 20)}`;
  if (summaryKey !== lastSummaryKey) {
    summaryEl.textContent = spectrumSummary(time);
    lastSummaryKey = summaryKey;
  }
  const frame = frameIndex(time);
  bigPlay.textContent = time > 0.05 && time < DURATION ? "Resume presentation" : "Play presentation";
  readout.textContent = `${time.toFixed(2)} / 34.00 s, frame ${frame}`;
  timeInput.value = time.toFixed(3);
  timeInput.setAttribute("aria-valuetext", `${time.toFixed(2)} seconds, shot ${shot}, frame ${frame}`);
  timeInput.setAttribute("aria-valuenow", time.toFixed(2));
  if (!experience) updateFallback(time);
}

function render(now: number): void {
  if (playing) {
    time = Math.min(DURATION, playOriginTime + (now - playOriginPerf) / 1000);
    if (time >= DURATION) {
      time = DURATION;
      playing = false;
      audio.stop();
      syncButtons();
      announce("Presentation ended at 34 seconds.");
    } else if (audio.contextState() === "running" && now - lastAudioSync > 500) {
      const heard = audio.presentationTime();
      if (heard != null && Math.abs(heard - time) > 0.18) {
        lastAudioSync = now;
        audio.startAt(time);
      }
    }
  }
  experience?.update(time);
  updateHud();
}

function syncButtons(): void {
  playBtn.textContent = playing ? "Pause" : "Play";
  playBtn.setAttribute("aria-pressed", playing ? "true" : "false");
  bigPlay.hidden = playing;
  bigPlay.textContent = time > 0.05 && time < DURATION ? "Resume presentation" : "Play presentation";
}

async function startPlayback(from: number): Promise<void> {
  time = clamp(from, 0, DURATION);
  if (time >= DURATION) time = 0;
  await audio.ensure();
  audio.startAt(time);
  playOriginPerf = performance.now();
  playOriginTime = time;
  lastAudioSync = playOriginPerf;
  playing = true;
  syncButtons();
  announce("Playing presentation.");
}

function pause(): void {
  if (!playing) return;
  time = Math.min(DURATION, playOriginTime + (performance.now() - playOriginPerf) / 1000);
  playing = false;
  audio.stop();
  syncButtons();
  announce(`Paused at ${time.toFixed(2)} seconds.`);
}

async function togglePlay(): Promise<void> {
  if (playing) pause();
  else await startPlayback(time);
}

function seek(next: number): void {
  time = clamp(next, 0, DURATION);
  if (playing) {
    playOriginPerf = performance.now();
    playOriginTime = time;
    if (audio.contextState() !== "none") audio.startAt(time);
  }
  updateHud();
  experience?.update(time);
}

if (reducedMotion) {
  motionNote.hidden = false;
  motionNote.textContent =
    "Reduced motion is on. The view stays still until you press Play. Shot buttons and the timeline jump to stills.";
}

const fullscreenTarget = document.documentElement as HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};
const canFullscreen = Boolean(document.fullscreenEnabled || fullscreenTarget.webkitRequestFullscreen);
if (!canFullscreen) fullBtn.hidden = true;

try {
  if (!webglOk()) {
    canvas.hidden = true;
    const fallback = document.querySelector<HTMLElement>("#fallback");
    if (fallback) mountFallback(fallback);
    loader.hidden = true;
  } else {
    experience = new Experience({
      canvas,
      stage,
      labels,
      leaders,
      quality: quality(),
      onContextLost: () => {
        showError("The graphics context was lost. Reload the page to restore the 3D view.");
        const fallback = document.querySelector<HTMLElement>("#fallback");
        if (fallback) mountFallback(fallback);
        experience = null;
      },
    });
    loader.hidden = true;
  }
} catch (error) {
  canvas.hidden = true;
  const fallback = document.querySelector<HTMLElement>("#fallback");
  if (fallback) mountFallback(fallback);
  loader.hidden = true;
  const message = error instanceof Error ? error.message : "The 3D view failed to start.";
  showError(`${message} A schematic fallback is shown instead.`);
}

updateHud();
experience?.update(time);
syncButtons();

playBtn.addEventListener("click", () => void togglePlay());
bigPlay.addEventListener("click", () => void togglePlay());
replayBtn.addEventListener("click", () => void startPlayback(0));
muteBtn.addEventListener("click", () => {
  audio.muted = !audio.muted;
  audio.applyGains();
  muteBtn.textContent = audio.muted ? "Unmute" : "Mute";
  muteBtn.setAttribute("aria-pressed", audio.muted ? "true" : "false");
});
musicInput.addEventListener("input", () => {
  audio.musicLevel = Number(musicInput.value);
  audio.applyGains();
});
sfxInput.addEventListener("input", () => {
  audio.sfxLevel = Number(sfxInput.value);
  audio.applyGains();
});
timeInput.addEventListener("input", () => seek(Number(timeInput.value)));
document.querySelectorAll<HTMLButtonElement>("[data-jump]").forEach((button) => {
  button.addEventListener("click", () => seek(Number(button.dataset.jump)));
});
fullBtn.addEventListener("click", async () => {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
    return;
  }
  if (fullscreenTarget.requestFullscreen) await fullscreenTarget.requestFullscreen();
  else await fullscreenTarget.webkitRequestFullscreen?.();
});
aboutBtn.addEventListener("click", () => dialog.showModal());
aboutClose.addEventListener("click", () => dialog.close());

window.addEventListener("keydown", (event) => {
  if (dialog.open) return;
  const target = event.target as HTMLElement | null;
  const tag = target?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  if (event.code === "Space") {
    if (tag === "BUTTON") return;
    event.preventDefault();
    void togglePlay();
  } else if (event.code === "KeyR") {
    void startPlayback(0);
  } else if (event.code === "KeyM") {
    muteBtn.click();
  } else if (event.code === "KeyF" && canFullscreen) {
    fullBtn.click();
  } else if (event.code === "Home") {
    seek(0);
  } else if (event.code === "End") {
    seek(DURATION);
  } else if (event.code === "ArrowRight") {
    seek(time + (event.shiftKey ? 0.1 : 1));
  } else if (event.code === "ArrowLeft") {
    seek(time - (event.shiftKey ? 0.1 : 1));
  } else if (event.code >= "Digit1" && event.code <= "Digit5") {
    const jumps = [0, 5, 10, 17, 25];
    seek(jumps[Number(event.code.slice(5)) - 1] ?? 0);
  }
});

window.addEventListener("resize", () => {
  experience?.resize();
  resizeChart();
  updateHud();
});

if (params.has("debug")) {
  const api = {
    getTime: () => time,
    isPlaying: () => playing,
    seek: (next: number) => seek(next),
    play: () => startPlayback(time),
    pause: () => pause(),
    snapshot: () => ({
      time,
      shot: shotNumber(time),
      frame: frameIndex(time),
      occupancy: occupancy(time),
      playing,
      muted: audio.muted,
      webgl: Boolean(experience),
    }),
  };
  (window as unknown as { __biosensor: typeof api }).__biosensor = api;
}

function tick(now: number): void {
  render(now);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
