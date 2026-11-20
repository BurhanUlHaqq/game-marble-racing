import type { Phase } from './lifecycle';
import type { RoundRecord } from './session';

export class Diagnostics {
  private readonly frames = new Float32Array(3600);
  private cursor = 0;
  private samples = 0;
  private readonly phaseLog: { phase: Phase; at: number; number: number; seed?: string }[] = [];
  private readonly races: (RoundRecord & { elapsed: number; overtakes: number })[] = [];
  private cached = { frames: 0, meanMs: 0, p95Ms: 0, maxMs: 0, fps: 0 };
  private lastCalculation = 0;
  fallbacks = 0;
  contextLosses = 0;
  contextRestores = 0;
  persistence = true;

  frame(ms: number) {
    if (ms <= 0) return;
    this.frames[this.cursor++ % this.frames.length] = ms;
    this.samples = Math.min(this.samples + 1, this.frames.length);
  }

  clock() {
    const now = performance.now();
    if (now - this.lastCalculation < 1300 || !this.samples) return this.cached;
    this.lastCalculation = now;
    const data = this.frames.slice(0, this.samples).sort();
    const meanMs = data.reduce((sum, x) => sum + x, 0) / data.length;
    this.cached = { frames: data.length, meanMs, p95Ms: data[Math.floor((data.length - 1) * 0.95)],
      maxMs: data[data.length - 1], fps: 1000 / meanMs };
    return this.cached;
  }

  phase(phase: Phase, now: number, number: number, seed?: string) {
    this.phaseLog.push({ phase, at: now, number, seed });
    if (this.phaseLog.length > 72) this.phaseLog.shift();
  }

  complete(record: RoundRecord, elapsed: number, overtakes: number) {
    this.races.push({ ...record, elapsed, overtakes });
    if (this.races.length > 12) this.races.shift();
  }

  snapshot() {
    return { timing: this.clock(), phases: [...this.phaseLog], races: [...this.races],
      fallbacks: this.fallbacks, contextLosses: this.contextLosses, contextRestores: this.contextRestores,
      persistence: this.persistence };
  }
}
