import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow-condensed/latin-800.css';
import '@fontsource-variable/space-grotesk/wght.css';
import './style.css';
import { ShowAudio } from './audio';
import type { simulate } from './calibration';
import { DEFAULTS, raceSettings, settingsFrom } from './config';
import type { Settings } from './config';
import { Diagnostics } from './diagnostics';
import { Hud } from './hud';
import { rosterFor } from './identities';
import type { Identity } from './identities';
import { Lifecycle } from './lifecycle';
import type { Phase } from './lifecycle';
import { CAP, initPhysics, RacePhysics, STEP } from './physics';
import type { Place } from './physics';
import type { PreflightRequest } from './preflight.worker';
import { AdaptiveScale } from './render-scale';
import { commitRound, loadSession, saveSession } from './session';
import type { RoundRecord, Stat } from './session';
import { ShowScene } from './show-scene';
import { planFor } from './track';
import type { Plan } from './track';

type Forecast = ReturnType<typeof simulate>;
type Queued = { number: number; settings: Settings; roster: readonly Identity[]; plan: Plan };

let storage: Storage | undefined;
try { storage = window.localStorage; } catch { /* Private or disabled storage still allows a live show. */ }

class Show {
  private readonly lifecycle: Lifecycle;
  private readonly hud: Hud;
  private readonly view: ShowScene;
  private readonly audio: ShowAudio;
  private readonly metrics = new Diagnostics();
  private readonly session = loadSession(storage, location.search);
  private readonly abort = new AbortController();
  private readonly observer: ResizeObserver;
  private readonly renderScale: AdaptiveScale;
  private worker?: Worker;
  private token = 0;
  private queued?: Queued;
  private settings: Settings;
  private active: Settings;
  private race?: RacePhysics;
  private round = 0;
  private previousSignature = '';
  private warmupPromise?: Promise<void>;
  private lastFrame = 0;
  private bucket = 0;
  private tickHandle = 0;
  private currentPlaces: Place[] = [];
  private record?: RoundRecord;
  private cup?: Stat[];
  private countdownSpoken = 0;
  private gateTime = 0;
  private lastHud = -1000;
  private shownFinishers = 0;
  private lastTune = 0;
  private glLost = false;
  private disposed = false;
  private scoredArrivals = 0;
  private audibleContacts = { marble: 0, surface: 0 };
  private finished = 0;
  private readonly query = new URLSearchParams(location.search);

  constructor(root: HTMLElement) {
    this.settings = this.active = this.session.settings;
    this.lifecycle = new Lifecycle(this.settings);
    this.audio = new ShowAudio(this.settings, () => this.hud.setAudioPrompt(this.audio.awaitingGesture && this.settings.controls === 'show'),this.session.id);
    this.hud = new Hud(root, this.settings, value => this.configure(value), () => this.audio.enable(), () => this.audio.credits());
    this.view = new ShowScene(this.hud.canvasHost);
    this.renderScale = new AdaptiveScale(this.settings.quality);
    this.view.setQuality(this.settings.quality);
    this.view.setScale(this.renderScale.scale);
    const resize = () => this.view.resize(this.hud.canvasHost.clientWidth, this.hud.canvasHost.clientHeight);
    this.observer = new ResizeObserver(resize);
    this.observer.observe(this.hud.canvasHost);
    resize();
    const listen = { signal: this.abort.signal };
    window.addEventListener('keydown', this.key, listen);
    window.addEventListener('click', () => {
      if (this.audio.awaitingGesture) void this.audio.enable();
    }, listen);
    window.addEventListener('pagehide', e => { if (!e.persisted) this.dispose(); }, listen);
    this.view.renderer.domElement.addEventListener('webglcontextlost', evt => {
      evt.preventDefault();
      this.glLost = true;
      this.metrics.contextLosses++;
    }, listen);
    this.view.renderer.domElement.addEventListener('webglcontextrestored', () => {
      this.glLost = false;
      this.metrics.contextRestores++;
      this.view.restore();
      resize();
    }, listen);
    this.persist();
    this.audio.start();
    this.lifecycle.enter('PREPARE', performance.now());
    this.metrics.phase('PREPARE', performance.now(), this.session.next);
    this.warmupPromise = initPhysics();
    this.warmupPromise.then(() => {
      if (this.disposed) return;
      this.queue(this.session.next);
      this.tickHandle = requestAnimationFrame(this.frame);
    }).catch(error => {
      console.error('Physics could not initialize', error);
      this.hud.error('Physics could not initialize. Reload after checking the local build.');
    });
    if (this.query.get('diagnostics') === '1') {
      Object.defineProperty(window, '__zeerush', { configurable: true, value: () => this.snapshot() });
    }
  }

