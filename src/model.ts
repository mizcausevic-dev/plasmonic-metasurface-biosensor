/**
 * Illustrative presentation model.
 * Every visual quantity is a pure function of presentation time.
 * This is not an electromagnetic solver, a binding-kinetics fit, or a calibrated assay.
 */

export const DURATION = 34;
export const FPS = 30;
export const FRAME_COUNT = 1020;

/** Specified clear opening between facing metal surfaces. */
export const CLEAR_GAP_UM = 0.02;

/** Illustrative ring geometry, in micrometers. */
export const RING_R = 0.11;
export const TUBE_R = 0.018;
export const CHORD = CLEAR_GAP_UM + 2 * TUBE_R;
export const HALF_GAP = Math.asin(CHORD / (2 * RING_R));
export const ROT_Y = -Math.PI / 2;
export const LINKER_H = 0.004;
export const AB_HEIGHT = 0.013;

export const CHANNEL = {
  length: 220,
  height: 28,
  halfWidth: 25,
  wall: 6,
  cover: 6,
  sensorX: 110,
} as const;

export const ARRAY = {
  pitch: 0.5,
  nx: 15,
  nz: 9,
} as const;

export const BASE_CENTER = 0.38;
export const MAX_SHIFT = 0.18;
export const DIP_DEPTH = 0.62;
export const DIP_WIDTH = 0.055;
export const BASELINE_LEVEL = 0.9;
export const OPTICAL_CYCLE_SECONDS = 2.4;

export const AXIS_X = "Wavelength · illustrative scale";
export const AXIS_Y = "Normalized transmission";

export type V3 = { x: number; y: number; z: number };

export const HERO_POS: V3 = { x: CHANNEL.sensorX, y: TUBE_R, z: 0 };

export function smoother(a: number, b: number, t: number): number {
  if (b <= a) return t >= b ? 1 : 0;
  if (t <= a) return 0;
  if (t >= b) return 1;
  const u = (t - a) / (b - a);
  return u * u * u * (u * (u * 6 - 15) + 10);
}

export function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

export function lerp(a: number, b: number, u: number): number {
  return a + (b - a) * u;
}

export function add(a: V3, b: V3): V3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function sub(a: V3, b: V3): V3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function scale(a: V3, s: number): V3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function len(a: V3): number {
  return Math.hypot(a.x, a.y, a.z);
}

export function dist(a: V3, b: V3): number {
  return len(sub(a, b));
}

export function normalize(a: V3): V3 {
  const l = len(a) || 1;
  return scale(a, 1 / l);
}

export function lerpV(a: V3, b: V3, u: number): V3 {
  return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), z: lerp(a.z, b.z, u) };
}

/** Right-handed Y rotation. Matches Three.js Object3D.rotation.y. */
export function rotateY(p: V3, ang: number): V3 {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
}

export function heroLocalToWorld(p: V3): V3 {
  const r = rotateY(p, ROT_Y);
  return { x: HERO_POS.x + r.x, y: HERO_POS.y + r.y, z: HERO_POS.z + r.z };
}

export function ringEndLocals(): [V3, V3] {
  const x = RING_R * Math.cos(HALF_GAP);
  const z = RING_R * Math.sin(HALF_GAP);
  return [
    { x, y: 0, z },
    { x, y: 0, z: -z },
  ];
}

export function clearGapEndpointsLocal(): [V3, V3] {
  const [e1, e2] = ringEndLocals();
  const d = normalize(sub(e2, e1));
  return [add(e1, scale(d, TUBE_R)), add(e2, scale(d, -TUBE_R))];
}

export function clearGapEndpointsWorld(lift = 0): [V3, V3] {
  const [a, b] = clearGapEndpointsLocal();
  return [
    heroLocalToWorld({ x: a.x, y: a.y + lift, z: a.z }),
    heroLocalToWorld({ x: b.x, y: b.y + lift, z: b.z }),
  ];
}

export function gapMidLocal(): V3 {
  const [a, b] = clearGapEndpointsLocal();
  return lerpV(a, b, 0.5);
}

