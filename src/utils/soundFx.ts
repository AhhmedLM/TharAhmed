// Pure Web Audio API 2000s RTS Synthesized Sound Effects Engine (Zero external assets)

const MUTE_STORAGE_KEY = 'husun_rts_sfx_muted_v1';

class SoundFxEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;
  private lastPlayedAt = new Map<string, number>();

  constructor() {
    try {
      if (typeof window !== 'undefined') {
        this.muted = window.localStorage.getItem(MUTE_STORAGE_KEY) === '1';
      }
    } catch {
      this.muted = false;
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(next: boolean): void {
    this.muted = next;
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(MUTE_STORAGE_KEY, next ? '1' : '0');
      }
    } catch {
      // Ignore storage failures
    }
  }

  private getCtx(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private canPlay(key: string, cooldownMs: number): boolean {
    const now = performance.now();
    const prev = this.lastPlayedAt.get(key) ?? 0;
    if (now - prev < cooldownMs) return false;
    this.lastPlayedAt.set(key, now);
    return true;
  }

  private playTone(
    freqStart: number,
    freqEnd: number,
    durationSec: number,
    type: OscillatorType,
    volume: number,
    delaySec = 0
  ) {
    const ctx = this.getCtx();
    if (!ctx) return;
    const t0 = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqEnd), t0 + durationSec);

    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + durationSec + 0.02);
  }

  private playNoiseBurst(durationSec: number, filterHz: number, volume: number, q = 1.5) {
    const ctx = this.getCtx();
    if (!ctx) return;
    const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * durationSec));
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / sampleCount);
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterHz;
    filter.Q.value = q;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSec);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start();
  }

  public playSelect(): void {
    if (!this.canPlay('select', 70)) return;
    this.playTone(480, 620, 0.055, 'triangle', 0.045);
  }

  public playMoveOrder(): void {
    if (!this.canPlay('move', 90)) return;
    this.playTone(190, 120, 0.09, 'sine', 0.08);
    this.playTone(340, 260, 0.06, 'triangle', 0.045, 0.02);
  }

  public playAttackOrder(): void {
    if (!this.canPlay('attack_order', 160)) return;
    // Crisp metallic draw + low horn
    this.playTone(220, 330, 0.14, 'sawtooth', 0.055);
    this.playTone(440, 587, 0.12, 'triangle', 0.045, 0.05);
  }

  public playBuildPlaced(): void {
    if (!this.canPlay('build_placed', 140)) return;
    this.playTone(165, 95, 0.11, 'square', 0.05);
    this.playTone(330, 440, 0.1, 'triangle', 0.05, 0.04);
  }

  public playArrowShot(): void {
    if (!this.canPlay('arrow', 100)) return;
    this.playNoiseBurst(0.075, 2200, 0.045, 2.2);
    this.playTone(540, 220, 0.065, 'triangle', 0.03);
  }

  public playMeleeClash(): void {
    if (!this.canPlay('melee', 120)) return;
    this.playNoiseBurst(0.06, 3600, 0.055, 3.0);
    this.playTone(980, 420, 0.08, 'sawtooth', 0.028);
  }

  public playSiegeHit(): void {
    if (!this.canPlay('siege', 150)) return;
    this.playNoiseBurst(0.14, 480, 0.08, 0.9);
    this.playTone(110, 48, 0.16, 'triangle', 0.075);
  }

  public playDestruction(): void {
    if (!this.canPlay('destruction', 220)) return;
    this.playNoiseBurst(0.28, 360, 0.1, 0.8);
    this.playTone(135, 38, 0.28, 'sawtooth', 0.075);
  }

  public playUnderAttackAlert(): void {
    if (!this.canPlay('alert', 5500)) return;
    // Two-note medieval war-horn alert
    this.playTone(293.66, 329.63, 0.22, 'sawtooth', 0.055, 0);
    this.playTone(392.0, 392.0, 0.34, 'sawtooth', 0.065, 0.22);
  }

  public playVictoryFanfare(): void {
    if (!this.canPlay('victory', 1500)) return;
    const notes = [392, 493.88, 587.33, 783.99];
    notes.forEach((n, idx) => {
      this.playTone(n, n, idx === 3 ? 0.55 : 0.18, 'triangle', 0.07, idx * 0.13);
    });
  }

  public playDefeatToll(): void {
    if (!this.canPlay('defeat', 1500)) return;
    const notes = [293.66, 261.63, 220.0, 174.61];
    notes.forEach((n, idx) => {
      this.playTone(n, n * 0.96, idx === 3 ? 0.65 : 0.22, 'sawtooth', 0.055, idx * 0.18);
    });
  }
}

export const soundFx = new SoundFxEngine();