  private persist() { this.metrics.persistence = saveSession(storage, this.session); }

  private key = (e: KeyboardEvent) => {
    if (this.audio.awaitingGesture && !e.repeat && !e.altKey && !e.metaKey && !e.ctrlKey) void this.audio.enable();
    if (e.key === 'Escape') { this.hud.controls.close(); return; }
    if (e.repeat || e.altKey || e.metaKey || e.ctrlKey || (e.target instanceof HTMLElement && e.target.closest('input,select,textarea'))) return;
    if (e.key.toLowerCase() === 'o') this.hud.controls.toggle();
    if (e.key.toLowerCase() === 'a' && !this.audio.awaitingGesture) void this.audio.enable();
  };

  private configure(value: unknown) {
    const previous = this.settings;
    this.settings = settingsFrom({ ...previous, ...(value as Record<string, unknown>), session: 'resume' });
    const url = new URL(location.href);
    for (const key of Object.keys(DEFAULTS)) url.searchParams.delete(key);
    if (url.href !== location.href) history.replaceState(history.state, '', url);
    this.session.settings = this.settings;
    this.audio.configure(this.settings);
    if (previous.mute && this.audio.awaitingGesture) void this.audio.enable();
    this.hud.controls.set(this.settings);
    this.persist();
    if (this.settings.quality !== this.active.quality) {
      this.renderScale.setQuality(this.settings.quality);
      this.view.setQuality(this.settings.quality);
      this.view.setScale(this.renderScale.scale);
      this.active = { ...this.active, quality: this.settings.quality };
    }
    const nextRaceKeys = ['generation', 'seed', 'track', 'obstacles', 'theme', 'roster', 'marbles', 'minMarbles', 'maxMarbles', 'pace', 'raceTarget',
      'minPace', 'maxPace', 'pick', 'countdown', 'grace', 'celebration', 'results', 'hud', 'championship'] as const;
    if (nextRaceKeys.some(key => previous[key] !== this.settings[key])) {
      this.queue(this.race && this.round === this.session.next ? this.round + 1 : this.session.next);
    }
    return this.metrics.persistence;
  }

  private queue(number: number) {
    const settings = raceSettings(this.settings, this.session.id, number);
    const roster = rosterFor(settings, number);
    const token = ++this.token;
    this.queued = undefined;
    this.view.discardPending();
    if (!this.worker) {
      try {
        this.worker = new Worker(new URL('./preflight.worker.ts', import.meta.url), { type: 'module' });
      } catch {
        this.stage({ number, settings, roster, plan: this.fallback(number, settings) });
        return;
      }
    }
    this.worker.onmessage = (e: MessageEvent<{ token: number; plan?: Plan; forecast?: Forecast | null; error?: string }>) => {
      if (e.data.token !== this.token || e.data.token !== token || this.disposed) return;
      if (!e.data.plan || !e.data.forecast) this.metrics.fallbacks++;
      this.stage({ number, settings, roster, plan: e.data.plan ?? this.fallback(number, settings) });
    };
    this.worker.onerror = e => {
      if (token !== this.token || this.disposed) return;
      console.warn('Course preflight worker unavailable', e.message);
      this.worker?.terminate();
      this.worker = undefined;
      this.stage({ number, settings, roster, plan: this.fallback(number, settings) });
    };
    const request: PreflightRequest = { token, settings, number, roster, previous: this.previousSignature };
    this.worker.postMessage(request);
  }

