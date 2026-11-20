import type { Settings, Theme } from './config';
import type { Phase } from './lifecycle';
import type { Impact, Racer } from './physics';
import { Random } from './random';
import { clamp } from './track';
import type { V3 } from './track';
import { SURFACES } from './surfaces';
import type { TrackId } from './signatures';
import { musicMood, Soundtrack } from './soundtrack';

const RATE = 24000;
const TAU = Math.PI * 2;
// Midpoint of the pause after "Can you pick the winner?" in grid-pick.mp3.
const GRID_QUESTION_END = 1.291;
const THEMES = {
  workshop: { bpm: 94, key: 55, chords: [[0, 4, 7, 11], [-3, 0, 4, 7], [2, 5, 9, 12], [-5, -1, 2, 7]],
    tune: [7, 11, 14, 11, 9, 7, 4, 2, 7, 9, 12, 16, 14, 11, 7, 4], color: 0.45 },
  rainbow: { bpm: 108, key: 60, chords: [[0, 4, 7, 9], [5, 9, 12, 16], [-3, 0, 4, 7], [-5, -1, 2, 7]],
    tune: [12, 9, 7, 4, 5, 9, 12, 14, 16, 12, 9, 7, 11, 14, 9, 7], color: 0.61 },
  crystal: { bpm: 83, key: 57, chords: [[0, 3, 7, 10], [-4, 0, 3, 7], [3, 7, 10, 14], [-2, 2, 5, 9]],
    tune: [15, 10, 7, 3, 8, 12, 15, 19, 10, 14, 17, 19, 17, 14, 9, 5], color: 0.29 },
  night: { bpm: 79, key: 53, chords: [[0, 4, 7, 11], [2, 5, 9, 12], [-3, 0, 4, 7], [-5, -1, 2, 7]],
    tune: [11, 7, 4, 7, 9, 12, 16, 12, 14, 12, 7, 4, 2, 7, 11, 14], color: 0.19 },
};
const note = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

function musicBuffer(ctx: AudioContext, theme: Theme) {
  const { bpm, key, chords, tune, color } = THEMES[theme];
  const beat = 60 / bpm;
  const size = Math.round(32 * beat * RATE);
  const buf = ctx.createBuffer(2, size, RATE);
  const l = buf.getChannelData(0), r = buf.getChannelData(1);
  const rng = new Random(`zeerush-composition-${theme}`);
  const add = (at: number, duration: number, f: number, volume: number, pan: number, voice: 'pad' | 'pluck' | 'lead' | 'bass' | 'brush') => {
    const start = Math.round(at * RATE);
    const end = duration * RATE;
    for (let i = 0; i < end; i++) {
      const t = i / RATE, angle = TAU * f * t;
      let v = 0;
      switch (voice) {
        case 'pad': v = (Math.sin(angle) + 0.25 * Math.sin(angle * 2 + t * 1.3) + 0.11 * Math.sin(angle * 3)) * Math.min(1, t * 6, (duration - t) * 8); break;
        case 'pluck': v = (Math.sin(angle) + Math.sin(angle * 2.007) * 0.31 + 0.17 * Math.sin(angle * 3.012)) * Math.min(1, t * 218) * Math.exp(-t * 8); break;
        case 'lead': v = (Math.sin(angle + (0.47 + color) * Math.exp(-t * 7) * Math.sin(angle * 2)) + color * 0.23 * Math.sin(angle * 3.001))
          * Math.min(1, t * 125, (duration - t) * 18) * Math.exp(-t * 3.0); break;
        case 'bass': v = (Math.sin(angle) + Math.sin(angle * 2) * 0.18) * Math.min(1, t * 80, (duration - t) * 14) * Math.exp(-t * 2); break;
        case 'brush': v = ((rng.next() - 0.5) * 0.72 + Math.sin(TAU * (140 * t - t * t * 120))) * Math.min(1, t * 380) * Math.exp(-t * 45); break;
      }
      const index = (start + i) % size;
      l[index] += v * volume * (0.7 - pan * 0.27);
      r[index] += v * volume * (0.7 + pan * 0.27);
    }
  };
  for (let bar = 0; bar < 8; bar++) {
    const ch = chords[bar % 4];
    const offset = bar * 4 * beat;
    for (const [i, pitch] of ch.entries()) {
      add(offset + i * 0.044, beat * 3.96, note(key + pitch), 0.038, i / 2 - 0.75, 'pad');
    }
    for (let i = 0; i < 8; i++) {
      const t = offset + beat * (i * 0.5 + (i % 2) * 0.065);
      if (i % 2 === 0 || theme === 'rainbow') add(t, beat * 0.68, note(key + ch[(i + bar) % ch.length] + 12), 0.054, (i % 4 - 2) * 0.35, 'pluck');
      if (i === 0 || i === 4 || i === 7) add(t, beat * 0.58, note(key + ch[i === 7 ? 2 : 0] - 12), 0.115, 0, 'bass');
      if (i % 2 || i === 0 || i === 4) add(t, 0.12, i % 2 ? 190 : 75, i % 2 ? 0.022 : 0.076, i % 2 ? 0.38 : 0, 'brush');
      if (i === 0 || i === 3 || i === 6) {
        const p = tune[(bar * 3 + Math.floor(i / 3)) % tune.length];
        add(t, beat * 0.86, note(key + p + 12), 0.103, -0.22, 'lead');
        add(t + beat * 0.75, beat * 0.75, note(key + p + 12), 0.024, 0.53, 'lead');
      }
    }
  }
  return buf;
}

