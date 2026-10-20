import { VO, slug } from './vo.js?v=1792521149';
// ENDZONE KINGS — all audio is generated live (no sound files): stadium crowd, chants, air horn,
// pad hits, whistle, menu music, and a play-by-play announcer (the one thing that IS recorded: assets/vo).

export class Sfx {
  constructor() {
    this.ctx = null; this.vol = 0.7; this.musicVol = 0.5; this.muted = false;
    this.announcer = true; this.musicOn = false;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : this.vol;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp).connect(c.destination);
    this.sfxBus = c.createGain(); this.sfxBus.connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.gain.value = 0; this.musicBus.connect(this.master);
    // shared noise
    const len = c.sampleRate * 3;
    this.noise = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = this.noise.getChannelData(ch); let b = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.55 + b * 3; } }
    this.buildCrowd();
    this.loadVo();
    if (this.musicOn) this.startMusic();
  }

  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = this.muted ? 0 : v; }
  setMusicVolume(v) { this.musicVol = v; if (this.musicOn && this.musicBus) this.musicBus.gain.setTargetAtTime(v * 0.55, this.ctx.currentTime, 0.2); }
  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : this.vol; if (this.muted) this.stopVoice(); return this.muted; }

  // ---------------- crowd ----------------
  buildCrowd() {
    const c = this.ctx;
    // three filtered noise layers = murmur, body, roar
    this.crowdLayers = [[350, 0.7, 0.05], [900, 0.9, 0.03], [2200, 1.2, 0.0]].map(([f, q, g]) => {
      const s = c.createBufferSource(); s.buffer = this.noise; s.loop = true; s.playbackRate.value = 0.9 + Math.random() * 0.2;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const gain = c.createGain(); gain.gain.value = g;
      const pan = c.createStereoPanner ? c.createStereoPanner() : null;
      s.connect(bp).connect(gain); (pan ? gain.connect(pan) : gain).connect(this.sfxBus);
      s.start(0, Math.random() * 2);
      return gain;
    });
    // slow random swell so the crowd feels alive
    this.swellT = setInterval(() => {
      if (!this.ctx || c.currentTime < (this._busyUntil || 0)) return;   // don't cut a big roar short
      const t = c.currentTime, base = this.crowdBase || 0.05;
      this.crowdLayers[0].gain.setTargetAtTime(base * (0.8 + Math.random() * 0.5), t, 0.8);
    }, 1500);
  }

  cheer(level = 0.45, dur = 2.5) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    this._busyUntil = Math.max(this._busyUntil || 0, t + dur);
    const [m, b, r] = this.crowdLayers;
    for (const [g, k] of [[m, 1], [b, 0.8], [r, 0.55]]) {
      g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(level * k, t + 0.2);
      g.gain.linearRampToValueAtTime(k === 1 ? 0.05 : k === 0.8 ? 0.03 : 0.001, t + dur);
    }
  }
  groan() {
    if (!this.ctx) return; const t = this.ctx.currentTime, g = this.crowdLayers[0].gain;
    this._busyUntil = Math.max(this._busyUntil || 0, t + 1.6);
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0.22, t + 0.15); g.linearRampToValueAtTime(0.05, t + 1.6);
    this.voiceBurst(t, 0.9, 140, 0.25, 'oh');
  }

  // crowd "voice": many-voice formant burst (used for chants)
  voiceBurst(t, dur, pitch, amp, vowel = 'eh', voices = 6) {
    const c = this.ctx;
    const F = { eh: [530, 1840], oh: [450, 800], ah: [730, 1090], ee: [300, 2300] }[vowel];
    const out = c.createGain(); out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(amp, t + 0.05); out.gain.setValueAtTime(amp, t + dur * 0.6); out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    out.connect(this.sfxBus);
    for (let i = 0; i < voices; i++) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = pitch * (0.85 + Math.random() * 0.4); o.detune.value = (Math.random() - 0.5) * 40;
      const f1 = c.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = F[0]; f1.Q.value = 4;
      const f2 = c.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = F[1]; f2.Q.value = 6;
      const g = c.createGain(); g.gain.value = 0.25;
      o.connect(f1).connect(g); o.connect(f2).connect(g); g.connect(out);
      o.start(t); o.stop(t + dur + 0.05);
    }
    const n = c.createBufferSource(); n.buffer = this.noise; const nf = c.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = F[1]; nf.Q.value = 1.5;
    const ng = c.createGain(); ng.gain.value = 0.5 * Math.sqrt(voices / 6); n.connect(nf).connect(ng).connect(out); n.start(t, Math.random()); n.stop(t + dur + 0.05);
    n.onended = () => { try { out.disconnect(); } catch (_) {} };   // let the whole burst graph be collected
  }

  // "DE-FENSE!" chant: stomp stomp + two syllables
  chantDefense(times = 2) {
    if (!this.ctx) return; const t0 = this.ctx.currentTime + 0.05;
    for (let k = 0; k < times; k++) {
      const t = t0 + k * 1.3;
      this.stomp(t); this.stomp(t + 0.3);
      this.voiceBurst(t + 0.6, 0.28, 150, 0.22, 'ee');
      this.voiceBurst(t + 0.92, 0.4, 135, 0.26, 'eh');
    }
  }
  stomp(t) {
    const c = this.ctx;
    const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(this.sfxBus); o.start(t); o.stop(t + 0.25);
    const n = c.createBufferSource(); n.buffer = this.noise; const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    const ng = c.createGain(); ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.3, t + 0.01); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    n.connect(f).connect(ng).connect(this.sfxBus); n.start(t, Math.random()); n.stop(t + 0.2);
  }

  airHorn() {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime + 0.05;
    const out = c.createGain(); out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(0.22, t + 0.04);
    out.gain.setValueAtTime(0.22, t + 0.35); out.gain.exponentialRampToValueAtTime(0.18, t + 0.42); out.gain.setValueAtTime(0.22, t + 0.5); out.gain.setValueAtTime(0.22, t + 1.1); out.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    out.connect(lp).connect(this.sfxBus);
    for (const f of [349, 440, 523, 698]) for (const d of [-8, 8]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d;
      o.frequency.setValueAtTime(f * 0.94, t); o.frequency.linearRampToValueAtTime(f, t + 0.08);
      o.connect(out); o.start(t); o.stop(t + 1.45);
    }
  }

  // ---------------- one-shots ----------------
  env(node, t, a, peak, dcy) { const g = node.gain; g.setValueAtTime(0.0001, t); g.exponentialRampToValueAtTime(peak, t + a); g.exponentialRampToValueAtTime(0.0001, t + a + dcy); }
  tone(freq, dur, type = 'sine', peak = 0.3, slide = 0, bus) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    this.env(g, t, 0.01, peak, dur); o.connect(g).connect(bus || this.sfxBus); o.start(t); o.stop(t + dur + 0.05);
  }
  // shoulder-pad hit: low thump + plastic crack
  pads(power = 1) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
    this.env(g, t, 0.004, 0.7 * power, 0.22); o.connect(g).connect(this.sfxBus); o.start(t); o.stop(t + 0.3);
    const n = c.createBufferSource(); n.buffer = this.noise; const hp = c.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 1800; hp.Q.value = 0.8;
    const ng = c.createGain(); this.env(ng, t, 0.002, 0.55 * power, 0.07); n.connect(hp).connect(ng).connect(this.sfxBus); n.start(t, Math.random() * 2); n.stop(t + 0.12);
    const n2 = c.createBufferSource(); n2.buffer = this.noise; const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400;
    const ng2 = c.createGain(); this.env(ng2, t + 0.03, 0.01, 0.35 * power, 0.25); n2.connect(lp).connect(ng2).connect(this.sfxBus); n2.start(t + 0.03, Math.random() * 2); n2.stop(t + 0.35);
  }
  thud() { // ball hitting hands / turf
    if (!this.ctx) return; const t = this.ctx.currentTime;
    const n = this.ctx.createBufferSource(); n.buffer = this.noise; const f = this.ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.2;
    const g = this.ctx.createGain(); this.env(g, t, 0.002, 0.4, 0.06); n.connect(f).connect(g).connect(this.sfxBus); n.start(t, Math.random()); n.stop(t + 0.1);
  }
  whoosh(dur = 0.5) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const n = c.createBufferSource(); n.buffer = this.noise; const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(600, t); f.frequency.exponentialRampToValueAtTime(2400, t + dur * 0.5); f.frequency.exponentialRampToValueAtTime(800, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + dur * 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f).connect(g).connect(this.sfxBus); n.start(t, Math.random()); n.stop(t + dur + 0.05);
  }
  whistle() {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), lfo = this.ctx.createOscillator(), lg = this.ctx.createGain(), g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.value = 2900; lfo.frequency.value = 38; lg.gain.value = 140;
    lfo.connect(lg).connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.1, t + 0.02); g.gain.setValueAtTime(0.1, t + 0.32); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g).connect(this.sfxBus); o.start(t); lfo.start(t); o.stop(t + 0.5); lfo.stop(t + 0.5);
  }
  kick() { this.pads(0.5); this.tone(70, 0.2, 'sine', 0.5, 0.5); }

  play(e) {
    if (!this.ctx) return;
    switch (e) {
      case 'snap': this.thud(); this.cheer(0.12, 1.2); break;
      case 'throw': case 'pitch': this.whoosh(0.55); break;
      case 'catch': this.thud(); this.cheer(0.2, 1.6); break;
      case 'handoff': this.thud(); break;
      case 'tackle': this.pads(1); break;
      case 'bighit': this.pads(1.35); this.cheer(0.35, 1.8); break;
      case 'spin': case 'hurdle': this.whoosh(0.4); this.cheer(0.18, 1); break;
      case 'stiff': this.pads(0.5); break;
      case 'playball': this.whoosh(0.3); break;
      case 'shed': if (Math.random() < 0.3) this.pads(0.35); break;
      case 'brokentackle': this.pads(0.7); this.cheer(0.3, 1.8); break;
      case 'juke': this.whoosh(0.25); break;
      case 'dive': this.whoosh(0.35); break;
      case 'whistle': this.whistle(); break;
      case 'thirddown': this.cheer(0.5, 3.2); [0, 420, 840, 1260].forEach(t => setTimeout(() => this.thud && this.thud(), t)); break;   // home crowd: loud + stomping
      case 'thirddown_away': this.cheer(0.18, 1.6); break;
      case 'boo': { const t = this.ctx ? this.ctx.currentTime : 0; if (this.ctx && this.voiceBurst) { this.voiceBurst(t, 1.8, 118, 0.09, 'oh'); this.voiceBurst(t + 0.15, 1.6, 96, 0.07, 'oh'); } break; }
      case 'weather': this.cheer(0.12, 1.2); break;
      case 'flag': this.whistle(); break;
      case 'half': this.cheer(0.5, 3); break;
      case 'firstdown': this.cheer(0.22, 1.8); this.tone(660, 0.1, 'triangle', 0.08); setTimeout(() => this.tone(880, 0.16, 'triangle', 0.08), 110); break;
      case 'int': this.groan(); this.cheer(0.4, 2.6); break;
      case 'breakup': this.pads(0.4); this.groan(); break;
      case 'incomplete': this.thud(); break;
      case 'td': this.touchdown(); break;
      case 'score': this.cheer(0.7, 4); this.airHorn(); this.fanfare(); break;
      case 'kick': this.kick(); this.cheer(0.2, 2.5); break;
      case 'final': this.cheer(0.5, 3.5); this.airHorn(); break;
      case 'ui': this.tone(900, 0.05, 'triangle', 0.06); break;
      case 'cel0': this.cheer(0.5, 2.2); [0, 260, 520].forEach(t => setTimeout(() => this.tone(196, 0.12, 'square', 0.06), t)); break;   // jump: crowd + stomps
      case 'cel1': [523, 659, 523, 784, 659, 523].forEach((f, i) => setTimeout(() => { this.tone(f, 0.12, 'square', 0.045); this.tone(f / 4, 0.12, 'sine', 0.08); }, i * 150)); break;   // dance beat
      case 'cel2': this.tone(110, 0.6, 'sawtooth', 0.07, 40); this.cheer(0.45, 2); break;   // flex: deep OOH
      case 'cel3': [784, 988, 1175].forEach((f, i) => setTimeout(() => this.tone(f, 0.5, 'sine', 0.06), i * 120)); break;   // point up: chime
      case 'cel4': this.whoosh(0.5); setTimeout(() => this.whoosh(0.4), 350); this.cheer(0.3, 1.6); break;   // spin
      case 'cel5': this.cheer(0.4, 3); [392, 523].forEach((f, i) => setTimeout(() => this.tone(f, 0.4, 'triangle', 0.06), 200 + i * 300)); break;   // bow: applause
      case 'cel6': [98, 98, 131, 98, 147, 131].forEach((f, i) => setTimeout(() => this.tone(f, 0.18, 'sawtooth', 0.06), i * 180)); break;   // moonwalk bassline
      case 'cel7': this.whoosh(0.3); setTimeout(() => this.airHorn(), 180); break;   // dab
      case 'cel8': [0, 1, 2, 3, 4, 5, 6, 7].forEach(i => setTimeout(() => { this.tone(i % 2 ? 1400 : 160, 0.06, i % 2 ? 'square' : 'sine', i % 2 ? 0.03 : 0.1); }, i * 110)); this.cheer(0.35, 2); break;   // shuffle beat
      case 'cel9': [523, 659, 784].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, 'triangle', 0.06), i * 140)); break;   // salute: bugle
      case 'cel10': this.cheer(0.4, 2); [659, 523].forEach((f, i) => setTimeout(() => this.tone(f, 0.3, 'sine', 0.06), i * 220)); break;   // heart hands: aww
      case 'cel11': [0, 1, 2, 3, 4, 5].forEach(i => setTimeout(() => this.tone(220 + (i % 3) * 110, 0.08, 'square', 0.05), i * 330)); break;   // robot: beeps
      case 'cel12': [0, 1, 2, 3, 4, 5, 6].forEach(i => setTimeout(() => this.tone(1800, 0.03, 'square', 0.03), i * 90)); setTimeout(() => this.whoosh(0.3), 700); break;   // sprinkler: tick tick
      case 'cel13': this.whoosh(0.35); setTimeout(() => this.tone(880, 0.1, 'sine', 0.06), 900); setTimeout(() => this.cheer(0.45, 2), 1000); break;   // archer: twang and the crowd
      case 'cel14': this.cheer(0.35, 3); break;   // take a knee: applause
      case 'cel15': [0, 1, 2, 3].forEach(i => setTimeout(() => this.tone(150, 0.1, 'sine', 0.1), i * 320)); this.cheer(0.3, 1.6); break;   // jumping jacks: stomps
      case 'cel16': this.cheer(0.55, 2.6); break;   // wave: the crowd answers
      case 'cel17': this.tone(98, 0.8, 'sawtooth', 0.06, 40); [392, 494, 587, 784].forEach((f, i) => setTimeout(() => this.tone(f, 0.35, 'triangle', 0.06), 250 + i * 160)); this.cheer(0.5, 2.6); break;   // throne: fanfare
    }
  }
  // the full touchdown moment: cannon boom, stadium horn, a brass hit, and the place goes off for a good few seconds
  touchdown() {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime + 0.02;
    const boom = c.createBufferSource(); boom.buffer = this.noise; const bl = c.createBiquadFilter(); bl.type = 'lowpass'; bl.frequency.value = 180;
    const bg = c.createGain(); bg.gain.setValueAtTime(0.0001, t); bg.gain.exponentialRampToValueAtTime(0.9, t + 0.02); bg.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
    boom.connect(bl).connect(bg).connect(this.sfxBus); boom.start(t, Math.random()); boom.stop(t + 1.3);
    const o = c.createOscillator(), og = c.createGain(); o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.6);
    og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.6, t + 0.02); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.7); o.connect(og).connect(this.sfxBus); o.start(t); o.stop(t + 0.75);
    this.cheer(1, 6.5);
    setTimeout(() => this.airHorn(), 250);
    setTimeout(() => this.fanfare(), 900);
    setTimeout(() => this.cheer(0.6, 3.5), 2600);
    if (this.voiceBurst) [1700, 2300, 2900].forEach(d => setTimeout(() => { if (this.ctx) this.voiceBurst(this.ctx.currentTime, 0.45, 150, 0.18, 'oh'); }, d));   // crowd chant
  }
  fanfare() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => { this.tone(f, 0.3, 'square', 0.05); this.tone(f / 2, 0.3, 'triangle', 0.06); }, 250 + i * 130)); }

  // crowd mood for the current situation (called by the game loop)
  // background crowd chatter: lots of quiet overlapping voices, always under everything else
  startMurmur() {
    if (this._murT || !this.ctx) return;
    const tick = () => {
      if (!this.ctx || this.muted || !this._sit) return;
      const t = this.ctx.currentTime, V = ['eh', 'oh', 'ah', 'ee'];
      // 1-2 voices per burst (not 6): same murmur, a fraction of the audio nodes; amp scaled ~sqrt(6/n) to keep the level
      for (let i = 0; i < 2; i++) { const nv = 1 + (Math.random() < 0.5 ? 1 : 0); this.voiceBurst(t + Math.random() * 0.2, 0.25 + Math.random() * 0.45, 120 + Math.random() * 170, (0.0035 + Math.random() * 0.005 * (this._sit === 'live' ? 1.4 : 1)) * Math.sqrt(6 / nv), V[(Math.random() * 4) | 0], nv); }
    };
    this._murT = setInterval(tick, 260);
  }
  stopMurmur() { clearInterval(this._murT); this._murT = 0; this._sit = null; if (this._chantT) { clearInterval(this._chantT); this._chantT = 0; } }
  setSituation(sit) {
    if (!this.ctx || sit === this._sit) return;
    this._sit = sit; this.startMurmur();
    clearInterval(this._chantT);
    if (sit === 'homeDefense') {
      this.crowdBase = 0.09;
      this.chantDefense(2);
      this._chantT = setInterval(() => this.chantDefense(1), 5200);
    } else this.crowdBase = sit === 'live' ? 0.08 : 0.05;
  }

  // ---------------- menu music ----------------
  startMusic() {
    this.musicOn = true; this.stopMurmur();
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(this.musicVol * 0.55, this.ctx.currentTime, 0.4);
    if (this._musicT) return;
    const c = this.ctx, bpm = 96, beat = 60 / bpm, step = beat / 4;
    // i - VI - III - VII in A minor
    const prog = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
    const bassNotes = [45, 41, 36, 43];
    const mtof = n => 440 * Math.pow(2, (n - 69) / 12);
    let next = c.currentTime + 0.1, i = 0;
    const sched = () => {
      while (next < c.currentTime + 0.25) {
        const bar = Math.floor(i / 16) % 4, s = i % 16, t = next;
        // drums: kick, clap, hats (trap-ish)
        if (s === 0 || s === 7 || s === 10) this.mDrum(t, 'kick');
        if (s === 4 || s === 12) this.mDrum(t, 'clap');
        if (s % 2 === 0 || (bar % 2 && s > 12)) this.mDrum(t, 'hat');
        // bass
        if (s === 0 || s === 7 || s === 10) this.mNote(t, mtof(bassNotes[bar]), step * 3, 'sawtooth', 0.16, 600);
        // chord stabs
        if (s === 0 || s === 6 || s === 12) for (const n of prog[bar]) this.mNote(t, mtof(n + 12), step * 2.2, 'square', 0.035, 2200);
        // lead hook every other bar
        if (bar % 2 === 1 && [0, 3, 6, 8, 11].includes(s)) this.mNote(t, mtof([69, 72, 76, 74, 72][[0, 3, 6, 8, 11].indexOf(s)] + 12), step * 1.6, 'triangle', 0.05, 5000);
        next += step; i++;
      }
    };
    this._musicT = setInterval(sched, 60); sched();
  }
  stopMusic() {
    this.musicOn = false;
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
    clearInterval(this._musicT); this._musicT = null;
  }
  mNote(t, f, dur, type, amp, cutoff) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
    o.type = type; o.frequency.value = f; lp.type = 'lowpass'; lp.frequency.value = cutoff;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(amp, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp).connect(g).connect(this.musicBus); o.start(t); o.stop(t + dur + 0.05);
  }
  mDrum(t, kind) {
    const c = this.ctx;
    if (kind === 'kick') {
      const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.6, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g).connect(this.musicBus); o.start(t); o.stop(t + 0.4);
    } else {
      const n = c.createBufferSource(); n.buffer = this.noise; const f = c.createBiquadFilter();
      f.type = kind === 'hat' ? 'highpass' : 'bandpass'; f.frequency.value = kind === 'hat' ? 8000 : 1500; f.Q.value = kind === 'hat' ? 0.7 : 1;
      const g = c.createGain(), d = kind === 'hat' ? 0.04 : 0.18, a = kind === 'hat' ? 0.08 : 0.35;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(a, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      n.connect(f).connect(g).connect(this.musicBus); n.start(t, Math.random() * 2); n.stop(t + d + 0.02);
    }
  }

  // ---------------- announcer: one pre-recorded deep male voice (assets/vo), same on every device ----------------
  // lines live in vo.js; player names, cities and yard counts get stitched in like a real broadcast
  async loadVo() {
    if (this._voIdx) return this._voIdx;
    try { this._voIdx = new Set(await (await fetch(new URL('../assets/vo/index.json', import.meta.url))).json()); } catch (_) { this._voIdx = new Set(); }
    return this._voIdx;
  }
  clip(key) {
    this._clips = this._clips || new Map();
    if (!this._clips.has(key)) this._clips.set(key, fetch(new URL(`../assets/vo/${key}.ogg`, import.meta.url)).then(r => r.arrayBuffer()).then(b => this.ctx.decodeAudioData(b)).catch(() => null));
    return this._clips.get(key);
  }
  stopVoice() { (this._vsrc || []).forEach(s => { try { s.stop(); } catch (_) {} }); this._vsrc = []; this._vbusy = 0; }
  // say(lineId, { name, city, city2, n, n2, yds, pen }, urgent)
  async say(id, ctx = {}, urgent = false) {
    if (!this.announcer || this.muted || !this.ctx) return;
    const L = VO[id]; if (!L) return;
    const idx = await this.loadVo(); if (!idx.size) return;
    const now = this.ctx.currentTime;
    if (!urgent && this._vbusy > now) return;   // don't talk over yourself unless it matters
    const keyOf = p => {
      if (!p.startsWith('$')) return 'p_' + slug(p);
      const t = p.replace(/[^$a-z0-9]/gi, '').slice(1);
      const val = ctx[t]; if (val == null || val === '') return null;
      if (t === 'name') return 'n_' + slug(String(val).split(' ').pop());
      if (t === 'city' || t === 'city2') return 'c_' + slug(String(val));
      if (t === 'yds') return 'y_' + Math.min(99, Math.max(1, Math.round(val)));
      if (t === 'n' || t === 'n2') return 'num_' + Math.round(val);
      if (t === 'pen') return 'pen_' + slug(String(val));
      return null;
    };
    const ok = L.v.map(v => v.map(keyOf)).filter(ks => ks.every(k => k && idx.has(k)));
    if (!ok.length) return;
    const keys = ok[(Math.random() * ok.length) | 0];
    const tok = this._vtok = (this._vtok || 0) + 1;
    if (urgent) this.stopVoice();
    this._vbusy = now + 0.6;
    const bufs = await Promise.all(keys.map(k => this.clip(k)));
    if (tok !== this._vtok || bufs.some(b => !b)) return;
    if (!this.voBus) { this.voBus = this.ctx.createGain(); this.voBus.connect(this.master); }
    this.voBus.gain.value = 1.25;
    let t = this.ctx.currentTime + 0.03;
    this._vsrc = [];
    for (const b of bufs) { const s = this.ctx.createBufferSource(); s.buffer = b; s.connect(this.voBus); s.start(t); this._vsrc.push(s); t += b.duration + 0.02; }
    this._vbusy = t;
    if (L.hype && this.voiceBurst) { const t0 = this.ctx.currentTime; this.voiceBurst(t0 + 0.05, 1.1, 150, 0.16, 'oh'); this.voiceBurst(t0 + 0.2, 0.9, 175, 0.12, 'eh'); }   // crowd roars under the big calls
  }
  // turn a game message into a play-by-play call
  call(msg, cx = {}) {
    if (!msg) return;
    const sub = (msg.sub || '').split(' · ');
    const name = sub[0].replace(/[+-]?\d+ yds?/, '').trim(), t = msg.text;
    const c = { name, city: cx.team };
    if (t === 'TOUCHDOWN!') this.say('td', c, true);
    else if (t.startsWith('IT')) this.say('fg', c, true);
    else if (t === 'NO GOOD') this.say('fgMiss', c, true);
    else if (t === 'SACKED!') this.say('sack', c, true);
    else if (t === 'FIRST DOWN') this.say('first', c);
    else if (t.startsWith('GAIN OF')) { const n = +t.split(' ').pop(); c.yds = n; if (n >= 15) this.say('big', c); else if (n >= 7) this.say('mid', c); else if (Math.random() < 0.4) this.say('small', c); }
    else if (t.startsWith('LOSS')) this.say('loss', c);
    else if (t === 'INCOMPLETE') { if (Math.random() < 0.5) this.say('inc', c); }
    else if (t === 'PASS BROKEN UP' || t === 'SWATTED!') this.say('pbu', c);
    else if (t === 'EXTRA POINT GOOD') { if (Math.random() < 0.6) this.say('xp', c); }
    else if (t === 'EXTRA POINT NO GOOD') this.say('xpMiss', c, true);
    else if (t === '2-POINT GOOD!') this.say('two', c, true);
    else if (t === '2-POINT FAILED') this.say('twoMiss', c, true);
    else if (t === 'TURNOVER') this.say('to', c, true);
    else if (t === 'TURNOVER ON DOWNS') this.say('downs', c, true);
    else if (t === 'SAFETY!') this.say('safety', c, true);
    else if (t === 'HALFTIME') this.say('half', c, true);
    else if (t === 'OVERTIME') this.say('ot', c, true);
    else if (t === 'PUNT') { if (Math.random() < 0.5) this.say('punt', c); }
    else if (t === 'TOUCHBACK') { if (Math.random() < 0.5) this.say('tb', c); }
    else if (msg.pen) this.say('pen', { pen: t }, true);
    else if (t === 'OUT OF BOUNDS') { if (Math.random() < 0.3) this.say('oob', c); }
  }
  flashCall(text) {
    if (!text) return;
    const title = w => w.toLowerCase().replace(/\b\w/g, ch => ch.toUpperCase());
    let m;
    if ((m = text.match(/^FUMBLE BY (.+?)! (.+?) RECOVERS!$/))) this.say('fumbleBy', { city: title(m[1]), city2: title(m[2]) }, true);
    else if (text.startsWith('FUMBLE!') && text.includes('FALLS ON IT')) this.say('fumbleKeep', { city: title(text.replace('FUMBLE! ', '').replace(' FALLS ON IT', '')) }, true);
    else if (text === 'FUMBLE! BALL IS LOOSE') this.say('fumbleLoose', {}, true);
    else if (text.startsWith('INTERCEPTED')) this.say('pick', { name: text.replace('INTERCEPTED!', '').trim() }, true);
    else if (text === 'BROKEN TACKLE') { if (Math.random() < 0.5) this.say('broken'); }
    else if (text === 'ONE-HANDED CATCH!') this.say('onehand', {}, true);
  }
}