  private stage(queued: Queued) {
    this.view.stage(queued.plan, queued.roster);
    this.queued = queued;
  }

  private fallback(number: number, settings: Settings) {
    this.metrics.fallbacks++;
    const plan = planFor(settings, number, 0, true);
    if (!plan.track && plan.signature === this.previousSignature) {
      const alternate = planFor(settings, number + 1, 0, true);
      alternate.theme = plan.theme;
      return alternate;
    }
    return plan;
  }

  private begin(now: number) {
    const { number, settings, roster, plan } = this.queued!;
    this.queued = undefined;
    const newRace = new RacePhysics(plan, roster, true);
    try { this.view.activate(plan); } catch (error) {
      newRace.dispose();
      throw error;
    }
    this.race?.dispose();
    this.race = newRace;
    this.round = number;
    this.session.pending = number;
    this.active = { ...settings, quality: this.settings.quality };
    this.previousSignature = plan.signature;
    this.currentPlaces = [];
    this.record = undefined;
    this.cup = undefined;
    this.countdownSpoken = 0;
    this.scoredArrivals = 0;
    this.audibleContacts = { marble: 0, surface: 0 };
    this.bucket = 0;
    this.lastHud = -1000;
    this.shownFinishers = 0;
    this.lifecycle.configure(this.active);
    this.hud.load(plan, roster, number, settings);
    this.lifecycle.enter('PICK_MARBLE', now);
    this.metrics.phase('PICK_MARBLE', now, number, plan.seed);
    this.audio.setCourse(plan.track);
    this.audio.setPhase('PICK_MARBLE', plan.theme);
    this.hud.phase('PICK_MARBLE', this.active, this.session, undefined);
    this.persist();
    this.queue(number + 1);
  }

  private transition(phase: Phase, now: number) {
    const race = this.race;
    if (phase === 'PICK_MARBLE' && this.lifecycle.phase === 'PREPARE') {
      this.begin(now);
      return;
    }
    if (phase === 'RACING' && race) {
      race.release();
      this.gateTime = now;
      this.audio.cue('go');
    }
    if (phase === 'CELEBRATION' && race) {
      this.currentPlaces = race.resolve(race.elapsed >= CAP - STEP || now >= this.gateTime + CAP * 1000 ? 'Time limit' : 'Finishing window expired');
      const victor = race.finishers[0];
      const streak = victor && this.session.recent[0]?.winner === victor.id
        ? `${victor.identity.name} wins back-to-back` : undefined;
      const comeback = this.hud.comeback && race.ranked()[0]?.id === victor?.id ? this.hud.comeback : undefined;
      const result = commitRound(this.session, this.round, race.plan.seed, this.currentPlaces, streak ?? comeback);
      this.record = result?.record;
      this.cup = result?.finalCup;
      if (this.record) {
        this.finished++;
        this.metrics.complete(this.record, race.elapsed, race.overtakes);
      }
      this.persist();
      if (victor && !race.plan.track) this.audio.cue('winner');
    }
    this.lifecycle.enter(phase, now, race?.finishers[0]?.finish ?? undefined);
    if (phase === 'FINISHING' && race) {
      const remaining = (race.finishers[0]?.finish ?? race.elapsed) + this.active.grace - race.elapsed;
      this.lifecycle.deadline = Math.min(this.lifecycle.deadline, now + Math.max(0, remaining) * 1000, this.gateTime + CAP * 1000);
    }
    this.metrics.phase(phase, now, this.round || this.session.next, race?.plan.seed);
    if (race) {
      this.audio.setPhase(phase, race.plan.theme);
      this.hud.phase(phase, this.active, this.session, this.record, this.cup);
    }
  }

