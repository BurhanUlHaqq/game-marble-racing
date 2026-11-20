import type { Phase } from './lifecycle';
import { Random } from './random';

export type Mood = 'intermission' | 'race' | 'chase' | 'celebration';
type Recording = { id: string; title: string; mood: Mood; file: string; integratedLUFS: number; cueIn: number; cueOut: number };
type Deck = { audio: HTMLAudioElement; source: MediaElementAudioSourceNode; gain: GainNode; track?: Recording; requestedAt: number; cued: boolean };
const nextMood: Record<Mood,Mood> = { intermission:'race', race:'chase', chase:'celebration', celebration:'intermission' };
const fade = 1.35;

export function musicMood(phase: Phase, final: boolean): Mood {
  if (phase === 'RACING') return final ? 'chase' : 'race';
  if (phase === 'FINISHING') return 'chase';
  if (phase === 'CELEBRATION' || phase === 'RESULTS') return 'celebration';
  return 'intermission';
}

export class MusicRotation {
  private readonly counts = new Map<string,number>();
  private recent: string[] = [];
  constructor(private readonly random: Random) {}
  choose(rows: readonly Recording[], mood: Mood, excluded: ReadonlySet<string>) {
    const pool = rows.filter(r => r.mood === mood && !excluded.has(r.id));
    if (!pool.length) return;
    const avoid = this.recent.slice(-Math.min(8, pool.length - 1 || 1));
    const fresh = pool.filter(r => !avoid.includes(r.id));
    const choices = fresh.length ? fresh : pool;
    const least = Math.min(...choices.map(r => this.counts.get(r.id) ?? 0));
    return this.random.pick(choices.filter(r => (this.counts.get(r.id) ?? 0) === least));
  }
  played(track: Recording) {
    this.counts.set(track.id, (this.counts.get(track.id) ?? 0) + 1);
    this.recent = [...this.recent.slice(-11), track.id];
  }
}

export class Soundtrack {
  private readonly decks: Deck[] = [];
  private readonly rotation: MusicRotation;
  private readonly failed = new Set<string>();
  private readonly heard = new Map<string,string>();
  private readonly abort = new AbortController();
  private catalog: Recording[] = [];
  private fetching = false;
  private retryAt = 0;
  private retryFilesAt = 0;
  private failureCount = 0;
  private timer?: number;
  private enabled = false;
  private closed = false;
  private mood: Mood = 'intermission';
  private active?: Deck;
  private outgoing?: Deck;
  private retireAt = 0;
  private pending?: Deck;
  private version = 0;
  private lastTime = -1;
  private stalledSince = 0;
  private transitions = 0;
  needsGesture = false;
  private readonly base = new URL('./music/', document.baseURI);

  constructor(private readonly ctx: AudioContext, output: AudioNode, seed: string, private readonly changed: () => void) {
    this.rotation = new MusicRotation(new Random(seed + '/music'));
    for (let i = 0; i < 2; i++) {
      const audio = new Audio();
      audio.preload = 'auto';
      const source = ctx.createMediaElementSource(audio), gain = ctx.createGain();
      gain.gain.value = 0;
      source.connect(gain).connect(output);
      this.decks.push({audio, source, gain, requestedAt: 0, cued: false});
    }
  }

  get audible() { return Boolean(this.active && !this.active.audio.ended && !this.active.audio.paused); }
  unlock() { this.needsGesture = false; this.tick(); }

  configure(enabled: boolean, mood: Mood) {
    this.mood = mood;
    if (enabled !== this.enabled) {
      this.enabled = enabled;
      if (!enabled) {
        this.needsGesture = false;
        window.clearInterval(this.timer);
        this.timer = undefined;
        this.version++;
        this.active = this.pending = this.outgoing = undefined;
        for (const deck of this.decks) this.clear(deck);
      } else this.timer = window.setInterval(() => this.tick(), 180);
    }
    this.tick();
  }

  private clear(d: Deck) {
    d.audio.pause();
    d.gain.gain.cancelScheduledValues(this.ctx.currentTime);
    d.gain.gain.value = 0;
    if (d.track) {
      d.track = undefined;
      d.audio.removeAttribute('src');
      d.audio.load();
    }
  }

  private async loadCatalog() {
    if (this.fetching || this.ctx.currentTime < this.retryAt) return;
    this.fetching = true;
    try {
      const response = await fetch(new URL('catalog.json',this.base),{signal:this.abort.signal});
      if (!response.ok) throw new Error(String(response.status));
      const rows: Recording[] = await response.json();
      this.catalog = rows.filter(r => r.mood in nextMood && /^[A-Z0-9]{12}\.ogg$/.test(r.file));
      if (!this.catalog.length) throw new Error('Empty music catalog');
    } catch { this.retryAt = this.ctx.currentTime + 45; }
    finally { this.fetching = false; }
  }