export function gapMidWorld(): V3 {
  return heroLocalToWorld(gapMidLocal());
}

export function distToSegment(p: V3, a: V3, b: V3): number {
  const ab = sub(b, a);
  const l2 = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z || 1;
  const u = clamp(((p.x - a.x) * ab.x + (p.y - a.y) * ab.y + (p.z - a.z) * ab.z) / l2, 0, 1);
  return dist(p, add(a, scale(ab, u)));
}

export function frameIndex(t: number): number {
  if (t >= DURATION) return FRAME_COUNT - 1;
  if (t <= 0) return 0;
  return Math.min(FRAME_COUNT - 1, Math.floor(t * FPS));
}

export function shotNumber(t: number): 1 | 2 | 3 | 4 | 5 {
  if (t < 5) return 1;
  if (t < 10) return 2;
  if (t < 17) return 3;
  if (t < 25) return 4;
  return 5;
}

export function arrayOrigin(): V3 {
  return {
    x: CHANNEL.sensorX - ((ARRAY.nx - 1) * ARRAY.pitch) / 2,
    y: TUBE_R,
    z: -((ARRAY.nz - 1) * ARRAY.pitch) / 2,
  };
}

export function coverTransform(t: number): { x: number; y: number; ghost: number } {
  const lift = smoother(1.05, 2.2, t);
  const slide = smoother(2.15, 3.6, t);
  const back = smoother(25.4, 27.8, t);
  const open = 1 - back;
  return {
    x: 90 * slide * open,
    y: 22 * lift * open,
    ghost: smoother(1.15, 2.05, t) * (1 - smoother(26.4, 28.1, t)),
  };
}

const WEIGHTS = [1, 0.84, 0.66, 0.5, 0.96, 0.78, 0.62, 0.46];

export type Receptor = {
  index: number;
  angle: number;
  weight: number;
  baseLocal: V3;
  tipLocal: V3;
  base: V3;
  tip: V3;
};

function buildReceptors(): Receptor[] {
  const angles = [
    HALF_GAP + 0.22,
    HALF_GAP + 0.46,
    HALF_GAP + 0.72,
    HALF_GAP + 1.02,
    -HALF_GAP - 0.22,
    -HALF_GAP - 0.46,
    -HALF_GAP - 0.72,
    -HALF_GAP - 1.02,
  ];
  return angles.map((angle, index) => {
    const baseLocal = {
      x: Math.cos(angle) * RING_R,
      y: TUBE_R + LINKER_H,
      z: Math.sin(angle) * RING_R,
    };
    const tipLocal = { x: baseLocal.x, y: baseLocal.y + AB_HEIGHT, z: baseLocal.z };
    return {
      index,
      angle,
      weight: WEIGHTS[index] ?? 0.5,
      baseLocal,
      tipLocal,
      base: heroLocalToWorld(baseLocal),
      tip: heroLocalToWorld(tipLocal),
    };
  });
}

export const RECEPTORS: readonly Receptor[] = buildReceptors();

export const BIND_EVENTS: readonly { receptor: number; bindT: number }[] = [
  { receptor: 0, bindT: 18.35 },
  { receptor: 1, bindT: 19.2 },
  { receptor: 2, bindT: 20.15 },
  { receptor: 4, bindT: 21.05 },
  { receptor: 5, bindT: 22.1 },
  { receptor: 6, bindT: 23.2 },
];

/** Sparse sonification: three of the six binding events. */
export const SONIFIED_BIND_INDEXES = [0, 2, 5] as const;

const BIND_BY_RECEPTOR = new Map(BIND_EVENTS.map((e) => [e.receptor, e.bindT]));

export function occupancy(t: number): number {
  let acc = 0;
  let total = 0;
  for (const r of RECEPTORS) {
    total += r.weight;
    const bt = BIND_BY_RECEPTOR.get(r.index);
    if (bt == null) continue;
    acc += r.weight * smoother(bt, bt + 0.55, t);
  }
  return total > 0 ? acc / total : 0;
}

