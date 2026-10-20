# Plasmonic gold metasurface biosensor

Interactive 34-second 3D explainer of an illustrative plasmonic gold split-ring metasurface biosensor.

The device on screen is a teaching model. It is not a fabricated chip, not a measured spectrum, and not an electromagnetic or binding-kinetics simulation. The only specified dimension is the 20 nm clear gap. Every other length, pitch, and chart position is an illustrative design parameter and is labeled that way in the interface.

## GitHub

About: Interactive 34-second 3D explainer of an illustrative plasmonic gold split-ring metasurface biosensor.

Topics: `plasmonics`, `biosensor`, `threejs`, `scientific-visualization`, `metasurface`, `nanophotonics`, `webgl`, `vite`, `typescript`, `microfluidics`

This folder is not connected to a remote. `gh` is not authenticated in this environment, so nothing has been pushed and GitHub Pages has not been deployed. The workflow in `.github/workflows/pages.yml` is ready for a future push to `main`. It checks out the repo, runs `npm ci`, `npm run validate`, and `npm run build`, then uploads `dist` with SHA-pinned Pages actions. Vite `base` is `./`, so the same build works for a project site and for `vite preview`.

## Setup

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Other scripts:

| Script | What it does |
| --- | --- |
| `npm run validate` | Checks the deterministic model: 34.000 s, 1,020 frames, 20 nm gap, occupancy, spectrum, camera hold |
| `npm run build` | Typechecks and writes `dist/` |
| `npm run preview` | Serves the production build |
| `npm run check:browser` | Headless Chrome pass against a preview URL (defaults to `http://127.0.0.1:4173/`) |

Open the dev server, then press Play. Audio starts only after that gesture. Space plays or pauses, arrows seek, Home and End jump to the ends, 1–5 jump to shots, M mutes, R replays, F toggles fullscreen where the browser allows it.

Query flags: `?t=14` starts at a time, `?debug=1` exposes `window.__biosensor`, `?nowebgl=1` forces the static schematic, `?axes=1` adds an axis helper.

## What the 34 seconds show

One master clock, `t` from 0 to 34, drives the camera, cover, illumination, near field, molecules, charts, and audio. Seeking evaluates that time directly. Playback speed does not follow the render frame rate. At 34 seconds the last frame holds.

1. **0–5 s.** Tracking shot down the PDMS channel. The cover lifts and slides aside as a viewing cutaway. A ghost of the cover marks the functioning enclosure. Fluid stays in the channel.
2. **5–10 s.** Descent onto the periodic gold split-ring array and the transparent substrate. Polarized illumination and the pre-binding baseline spectrum appear.
3. **10–17 s.** One representative 20 nm gap. Slowed surface-charge oscillation, field-direction arrows, and a localized near-field overlay. The overlay is not light emitted by the metal or the molecules.
4. **17–25 s.** Flow plus a fixed wobble. Some targets pass. A subset binds at accessible receptors beside the gap. Occupancy redshifts the existing transmission minimum.
5. **25–34 s.** Pull back to the source, the sensor, the collection path, and the spectrometer. The last second is a still hero. The on-screen chart is the ensemble of the illuminated region. The floor graphic is labeled “Illustrative binding map.”

## Model choices

- Localized surface plasmon resonance is drawn as alternating surface-charge patches on the gap edges, coupled to the incident field. The visible cycle is labeled “Optical cycle slowed for illustration.” Conduction electrons are not drawn as orbiting particles.
- Near-field strength is a soft falloff centered on the gap. It does not flip with charge sign. Arrows carry direction. The legend reads “Relative near-field intensity · illustrative.” No enhancement factor is stated.
- Antibodies stay on a schematic linker. Targets bind only at the scheduled sites. Two receptors never bind. Complexes sit on the exposed surface near the gap. They are not pulled into the opening, and they do not have to fit inside 20 nm.
- Normalized near-field-weighted occupancy maps monotonically to a resonance-center shift. The transmission dip keeps the same depth and width. That is a schematic spectral model for this story, not a universal plasmonic rule. Axes are “Wavelength · illustrative scale” and “Normalized transmission.” There is no claimed wavelength, Q, nm/RIU, limit of detection, specificity, or clinical accuracy.
- Binding and transport are time-compressed. The interface says so. A 34-second playback is not a 34-second assay.
- Molecular paths and the optical-cycle phase are closed-form functions of `t` with fixed seeds. Replay and scrubbing reproduce the same state.
- Resonator pitch, ring span, wire diameter, channel size, and the chart’s wavelength axis are illustrative. The clear metal-to-metal opening is 20 nm.

## Stack

TypeScript, Vite, and Three.js. Geometry, the spectrum chart, and the score are procedural. Fonts are bundled from `@fontsource`. There is no API key and no runtime call to a third-party service.

Low-power and narrow viewports drop bloom, transmission materials, and the rect area light before they drop the clock. `prefers-reduced-motion` leaves a still view until Play. If WebGL is missing, a static schematic lists the five shots.

## Limits

The headless check confirms WebGL startup, the five shot times, the gap caption, the occupancy increase, play, pause, replay, mute state, the reduced-motion hold, and the no-WebGL schematic. It does not listen to the audio. The score is scheduled on the Web Audio clock and resynced if that clock drifts, but it was not auditioned in this environment.

The near field is an analytic glow, not a solved Maxwell field. The spectrum is a shifted Gaussian dip, not a computed cross-section. Antibody and antigen shapes are schematic and are not an enlarged molecular model. The relative scale note in shot 4 says so.