const timbre: Record<string, [number, number, number]> = {
  marble: [1450, 2410, 0.065], chime: [740, 1480, 0.53], landing: [205, 440, 0.136],
  stamp: [103, 247, .26], handdrum: [139, 291, .24],
};
const podiumCues: Record<TrackId, string> = {
  'paper-moon': 'stamp', 'cedar-creek': 'bamboo', bellflower: 'porcelain', clockmaker: 'keys', aurora: 'aurora',
  'cloud-quilt': 'cloth', 'truck-art': 'handdrum', 'fossil-canyon': 'slate', 'prism-aquarium': 'glass', 'midnight-record': 'jazz',
};
const finishNotes: Record<string, number[]> = {
  'keys-0': [67], 'keys-1': [71], 'keys-2': [74], porcelain: [81], aurora: [78, 85], glass: [72, 79, 86], jazz: [60, 67, 70, 74, 76],
};
type Roller = { gain: GainNode; filter: BiquadFilterNode; pan: StereoPannerNode; source: AudioBufferSourceNode };
type Voice = { gain: GainNode; pan: StereoPannerNode; source?: AudioBufferSourceNode; busy: number };

export class ShowAudio {
  private ctx?: AudioContext;
  private limiter?: DynamicsCompressorNode;
  private master?: GainNode;
  private music?: GainNode;
  private duck?: GainNode;
  private library?: Soundtrack;
  private effects?: GainNode;
  private readonly rollers: Roller[] = [];
  private readonly voices: Voice[] = [];
  private readonly score = new Map<Theme, AudioBuffer>();
  private readonly effectsBuffers = new Map<string, AudioBuffer>();
  private readonly musicTracks = new Map<AudioBufferSourceNode, GainNode>();
  private activeMusic?: AudioBufferSourceNode;
  private phase: Phase = 'PREPARE';
  private theme: Theme = 'workshop';
  private currentTheme?: Theme;
  private final = false;
  private chase = false;
  private latestImpact = -2;
  private impactCount = 0;
  private track?: TrackId;
  private nextFinishNote = 0;
  private gridRecording?: AudioBuffer;
  private loadingGridRecording = false;
  private gridSource?: AudioBufferSourceNode;
  private gridCall: 'full' | 'short' | null = null;
  private unavailable = false;

  constructor(private readonly settings: Settings, private readonly showId = '') {}

  get status() {
    if (this.settings.mute) return 'Muted';
    return this.ctx?.state === 'running' ? 'Enabled' : this.unavailable || this.ctx?.state === 'closed' ? 'Unavailable' : 'Awaiting browser gesture';
  }

  get awaitingGesture() { return !this.settings.mute && (this.ctx?.state === 'suspended' || Boolean(this.library?.needsGesture)); }

  credits() { return this.library?.credits() ?? ''; }

  start() {
    if (this.ctx || this.settings.mute || this.unavailable) return;
    try {
      this.open();
      this.syncState();
    } catch {
      this.unavailable = true;
    }
  }

  async enable() {
    this.start();
    if (!this.ctx) return false;
    try {
      this.library?.unlock();
      await this.ctx.resume();
      this.syncState();
    } catch {
      return false;
    }
    return this.ctx?.state === 'running';
  }

  private syncState() {
    this.mix();
    if (this.ctx?.state === 'running') this.playTheme();
  }