export function resonanceCenter(occ: number): number {
  return BASE_CENTER + MAX_SHIFT * occ;
}

export function transmission(x: number, center: number): number {
  const y = BASELINE_LEVEL - DIP_DEPTH * Math.exp(-0.5 * ((x - center) / DIP_WIDTH) ** 2);
  return clamp(y, 0, 1);
}

export function opticalPhase(t: number): number {
  return ((t - 11) / OPTICAL_CYCLE_SECONDS) * Math.PI * 2;
}

/** +1 when the world +X gap face carries schematic positive charge. */
export function chargeSign(t: number): 1 | -1 {
  return Math.cos(opticalPhase(t)) >= 0 ? 1 : -1;
}

/** Direction from schematic positive charge toward negative charge, with an upward fringe. */
export function gapFieldDir(t: number): V3 {
  const s = chargeSign(t);
  return normalize({ x: -s, y: 0.28, z: 0 });
}

export type MoleculeKind = "bind" | "pass";

export type MoleculeSpec = {
  id: number;
  kind: MoleculeKind;
  receptor: number | null;
  bindT: number | null;
  y: number;
  z: number;
  x0: number;
  speed: number;
  phase: number;
  radius: number;
};

const APPROACH = 0.85;

function flowPoint(spec: MoleculeSpec, time: number): V3 {
  return {
    x: spec.x0 + spec.speed * time + Math.sin(time * 1.6 + spec.phase) * 0.003,
    y: spec.y + Math.sin(time * 1.9 + spec.phase * 1.3) * 0.0035,
    z: spec.z + Math.sin(time * 1.4 + spec.phase * 0.7) * 0.0035,
  };
}

export function moleculePosition(spec: MoleculeSpec, t: number): V3 {
  if (spec.kind === "pass" || spec.bindT == null || spec.receptor == null) {
    return flowPoint(spec, t);
  }
  const tip = RECEPTORS[spec.receptor]?.tip;
  if (!tip) return flowPoint(spec, t);
  const t0 = spec.bindT - APPROACH;
  if (t <= t0) return flowPoint(spec, t);
  const u = smoother(t0, spec.bindT, t);
  const start = flowPoint(spec, t0);
  const wiggle = t > spec.bindT ? Math.sin(t * 2.1 + spec.phase) * 0.0008 : 0;
  return {
    x: lerp(start.x, tip.x, u),
    y: lerp(start.y, tip.y, u) + wiggle,
    z: lerp(start.z, tip.z, u),
  };
}

function buildMolecules(): MoleculeSpec[] {
  const specs: MoleculeSpec[] = [];
  let id = 0;
  for (const ev of BIND_EVENTS) {
    const tip = RECEPTORS[ev.receptor]?.tip;
    if (!tip) continue;
    const speed = 0.05;
    const xAtApproach = tip.x - 0.04;
    specs.push({
      id: id++,
      kind: "bind",
      receptor: ev.receptor,
      bindT: ev.bindT,
      y: tip.y + 0.03,
      z: tip.z + (ev.receptor % 2 === 0 ? 0.01 : -0.012),
      x0: xAtApproach - speed * (ev.bindT - APPROACH),
      speed,
      phase: ev.receptor * 1.7 + 0.4,
      radius: 0.0045,
    });
  }
  const gapX = gapMidWorld().x;
  const passers = [
    { enter: 17.1, y: 0.07, z: 0.02, speed: 0.06, phase: 0.3, radius: 0.0042 },
    { enter: 17.8, y: 0.095, z: -0.035, speed: 0.05, phase: 1.2, radius: 0.005 },
    { enter: 18.4, y: 0.055, z: 0.07, speed: 0.07, phase: 2.0, radius: 0.0038 },
    { enter: 19.1, y: 0.12, z: 0.0, speed: 0.055, phase: 0.8, radius: 0.0044 },
    { enter: 20.0, y: 0.08, z: -0.09, speed: 0.065, phase: 1.7, radius: 0.0048 },
    { enter: 21.2, y: 0.06, z: 0.11, speed: 0.05, phase: 2.6, radius: 0.0036 },
    { enter: 22.0, y: 0.13, z: -0.02, speed: 0.08, phase: 0.55, radius: 0.0051 },
    { enter: 18.9, y: 0.085, z: 0.1, speed: 0.045, phase: 1.45, radius: 0.004 },
  ];
  for (const p of passers) {
    const xEnter = gapX - 0.08;
    specs.push({
      id: id++,
      kind: "pass",
      receptor: null,
      bindT: null,
      y: p.y,
      z: p.z,
      x0: xEnter - p.speed * p.enter,
      speed: p.speed,
      phase: p.phase,
      radius: p.radius,
    });
  }
  return specs;
}

