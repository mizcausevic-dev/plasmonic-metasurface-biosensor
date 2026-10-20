import { BIND_EVENTS, DURATION, musicBedGain, SFX_EVENTS, SONIFIED_BIND_INDEXES } from "./model";

type Voice = { stop: (now: number) => void };

/**
 * Original procedural score. One-shots at or after the seek time are scheduled.
 * Skipped events are not retriggered. The drone follows the current envelope.
 */
export class Score {
  musicLevel = 0.72;
  sfxLevel = 0.68;
  muted = false;

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private music: GainNode | null = null;
  private sfx: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices: Voice[] = [];
  private originCtx = 0;
  private originT = 0;
  private running = false;

  contextState(): AudioContextState | "none" {
    return this.ctx?.state ?? "none";
  }

  presentationTime(): number | null {
    if (!this.ctx || !this.running) return null;
    return this.originT + (this.ctx.currentTime - this.originCtx);
  }

  async ensure(): Promise<void> {
    if (!this.ctx) {
      const ctx = new AudioContext();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.music = ctx.createGain();
      this.sfx = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 10;
      comp.ratio.value = 3;
      comp.attack.value = 0.01;
      comp.release.value = 0.2;
      this.music.connect(comp);
      this.sfx.connect(comp);
      comp.connect(this.master);
      this.master.connect(ctx.destination);
      this.noise = this.makeNoise(ctx);
      this.applyGains();
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  applyGains(): void {
    if (!this.master || !this.music || !this.sfx) return;
    this.master.gain.value = this.muted ? 0 : 1;
    this.music.gain.value = this.musicLevel;
    this.sfx.gain.value = this.sfxLevel;
  }

  stop(): void {
    if (!this.ctx) {
      this.voices = [];
      this.running = false;
      return;
    }
    const now = this.ctx.currentTime;
    for (const voice of this.voices) voice.stop(now);
    this.voices = [];
    this.running = false;
  }

  startAt(t: number): void {
    if (!this.ctx || !this.music || !this.sfx) return;
    this.stop();
    const now = this.ctx.currentTime + 0.04;
    this.originCtx = now;
    this.originT = t;
    this.running = true;
    this.scheduleBed(t, now);
    this.scheduleEvents(t, now);
  }

  private when(seekT: number, eventT: number, now: number): number {
    return now + Math.max(0, eventT - seekT);
  }

  private scheduleBed(seekT: number, now: number): void {
    if (!this.ctx || !this.music) return;
    const freqs = [110, 164.81, 220];
    const gains = [0.045, 0.02, 0.012];
    const end = this.when(seekT, DURATION, now);
    freqs.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = i === 2 ? "triangle" : "sine";
      osc.frequency.value = freq;
      const points = [0, 2, 8, 22, 32, 34].map((time) => ({
        time,
        value: musicBedGain(time) * gains[i],
      }));
      this.applyEnvelope(gain.gain, seekT, now, points);
      osc.connect(gain);
      gain.connect(this.music!);
      osc.start(now);
      osc.stop(end + 0.05);
      this.voices.push({ stop: (at) => this.fadeStop(gain, osc, at) });
    });
  }

  private scheduleEvents(seekT: number, now: number): void {
    for (const event of SFX_EVENTS) {
      if (event.t < seekT - 0.02) continue;
      const at = this.when(seekT, event.t, now);
      if (event.id === "cover" || event.id === "reassembly") this.noiseSweep(at, event.dur, event.id === "reassembly" ? 0.04 : 0.055);
      else if (event.id === "scale") this.glide(at, 740, 1180, 0.36, 0.03);
      else if (event.id === "light") this.tone(at, 196, 1.0, 0.035, "sine");
      else if (event.id === "field") {
        this.tone(at, 660, 1.15, 0.02, "sine");
        this.tone(at, 990, 1.15, 0.012, "triangle");
      } else if (event.id === "bind") this.tone(at, 523.25, 0.2, 0.04, "sine");
      else if (event.id === "resolve") {
        this.tone(at, 329.63, 2.1, 0.03, "sine");
        this.tone(at + 0.08, 415.3, 2.0, 0.022, "sine");
        this.tone(at + 0.16, 493.88, 1.9, 0.018, "triangle");
      }
    }
  }

  private applyEnvelope(
    param: AudioParam,
    seekT: number,
    now: number,
    points: { time: number; value: number }[],
  ): void {
    const valueAt = (time: number) => {
      if (time <= points[0].time) return points[0].value;
      const last = points[points.length - 1];
      if (time >= last.time) return last.value;
      for (let i = 0; i < points.length - 1; i += 1) {
        const a = points[i];
        const b = points[i + 1];
        if (time >= a.time && time <= b.time) {
          const u = (time - a.time) / (b.time - a.time || 1);
          return a.value + (b.value - a.value) * u;
        }
      }
      return 0;
    };
    param.cancelScheduledValues(now);
    param.setValueAtTime(Math.max(0.0001, valueAt(seekT)), now);
    for (const point of points) {
      if (point.time > seekT) {
        param.linearRampToValueAtTime(Math.max(0.0001, point.value), this.when(seekT, point.time, now));
      }
    }
  }

  private tone(when: number, freq: number, dur: number, level: number, type: OscillatorType): void {
    if (!this.ctx || !this.sfx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, when);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, level), when + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(gain);
    gain.connect(this.sfx);
    osc.start(when);
    osc.stop(when + dur + 0.05);
    this.voices.push({ stop: (at) => this.fadeStop(gain, osc, at) });
  }

  private glide(when: number, f0: number, f1: number, dur: number, level: number): void {
    if (!this.ctx || !this.sfx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 1800;
    osc.type = "sine";
    osc.frequency.setValueAtTime(f0, when);
    osc.frequency.exponentialRampToValueAtTime(f1, when + dur);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(level, when + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfx);
    osc.start(when);
    osc.stop(when + dur + 0.05);
    this.voices.push({ stop: (at) => this.fadeStop(gain, osc, at) });
  }

  private noiseSweep(when: number, dur: number, level: number): void {
    if (!this.ctx || !this.sfx || !this.noise) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 0.8;
    filter.frequency.setValueAtTime(280, when);
    filter.frequency.exponentialRampToValueAtTime(1400, when + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(level, when + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfx);
    src.start(when);
    src.stop(when + dur + 0.05);
    this.voices.push({
      stop: (at) => {
        try {
          gain.gain.cancelScheduledValues(at);
          gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), at);
          gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.03);
          src.stop(at + 0.04);
        } catch {
          /* already stopped */
        }
      },
    });
  }

  private fadeStop(gain: GainNode, osc: OscillatorNode, at: number): void {
    try {
      gain.gain.cancelScheduledValues(at);
      gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), at);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.03);
      osc.stop(at + 0.05);
    } catch {
      /* already stopped */
    }
  }

  private makeNoise(ctx: AudioContext): AudioBuffer {
    const length = ctx.sampleRate;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let seed = 2463534242;
    for (let i = 0; i < length; i += 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      data[i] = (seed / 4294967296) * 2 - 1;
    }
    return buffer;
  }
}

export function sonifiedBindTimes(): number[] {
  return SONIFIED_BIND_INDEXES.map((index) => BIND_EVENTS[index].bindT);
}
