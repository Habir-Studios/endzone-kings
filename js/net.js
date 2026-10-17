// Online 1v1: room codes + WebRTC data channels, signaled through Supabase Realtime.
// If a direct connection can't be made, falls back to relaying through Supabase Realtime.

const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }];

export function makeRoomCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = ''; for (let i = 0; i < 5; i++) s += A[(Math.random() * A.length) | 0];
  return s;
}

// --- signaling transports ---
export class SupabaseSignal {
  constructor(client, code) { this.client = client; this.code = code; this.cbs = []; }
  async open() {
    this.ch = this.client.channel('ek-room-' + this.code, { config: { broadcast: { self: false, ack: false } } });
    this.ch.on('broadcast', { event: 'sig' }, ({ payload }) => this.cbs.forEach(cb => cb(payload)));
    await new Promise((res, rej) => {
      const to = setTimeout(() => rej(new Error('Could not reach the game server (Supabase Realtime).')), 10000);
      this.ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') { clearTimeout(to); res(); }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { clearTimeout(to); rej(new Error('Realtime connection failed: ' + status)); }
      });
    });
  }
  on(cb) { this.cbs.push(cb); }
  send(payload) { if (this.ch) this.ch.send({ type: 'broadcast', event: 'sig', payload }); }
  close() { if (this.ch) { this.client.removeChannel(this.ch); this.ch = null; } }
}

// Same-browser signaling for local testing (?localnet=1): two tabs talk through BroadcastChannel.
export class LocalSignal {
  constructor(code) { this.code = code; this.cbs = []; }
  async open() { this.bc = new BroadcastChannel('ek-local-' + this.code); this.bc.onmessage = (e) => this.cbs.forEach(cb => cb(e.data)); }
  on(cb) { this.cbs.push(cb); }
  send(p) { if (this.bc) this.bc.postMessage(p); }
  close() { if (this.bc) { this.bc.close(); this.bc = null; } }
}

// --- peer ---
export class Peer {
  constructor(signal, role, info) {
    this.sig = signal; this.role = role; this.info = info; // info: {name, team}
    this.id = Math.random().toString(36).slice(2, 10);
    this.remote = null; this.mode = null; this.handlers = {};
    this.lastRx = Date.now(); this.closed = false; this.pending = [];
  }
  on(ev, fn) { this.handlers[ev] = fn; }
  emit(ev, ...a) { const f = this.handlers[ev]; if (f) f(...a); }

  async start() {
    await this.sig.open();
    this.sig.on((m) => this.onSignal(m));
    if (this.role === 'guest') {
      const hello = () => { if (!this.remote && !this.closed) { this.sig.send({ k: 'hello', from: this.id, info: this.info }); } };
      hello();
      this.helloTimer = setInterval(hello, 1500);
      this.joinTimeout = setTimeout(() => { if (!this.remote) { this.emit('error', 'No game found with that code.'); this.close(); } }, 15000);
    }
    this.hb = setInterval(() => {
      if (!this.mode) return;
      this.send({ t: 'ping' }, false);
      if (Date.now() - this.lastRx > 20000) { this.emit('close', 'Opponent disconnected'); this.close(); }
    }, 1000);
  }

  onSignal(m) {
    if (this.closed || !m || m.from === this.id) return;
    if (m.to && m.to !== this.id) return;
    if (this.role === 'host') {
      if (m.k === 'hello') {
        if (this.remote && this.remote.id !== m.from) { this.sig.send({ k: 'full', to: m.from, from: this.id }); return; }
        if (this.remote) return;
        this.remote = { id: m.from, info: m.info };
        this.sig.send({ k: 'welcome', to: m.from, from: this.id, info: this.info });
        this.emit('joined', m.info);
        this.setupRTC(true);
      }
    } else {
      if (m.k === 'welcome' && !this.remote) {
        clearInterval(this.helloTimer); clearTimeout(this.joinTimeout);
        this.remote = { id: m.from, info: m.info };
        this.emit('joined', m.info);
        this.setupRTC(false);
      } else if (m.k === 'full') { clearInterval(this.helloTimer); this.emit('error', 'That game is already full.'); this.close(); }
    }
    if (!this.remote || m.from !== this.remote.id) return;
    if (m.k === 'sdp') this.onSDP(m.sdp);
    else if (m.k === 'ice' && this.pc) { this.pc.addIceCandidate(m.c).catch(() => {}); }
    else if (m.k === 'relay') this.useRelay();
    else if (m.k === 'msg' && this.mode === 'relay') this.rx(m.d, true);
  }