export const MOLECULES: readonly MoleculeSpec[] = buildMolecules();

export function isBound(spec: MoleculeSpec, t: number): boolean {
  return spec.kind === "bind" && spec.bindT != null && t >= spec.bindT;
}

type CamKey = { t: number; pos: V3; look: V3; fov: number };

export function cameraAt(t: number): { pos: V3; look: V3; fov: number } {
  const gap = gapMidWorld();
  const s = CHANNEL.sensorX;
  const keys: CamKey[] = [
    { t: 0, pos: { x: 16, y: 18, z: 52 }, look: { x: 78, y: 10, z: 0 }, fov: 38 },
    { t: 2.3, pos: { x: 74, y: 24, z: 44 }, look: { x: 128, y: 8, z: 0 }, fov: 36 },
    { t: 5, pos: { x: s - 1.2, y: 10.5, z: 8.2 }, look: { x: s, y: 0.35, z: 0 }, fov: 26 },
    { t: 7.7, pos: { x: s + 0.8, y: 2.5, z: 1.65 }, look: { x: s, y: 0.04, z: 0.04 }, fov: 20 },
    {
      t: 10,
      pos: { x: gap.x, y: gap.y + 0.22, z: gap.z + 0.2 },
      look: gap,
      fov: 28,
    },
    {
      t: 13.4,
      pos: { x: gap.x, y: gap.y + 0.03, z: gap.z + 0.058 },
      look: gap,
      fov: 36,
    },
    {
      t: 17,
      pos: { x: gap.x, y: gap.y + 0.024, z: gap.z + 0.046 },
      look: { x: gap.x, y: gap.y + 0.006, z: gap.z },
      fov: 34,
    },
    {
      t: 19.5,
      pos: { x: gap.x - 0.012, y: gap.y + 0.068, z: gap.z + 0.175 },
      look: { x: gap.x, y: gap.y + 0.02, z: gap.z },
      fov: 32,
    },
    {
      t: 25,
      pos: { x: gap.x - 0.02, y: gap.y + 0.062, z: gap.z + 0.155 },
      look: { x: gap.x, y: gap.y + 0.018, z: gap.z },
      fov: 30,
    },
    { t: 28.2, pos: { x: s + 86, y: 62, z: 240 }, look: { x: s, y: 14, z: 16 }, fov: 48 },
    { t: 33, pos: { x: s + 16, y: 18, z: 190 }, look: { x: s + 4, y: 8, z: 36 }, fov: 56 },
    { t: 34, pos: { x: s + 16, y: 18, z: 190 }, look: { x: s + 4, y: 8, z: 36 }, fov: 56 },
  ];
  if (t <= keys[0].t) return { pos: { ...keys[0].pos }, look: { ...keys[0].look }, fov: keys[0].fov };
  const last = keys[keys.length - 1];
  if (t >= last.t) return { pos: { ...last.pos }, look: { ...last.look }, fov: last.fov };
  let i = 0;
  while (i < keys.length - 1 && t >= keys[i + 1].t) i += 1;
  const a = keys[i];
  const b = keys[i + 1];
  const u = smoother(a.t, b.t, t);
  return { pos: lerpV(a.pos, b.pos, u), look: lerpV(a.look, b.look, u), fov: lerp(a.fov, b.fov, u) };
}

