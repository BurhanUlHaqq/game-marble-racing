import type { Settings } from './config';
import { CAP } from './physics';

export type Phase = 'PREPARE' | 'PICK_MARBLE' | 'COUNTDOWN' | 'RACING' | 'FINISHING' | 'CELEBRATION' | 'RESULTS' | 'NEXT_ROUND';

export class Lifecycle {
  phase: Phase = 'PREPARE';
  started = 0;
  deadline = 0;
  private settings: Settings;

  constructor(settings: Settings) { this.settings = settings; }

  configure(settings: Settings) { this.settings = settings; }

  enter(phase: Phase, now: number, first?: number) {
    const seconds: Record<Phase, number> = {
      PREPARE: 5, PICK_MARBLE: this.settings.pick, COUNTDOWN: this.settings.countdown,
      RACING: CAP, FINISHING: Math.min(this.settings.grace, Math.max(0, CAP - (first ?? 0))),
      CELEBRATION: this.settings.celebration, RESULTS: this.settings.results, NEXT_ROUND: 0.8,
    };
    this.phase = phase;
    this.started = now;
    this.deadline = now + seconds[phase] * 1000;
  }

  left(now: number) { return Math.max(0, (this.deadline - now) / 1000); }
  next(now: number, ready: boolean, race: { elapsed: number; first?: number; done: boolean }): Phase | null {
    const expired = now >= this.deadline;
    switch (this.phase) {
      case 'PREPARE': return ready || expired ? 'PICK_MARBLE' : null;
      case 'PICK_MARBLE': return expired ? 'COUNTDOWN' : null;
      case 'COUNTDOWN': return expired ? 'RACING' : null;
      case 'RACING': return race.done || expired || race.elapsed >= CAP ? 'CELEBRATION' : race.first !== undefined ? 'FINISHING' : null;
      case 'FINISHING': return race.done || expired || race.elapsed >= Math.min(CAP, (race.first ?? CAP) + this.settings.grace) ? 'CELEBRATION' : null;
      case 'CELEBRATION': return expired ? 'RESULTS' : null;
      case 'RESULTS': return expired ? 'NEXT_ROUND' : null;
      case 'NEXT_ROUND': return expired ? 'PREPARE' : null;
    }
  }
}
