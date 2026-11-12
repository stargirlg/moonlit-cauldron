export class FairyAudio {
  private ctx: AudioContext | null = null;
  public muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted) return null;
    try {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  private playTone(
    freq: number,
    delay: number,
    duration: number,
    type: OscillatorType = 'sine',
    peakGain = 0.08
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peakGain, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  playHerbPickup(): void {
    this.playTone(659.25, 0, 0.22, 'sine', 0.07); // E5
    this.playTone(987.77, 0.07, 0.28, 'sine', 0.07); // B5
  }

  playGearPickup(): void {
    this.playTone(523.25, 0, 0.2, 'triangle', 0.08); // C5
    this.playTone(659.25, 0.07, 0.2, 'triangle', 0.08); // E5
    this.playTone(783.99, 0.14, 0.25, 'triangle', 0.08); // G5
    this.playTone(1046.5, 0.21, 0.35, 'sine', 0.09); // C6
  }

  playBridgeWeave(): void {
    const notes = [440, 554.37, 659.25, 880];
    notes.forEach((n, idx) => this.playTone(n, idx * 0.06, 0.24, 'sine', 0.06));
  }

  playBrewPotion(): void {
    this.playTone(329.63, 0, 0.25, 'triangle', 0.08);
    this.playTone(493.88, 0.09, 0.28, 'sine', 0.08);
    this.playTone(739.99, 0.18, 0.38, 'sine', 0.09);
  }

  playFlyToggle(): void {
    this.playTone(392.0, 0, 0.3, 'sine', 0.06);
    this.playTone(587.33, 0.08, 0.35, 'sine', 0.06);
  }

  playVictory(): void {
    const fanfare = [523.25, 659.25, 783.99, 1046.5, 1318.51];
    fanfare.forEach((n, idx) => this.playTone(n, idx * 0.1, 0.45, 'triangle', 0.09));
  }
}