export function fluidOpacity(t: number): number {
  const macro = 1 - smoother(4.6, 7.4, t);
  const section = smoother(17.2, 18.5, t) * (1 - smoother(24.8, 26.8, t));
  const back = smoother(28.4, 30.5, t);
  return 0.045 + 0.2 * Math.max(macro, back * 0.9) + 0.12 * section;
}

/** 0 keeps the full channel. 1 opens a cross-section just in front of the gap. */
export function clipAmount(t: number): number {
  return smoother(17.3, 18.7, t) * (1 - smoother(27.6, 28.5, t));
}

export function illuminationAmount(t: number): number {
  const on = smoother(6.1, 7.5, t);
  const dive = 1 - smoother(9.3, 10.6, t);
  const back = smoother(28.3, 29.6, t);
  return on * Math.max(dive, back);
}

export function lowerPathAmount(t: number): number {
  return smoother(28.3, 29.6, t);
}

export function nearFieldAmount(t: number): number {
  return smoother(11.3, 12.7, t) * (1 - smoother(24.8, 27.5, t));
}

export function moleculeAmount(t: number): number {
  return smoother(16.6, 17.8, t);
}

export function dielectricAmount(t: number): number {
  return occupancy(t) * smoother(18.4, 19.6, t) * (1 - smoother(25.6, 28.2, t));
}

export function bindingMapAmount(t: number): number {
  return occupancy(t) * smoother(29.1, 30.6, t);
}

export function dimensionAmount(t: number): number {
  return smoother(12.1, 13.1, t) * (1 - smoother(16.7, 17.7, t));
}

export function chargeAmount(t: number): number {
  const main = smoother(11.7, 12.7, t) * (1 - smoother(24.6, 26.4, t));
  return main;
}

export function chevronAmount(t: number): number {
  const early = 1 - smoother(4.8, 6.2, t);
  const late = smoother(28.8, 30.4, t);
  return Math.max(early, late * 0.75);
}

export function chevronX(i: number, t: number): number {
  const span = 170;
  const speed = 18;
  return 20 + ((i * 24 + t * speed) % span);
}

export type ChartMode = "hidden" | "baseline" | "shift" | "readout";

export function chartMode(t: number): ChartMode {
  if (t < 6.7) return "hidden";
  if (t < 17.15) return "baseline";
  if (t < 25) return "shift";
  return "readout";
}

export function musicBedGain(t: number): number {
  const attack = smoother(0.15, 2.0, t);
  const release = 1 - smoother(32.0, 34.0, t);
  const body = 0.62 + 0.38 * smoother(8, 22, t);
  return attack * release * body;
}

export const SFX_EVENTS: readonly { id: string; t: number; dur: number }[] = [
  { id: "cover", t: 1.15, dur: 1.6 },
  { id: "scale", t: 5.0, dur: 0.42 },
  { id: "light", t: 6.35, dur: 1.05 },
  { id: "scale", t: 10.0, dur: 0.42 },
  { id: "field", t: 11.75, dur: 1.25 },
  { id: "scale", t: 17.0, dur: 0.4 },
  { id: "bind", t: BIND_EVENTS[0].bindT, dur: 0.22 },
  { id: "bind", t: BIND_EVENTS[2].bindT, dur: 0.22 },
  { id: "bind", t: BIND_EVENTS[5].bindT, dur: 0.22 },
  { id: "scale", t: 25.05, dur: 0.42 },
  { id: "reassembly", t: 26.35, dur: 1.15 },
  { id: "resolve", t: 31.6, dur: 2.3 },
];

export const OPTICS = {
  source: { x: CHANNEL.sensorX, y: 50, z: 0 },
  top: { x: CHANNEL.sensorX, y: CHANNEL.height + CHANNEL.cover, z: 0 },
  floor: { x: CHANNEL.sensorX, y: 0, z: 0 },
  exit: { x: CHANNEL.sensorX, y: -9, z: 0 },
  lens: { x: CHANNEL.sensorX, y: -14, z: 0 },
  fold: { x: CHANNEL.sensorX, y: -14, z: 36 },
  slit: { x: CHANNEL.sensorX, y: -14, z: 72 },
  screen: { x: CHANNEL.sensorX, y: -12, z: 98 },
} as const;

