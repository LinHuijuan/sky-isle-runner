export type PowerTimers = {
  magnet: number;
  shield: number;
  boost: number;
};

export type PanelName =
  | 'title'
  | 'stages'
  | 'loadout'
  | 'settings'
  | 'playing'
  | 'paused'
  | 'fail'
  | 'win';

export type HudSnapshot = {
  score: number;
  target: number;
  distance: number;
  finishZ: number;
  lives: number;
  maxLives: number;
  combo: number;
  bestDistance: number;
  dashReady: number;
  powers: PowerTimers;
  timer?: number;
  stageLabel?: string;
  mode: PanelName;
};

export class Hud {
  private readonly scoreValue = this.getElement('#score-value');
  private readonly targetValue = this.getElement('#target-value');
  private readonly distanceValue = this.getElement('#distance-value');
  private readonly livesValue = this.getElement('#lives-value');
  private readonly bestValue = this.getElement('#best-value');
  private readonly comboBanner = this.getElement('#combo-banner');
  private readonly comboValue = this.getElement('#combo-value');
  private readonly powerRow = this.getElement('#power-row');
  private readonly dashMeter = this.getElement('#dash-meter');
  private readonly dashFill = this.getElement('#dash-fill');
  private readonly overlay = this.getElement('#overlay');
  private readonly titleBest = this.getElement('#title-best');
  private readonly pauseStats = this.getElement('#pause-stats');
  private readonly failBest = this.getElement('#fail-best');
  private readonly winBest = this.getElement('#win-best');
  private readonly failStars = this.getElement('#fail-stars');
  private readonly winStars = this.getElement('#win-stars');
  private readonly panels: Record<string, HTMLElement> = {
    title: this.getElement('#panel-title'),
    stages: this.getElement('#panel-stages'),
    loadout: this.getElement('#panel-loadout'),
    settings: this.getElement('#panel-settings'),
    pause: this.getElement('#panel-pause'),
    fail: this.getElement('#panel-fail'),
    win: this.getElement('#panel-win'),
  };
  private readonly progressWrap = this.getElement('#progress-wrap');
  private readonly progressFill = this.getElement('#progress-fill');
  private readonly progressPct = this.getElement('#progress-pct');
  private readonly stageLabel = this.getElement('#stage-label');
  private lastMode: string | null = null;
  private lastLives = -1;
  /** Cached last-written values so identical frames do no DOM work. */
  private lastScore = -1;
  private lastTarget = -1;
  private lastDistance = -1;
  private lastBest = -1;
  private lastPct = -1;
  private lastStageLabel = '';
  private lastCombo = -1;
  private lastDashReady = -1;
  private lastPowerCount = -1;
  private readonly lastPowerSeconds = new Map<string, string>();
  private timerChip: HTMLElement | null = null;
  private timerValue: HTMLElement | null = null;
  private lastTimerText = '';
  private lastTimerDanger: boolean | null = null;

  setTarget(target: number): void {
    this.targetValue.textContent = String(target);
    this.lastTarget = target;
  }

  /** Throttled screen-reader announcement (see #a11y-status). */
  announce(text: string): void {
    const el = document.querySelector('#a11y-status');
    if (!el) return;
    el.textContent = text;
  }