  private frame = (now: number) => {
    if (this.disposed) return;
    const delta = this.lastFrame ? now - this.lastFrame : 0;
    this.lastFrame = now;
    this.metrics.frame(delta);
    const dt = Math.min(delta / 1000, 0.14);
    try {
      const phase = this.lifecycle.phase;
      const race = this.race;
      const racing = phase === 'RACING' || phase === 'FINISHING';
      if (race && racing) {
        this.bucket = Math.min(this.bucket + dt, 8 * STEP);
        while (this.bucket >= STEP - 1e-8) {
          const first = race.finishers[0]?.finish;
          if (first !== null && first !== undefined && race.elapsed + STEP / 2 >= Math.min(CAP, first + this.active.grace)) break;
          race.step();
          this.bucket -= STEP;
        }
        while (this.scoredArrivals < race.finishers.length) this.audio.arrival(this.scoredArrivals++);
      }
      if (phase === 'PREPARE' && now >= this.lifecycle.deadline && this.queued?.number !== this.session.next) {
        this.token++;
        const number = this.session.next;
        const settings = raceSettings(this.settings, this.session.id, number);
        this.stage({ number, settings, roster: rosterFor(settings, number), plan: this.fallback(number, settings) });
      }
      try {
        this.view.prepareFrame(!this.glLost && (phase === 'PREPARE' || phase === 'CELEBRATION' || phase === 'RESULTS' || phase === 'NEXT_ROUND'));
      } catch (error) {
        console.error('Could not prepare the queued scene', error);
        this.queued = undefined;
        this.view.discardPending();
      }
      const ready = this.queued?.number === this.session.next && this.view.ready(this.queued.plan, this.glLost);
      const next = this.lifecycle.next(now, ready, {
        elapsed: race?.elapsed ?? 0,
        first: race?.finishers[0]?.finish ?? undefined,
        done: race?.racers.every(r => r.dnf || r.finish !== null) ?? false,
      });
      if (next && (next !== 'PICK_MARBLE' || ready)) this.transition(next, now);
      if (this.race) this.present(this.race, now, dt);
      const sample = !this.glLost && (racing || phase === 'PICK_MARBLE' || phase === 'COUNTDOWN');
      if (sample && phase === this.lifecycle.phase) {
        const scale = this.renderScale.sample(delta);
        if (scale !== undefined) this.view.setScale(scale);
      } else if (!sample) {
        this.renderScale.pause();
      }
    } catch (error) {
      console.error('Race frame failed', error);
      if (this.race) {
        if (this.race.released && this.session.next === this.round) this.transition('CELEBRATION', now);
        else this.lifecycle.enter('NEXT_ROUND', now);
      } else {
        this.hud.error('The starting grid could not load. Retrying the local course.');
        this.lifecycle.enter('PREPARE', now);
      }
    }
    this.tickHandle = requestAnimationFrame(this.frame);
  };