export const CAPTIONS = [
  "Tracking the microfluidic channel. The cover lift is a viewing cutaway. Fluid stays confined in the functioning device.",
  "Periodic gold split rings on a transparent substrate. Polarized light at normal incidence is oriented to drive charge separation across the gap of this illustrative design.",
  "Localized plasmonic response. The optical cycle is slowed for illustration. Schematic surface charge alternates. Relative near-field intensity is strongest at the gap and decays outward. This resonator is not individually resolved by the ensemble spectrometer.",
  "Targets arrive by flow, with a restrained diffusive wobble. A subset binds at accessible receptors beside the gap. In this selected model, binding raises the local refractive index and shifts the existing transmission minimum toward longer wavelength.",
  "Transmitted light is collected below the substrate and read as one ensemble spectrum. The dashed curve is the pre-binding baseline. The marked shift follows near-field-weighted bound occupancy. Binding and transport are time-compressed.",
] as const;

export function caption(t: number): string {
  return CAPTIONS[shotNumber(t) - 1];
}

export function scaleNote(t: number): string {
  const s = shotNumber(t);
  if (s === 1) return "Scale: channel. Length, width, and height are illustrative design parameters.";
  if (s === 2) return "Scale: array. Pitch 500 nm, ring span, and wire thickness are illustrative design parameters.";
  if (s === 3) return "Scale: 20 nm clear gap between the facing gold edges.";
  if (s === 4) return "Scale: schematic receptors and targets at approximate relative size.";
  return "Scale: full transmission path, from source to spectrometer.";
}

export function statusLine(t: number): string {
  if (t >= 11.5 && t < 17.15) return "Optical cycle slowed for illustration";
  if (t >= 17.15) return "Illustrative model · time-compressed binding";
  return "";
}

export function parameterNote(t: number): string {
  if (t >= 6.4 && t < 10.8) {
    return "Illustrative parameters: outer span about 256 nm, wire diameter 36 nm, pitch 500 nm. The 20 nm gap is the specified opening.";
  }
  return "";
}

export function callouts(t: number): readonly string[] {
  const s = shotNumber(t);
  if (s === 3) {
    return ["Optical cycle slowed for illustration", "Relative near-field intensity · illustrative"];
  }
  if (s === 4) {
    return [
      "Surface capture",
      "Local optical environment changes",
      "Resonance redshift · illustrative model",
    ];
  }
  if (s === 5 && t < 33.15) {
    return ["Illustrative model · time-compressed binding"];
  }
  return [];
}

export type LabelSpec = {
  id: string;
  text: string;
  show: (t: number) => boolean;
  anchor: (t: number) => V3;
  dx: number;
  dy: number;
};