  update(snapshot: HudSnapshot): void {
    // Every write below is guarded: this runs 60x/s and unguarded writes to
    // textContent / style invalidate layout even when nothing changed.
    if (snapshot.score !== this.lastScore) {
      this.lastScore = snapshot.score;
      this.scoreValue.textContent = String(snapshot.score);
    }
    if (snapshot.target !== this.lastTarget) {
      this.lastTarget = snapshot.target;
      this.targetValue.textContent = String(snapshot.target);
    }
    const distance = Math.floor(snapshot.distance);
    if (distance !== this.lastDistance) {
      this.lastDistance = distance;
      this.distanceValue.textContent = String(distance);
    }
    const best = Math.floor(snapshot.bestDistance);
    if (best !== this.lastBest) {
      this.lastBest = best;
      this.bestValue.textContent = String(best);
    }

    // Course progress — transform only, so it stays off the layout path.
    if (snapshot.finishZ > 1) {
      const pct = Math.max(0, Math.min(100, (snapshot.distance / snapshot.finishZ) * 100));
      this.progressWrap.hidden = false;
      const rounded = Math.floor(pct);
      if (rounded !== this.lastPct) {
        this.lastPct = rounded;
        this.progressFill.style.transform = `scaleX(${(pct / 100).toFixed(4)})`;
        this.progressPct.textContent = `${rounded}%`;
      }
    } else {
      this.progressWrap.hidden = true;
    }
    if (snapshot.stageLabel && snapshot.stageLabel !== this.lastStageLabel) {
      this.lastStageLabel = snapshot.stageLabel;
      this.stageLabel.textContent = snapshot.stageLabel;
    }

    if (snapshot.lives !== this.lastLives) {
      const previous = this.lastLives;
      this.lastLives = snapshot.lives;
      if (previous >= 0 && snapshot.lives < previous) {
        this.announce(snapshot.lives >= 99 ? '无限生命' : `剩余生命 ${snapshot.lives}`);
      }
      this.livesValue.replaceChildren();
      if (snapshot.lives >= 99) {
        const inf = document.createElement('span');
        inf.className = 'life-pip';
        inf.textContent = '∞';
        inf.style.width = 'auto';
        inf.style.borderRadius = '4px';
        inf.style.padding = '0 4px';
        inf.style.fontSize = '0.75rem';
        inf.style.lineHeight = '12px';
        this.livesValue.appendChild(inf);
      } else {
        for (let i = 0; i < snapshot.maxLives; i += 1) {
          const pip = document.createElement('span');
          pip.className = i < snapshot.lives ? 'life-pip' : 'life-pip empty';
          this.livesValue.appendChild(pip);
        }
      }
    }

    if (snapshot.combo >= 2) {
      this.comboBanner.hidden = false;
      if (snapshot.combo !== this.lastCombo) {
        this.lastCombo = snapshot.combo;
        this.comboValue.textContent = String(snapshot.combo);
      }
    } else if (!this.comboBanner.hidden) {
      this.comboBanner.hidden = true;
    }

    // Dash cooldown fill (0–1 ready)
    const ready = Math.max(0, Math.min(1, snapshot.dashReady));
    if (Math.abs(ready - this.lastDashReady) > 0.004) {
      this.lastDashReady = ready;
      this.dashFill.style.transform = `scaleY(${ready.toFixed(3)})`;
      this.dashMeter.classList.toggle('cooling', ready < 0.99);
    }

    this.renderPowers(snapshot.powers);

    if (snapshot.mode !== this.lastMode) {
      this.lastMode = snapshot.mode;
      this.setMode(snapshot.mode);
    }
  }

