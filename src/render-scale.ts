import type { Settings } from './config';

const presets = {
  high: { ceiling: 1, floor: 1 },
  medium: { ceiling: 1, floor: 0.63 },
  low: { ceiling: 0.57, floor: 0.46 },
};

export class AdaptiveScale {
  private limits: (typeof presets)[keyof typeof presets];
  private sampleMs = 0;
  private frames = 0;
  private lateFrames = 0;
  private steadyMs = 0;
  scale: number;

  constructor(quality: Settings['quality']) {
    this.limits = presets[quality];
    this.scale = this.limits.ceiling;
  }

  setQuality(quality: Settings['quality']) {
    this.limits = presets[quality];
    this.scale = this.limits.ceiling;
    this.pause();
  }

  pause() {
    this.steadyMs = this.sampleMs = this.frames = this.lateFrames = 0;
  }

  sample(ms: number) {
    // A single browser stall is not evidence of sustained rendering pressure.
    if (this.limits.floor === this.limits.ceiling || ms <= 0 || ms > 200) return;
    this.sampleMs += ms;
    this.frames++;
    if (ms > 24) this.lateFrames++;
    if (this.sampleMs < 2000) return;
    const missed = this.lateFrames / this.frames;
    const previous = this.scale;
    if (missed >= 0.12) {
      this.scale = Math.max(this.limits.floor, this.scale - 0.07);
      this.steadyMs = 0;
    } else if (missed <= 0.02) {
      this.steadyMs += this.sampleMs;
      if (this.steadyMs >= 12000) {
        this.scale = Math.min(this.limits.ceiling, this.scale + 0.035);
        this.steadyMs = 0;
      }
    } else {
      this.steadyMs = 0;
    }
    this.sampleMs = this.frames = this.lateFrames = 0;
    if (this.scale !== previous) return this.scale;
  }
}
