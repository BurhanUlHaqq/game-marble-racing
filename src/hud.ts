import type { Settings } from './config';
import { IDENTITIES } from './identities';
import type { Identity } from './identities';
import type { Lifecycle, Phase } from './lifecycle';
import { LiveOrder } from './live-order';
import type { Racer } from './physics';
import { standings } from './session';
import type { RoundRecord, Session, Stat } from './session';
import { PALETTES } from './themes';
import { SIGNATURES } from './signatures';
import { nodeAt } from './track';
import type { Plan, V3 } from './track';

const icon = '<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M5 8h29l-8 10h8L14 35l5-13H6l8-8H5z" fill="currentColor"/></svg>';
const star = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 2.4 7.6H22l-6.2 4.5 2.4 7.4-6.2-4.6-6.2 4.6 2.4-7.4L2 9.6h7.6z" fill="currentColor"/></svg>';
const flags = '<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M5 24V4m0 0c7-4 10 4 17 0v13c-7 4-10-4-17 0" stroke="currentColor" stroke-width="2" stroke-linejoin="round" fill="none"/><path d="M6 6h5v4H6zm5 4h5v4h-5zm5-3h5v4h-5zm0 8h5v3h-5z" fill="currentColor"/></svg>';
const routeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19h11a4 4 0 0 0 0-8H8a3 3 0 0 1 0-6h10M16 2l3 3-3 3" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="5" cy="19" r="2" fill="currentColor"/></svg>';
const idOf = (id: number) => IDENTITIES[id - 1];
const mapWidth = 440, mapHeight = 130, mapDetail = 2;
const roundNumber = (n: number) => String(n).padStart(2, '0');
const timeText = (t: number) => {
  const ticks = Math.round(t * 100);
  return `${Math.floor(ticks / 6000)}:${((ticks % 6000) / 100).toFixed(2).padStart(5, '0')}`;
};
const ordinal = (i: number) => ['1st', '2nd', '3rd'][i] ?? `${i + 1}th`;
const chip = (r: Identity, extra = '') => `<span class="orb ${extra}" style="--racer:${r.color}"><span>${r.id}</span><i>${r.mark}</i></span>`;
const stamp = (r: Identity) => `<span class="dot" style="--racer:${r.color}">${r.id}</span>`;
const phaseLabel: Partial<Record<Phase, string>> = {
  PREPARE: 'Preparing', PICK_MARBLE: 'On the grid', COUNTDOWN: 'Start sequence', RACING: 'Race in progress',
  FINISHING: 'Finishing', CELEBRATION: 'Podium', RESULTS: 'Official results', NEXT_ROUND: 'Next race',
};

function required<T extends Element>(host: ParentNode, selector: string) {
  const target = host.querySelector<T>(selector);
  if (!target) throw new Error(`Missing display element ${selector}`);
  return target;
}

export class Hud {
  readonly canvasHost: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly header: HTMLElement;
  private readonly main: HTMLElement;
  private readonly side: HTMLElement;
  private readonly ticker: HTMLElement;
  private readonly routePercent: HTMLElement;
  private readonly routeSection: HTMLElement;
  private readonly footer: HTMLElement;
  private readonly tags: HTMLElement;
  private readonly map: HTMLCanvasElement;
  private readonly mapBase = document.createElement('canvas');
  private readonly markerEls = new Map<number, HTMLElement>();
  private readonly rankEls = new Map<number, HTMLElement>();
  private readonly liveOrder = new LiveOrder();
  private routeXY: (p: V3) => [number, number] = () => [0, 0];
  private plan?: Plan;
  private roster: readonly Identity[] = [];
  private status = '';
  private openPhase?: Phase;
  private lastRanks = '';
  private lastStage = '';
  private lastClock = '';
  private calloutUntil = 0;
  private lastCallout = -10;
  private leading = 0;
  private prevRanks = new Map<number, number>();
  private behind = new Set<number>();
  private recoveredCount = 0;
  private final = false;
  private shownCallout?: HTMLElement;

