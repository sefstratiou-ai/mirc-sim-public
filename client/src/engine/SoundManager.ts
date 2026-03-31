/** When true, playConnect() uses a ~56k dial-up modem handshake sound instead of a simple beep sequence. */
var CONNECT_SOUND = 'minimal';

export class SoundManager {
  private context: AudioContext | null = null;
  private enabled = true;

  private getContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext();
    }
    return this.context;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  private playTone(frequency: number, duration: number, type: OscillatorType = 'square') {
    if (!this.enabled) return;
    try {
      const ctx = this.getContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = frequency;
      gain.gain.value = 0.1;
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch {
      // Audio not available
    }
  }

  playJoin() {
    this.playTone(800, 0.1);
  }

  playPart() {
    this.playTone(400, 0.15);
  }

  playMessage() {
    this.playTone(600, 0.05);
  }

  playHighlight() {
    this.playTone(1000, 0.08);
    setTimeout(() => this.playTone(1200, 0.08), 100);
  }

  playPrivateMessage() {
    this.playTone(900, 0.1);
    setTimeout(() => this.playTone(1100, 0.1), 120);
    setTimeout(() => this.playTone(900, 0.1), 240);
  }

  playConnect() {
    if (!this.enabled) return;
    try {
      if (CONNECT_SOUND === 'modem') {
        this.playModemHandshake();
      } else if (CONNECT_SOUND == 'simple') {
        const audio = new Audio('/modem.mp3');
        audio.volume = 0.8;
        audio.play().catch(() => {
          // Fallback to beep sequence if audio playback is blocked
          this.playTone(500, 0.1);
          setTimeout(() => this.playTone(700, 0.1), 100);
          setTimeout(() => this.playTone(900, 0.15), 200);
        });
      } else {
        this.playTone(500, 0.2);
        // setTimeout(() => this.playTone(700, 0.1), 100);
        // setTimeout(() => this.playTone(900, 0.15), 200);
      }
    } catch {
      // Audio not available
    }
  }

  /**
   * Simulates ~56k dial-up modem handshake sequence:
   * 1. Dial tone
   * 2. DTMF dialing digits
   * 3. Ring-back
   * 4. Remote modem answer tone (2100 Hz)
   * 5. Carrier negotiation (scrambled ascending/descending tones)
   * 6. Static/white-noise data burst
   * 7. Final carrier lock tone
   */
  private playModemHandshake() {
    if (!this.enabled) return;
    try {
      const ctx = this.getContext();
      const masterGain = ctx.createGain();
      masterGain.gain.value = 0.12;
      masterGain.connect(ctx.destination);
      const t = ctx.currentTime;

      // 1. Dial tone (350 Hz + 440 Hz mixed) — 0.6s
      this.modemTone(ctx, masterGain, 350, t, 0.6, 'sine', 0.5);
      this.modemTone(ctx, masterGain, 440, t, 0.6, 'sine', 0.5);

      // 2. DTMF dialing — quick tone bursts (7 digits)
      const dtmfPairs = [
        [697, 1209], [770, 1336], [852, 1209],
        [697, 1477], [770, 1209], [852, 1336], [697, 1209],
      ];
      let dtmfStart = 0.7;
      for (const [lo, hi] of dtmfPairs) {
        this.modemTone(ctx, masterGain, lo, t + dtmfStart, 0.07, 'sine', 0.4);
        this.modemTone(ctx, masterGain, hi, t + dtmfStart, 0.07, 'sine', 0.4);
        dtmfStart += 0.1;
      }

      // 3. Silence + ring-back (440 Hz + 480 Hz, two bursts)
      const ringStart = 1.5;
      this.modemTone(ctx, masterGain, 440, t + ringStart, 0.4, 'sine', 0.3);
      this.modemTone(ctx, masterGain, 480, t + ringStart, 0.4, 'sine', 0.3);
      this.modemTone(ctx, masterGain, 440, t + ringStart + 0.6, 0.4, 'sine', 0.3);
      this.modemTone(ctx, masterGain, 480, t + ringStart + 0.6, 0.4, 'sine', 0.3);

      // 4. Remote answer tone — 2100 Hz (CED) — 0.5s
      const answerStart = 2.8;
      this.modemTone(ctx, masterGain, 2100, t + answerStart, 0.5, 'sine', 0.6);

      // 5. Carrier negotiation — rapid frequency sweeps
      const negoStart = 3.1;
      // Ascending sweep
      // this.modemSweep(ctx, masterGain, 1200, 2400, t + negoStart, 0.3, 0.5);
      // Descending sweep
      // this.modemSweep(ctx, masterGain, 2400, 1200, t + negoStart + 0.35, 0.25, 0.4);
      // Scrambled tones (V.32 training sequence feel)
      const scrambleFreqs = [1800, 1200, 2400, 1650, 2100, 1350, 1950, 2250];
      let scrambleT = negoStart + 0.0;
      for (const freq of scrambleFreqs) {
        this.modemTone(ctx, masterGain, freq, t + scrambleT, 0.04, 'sine', 0.45);
        scrambleT += 0.05;
      }

      // 6. White-noise data burst (shaped noise via buffer source) — 0.7s
      const noiseStart = negoStart + 1.1;
      this.modemNoise(ctx, masterGain, t + noiseStart, 0.7, 0.35);

      // 7. Final carrier lock tones (steady 1200 Hz + 2400 Hz)
      const lockStart = noiseStart + 0.4;
      this.modemTone(ctx, masterGain, 1200, t + lockStart, 0.2, 'sine', 0.3);
      this.modemTone(ctx, masterGain, 2400, t + lockStart, 0.2, 'sine', 0.2);
      // Short silence then a soft "connected" beep
      this.modemTone(ctx, masterGain, 800, t + lockStart + 0.3, 0.08, 'square', 0.3);

    } catch {
      // Audio not available
    }
  }

  /** Play a single tone into the modem chain. */
  private modemTone(
    ctx: AudioContext,
    dest: AudioNode,
    freq: number,
    startTime: number,
    duration: number,
    type: OscillatorType,
    volume: number,
  ) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);
  }

  /** Frequency sweep between two values. */
  private modemSweep(
    ctx: AudioContext,
    dest: AudioNode,
    freqStart: number,
    freqEnd: number,
    startTime: number,
    duration: number,
    volume: number,
  ) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freqStart, startTime);
    osc.frequency.linearRampToValueAtTime(freqEnd, startTime + duration);
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);
  }

  /** Shaped white-noise burst (simulates data scramble). */
  private modemNoise(
    ctx: AudioContext,
    dest: AudioNode,
    startTime: number,
    duration: number,
    volume: number,
  ) {
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    // Band-pass filter to sound more like modem noise (center ~1800 Hz)
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    filter.Q.value = 2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    src.start(startTime);
    src.stop(startTime + duration + 0.01);
  }


  playDisconnect() {
    this.playTone(900, 0.1);
    setTimeout(() => this.playTone(700, 0.1), 100);
    setTimeout(() => this.playTone(500, 0.15), 200);
  }
}

export const soundManager = new SoundManager();