  private present(race: RacePhysics, now: number, dt: number) {
    const phase = this.lifecycle.phase;
    const time = Math.max(0, (now - this.lifecycle.started) / 1000);
    const active = phase === 'RACING' || phase === 'FINISHING';
    const ranked = race.ranked();
    if (phase === 'PICK_MARBLE') this.audio.announceGrid(this.lifecycle.left(now));
    if (phase === 'COUNTDOWN') {
      const left = Math.max(1, Math.ceil(this.lifecycle.left(now)));
      if (this.countdownSpoken !== left) {
        this.countdownSpoken = left;
        this.audio.cue('count', this.active.countdown - left + 1);
      }
    }
    if (!this.glLost) this.view.draw(race, ranked, phase, time, dt, Math.min(1, Math.max(0, this.bucket / STEP)),
      this.currentPlaces, phase === 'COUNTDOWN' ? this.lifecycle.left(now) : Infinity);
    if (now - this.lastHud >= (active ? 83 : 32) || race.finishers.length !== this.shownFinishers) {
      this.lastHud = now;
      this.shownFinishers = race.finishers.length;
      const hadFinal = this.hud.reachedFinal;
      this.hud.update(this.lifecycle, now, race.elapsed, ranked, race.recoveries.length);
      if (ranked.length) this.audio.raceProgress(ranked[0].progress.distance/race.plan.length);
      if (!hadFinal && this.hud.reachedFinal) {
        this.audio.setPhase(phase, race.plan.theme, true);
        this.audio.cue('final');
      }
      const impacts = race.drainImpacts();
      for (const impact of impacts) {
        if (impact.surface === 'marble') this.audibleContacts.marble++;
        else this.audibleContacts.surface++;
      }
      this.audio.update(race.racers, impacts, p => this.view.screen(p));
    }
    this.hud.markers(ranked, id => this.view.racerScreen(id), active && !this.glLost);
    if (!this.hud.controls.element.hidden && now - this.lastTune > 750) {
      this.lastTune = now;
      const frame = this.metrics.clock();
      const gfx = this.view.resources();
      this.hud.controls.diagnostics(`Audio: ${this.audio.status}
Capture: ${this.hud.canvasHost.clientWidth} × ${this.hud.canvasHost.clientHeight}
Internal: ${gfx.renderWidth} × ${gfx.renderHeight} (${Math.round(gfx.scale * 100)}%)
Frame average: ${frame.fps.toFixed(1)} fps
Course: ${race.plan.seed}
Obstacles: ${race.plan.level}
Pacing target: ${this.active.raceTarget}s
Storage: ${this.metrics.persistence ? 'Available' : 'In-memory only'}`);
    }
  }

  private snapshot() {
    const race = this.race;
    const bridge = race?.plan.modules.find(m => m.bridge)?.bridge;
    return { ...this.metrics.snapshot(), phase: this.lifecycle.phase, phaseTime: (performance.now() - this.lifecycle.started) / 1000,
      round: this.round, completed: this.finished, theme: race?.plan.theme, track: race?.plan.track, seed: race?.plan.seed, elapsed: race?.elapsed,
      raceTarget: race ? this.active.raceTarget : undefined, generation: race ? this.active.generation : undefined,
      plan: race && { length: race.plan.length, obstacles: race.plan.level, modules: race.plan.modules.map(m => m.kind),
        bridge: bridge && { start: race.plan.nodes[bridge.first].s, end: race.plan.nodes[bridge.last].s, width: bridge.width },
        dropChutes: race.plan.modules.filter(m => m.dropDegrees).map(m => ({
          degrees: m.dropDegrees, start: race.plan.nodes[m.from].s, end: race.plan.nodes[m.to].s,
        })),
        narrowPasses: race.plan.modules.flatMap(m => (m.passes ?? []).map(p => ({
          section: m.name, start: race.plan.nodes[p.first].s, end: race.plan.nodes[p.last].s, width: p.width,
        }))),
        section: race.plan.modules[race.plan.nodes[race.ranked()[0]?.progress.segment ?? 0].module].kind },
      racers: race?.ranked().map(r => ({ id: r.id, name: r.identity.name, distance: r.progress.distance, branch: r.progress.branch,
        time: r.finish, dnf: r.dnf, recoveries: r.recoveries, speed: r.speed, surface: r.surface, grounded: r.grounded })),
      recoveries: race?.recoveries, jams: race?.jams, gripSeconds: race ? race.gripTicks * STEP : undefined,
      impacts: { ...this.audibleContacts }, finishDisplay: this.view.finishDisplay(),
      resources: { ...race?.resources(), ...this.view.resources(), ...this.audio.resources(), worker: Boolean(this.worker) } };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.tickHandle);
    this.abort.abort();
    this.observer.disconnect();
    this.worker?.terminate();
    this.race?.dispose();
    this.audio.dispose();
    this.view.dispose();
  }
}

const root = document.querySelector<HTMLElement>('#app')!;
try {
  new Show(root);
} catch (error) {
  console.error(error);
  root.innerHTML = '<section id="show" data-phase="prepare"><div class="loader"><b>ZEERUSH<span>.</span></b><small>WebGL 2 is required. Open the show in a browser with graphics acceleration.</small></div></section>';
}