  constructor(readonly root: HTMLElement, settings: Settings) {
    root.innerHTML = `
      <section id="show" data-phase="prepare" data-hud="${settings.hud}" aria-label="Live race">
        <div class="world"></div><div class="vignette"></div>
        <header class="bar">
          <div class="brand"><span class="brand-icon">${icon}</span><div><b>ZEERUSH<span>.</span></b><small>MARBLE RACE SHOW</small></div></div>
          <div class="bar-track"><span class="status-indicator"></span><span id="phaseLabel">Preparing</span><span class="slash"></span><span id="themeLabel">Wooden Workshop</span></div>
          <div class="header-right"><span class="race-id">RACE <b>01</b></span><span class="on-air"><i></i> AUTO SHOW</span></div>
        </header>
        <div class="stage"><section class="main-panel"></section><div class="marble-tags"></div><aside class="race-panel"></aside><div class="callout" hidden></div></div>
        <section class="route-panel"><div class="route-info"></div><canvas class="course-map" width="${mapWidth * mapDetail}" height="${mapHeight * mapDetail}" aria-label="Course progress map"></canvas></section>
        <footer class="footer"></footer>
        <div class="loader"><b>ZEERUSH<span>.</span></b><span class="loader-line"></span><small>Preparing the starting grid</small></div>
      </section>`;
    this.stage = required(root, '#show');
    this.canvasHost = required(root, '.world');
    this.header = required(root, '.bar');
    this.main = required(root, '.main-panel');
    this.side = required(root, '.race-panel');
    this.ticker = required(root, '.route-info');
    this.ticker.innerHTML = `<div>${routeIcon} COURSE PROGRESS <b>0%</b></div><p>Starting grid</p><span></span>`;
    this.routePercent = required(this.ticker, 'b');
    this.routeSection = required(this.ticker, 'p');
    this.footer = required(root, '.footer');
    this.tags = required(root, '.marble-tags');
    this.map = required(root, '.course-map');
  }

  load(plan: Plan, roster: readonly Identity[], number: number, settings: Settings) {
    this.plan = plan;
    this.roster = [...roster].sort((a, b) => a.id - b.id);
    required(this.header, '#themeLabel').textContent = plan.track ? SIGNATURES[plan.track].name : PALETTES[plan.theme].name;
    required(this.header, '.race-id b').textContent = roundNumber(number);
    this.stage.dataset.hud = settings.hud;
    this.stage.dataset.theme = plan.theme;
    this.leading = 0;
    this.openPhase = undefined;
    this.lastStage = '';
    this.lastRanks = '';
    this.lastClock = '';
    this.lastCallout = -10;
    this.calloutUntil = 0;
    this.recoveredCount = 0;
    this.final = false;
    this.prevRanks.clear();
    this.liveOrder.reset();
    this.routePercent.textContent = '0%';
    this.routeSection.textContent = 'Starting grid';
    this.ticker.style.setProperty('--progress', '0%');
    this.behind.clear();
    this.rankEls.clear();
    this.markerEls.clear();
    this.tags.replaceChildren();
    this.side.replaceChildren();
    for (const r of roster) {
      const mark = document.createElement('span');
      mark.className = 'screen-tag';
      mark.textContent = String(r.id);
      mark.style.setProperty('--racer', r.color);
      this.markerEls.set(r.id, mark);
      this.tags.append(mark);
    }
    this.shownCallout = required(this.root, '.callout');
    this.shownCallout.hidden = true;
    this.prepareMap();
  }

  get reachedFinal() { return this.final; }
  get comeback() { return this.leading && this.behind.has(this.leading) ? `${idOf(this.leading).name} made a comeback` : undefined; }