  private reject(d: Deck) {
    if (d.track) {
      this.failed.add(d.track.id);
      this.failureCount++;
      if (!this.retryFilesAt) this.retryFilesAt = this.ctx.currentTime + 35;
    }
    if (this.active === d) {
      this.active = undefined;
      this.changed();
    }
    this.clear(d);
  }

  private tick() {
    if (!this.enabled || this.closed || this.needsGesture || this.ctx.state !== 'running') return;
    if (!this.catalog.length) { void this.loadCatalog(); return; }
    const now = this.ctx.currentTime;
    if (this.retryFilesAt && now >= this.retryFilesAt) {
      this.failed.clear();
      this.retryFilesAt = 0;
    }
    if (this.outgoing) {
      if (now < this.retireAt) return;
      this.clear(this.outgoing);
      this.outgoing = undefined;
    }
    if (this.active) {
      const audio = this.active.audio;
      if (audio.currentTime !== this.lastTime) {
        this.lastTime = audio.currentTime;
        this.stalledSince = now;
      }
      if (audio.ended || audio.paused) {
        const ended = this.active;
        this.active = undefined;
        this.clear(ended);
        this.changed();
      } else if (audio.error || now - this.stalledSince > 5) this.reject(this.active);
    }
    if (this.pending) return;
    const active = this.active;
    const remaining = active ? (active.track?.cueOut ?? active.audio.duration) - active.audio.currentTime : 0;
    const switching = !active || active.track?.mood !== this.mood || active.audio.ended || remaining <= fade;
    const desired = switching || remaining < 10 ? this.mood : nextMood[this.mood];
    const idle = this.decks.find(d => d !== active && d.track?.mood === desired) ?? this.decks.find(d => d !== active)!;
    if (idle.track && (idle.audio.error || idle.audio.readyState < HTMLMediaElement.HAVE_FUTURE_DATA && now - idle.requestedAt > 15)) this.reject(idle);
    if (idle.track?.mood !== desired) {
      const recording = this.rotation.choose(this.catalog,desired,this.failed);
      if (!recording) return;
      this.clear(idle);
      idle.track = recording;
      idle.requestedAt = now;
      idle.cued = false;
      idle.audio.src = new URL(recording.file,this.base).href;
      idle.audio.load();
    }
    if (!idle.cued && idle.audio.readyState >= 1) {
      idle.cued = true;
      if (idle.track.cueIn > 0) idle.audio.currentTime = idle.track.cueIn;
    }
    if (switching && !idle.audio.seeking && idle.audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) void this.start(idle);
  }

  private async start(d: Deck) {
    const record = d.track!, version = this.version;
    this.pending = d;
    try {
      await d.audio.play();
      if (version !== this.version || !this.enabled || d.track !== record) return;
      if (record.mood !== this.mood) { this.clear(d); return; }
      const now = this.ctx.currentTime;
      this.outgoing = this.active;
      this.active = d;
      this.stalledSince = now;
      this.lastTime = -1;
      const trim = Math.min(1.18, Math.pow(10,(-19 - record.integratedLUFS)/20));
      d.gain.gain.setValueAtTime(0,now);
      d.gain.gain.linearRampToValueAtTime(trim,now + fade);
      if (this.outgoing) {
        const old = this.outgoing.gain.gain;
        if (typeof old.cancelAndHoldAtTime === 'function') old.cancelAndHoldAtTime(now);
        else { const value=old.value; old.cancelScheduledValues(now); old.setValueAtTime(value,now); }
        old.linearRampToValueAtTime(0,now + fade);
        this.retireAt = now + fade;
      }
      this.heard.set(record.id,record.title);
      this.rotation.played(record);
      this.transitions++;
      this.changed();
    } catch (error) {
      if (version === this.version && d.track === record) {
        if (error instanceof DOMException && error.name === 'NotAllowedError') {
          this.needsGesture = true;
          this.changed();
        } else this.reject(d);
      }
    } finally {
      if (this.pending === d && version === this.version) this.pending = undefined;
    }
  }

  credits() {
    if (!this.heard.size) return '';
    return 'Music by Kevin MacLeod (https://incompetech.com)\nLicensed under Creative Commons Attribution 4.0 (https://creativecommons.org/licenses/by/4.0/).\nRecordings normalized and encoded for the broadcast.\n\n'+[...this.heard.values()].join('\n')+'\n';
  }

  resources() {
    return { musicSource:this.audible ? 'library' : 'synth', musicTitle:this.active?.track?.title ?? null,
      musicMood:this.active?.track?.mood ?? null, musicTransitions:this.transitions, musicFailures:this.failureCount,
      mediaPlaying:this.decks.filter(d=>!d.audio.paused && !d.audio.ended).length,
      mediaLoaded:this.decks.filter(d=>Boolean(d.track)).length };
  }

  dispose() {
    this.configure(false,this.mood);
    this.closed = true;
    this.abort.abort();
    for (const d of this.decks) { d.source.disconnect(); d.gain.disconnect(); }
  }
}
