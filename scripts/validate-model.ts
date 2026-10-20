import assert from "node:assert/strict";
import {
  AXIS_X,
  AXIS_Y,
  BASE_CENTER,
  BIND_EVENTS,
  CAPTIONS,
  CHANNEL,
  CLEAR_GAP_UM,
  DURATION,
  FRAME_COUNT,
  FPS,
  MOLECULES,
  RECEPTORS,
  SFX_EVENTS,
  SONIFIED_BIND_INDEXES,
  TUBE_R,
  cameraAt,
  caption,
  chargeSign,
  clearGapEndpointsWorld,
  dist,
  distToSegment,
  frameIndex,
  gapFieldDir,
  moleculePosition,
  musicBedGain,
  occupancy,
  resonanceCenter,
  shotNumber,
  transmission,
} from "../src/model.ts";

assert.equal(DURATION, 34);
assert.equal(FPS, 30);
assert.equal(FRAME_COUNT, 1020);
assert.equal(CLEAR_GAP_UM, 0.02);
assert.equal(AXIS_X, "Wavelength · illustrative scale");
assert.equal(AXIS_Y, "Normalized transmission");

const boundaries: Array<[number, number, number]> = [
  [0, 0, 1],
  [4.999, 149, 1],
  [5, 150, 2],
  [9.999, 299, 2],
  [10, 300, 3],
  [16.999, 509, 3],
  [17, 510, 4],
  [24.999, 749, 4],
  [25, 750, 5],
  [33.999, 1019, 5],
  [34, 1019, 5],
];
for (const [t, frame, shot] of boundaries) {
  assert.equal(frameIndex(t), frame, `frame at ${t}`);
  assert.equal(shotNumber(t), shot, `shot at ${t}`);
}

const [a, b] = clearGapEndpointsWorld(0);
const gap = dist(a, b);
assert.ok(Math.abs(gap - 0.02) < 1e-6, `clear gap ${gap}`);

for (const receptor of RECEPTORS) {
  const separation = distToSegment(receptor.tip, a, b);
  assert.ok(separation > 0.015, `receptor ${receptor.index} too close to gap: ${separation}`);
}

assert.equal(occupancy(18), 0);
let previous = -1;
for (let t = 0; t <= 34; t += 0.25) {
  const occ = occupancy(t);
  assert.ok(occ + 1e-9 >= previous, `occupancy decreased at ${t}`);
  previous = occ;
  const center = resonanceCenter(occ);
  assert.ok(center >= BASE_CENTER - 1e-9);
  for (const x of [0, 0.2, 0.5, 0.8, 1]) {
    const y = transmission(x, center);
    assert.ok(y >= 0 && y <= 1);
  }
}
assert.ok(occupancy(30) > occupancy(19));
assert.ok(Math.abs(occupancy(30) - occupancy(26)) < 1e-6);

const depth = (center: number) => transmission(center, center);
assert.ok(Math.abs(depth(BASE_CENTER) - depth(resonanceCenter(0.7))) < 1e-9);

for (const dx of [-0.04, -0.02, 0.02, 0.05]) {
  const left = transmission(BASE_CENTER + dx, BASE_CENTER);
  const right = transmission(0.57 + dx, 0.57);
  assert.ok(Math.abs(left - right) < 1e-9, "linewidth and depth must be shift-invariant");
}

const cam33 = cameraAt(33);
const cam34 = cameraAt(34);
assert.deepEqual(cam33, cam34);
assert.ok(musicBedGain(30) > 0.2);
assert.equal(musicBedGain(34), 0);

for (const text of CAPTIONS) assert.equal(text.includes("—"), false);
assert.equal(caption(0).includes("cutaway"), true);
assert.equal(caption(12).toLowerCase().includes("slowed"), true);
assert.equal(caption(21).toLowerCase().includes("refractive"), true);
assert.equal(caption(30).toLowerCase().includes("ensemble"), true);

const sonified = SONIFIED_BIND_INDEXES.map((index) => BIND_EVENTS[index].bindT);
assert.equal(sonified.length, 3);
for (const event of SFX_EVENTS) {
  if (event.id !== "bind") continue;
  assert.ok(sonified.includes(event.t));
}
assert.ok(BIND_EVENTS.length > sonified.length);

const sample = MOLECULES[0];
assert.equal(JSON.stringify(moleculePosition(sample, 12)), JSON.stringify(moleculePosition(sample, 12)));
const binder = MOLECULES.find((item) => item.kind === "bind" && item.receptor === 0);
assert.ok(binder?.bindT);
const tip = RECEPTORS[0].tip;
const parked = moleculePosition(binder, binder.bindT + 1);
assert.ok(dist(parked, tip) < 0.002);

const signA = chargeSign(11);
const signB = chargeSign(11 + 2.4);
assert.equal(signA, signB);
const dir = gapFieldDir(12);
assert.ok(Math.abs(dir.x) > Math.abs(dir.z));

assert.equal(CHANNEL.sensorX, 110);
console.log("validate-model: ok");
console.log(
  JSON.stringify({
    gapUm: gap,
    finalOccupancy: Number(occupancy(30).toFixed(4)),
    finalCenter: Number(resonanceCenter(occupancy(30)).toFixed(4)),
    receptors: RECEPTORS.length,
    molecules: MOLECULES.length,
  }),
);