  private open() {
    const ctx = this.ctx = new AudioContext({ latencyHint: 'interactive' });
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.music = ctx.createGain();
    this.effects = ctx.createGain();
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -10;
    this.limiter.knee.value = 12;
    this.limiter.ratio.value = 8;
    this.limiter.attack.value = 0.005;
    this.limiter.release.value = 0.25;
    this.duck = ctx.createGain();
    this.music.connect(this.duck).connect(this.master);
    this.library = new Soundtrack(ctx, this.music, this.settings.generation === 'random' ? this.showId : this.settings.seed, () => {
      if (ctx.state === 'running') this.playTheme();
    });
    this.effects.connect(this.master);
    this.master.connect(this.limiter).connect(ctx.destination);
    const tread = ctx.createBuffer(1, RATE, RATE);
    const data = tread.getChannelData(0);
    for (const [tick, at] of [.08, .32, .59, .79].entries()) {
      const start = Math.round(at * RATE), pitch = [340, 410, 300, 375][tick];
      for (let i = 0; i < .022 * RATE; i++) {
        const t = i / RATE;
        data[start + i] = Math.min(1, t * 1800) * Math.exp(-250 * t) *
          (.62 * Math.sin(TAU * pitch * t) + .30 * Math.sin(TAU * pitch * 2.6 * t));
      }
    }
    for (let i = 0; i < 8; i++) {
      const source = ctx.createBufferSource();
      source.buffer = tread;
      source.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      const pan = ctx.createStereoPanner();
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = .55;
      source.connect(filter).connect(gain).connect(pan).connect(this.effects);
      source.start(0, i / 8);
      this.rollers.push({ gain, pan, filter, source });
    }
    for (let i = 0; i < 12; i++) {
      const gain = ctx.createGain(), pan = ctx.createStereoPanner();
      gain.connect(pan).connect(this.effects);
      this.voices.push({ gain, pan, busy: 0 });
    }
    ctx.onstatechange = () => this.syncState();
    void this.loadGridRecording();
  }

  setPhase(phase: Phase, theme: Theme, isFinal = false) {
    if (phase !== 'PICK_MARBLE') this.stopGridCall();
    this.phase = phase;
    this.theme = theme;
    this.final = isFinal;
    this.mix();
    if (this.ctx?.state === 'running') this.playTheme();
  }

  setCourse(track?: TrackId) {
    this.track = track;
    this.chase = false;
    this.nextFinishNote = 0;
    this.stopGridCall();
    this.gridCall = null;
    void this.loadGridRecording();
  }

  private get gridVoiceEnabled() {
    return this.settings.announcer && !this.settings.mute && this.settings.master > 0 && this.settings.effects > 0;
  }

  private async loadGridRecording() {
    const ctx = this.ctx;
    if (!ctx || !this.gridVoiceEnabled || this.gridRecording || this.loadingGridRecording) return;
    this.loadingGridRecording = true;
    try {
      const response = await fetch('./voice/grid-pick.mp3');
      if (response.ok) this.gridRecording = await ctx.decodeAudioData(await response.arrayBuffer());
    } catch {
      // The on-screen invitation runs on the race clock. A later grid can retry the audio.
    } finally {
      this.loadingGridRecording = false;
    }
  }

  announceGrid(secondsLeft: number) {
    const ctx = this.ctx, recording = this.gridRecording;
    if (this.gridCall || this.phase !== 'PICK_MARBLE' || !this.gridVoiceEnabled || !recording || ctx?.state !== 'running') return;
    const available = secondsLeft - .20;
    if (available < GRID_QUESTION_END) return;
    const full = recording.duration <= available;
    const source = ctx.createBufferSource();
    source.buffer = recording;
    source.connect(this.effects!);
    this.gridSource = source;
    this.gridCall = full ? 'full' : 'short';
    source.onended = () => {
      source.disconnect();
      this.gridSource = undefined;
      this.mix();
    };
    this.mix();
    source.start(0, 0, full ? recording.duration : GRID_QUESTION_END);
  }

  private stopGridCall() {
    if (!this.gridSource) return;
    this.gridSource.onended = null;
    this.gridSource.stop();
    this.gridSource.disconnect();
    this.gridSource = undefined;
  }

  raceProgress(fraction: number) {
    if (this.phase === 'RACING' && fraction >= .74 && !this.chase) {
      this.chase = true;
      this.mix();
    }
  }