export function labelSpecs(): LabelSpec[] {
  const s = CHANNEL.sensorX;
  const gap = gapMidWorld();
  const port = (x: number, t: number): V3 => {
    const c = coverTransform(t);
    return {
      x: x + c.x,
      y: CHANNEL.height + CHANNEL.cover + 8 + c.y,
      z: 0,
    };
  };
  return [
    {
      id: "pdms",
      text: "PDMS cover",
      show: (t) => t >= 0.25 && t < 2.05,
      anchor: () => ({ x: 48, y: CHANNEL.height + 8, z: 8 }),
      dx: 18,
      dy: -36,
    },
    {
      id: "inlet",
      text: "Inlet",
      show: (t) => (t >= 0.2 && t < 4.4) || t >= 29.2,
      anchor: (t) => port(28, t),
      dx: -8,
      dy: -32,
    },
    {
      id: "outlet",
      text: "Outlet",
      show: (t) => (t >= 0.8 && t < 4.4) || t >= 29.2,
      anchor: (t) => port(192, t),
      dx: 8,
      dy: -32,
    },
    {
      id: "flow",
      text: "Flow direction",
      show: (t) => t >= 0.55 && t < 4.5,
      anchor: () => ({ x: 62, y: 12, z: 0 }),
      dx: 16,
      dy: -28,
    },
    {
      id: "aqueous",
      text: "Aqueous volume, tinted for visibility",
      show: (t) => t >= 0.9 && t < 3.6,
      anchor: () => ({ x: 96, y: 16, z: -6 }),
      dx: -20,
      dy: 22,
    },
    {
      id: "cutaway",
      text: "Cutaway: fluid remains confined",
      show: (t) => (t >= 1.7 && t < 4.9) || (t >= 25.3 && t < 27.9),
      anchor: () => ({ x: s, y: 46, z: 10 }),
      dx: 20,
      dy: -26,
    },
    {
      id: "sensor",
      text: "Sensing array",
      show: (t) => t >= 3.45 && t < 6.5,
      anchor: () => ({ x: s, y: 3.2, z: 0 }),
      dx: 18,
      dy: -30,
    },
    {
      id: "substrate",
      text: "Transparent substrate",
      show: (t) => t >= 5.55 && t < 9.7,
      anchor: () => ({ x: s + 6, y: -3, z: 14 }),
      dx: 16,
      dy: 8,
    },
    {
      id: "light",
      text: "Polarized broadband illumination",
      show: (t) => t >= 6.55 && t < 9.5,
      anchor: () => ({ x: s, y: 8, z: 0.2 }),
      dx: -16,
      dy: -34,
    },
    {
      id: "polar",
      text: "Incident E polarization",
      show: (t) => (t >= 6.9 && t < 10.3) || t >= 29.4,
      anchor: (t) => (t < 20 ? { x: s, y: 1.15, z: 0.45 } : { x: s, y: 44, z: 6 }),
      dx: 18,
      dy: -18,
    },
    {
      id: "gap",
      text: "20 nm gap",
      show: (t) => t >= 12.25 && t < 17.05,
      anchor: () => gap,
      dx: -150,
      dy: -52,
    },
    {
      id: "rep",
      text: "Representative resonator",
      show: (t) => t >= 13.4 && t < 16.7,
      anchor: () => gap,
      dx: 28,
      dy: 36,
    },
    {
      id: "capture",
      text: "Surface capture",
      show: (t) => t >= 18.15 && t < 24.6,
      anchor: () => RECEPTORS[0].tip,
      dx: 20,
      dy: -32,
    },
    {
      id: "access",
      text: "Accessible binding near the gap",
      show: (t) => t >= 18.6 && t < 23.6,
      anchor: () => RECEPTORS[4].tip,
      dx: -16,
      dy: 24,
    },
    {
      id: "map",
      text: "Illustrative binding map",
      show: (t) => t >= 28.5,
      anchor: () => ({ x: s, y: 1.4, z: 2 }),
      dx: 16,
      dy: -24,
    },
    {
      id: "collect",
      text: "Collection optics",
      show: (t) => t >= 28.1 && t < 33.4,
      anchor: () => ({ x: OPTICS.lens.x, y: OPTICS.lens.y, z: OPTICS.lens.z + 6 }),
      dx: -20,
      dy: 10,
    },
    {
      id: "spec",
      text: "Spectrometer",
      show: (t) => t >= 28.6,
      anchor: () => ({ x: OPTICS.screen.x, y: OPTICS.screen.y, z: OPTICS.screen.z }),
      dx: 18,
      dy: -16,
    },
  ];
}

/** Fixed spatial weights for the illustrative binding map. Not a spectrometer image. */
export function bindingMapWeight(ix: number, iz: number): number {
  const cx = (ARRAY.nx - 1) / 2;
  const cz = (ARRAY.nz - 1) / 2;
  const dx = (ix - cx) / cx;
  const dz = (iz - cz) / cz;
  const radial = Math.exp(-2.1 * (dx * dx + dz * dz));
  const grain = 0.55 + 0.45 * Math.abs(Math.sin(ix * 12.9898 + iz * 78.233) * 43758.5453 % 1);
  return radial * grain;
}
