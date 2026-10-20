import {
  AXIS_X,
  AXIS_Y,
  BASE_CENTER,
  DURATION,
  type ChartMode,
  chartMode,
  occupancy,
  resonanceCenter,
  transmission,
} from "./model";

export type SpectrumDrawOptions = {
  background?: string;
  compact?: boolean;
};

export function drawSpectrum(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  t: number,
  options: SpectrumDrawOptions = {},
): void {
  const mode: ChartMode = chartMode(t);
  const compact = options.compact ?? width < 420;
  ctx.clearRect(0, 0, width, height);
  if (mode === "hidden") return;

  const bg = options.background ?? "rgba(10, 12, 16, 0.92)";
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const short = height < 200;
  const narrow = width < 300;
  const padL = compact ? 28 : 52;
  const padR = compact ? 10 : 16;
  const padT = compact ? 18 : 22;
  const padB =
    mode === "readout" ? (short ? 30 : compact ? 78 : 96) : short ? 16 : compact ? 28 : 46;
  const plotW = Math.max(10, width - padL - padR);
  const plotH = Math.max(10, height - padT - padB);
  const occ = occupancy(t);
  const center = resonanceCenter(occ);
  const showCurrent = mode === "shift" || mode === "readout";

  const xOf = (x: number) => padL + x * plotW;
  const yOf = (y: number) => padT + (1 - y) * plotH;

  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let g = 0; g <= 4; g += 1) {
    const y = padT + (g / 4) * plotH;
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
  }
  ctx.stroke();

  ctx.strokeStyle = "rgba(197,198,199,0.85)";
  ctx.lineWidth = 1.25;
  ctx.strokeRect(padL, padT, plotW, plotH);

  const sampleCurve = (c: number, dashed: boolean) => {
    ctx.beginPath();
    const n = 96;
    for (let i = 0; i <= n; i += 1) {
      const x = i / n;
      const px = xOf(x);
      const py = yOf(transmission(x, c));
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.setLineDash(dashed ? [5, 4] : []);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  ctx.lineWidth = compact ? 1.6 : 2;
  ctx.strokeStyle = "#C5C6C7";
  sampleCurve(BASE_CENTER, true);
  if (showCurrent) {
    ctx.strokeStyle = "#FFD166";
    sampleCurve(center, false);
  }

  const markBaseline = () => {
    const x = xOf(BASE_CENTER);
    const y = yOf(transmission(BASE_CENTER, BASE_CENTER));
    ctx.strokeStyle = "#C5C6C7";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - 4, y - 4, 8, 8);
  };
  const markCurrent = () => {
    const x = xOf(center);
    const y = yOf(transmission(center, center));
    ctx.fillStyle = "#FFD166";
    ctx.beginPath();
    ctx.moveTo(x, y - 6);
    ctx.lineTo(x + 5, y);
    ctx.lineTo(x, y + 6);
    ctx.lineTo(x - 5, y);
    ctx.closePath();
    ctx.fill();
  };
  markBaseline();
  if (showCurrent) markCurrent();

  if (showCurrent && occ > 0.03) {
    const y = yOf(0.18);
    const x0 = xOf(BASE_CENTER);
    const x1 = xOf(center);
    ctx.strokeStyle = "#00E5FF";
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.moveTo(x0, y - 4);
    ctx.lineTo(x0, y + 4);
    ctx.moveTo(x1, y - 4);
    ctx.lineTo(x1, y + 4);
    ctx.stroke();
    ctx.fillStyle = "#00E5FF";
    ctx.font = `${compact ? 10 : 12}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("Δλ · illustrative", (x0 + x1) / 2, y - 6);
  }

  ctx.fillStyle = "#C5C6C7";
  ctx.font = `${compact ? 10 : 12}px "Space Grotesk", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  const axisY = short ? height - (mode === "readout" ? 16 : 2) : height - (mode === "readout" ? (compact ? 62 : 74) : 6);
  ctx.fillText(AXIS_X, padL + plotW / 2, axisY);

  ctx.save();
  ctx.translate(14, padT + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(AXIS_Y, 0, 0);
  ctx.restore();

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.font = `${compact ? 10 : 11}px "Space Grotesk", sans-serif`;
  const legendY = 6;
  ctx.fillStyle = "#C5C6C7";
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = "#C5C6C7";
  ctx.beginPath();
  ctx.moveTo(padL, legendY + 6);
  ctx.lineTo(padL + 16, legendY + 6);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeRect(padL + 22, legendY + 2, 7, 7);
  ctx.fillText("Baseline", padL + 32, legendY);
  if (showCurrent) {
    ctx.strokeStyle = "#FFD166";
    ctx.beginPath();
    ctx.moveTo(padL + 92, legendY + 6);
    ctx.lineTo(padL + 108, legendY + 6);
    ctx.stroke();
    ctx.fillStyle = "#FFD166";
    ctx.beginPath();
    ctx.moveTo(padL + 118, legendY);
    ctx.lineTo(padL + 123, legendY + 5);
    ctx.lineTo(padL + 118, legendY + 10);
    ctx.lineTo(padL + 113, legendY + 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillText("Current", padL + 128, legendY);
  }

  ctx.fillStyle = "#A7B0BA";
  ctx.font = `${compact ? 10 : 11}px "Space Grotesk", sans-serif`;
  ctx.textAlign = "right";
  const title =
    mode === "baseline"
      ? narrow
        ? "Baseline"
        : "Baseline after receptor functionalization"
      : narrow
        ? "Schematic model"
        : "Schematic spectral model";
  if (!(short && mode === "readout")) ctx.fillText(title, width - 8, legendY);

  if (mode === "readout" && short) {
    ctx.fillStyle = "#00E5FF";
    ctx.textAlign = "right";
    ctx.font = `10px "JetBrains Mono", ui-monospace, monospace`;
    ctx.fillText(`${Math.round(occ * 100)}% weighted`, width - 8, legendY);
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = "#A7B0BA";
    ctx.fillText("Weighted occupancy. Not a spectrometer map.", padL, height - 2);
    return;
  }

  if (mode === "readout") {
    const trendTop = height - (compact ? 56 : 66);
    const trendH = compact ? 28 : 36;
    ctx.fillStyle = "#E6E8EB";
    ctx.textAlign = "left";
    ctx.font = `${compact ? 10 : 12}px "Space Grotesk", sans-serif`;
    ctx.fillText("Illustrative bound occupancy", padL, trendTop - 2);
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.strokeRect(padL, trendTop + 12, plotW, trendH);
    ctx.beginPath();
    ctx.strokeStyle = "#00E5FF";
    ctx.lineWidth = 1.5;
    const t0 = 17;
    const steps = 48;
    for (let i = 0; i <= steps; i += 1) {
      const tt = t0 + ((DURATION - t0) * i) / steps;
      const x = padL + (plotW * (tt - t0)) / (DURATION - t0);
      const y = trendTop + 12 + trendH - occupancy(Math.min(tt, t)) * (trendH - 4) - 2;
      if (tt > t) break;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    const pct = Math.round(occ * 100);
    ctx.fillStyle = "#00E5FF";
    ctx.textAlign = "right";
    ctx.fillText(`${pct}% of weighted sites`, padL + plotW, trendTop - 2);
    ctx.textAlign = "left";
    ctx.fillStyle = "#A7B0BA";
    ctx.font = `${compact ? 9 : 10}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.fillText("Near-field-weighted. Not a measured surface map.", padL, height - 8);
  }
}

export function spectrumSummary(t: number): string {
  const mode = chartMode(t);
  if (mode === "hidden") return "Spectrum hidden until illumination is introduced.";
  const occ = occupancy(t);
  const center = resonanceCenter(occ);
  const pct = Math.round(occ * 100);
  const shift =
    center > BASE_CENTER + 0.004
      ? "The current minimum sits to the right of the dashed baseline: a redshift on the illustrative wavelength axis."
      : "The current minimum matches the dashed pre-binding baseline.";
  if (mode === "baseline") {
    return "Schematic baseline transmission after receptor functionalization, before target binding. Open square marks the minimum. Axes: illustrative wavelength and normalized transmission.";
  }
  return `Schematic spectral model. Dashed gray curve with an open square is the baseline. Solid gold curve with a diamond is the current ensemble transmission. ${shift} Illustrative near-field-weighted bound occupancy ${pct} percent. Dip depth and linewidth stay constant.`;
}
