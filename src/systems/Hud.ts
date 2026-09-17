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

  setTarget(target: number): void {
    this.targetValue.textContent = String(target);
  }

  update(snapshot: HudSnapshot): void {
    this.scoreValue.textContent = String(snapshot.score);
    this.targetValue.textContent = String(snapshot.target);
    this.distanceValue.textContent = String(Math.floor(snapshot.distance));
    this.bestValue.textContent = String(Math.floor(snapshot.bestDistance));

    // Course progress
    if (snapshot.finishZ > 1) {
      const pct = Math.max(0, Math.min(100, (snapshot.distance / snapshot.finishZ) * 100));
      this.progressWrap.hidden = false;
      this.progressFill.style.width = `${pct.toFixed(1)}%`;
      this.progressPct.textContent = `${Math.floor(pct)}%`;
    } else {
      this.progressWrap.hidden = true;
    }
    if (snapshot.stageLabel) this.stageLabel.textContent = snapshot.stageLabel;

    if (snapshot.lives !== this.lastLives) {
      this.lastLives = snapshot.lives;
      this.livesValue.replaceChildren();
      for (let i = 0; i < snapshot.maxLives; i += 1) {
        const pip = document.createElement('span');
        pip.className = i < snapshot.lives ? 'life-pip' : 'life-pip empty';
        this.livesValue.appendChild(pip);
      }
    }

    if (snapshot.combo >= 2) {
      this.comboBanner.hidden = false;
      this.comboValue.textContent = String(snapshot.combo);
    } else {
      this.comboBanner.hidden = true;
    }

    // Dash cooldown fill (0–1 ready)
    const ready = Math.max(0, Math.min(1, snapshot.dashReady));
    this.dashFill.style.transform = `scaleY(${ready})`;
    this.dashMeter.classList.toggle('cooling', ready < 0.99);

    this.renderPowers(snapshot.powers);

    if (snapshot.mode !== this.lastMode) {
      this.lastMode = snapshot.mode;
      this.setMode(snapshot.mode);
    }
  }

  private renderPowers(powers: PowerTimers): void {
    const active: Array<[keyof PowerTimers, string, string]> = [];
    if (powers.magnet > 0) active.push(['magnet', '磁铁', 'magnet']);
    if (powers.shield > 0) active.push(['shield', '护盾', 'shield']);
    if (powers.boost > 0) active.push(['boost', '加速', 'boost']);

    if (active.length === 0) {
      this.powerRow.hidden = true;
      this.powerRow.replaceChildren();
      return;
    }
    this.powerRow.hidden = false;
    // Rebuild only if count changes to reduce thrash
    if (this.powerRow.childElementCount !== active.length) {
      this.powerRow.replaceChildren();
      for (const [, label, cls] of active) {
        const chip = document.createElement('div');
        chip.className = `power-chip ${cls}`;
        chip.innerHTML = `<span class="dot"></span><span class="txt">${label}</span><span class="t"></span>`;
        this.powerRow.appendChild(chip);
      }
    }
    active.forEach(([, , cls], i) => {
      const chip = this.powerRow.children[i] as HTMLElement | undefined;
      if (!chip) return;
      const t = chip.querySelector('.t');
      if (t) t.textContent = `${Math.ceil(powers[cls as keyof PowerTimers])}s`;
    });
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
      btn.innerHTML = `
        <span class="code">${s.code}</span>
        <span class="stars-mini">${'★'.repeat(s.stars)}${'☆'.repeat(3 - s.stars)}</span>
        <span class="name">${s.name}</span>
        <span class="sub">${s.locked ? '通关上一关解锁' : s.subtitle}</span>
        ${tags.length ? `<div class="tag-row" style="grid-column:1/-1">${tags.join('')}</div>` : ''}
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
    let chip = document.querySelector('#hud-chip-timer') as HTMLElement | null;
    if (!chip) {
      chip = document.createElement('div');
      chip.id = 'hud-chip-timer';
      chip.className = 'hud-chip';
      chip.innerHTML = `<span class="hud-label">时间</span><strong id="timer-value">0</strong>`;
      document.querySelector('.hud-cluster')?.appendChild(chip);
    }
    const v = chip.querySelector('#timer-value');
    if (v) {
      v.textContent = seconds.toFixed(1);
      v.classList.toggle('danger', seconds < 10);
    }
  }

  hideTimer(): void {
    document.querySelector('#hud-chip-timer')?.remove();
  }

  private getElement(selector: string): HTMLElement {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Missing HUD element: ${selector}`);
    return element;
  }
}