  private mix() {
    if (!this.ctx || !this.master || !this.music || !this.effects) return;
    const now = this.ctx.currentTime;
    const racing = this.phase === 'RACING' || this.phase === 'FINISHING';
    const music = this.settings.audio === 'asmr' ? racing ? 0.045 : 0.47
      : this.phase === 'COUNTDOWN' ? 0.24 : racing ? this.track === 'clockmaker' ? .16 : this.final ? .40 : .32 : .57;
    this.master.gain.setTargetAtTime(this.settings.mute ? 0 : this.settings.master, now, 0.18);
    this.music.gain.setTargetAtTime(this.settings.music * music * (this.gridSource ? .38 : 1), now, this.gridSource ? .045 : .45);
    this.effects.gain.setTargetAtTime(this.settings.effects * (this.settings.audio === 'asmr' ? 1 : 0.78), now, 0.24);
    this.library?.configure(this.settings.soundtrack === 'library' && !this.settings.mute && this.settings.music > 0,
      musicMood(this.phase,this.final || this.chase));
  }

  private playTheme() {
    const ctx = this.ctx!;
    if (this.library?.audible || this.settings.mute || this.settings.music === 0) {
      if (this.activeMusic) {
        const gain = this.musicTracks.get(this.activeMusic)!;
        gain.gain.setTargetAtTime(.0001,ctx.currentTime,.28);
        this.activeMusic.stop(ctx.currentTime+1.35);
        this.activeMusic = undefined;
        this.currentTheme = undefined;
      }
      return;
    }
    if (this.currentTheme === this.theme) return;
    this.currentTheme = this.theme;
    const buf = this.score.get(this.theme) ?? musicBuffer(ctx, this.theme);
    this.score.set(this.theme, buf);
    if (this.activeMusic) {
      const gain = this.musicTracks.get(this.activeMusic)!;
      gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.45);
      this.activeMusic.stop(ctx.currentTime + 2.4);
    }
    const source = ctx.createBufferSource();
    source.buffer = buf;
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.gain.setTargetAtTime(1, ctx.currentTime, 0.5);
    source.connect(gain).connect(this.music!);
    source.onended = () => { source.disconnect(); gain.disconnect(); this.musicTracks.delete(source); };
    source.start();
    this.activeMusic = source;
    this.musicTracks.set(source, gain);
  }

  private effectBuffer(key: string) {
    const prior = this.effectsBuffers.get(key);
    if (prior) return prior;
    const ctx = this.ctx!;
    const notes = key === 'winner' ? [67, 71, 74, 79, 83, 86] : key === 'go' ? [71, 78, 83]
      : key === 'finish' ? [79, 83] : key === 'count' ? [71] : key === 'final' ? [67, 74] : finishNotes[key];
    const profile = timbre[key] ?? SURFACES[key as keyof typeof SURFACES]?.tones ?? SURFACES.wood.tones;
    const duration = notes ? notes.length * 0.145 + 0.38 : profile[2];
    const buf = ctx.createBuffer(1, Math.ceil(duration * RATE), RATE);
    const data = buf.getChannelData(0);
    const rng = new Random(`sound-${key}`);
    for (let i = 0; i < data.length; i++) {
      const sec = i / RATE;
      if (notes) {
        for (let k = 0; k < notes.length; k++) {
          const t = sec - k * (key === 'winner' ? .137 : key === 'jazz' ? .108 + (k % 2 ? .017 : 0) : .066);
          if (t < 0) continue;
          const a = TAU * t * note(notes[k]);
          data[i] += (Math.sin(a) + 0.26 * Math.sin(a * 2.02) + 0.12 * Math.sin(a * 3.44))
            * Math.min(1, t * 120) * Math.exp(-t * 7) * 0.34;
        }
      } else {
        const [lo, hi] = profile;
        data[i] = (0.48 * Math.sin(TAU * lo * sec) + 0.23 * Math.sin(TAU * hi * sec + 0.08 * Math.sin(sec * 78))
          + (rng.next() - 0.5) * 0.66 * Math.exp(-sec * 102))
          * Math.min(1, sec * 420, (duration - sec) * 120) * Math.exp(-sec * 4.6 / duration);
        if (key === 'handdrum') for (const at of [.059, .122, .148]) {
          const x = sec - at;
          if (x > 0) data[i] += .35 * Math.sin(TAU * (lo + at * 415) * x) * Math.min(1, x * 480) * Math.exp(-x * 68);
        }
      }
    }
    this.effectsBuffers.set(key, buf);
    return buf;
  }

  private play(key: string, volume: number, pan = 0, variation = 1, priority = false, delay = 0) {
    const ctx = this.ctx;
    if (ctx?.state !== 'running') return;
    if (this.duck && this.settings.effects > 0 && (priority || volume >= .46)) {
      const gain = this.duck.gain, now = ctx.currentTime + delay;
      gain.cancelScheduledValues(now);
      gain.setTargetAtTime(priority ? .48 : .79,now,.024);
      gain.setTargetAtTime(1,now+(priority ? .24 : .07),.16);
    }
    const voice = this.voices.find(v => v.busy <= ctx.currentTime)
      ?? (priority ? this.voices.reduce((a, b) => a.busy < b.busy ? a : b) : undefined);
    if (!voice) return;
    if (voice.source) { voice.source.stop(); voice.source.disconnect(); }
    const source = ctx.createBufferSource();
    source.buffer = this.effectBuffer(key);
    source.playbackRate.value = variation;
    voice.pan.pan.setValueAtTime(pan, ctx.currentTime);
    voice.gain.gain.setValueAtTime(volume, ctx.currentTime);
    source.connect(voice.gain);
    voice.source = source;
    voice.busy = ctx.currentTime + delay + source.buffer.duration / variation;
    source.onended = () => { source.disconnect(); if (voice.source === source) voice.source = undefined; };
    source.start(ctx.currentTime + delay);
  }

  cue(key: 'count' | 'go' | 'finish' | 'winner' | 'final', step = 1) {
    this.play(key, key === 'winner' ? 0.75 : key === 'count' ? 0.39 : 0.57, 0, key === 'count' ? 1 + step * 0.046 : 1, true);
  }

  arrival(index: number) {
    if (this.track === 'clockmaker' && index < 3 && this.ctx?.state === 'running') {
      const now = this.ctx.currentTime;
      const at = Math.max(now, this.nextFinishNote);
      this.play(`keys-${index}`, .73, (index - 1) * .27, 1, true, at - now);
      this.nextFinishNote = at + .104;
    } else if (index === 0) {
      if (this.track) this.play(podiumCues[this.track], .71, 0, 1, true);
      else this.cue('finish');
    }
  }

  update(racers: readonly Racer[], impacts: readonly Impact[], screen: (p: V3) => { x: number; visible: boolean }) {
    const ctx = this.ctx;
    if (ctx?.state !== 'running') return;
    const now = ctx.currentTime;
    const racing = this.phase === 'RACING' || this.phase === 'FINISHING';
    for (const [i, roller] of this.rollers.entries()) {
      const racer = racers[i];
      const audible = racing && racer?.ground && racer.finish === null && !racer.dnf;
      const speed = racer?.ground?.speed ?? 0;
      const pos = racer && screen(racer.p);
      let tread = racer?.belt ? 1.15 + Math.sin(now * 17.5) * 0.24 : 1;
      if (racer?.surface === 'bamboo' || racer?.surface === 'wood' || racer?.surface === 'slate') {
        tread += .26 * Math.max(0, Math.cos(racer.progress.distance * TAU / 2.8)) ** 9;
      }
      const volume = audible ? Math.min(0.15, speed * 0.026) * (pos && pos.visible ? 1 : 0.26) * tread : 0;
      roller.gain.gain.setTargetAtTime(volume, now, 0.10);
      if (!audible) continue;
      const cutoff = racer.belt ? 170 : SURFACES[racer.surface].roll;
      roller.source.playbackRate.setTargetAtTime(clamp(speed / 4, .35, 2.25), now, .10);
      roller.filter.frequency.setTargetAtTime(650 + cutoff, now, .12);
      roller.pan.pan.setTargetAtTime(pos ? clamp((pos.x - 0.5) * 1.4, -0.68, 0.68) : 0, now, 0.16);
    }
    if (now - this.latestImpact > 0.13) this.impactCount = 0;
    for (const impact of impacts) {
      if (this.impactCount >= 3) break;
      const s = screen(impact.p);
      const size = Math.min(0.54, 0.13 + (impact.force - 25) / 330);
      this.play(impact.surface, size * (s.visible ? 1 : 0.42), clamp((s.x - 0.5) * 1.28, -0.65, 0.65), 0.91 + Math.random() * 0.16);
      this.latestImpact = now;
      this.impactCount++;
    }
  }

  resources() { return { rollers: this.rollers.length, voices: this.voices.length, beds: this.score.size, tracks: this.musicTracks.size,
    samples: this.effectsBuffers.size, audioState: this.ctx?.state ?? 'blocked', gridCall: this.gridCall,
    gridSpeaking: Boolean(this.gridSource), ...this.library?.resources() }; }

  dispose() {
    if (this.ctx) this.ctx.onstatechange = null;
    this.stopGridCall();
    this.library?.dispose();
    for (const roller of this.rollers) roller.source.stop();
    for (const source of this.musicTracks.keys()) source.disconnect();
    for (const voice of this.voices) voice.source?.disconnect();
    void this.ctx?.close().catch(() => undefined);
  }
}