  private prepareMap() {
    const nodes = this.plan!.nodes;
    this.mapBase.width = this.map.width;
    this.mapBase.height = this.map.height;
    const ctx = this.mapBase.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(mapDetail, 0, 0, mapDetail, 0, 0);
    const center = nodes.reduce((sum, n) => ({ x: sum.x + n.x / nodes.length, z: sum.z + n.z / nodes.length }), { x: 0, z: 0 });
    const cov = nodes.reduce((sum, n) => {
      const x = n.x - center.x, z = n.z - center.z;
      return { xx: sum.xx + x * x, zz: sum.zz + z * z, xz: sum.xz + x * z };
    }, { xx: 0, zz: 0, xz: 0 });
    const yaw = Math.atan2(2 * cov.xz, cov.xx - cov.zz) / 2;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const rotated = (p: V3): [number, number] => [p.x * c + p.z * s, p.z * c - p.x * s];
    const coords = nodes.map(rotated);
    const xs = coords.map(n => n[0]), zs = coords.map(n => n[1]);
    const left = Math.min(...xs), top = Math.min(...zs), width = Math.max(...xs) - left, height = Math.max(...zs) - top;
    const scale = Math.min((mapWidth - 45) / Math.max(1, width), (mapHeight - 34) / Math.max(1, height));
    this.routeXY = (p: V3) => {
      const [x, y] = rotated(p);
      return [(mapWidth - width * scale) / 2 + (x - left) * scale,
        (mapHeight - height * scale) / 2 + (y - top) * scale];
    };
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (const [i, n] of nodes.entries()) {
      const [x, y] = this.routeXY(n);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineWidth = 11;
    ctx.strokeStyle = '#101922';
    ctx.stroke();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#8b9aa9';
    ctx.stroke();
    ctx.strokeStyle = '#ff995e';
    ctx.beginPath();
    for (const n of nodes.slice(this.plan!.finalSection)) ctx.lineTo(...this.routeXY(n));
    ctx.stroke();
    const [fx, fy] = this.routeXY(nodes[this.plan!.finish]);
    ctx.fillStyle = '#fff4dc';
    ctx.fillRect(fx - 4, fy - 4, 8, 8);
    ctx.fillStyle = '#101922';
    ctx.fillRect(fx, fy - 4, 4, 4);
    ctx.fillRect(fx - 4, fy, 4, 4);
  }

  private drawMap(ranked: readonly Racer[]) {
    const ctx = this.map.getContext('2d');
    if (!ctx || !this.plan) return;
    ctx.setTransform(mapDetail, 0, 0, mapDetail, 0, 0);
    ctx.clearRect(0, 0, mapWidth, mapHeight);
    ctx.drawImage(this.mapBase, 0, 0, mapWidth, mapHeight);
    for (const [i, r] of [...ranked].reverse().entries()) {
      const [x, y] = this.routeXY(nodeAt(this.plan, r.progress.distance));
      const offset = 4 + (i % 4) * 3.4;
      const xx = x + Math.cos(i * 2.4) * offset, yy = y + Math.sin(i * 2.4) * offset;
      ctx.globalAlpha = r.dnf ? 0.45 : 1;
      ctx.beginPath();
      ctx.arc(xx, yy, 8.2, 0, Math.PI * 2);
      ctx.fillStyle = r.identity.color;
      ctx.fill();
      ctx.strokeStyle = '#17212a';
      ctx.lineWidth = 1.8;
      ctx.stroke();
      ctx.fillStyle = '#18222b';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.font = 'bold 11px Arial';
      ctx.fillText(String(r.id), xx, yy + 0.9);
      ctx.globalAlpha = 1;
    }
  }

  phase(phase: Phase, settings: Settings, session: Session, record: RoundRecord | undefined, finalCup?: Stat[]) {
    if (this.openPhase === phase) return;
    if (phase === 'PREPARE' && record && this.openPhase === 'NEXT_ROUND') return;
    const keepStandings = this.openPhase === 'RACING' && phase === 'FINISHING';
    this.openPhase = phase;
    this.status = phaseLabel[phase] ?? '';
    this.stage.dataset.phase = phase.toLowerCase();
    this.side.hidden = phase === 'RACING';
    required(this.header, '#phaseLabel').textContent = this.status;
    const best = standings(session.stats).find(r => r.appearances > 0);
    const series = settings.championship ? `<span><i></i> CUP ${String(record?.championship ?? session.championship).padStart(2, '0')} <b> / </b> FIVE RACES</span>` : '';
    this.footer.innerHTML = `<div class="footer-left">${flags}<span>${phase === 'PICK_MARBLE' || phase === 'COUNTDOWN' ? 'STARTING GRID' : 'ZEERUSH RACEWAY'}</span>${series}</div>
      <div class="footer-right">${best ? `<span class="footer-record">SESSION LEADER ${stamp(idOf(best.id))} <b>${idOf(best.id).name}</b> <em>${best.points} PTS</em></span>` : ''}</div>`;
    if (phase === 'PICK_MARBLE' || phase === 'COUNTDOWN') {
      const positions = this.roster.map(r => `<li style="--racer:${r.color}">${chip(r)}<div><b>${r.name}</b><small>${r.pattern}</small></div></li>`).join('');
      this.footer.insertAdjacentHTML('afterbegin', `<div class="grid-header"><b><span></span> THE LINEUP</b><span>${this.roster.length} MARBLES</span></div><ul class="lineup" style="--entrants:${this.roster.length}">${positions}</ul>`);
    }
    if (keepStandings) {
      required<HTMLElement>(this.main, '.go-tag').hidden = true;
    } else if (phase === 'PICK_MARBLE') {
      this.main.innerHTML = `<h1>CAN YOU PICK<br><em>THE WINNER?</em></h1>
        <p class="grid-invitation">Call out your marble’s number before the gate drops, then cheer it all the way home!</p>
        <div class="launch"><span class="timer-number">${settings.pick}</span><div><b>UNTIL COUNTDOWN</b><div class="timer-track"><i></i></div></div></div>`;
    } else if (phase === 'COUNTDOWN') {
      this.main.innerHTML = `<div class="eyebrow"><i></i> STARTING SEQUENCE</div><h1>GET<br><em>READY.</em></h1>
        <div class="countdown-big" aria-live="polite">5</div>`;
    } else if (phase === 'RACING' || phase === 'FINISHING') {
      this.lastRanks = '';
      this.lastClock = '';
      this.main.innerHTML = `<div class="go-tag">GO!</div>`;
      this.side.innerHTML = `<div class="side-head"><span>${flags} LIVE POSITIONS</span><time>0:00</time></div><ol class="standings"></ol>`;
      this.rankEls.clear();
      const ol = required(this.side, '.standings');
      this.roster.forEach(r => {
        const li = document.createElement('li');
        li.style.setProperty('--racer', r.color);
        li.innerHTML = `<strong></strong>${stamp(r)}<b>${r.name}</b><small></small>`;
        ol.append(li);
        this.rankEls.set(r.id, li);
      });
    } else if (phase === 'CELEBRATION') {
      const r = record?.winner ? idOf(record.winner) : undefined;
      const cup = record?.titles?.map(i => idOf(i).name).join(' & ');
      this.main.innerHTML = r ? `<div class="eyebrow"><i></i> RACE WINNER</div><h1 class="winner" style="--racer:${r.color}">${r.name.split(' ')[0]}<br><em>${r.name.split(' ').slice(1).join(' ') || 'WINS!'}</em></h1>
        <p>${stamp(r)} <strong>${timeText(record!.places[0].time!)} </strong> <span>·</span> +10 points</p>
        ${cup ? `<div class="medal">${star} CHAMPION · ${cup}</div>` : record?.badge ? `<div class="medal">${star} ${record.badge}</div>` : ''}`
        : '<div class="eyebrow"><i></i> RECOVERY</div><h1>ROUND<br><em>VOID.</em></h1><p>Preparing a replacement course.</p>';
      this.side.innerHTML = record ? `<div class="side-head"><span>${star} PODIUM</span></div><ol class="podium-list">
        ${[0, 1, 2].map(i => {
          const place = record.places[i];
          const r = place?.time !== null && place ? idOf(place.id) : undefined;
          return `<li><b>${ordinal(i)}</b>${r ? stamp(r) + r.name : '<span>Vacant</span>'}</li>`;
        }).join('')}</ol>` : '';
    } else if (phase === 'RESULTS') {
      this.main.innerHTML = `<div class="results-head"><div class="eyebrow"><i></i> RACE ${roundNumber(record?.number ?? 0)}</div><h1>THE <em>RESULTS</em></h1></div>
        <ol class="results-list">${record?.places.map((p, i) => {
          const r = idOf(p.id);
          return `<li><b>${p.time === null ? '—' : ordinal(i)}</b>${stamp(r)}<strong>${r.name}</strong><time>${p.time === null ? 'DNF' : timeText(p.time)}</time><em>+${record.awards[r.id]}</em></li>`;
        }).join('') ?? ''}</ol>`;
      const stats = finalCup ?? (settings.championship && session.cupRound ? standings(session.cup) : standings(session.stats));
      this.side.innerHTML = `<div class="side-head"><span>${star} ${finalCup ? 'FINAL CUP STANDINGS' : settings.championship ? 'CUP STANDINGS' : 'SESSION STANDINGS'}</span></div>
        <ol class="stat-list"><li class="stat-title"><span>RACER</span><span>RACES</span><span>WIN %</span><span>PTS</span></li>
        ${stats.map(s => `<li>${stamp(idOf(s.id))}<b>${idOf(s.id).name}</b><span>${s.appearances}</span><span>${s.appearances ? Math.round(s.wins / s.appearances * 100) : 0}%</span><em>${s.points}</em></li>`).join('')}</ol>
        <div class="recent">RECENT WINNERS <span>${session.recent.filter(r => r.winner).slice(0, 5).map(r => stamp(idOf(r.winner!))).join('')}</span></div>`;
    } else {
      this.main.innerHTML = '<div class="eyebrow"><i></i> RESETTING THE GRID</div><h1>NEXT <em>RACE</em></h1>';
      this.side.replaceChildren();
    }
    if (phase !== 'FINISHING' && phase !== 'RACING') this.shownCallout!.hidden = true;
  }

  update(clock: Lifecycle, now: number, elapsed: number, ranked: readonly Racer[], recoveryCount: number) {
    if (!this.plan) return;
    const phase = clock.phase;
    const left = Math.ceil(clock.left(now));
    if (phase === 'PICK_MARBLE') {
      const timer = required(this.main, '.timer-number');
      const val = String(left).padStart(2, '0');
      if (timer.textContent !== val) timer.textContent = val;
      (required<HTMLElement>(this.main, '.timer-track i')).style.width = `${clock.left(now) / ((clock.deadline - clock.started) / 1000) * 100}%`;
    }
    if (phase === 'COUNTDOWN') {
      const grid = required<HTMLElement>(this.main, '.countdown-big');
      const text = String(Math.max(1, left));
      if (grid.textContent !== text) { grid.textContent = text; grid.animate([{ scale: '1.19', opacity: 0.25 }, { scale: '1', opacity: 1 }], 270); }
    }
    if (phase !== 'RACING' && phase !== 'FINISHING') return;
    const showingLaunch = phase === 'RACING' && elapsed <= 1.14;
    this.side.hidden = showingLaunch;
    const status = timeText(elapsed).split('.')[0];
    if (status !== this.lastClock) {
      this.lastClock = status;
      required(this.side, 'time').textContent = status;
    }
    required<HTMLElement>(this.main, '.go-tag').hidden = !showingLaunch;
    const displayed = this.liveOrder.update(ranked, elapsed);
    const key = displayed.map(r => `${r.id}/${r.finish !== null}/${r.dnf}`).join(',');
    const lead = ranked[0];
    const displayedLead = displayed[0];
    const fastEnough = elapsed > 4;
    if (key !== this.lastRanks) {
      this.lastRanks = key;
      const climb = displayed.find((r, i) => (this.prevRanks.get(r.id) ?? i) - i >= 2 && !r.dnf && r.finish === null);
      for (const [i, r] of displayed.entries()) {
        const el = this.rankEls.get(r.id);
        if (!el) continue;
        el.style.setProperty('--position', String(i));
        el.classList.toggle('leader', i === 0);
        el.classList.toggle('resolved', r.finish !== null || r.dnf);
        required(el, 'strong').textContent = String(i + 1).padStart(2, '0');
        required(el, 'small').textContent = r.dnf ? 'DNF' : r.finish !== null ? timeText(r.finish) : i === 0 ? 'LEADER' : '';
        if (elapsed > 12 && i >= Math.ceil(ranked.length * 0.65) && r.finish === null) this.behind.add(r.id);
      }
      if (displayedLead && this.leading && displayedLead.id !== this.leading && fastEnough && displayedLead.finish === null
        && !displayedLead.dnf) {
        this.callout(`${displayedLead.identity.name} takes the lead!`, elapsed);
      } else if (climb && fastEnough) {
        const gained = this.prevRanks.get(climb.id)! - displayed.indexOf(climb);
        this.callout(`${climb.identity.name} gains ${gained === 2 ? 'two' : gained} places!`, elapsed);
      }
      this.leading = displayedLead?.id ?? 0;
      this.prevRanks = new Map(displayed.map((r, i) => [r.id, i]));
    }
    if (!this.final && lead && lead.progress.distance > this.plan.nodes[this.plan.finalSection].s) {
      this.final = true;
      this.callout('Final section!', elapsed, true);
    }
    if (recoveryCount > this.recoveredCount) {
      const first = this.recoveredCount === 0;
      this.recoveredCount = recoveryCount;
      this.callout('A marble returns to its checkpoint', elapsed, first && !this.final);
    }
    if (this.shownCallout) this.shownCallout.hidden = this.calloutUntil < elapsed;
    const p = lead ? Math.min(100, Math.round(lead.progress.distance / this.plan.length * 100)) : 0;
    const section = lead ? this.plan.modules[this.plan.nodes[lead.progress.segment].module].name : 'Starting grid';
    const stageKey = `${section}/${p}`;
    if (stageKey !== this.lastStage) {
      this.lastStage = stageKey;
      this.routePercent.textContent = `${p}%`;
      this.routeSection.textContent = section;
      this.ticker.style.setProperty('--progress', `${p}%`);
    }
    this.drawMap(ranked);
  }

  markers(ranked: readonly Racer[], project: (id: number) => { x: number; y: number; visible: boolean } | undefined, active: boolean) {
    for (const r of ranked) {
      const marker = this.markerEls.get(r.id);
      if (!marker) continue;
      const position = active && !r.dnf ? project(r.id) : undefined;
      const behindPanel = position && ((!this.side.hidden && position.x > .758 && position.y < .51)
        || (position.x > .79 && position.y > .74));
      marker.hidden = !position?.visible || Boolean(behindPanel);
      if (position?.visible && !marker.hidden) marker.style.transform = `translate(${position.x * 100}cqw,${position.y * 100}cqh) translate(-50%, -50%)`;
      this.rankEls.get(r.id)?.classList.toggle('offscreen', Boolean(position) && marker.hidden);
    }
  }

  private callout(text: string, seconds: number, priority = false) {
    if ((!priority && seconds - this.lastCallout < 9) || !this.shownCallout) return;
    this.lastCallout = seconds;
    this.calloutUntil = seconds + 2.9;
    this.shownCallout.textContent = text;
    this.shownCallout.hidden = false;
  }

  error(message: string) {
    this.stage.dataset.phase = 'prepare';
    required(this.stage, '.loader small').textContent = message;
  }
}