  setupRTC(initiator) {
    if (typeof RTCPeerConnection === 'undefined') { this.sig.send({ k: 'relay', to: this.remote.id, from: this.id }); this.useRelay(); return; }
    const pc = this.pc = new RTCPeerConnection({ iceServers: ICE });
    pc.onicecandidate = (e) => { if (e.candidate) this.sig.send({ k: 'ice', to: this.remote.id, from: this.id, c: e.candidate.toJSON() }); };
    const wire = (ch) => {
      ch.onopen = () => this.checkOpen();
      ch.onmessage = (e) => { try { this.rx(JSON.parse(e.data), ch.label === 'ctl'); } catch (_) {} };
      ch.onclose = () => { if (this.mode === 'p2p' && !this.closed) { this.emit('close', 'Connection lost'); this.close(); } };
    };
    if (initiator) {
      this.ctl = pc.createDataChannel('ctl', { ordered: true });
      this.fast = pc.createDataChannel('fast', { ordered: false, maxRetransmits: 0 });
      wire(this.ctl); wire(this.fast);
      pc.createOffer().then(o => pc.setLocalDescription(o)).then(() => this.sig.send({ k: 'sdp', to: this.remote.id, from: this.id, sdp: pc.localDescription.toJSON() }));
    } else {
      pc.ondatachannel = (e) => { if (e.channel.label === 'ctl') this.ctl = e.channel; else this.fast = e.channel; wire(e.channel); };
    }
    // if no direct link in time, relay through the signaling server
    this.rtcTimer = setTimeout(() => {
      if (!this.mode) { this.sig.send({ k: 'relay', to: this.remote.id, from: this.id }); this.useRelay(); }
    }, 9000);
  }

  async onSDP(sdp) {
    const pc = this.pc; if (!pc) return;
    await pc.setRemoteDescription(sdp);
    if (sdp.type === 'offer') {
      const a = await pc.createAnswer(); await pc.setLocalDescription(a);
      this.sig.send({ k: 'sdp', to: this.remote.id, from: this.id, sdp: pc.localDescription.toJSON() });
    }
  }

  checkOpen() {
    if (this.mode) return;
    if (this.ctl && this.ctl.readyState === 'open' && this.fast && this.fast.readyState === 'open') {
      this.mode = 'p2p'; clearTimeout(this.rtcTimer); this.lastRx = Date.now();
      this.emit('open', 'p2p');
      this.flush();
    }
  }

  useRelay() {
    if (this.mode) return;
    this.mode = 'relay'; clearTimeout(this.rtcTimer); this.lastRx = Date.now();
    if (this.pc) { try { this.pc.close(); } catch (_) {} this.pc = null; }
    this.emit('open', 'relay');
    this.flush();
  }

  flush() { const p = this.pending; this.pending = []; p.forEach(([m, r]) => this.send(m, r)); }

  rx(msg, reliable) {
    this.lastRx = Date.now();
    if (msg.t === 'ping') return;
    this.emit('message', msg, reliable);
  }

  // reliable=true for events, false for frequent state
  send(msg, reliable = true) {
    if (this.closed) return;
    if (!this.mode) { if (reliable) this.pending.push([msg, reliable]); return; }
    if (this.mode === 'p2p') {
      const ch = reliable ? this.ctl : this.fast;
      if (ch && ch.readyState === 'open') { try { ch.send(JSON.stringify(msg)); } catch (_) {} }
    } else {
      // relay is rate-limited: drop some unreliable traffic
      if (!reliable) { const now = performance.now(); if (now - (this._lastRelay || 0) < 95) return; this._lastRelay = now; }
      this.sig.send({ k: 'msg', to: this.remote.id, from: this.id, d: msg });
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.hb); clearInterval(this.helloTimer); clearTimeout(this.rtcTimer); clearTimeout(this.joinTimeout);
    try { if (this.ctl && this.ctl.readyState === 'open') this.ctl.send(JSON.stringify({ t: 'bye' })); } catch (_) {}
    if (this.pc) { try { this.pc.close(); } catch (_) {} }
    setTimeout(() => this.sig.close(), 200);
  }
}
