export class AudioSystem {
  private context: AudioContext | null = null;
  private unlocked = false;
  private windGain: GainNode | null = null;
  private windSrc: AudioBufferSourceNode | null = null;
  private muted = false;

  constructor() {
    const unlock = () => {
      void this.unlock();
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.windGain && this.context) {
      this.windGain.gain.value = muted ? 0 : 0.02;
    }
  }

  private get canPlay(): boolean {
    return !this.muted && !!this.context && this.context.state === 'running';
  }

  async unlock(): Promise<void> {
    if (this.unlocked) return;
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    this.context = new AudioContextClass();
    await this.context.resume();
    this.unlocked = true;
    this.startWind();
  }

  private startWind(): void {
    if (!this.context) return;
    const ctx = this.context;
    const len = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 400;
    filter.Q.value = 0.6;
    const gain = ctx.createGain();
    gain.gain.value = 0.02;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
    this.windSrc = src;
    this.windGain = gain;
  }

  setWindIntensity(speed: number): void {
    if (this.muted || !this.windGain || !this.context) return;
    const t = Math.min(1, Math.max(0, (speed - 6) / 8));
    this.windGain.gain.setTargetAtTime(0.015 + t * 0.04, this.context.currentTime, 0.15);
  }

  pickup(combo = 1): void {
    if (!this.canPlay || !this.context) return;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    const base = 420 + Math.min(combo, 8) * 28;
    oscillator.type = 'triangle';
    oscillator.frequency.setValueAtTime(base, now);
    oscillator.frequency.exponentialRampToValueAtTime(base * 1.7, now + 0.1);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.07, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.18);
  }

  jump(): void {
    this.blip(260, 520, 0.12, 'sine', 0.05);
  }

  land(): void {
    this.blip(180, 90, 0.12, 'sine', 0.06);
  }

  footstep(): void {
    this.blip(90 + Math.random() * 40, 60, 0.05, 'triangle', 0.02);
  }

  bounce(): void {
    this.blip(300, 900, 0.2, 'sine', 0.07);
  }

  crumble(): void {
    this.noiseBurst(0.25, 0.05);
  }

  checkpoint(): void {
    if (!this.canPlay || !this.context) return;
    const notes = [523, 784];
    const now = this.context.currentTime;
    notes.forEach((freq, i) => {
      const osc = this.context!.createOscillator();
      const gain = this.context!.createGain();
      const t = now + i * 0.08;
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.05, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(gain).connect(this.context!.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  }

  fall(): void {
    this.blip(220, 60, 0.4, 'sawtooth', 0.05);
  }

  win(): void {
    if (!this.canPlay || !this.context) return;
    const notes = [523, 659, 784, 1046];
    const now = this.context.currentTime;
    notes.forEach((freq, i) => {
      const osc = this.context!.createOscillator();
      const gain = this.context!.createGain();
      const t = now + i * 0.1;
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.06, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(gain).connect(this.context!.destination);
      osc.start(t);
      osc.stop(t + 0.24);
    });
  }

  private blip(from: number, to: number, dur: number, type: OscillatorType, vol: number): void {
    if (!this.canPlay || !this.context) return;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    osc.type = type;
    osc.frequency.setValueAtTime(from, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), now + dur * 0.8);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(vol, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain).connect(this.context.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  private noiseBurst(dur: number, vol: number): void {
    if (!this.canPlay || !this.context) return;
    const ctx = this.context;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    gain.gain.value = vol;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 800;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
  }

  dispose(): void {
    try {
      this.windSrc?.stop();
    } catch {
      /* already stopped */
    }
    void this.context?.close();
    this.context = null;
    this.windGain = null;
    this.windSrc = null;
  }
}