  private renderPowers(powers: PowerTimers): void {
    let count = 0;
    if (powers.magnet > 0) count += 1;
    if (powers.shield > 0) count += 1;
    if (powers.boost > 0) count += 1;

    if (count === 0) {
      // Guarded: this used to call replaceChildren() on every single frame.
      if (this.lastPowerCount !== 0) {
        this.lastPowerCount = 0;
        this.lastPowerSeconds.clear();
        this.powerRow.hidden = true;
        this.powerRow.replaceChildren();
      }
      return;
    }

    if (this.lastPowerCount !== count) {
      this.lastPowerCount = count;
      this.lastPowerSeconds.clear();
      this.powerRow.hidden = false;
      this.powerRow.replaceChildren();
      const entries: Array<[keyof PowerTimers, string]> = [];
      if (powers.magnet > 0) entries.push(['magnet', '磁铁']);
      if (powers.shield > 0) entries.push(['shield', '护盾']);
      if (powers.boost > 0) entries.push(['boost', '加速']);
      for (const [key, label] of entries) {
        const chip = document.createElement('div');
        chip.className = `power-chip ${key}`;
        chip.innerHTML = `<span class="dot"></span><span class="txt">${label}</span><span class="t"></span>`;
        this.powerRow.appendChild(chip);
      }
    }

    const keys: Array<keyof PowerTimers> = [];
    if (powers.magnet > 0) keys.push('magnet');
    if (powers.shield > 0) keys.push('shield');
    if (powers.boost > 0) keys.push('boost');
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      const text = `${Math.ceil(powers[key])}s`;
      if (this.lastPowerSeconds.get(key) === text) continue;
      this.lastPowerSeconds.set(key, text);
      const chip = this.powerRow.children[i] as HTMLElement | undefined;
      const t = chip?.querySelector('.t');
      if (t) t.textContent = text;
    }
  }

  setTitleBest(distance: number, stars: number): void {
    this.titleBest.textContent = `最佳距离 ${Math.floor(distance)}m · 最高星 ${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}`;
  }

  showFail(
    score: number,
    target: number,
    distance: number,
    stars: number,
    best: number,
    elapsedSec = 0,
  ): void {
    const sc = document.querySelector('#fail-crystals');
    const sd = document.querySelector('#fail-dist');
    const st = document.querySelector('#fail-time');
    if (sc) sc.textContent = `${score}/${target}`;
    if (sd) sd.textContent = `${Math.floor(distance)}m`;
    if (st) st.textContent = `${Math.floor(elapsedSec)}s`;
    this.failBest.textContent =
      distance >= best - 0.5
        ? '刷新最佳距离！'
        : `历史最佳 ${Math.floor(best)}m · 差 ${Math.floor(best - distance)}m`;
    this.renderStars(this.failStars, stars);
  }

  showWin(
    score: number,
    target: number,
    distance: number,
    stars: number,
    best: number,
    elapsedSec = 0,
  ): void {
    const sc = document.querySelector('#win-crystals');
    const sd = document.querySelector('#win-dist');
    const st = document.querySelector('#win-time');
    if (sc) sc.textContent = `${score}/${target}`;
    if (sd) sd.textContent = `${Math.floor(distance)}m`;
    if (st) st.textContent = `${Math.floor(elapsedSec)}s`;
    const beatBest = distance >= best - 0.5;
    this.winBest.textContent = `${score >= target ? '完美收集 · ' : `还差 ${target - score} 水晶 · `}${
      beatBest ? '刷新最佳！' : `最佳 ${Math.floor(best)}m`
    }`;
    this.renderStars(this.winStars, stars);
  }

  showHint(text: string, ms = 3500): void {
    const el = document.querySelector<HTMLElement>('#hint-toast');
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = `hintFade ${ms}ms ease forwards`;
  }

  showPause(score: number, target: number, distance: number): void {
    this.pauseStats.textContent = `水晶 ${score}/${target} · 距离 ${Math.floor(distance)}m`;
  }

  private renderStars(el: HTMLElement, stars: number): void {
    el.replaceChildren();
    for (let i = 0; i < 3; i += 1) {
      const s = document.createElement('span');
      s.className = i < stars ? 'on' : 'off';
      s.textContent = i < stars ? '★' : '☆';
      el.appendChild(s);
    }
  }

  flashPickup(): void {
    this.scoreValue.parentElement?.animate(
      [
        { transform: 'scale(1)' },
        { transform: 'scale(1.08)' },
        { transform: 'scale(1)' },
      ],
      { duration: 220, easing: 'ease-out' },
    );
  }

  setMuteLabel(muted: boolean): void {
    const text = muted ? '声音：关' : '声音：开';
    const a = document.querySelector('#btn-mute');
    const b = document.querySelector('#btn-mute-pause');
    const c = document.querySelector('#btn-mute-settings');
    if (a) a.textContent = text;
    if (b) b.textContent = text;
    if (c) c.textContent = text;
  }

  setSettingsLabels(quality: string, reducedMotion: boolean): void {
    const q = document.querySelector('#btn-quality');
    const m = document.querySelector('#btn-motion');
    if (q) q.textContent = `画质：${quality === 'high' ? '高' : '中'}`;
    if (m) m.textContent = `减少动态：${reducedMotion ? '开' : '关'}`;
  }

  setCoop(on: boolean): void {
    const chip = document.querySelector('#hud-chip-coop');
    if (on) {
      if (!chip) {
        const el = document.createElement('div');
        el.id = 'hud-chip-coop';
        el.className = 'hud-chip';
        el.innerHTML = `<span class="hud-label">模式</span><strong>双人</strong>`;
        document.querySelector('.hud-cluster')?.appendChild(el);
      }
    } else {
      chip?.remove();
    }
  }

  setKeys(collected: number, required: number): void {
    let chip = document.querySelector('#hud-chip-keys') as HTMLElement | null;
    if (required <= 0) {
      chip?.remove();
      return;
    }
    if (!chip) {
      chip = document.createElement('div');
      chip.id = 'hud-chip-keys';
      chip.className = 'hud-chip';
      chip.innerHTML = `<span class="hud-label">钥匙</span><strong><span id="keys-value">0</span>/<span id="keys-req">0</span></strong>`;
      document.querySelector('.hud-cluster')?.appendChild(chip);
    }
    const v = chip.querySelector('#keys-value');
    const r = chip.querySelector('#keys-req');
    if (v) v.textContent = String(collected);
    if (r) r.textContent = String(required);
    chip.style.borderColor =
      collected >= required ? 'rgba(255,210,122,0.6)' : 'rgba(255,106,154,0.45)';
  }

  private setMode(mode: PanelName): void {
    const showOverlay = mode !== 'playing';
    this.overlay.classList.toggle('visible', showOverlay);
    // Panel keys: pause panel id is #panel-pause but mode is 'paused'
    const panelKey = mode === 'paused' ? 'pause' : mode;
    for (const [key, el] of Object.entries(this.panels)) {
      el.hidden = key !== panelKey;
    }
    if (mode === 'playing') {
      for (const el of Object.values(this.panels)) el.hidden = true;
    }
    if (mode === 'paused') this.showPause(0, 0, 0);
  }

  showPanel(name: PanelName): void {
    this.lastMode = name;
    this.setMode(name);
  }

  renderStageList(
    stages: Array<{
      id: number;
      code: string;
      name: string;
      subtitle: string;
      locked: boolean;
      stars: number;
      exclusive?: string;
      bossKeys?: number;
      preview?: string;
      difficulty?: number;
    }>,
    onPick: (id: number) => void,
  ): void {
    const list = this.getElement('#stage-list');
    list.replaceChildren();
    const tagText: Record<string, string> = {
      'bouncy-garden': '弹跳花园',
      'crumble-flood': '崩塌洪流',
      'wind-corridor': '风区走廊',
      minefield: '地雷区',
      'boss-gate': 'Boss 门',
    };
    for (const s of stages) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = s.locked ? 'stage-item locked' : 'stage-item';
      btn.disabled = s.locked;
      const tags: string[] = [];
      if (s.exclusive && s.exclusive !== 'none') {
        tags.push(`<span class="tag">${tagText[s.exclusive] ?? s.exclusive}</span>`);
      }
      if (s.bossKeys && s.bossKeys > 0) {
        tags.push(`<span class="tag warn">${s.bossKeys} 钥匙</span>`);
      }
      const diff = s.difficulty ?? 0.3;
      const diffDots = Math.max(1, Math.min(5, Math.ceil(diff * 5)));
      const dots = Array.from({ length: 5 }, (_, i) =>
        `<i class="diff-dot${i < diffDots ? ' on' : ''}"></i>`,
      ).join('');
      const preview = s.preview
        ? `<img class="stage-thumb${s.locked ? ' locked' : ''}" src="${s.preview}" alt="" loading="lazy" />`
        : '';
      btn.innerHTML = `
        ${preview}
        <div class="stage-body">
          <span class="code">${s.code}</span>
          <span class="diff-dots" title="难度">${dots}</span>
          <span class="name">${s.name}</span>
          <span class="stars-mini">${'★'.repeat(s.stars)}${'☆'.repeat(3 - s.stars)}</span>
          <span class="sub">${s.locked ? '通关上一关解锁' : s.subtitle}</span>
          ${tags.length ? `<div class="tag-row">${tags.join('')}</div>` : ''}
        </div>
      `;
      if (!s.locked) btn.addEventListener('click', () => onPick(s.id));
      list.appendChild(btn);
    }
  }

  setLoadoutSelected(labels: string[]): void {
    const el = this.getElement('#loadout-selected');
    el.textContent = labels.length ? `已选：${labels.join(' · ')}` : '已选：无';
  }

  setTimer(seconds: number): void {
    if (!this.timerChip) {
      const chip = document.createElement('div');
      chip.id = 'hud-chip-timer';
      chip.className = 'hud-chip';
      chip.innerHTML = `<span class="hud-label">时间</span><strong id="timer-value">0</strong>`;
      document.querySelector('.hud-cluster')?.appendChild(chip);
      this.timerChip = chip;
      this.timerValue = chip.querySelector('#timer-value');
      this.lastTimerText = '';
      this.lastTimerDanger = null;
    }
    const text = seconds.toFixed(1);
    if (text !== this.lastTimerText) {
      this.lastTimerText = text;
      if (this.timerValue) this.timerValue.textContent = text;
    }
    const danger = seconds < 10;
    if (danger !== this.lastTimerDanger) {
      this.lastTimerDanger = danger;
      this.timerValue?.classList.toggle('danger', danger);
    }
  }

  hideTimer(): void {
    this.timerChip?.remove();
    this.timerChip = null;
    this.timerValue = null;
  }

  private getElement(selector: string): HTMLElement {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Missing HUD element: ${selector}`);
    return element;
  }
}
