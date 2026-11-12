/* =====================================================================================================================
   v0.0.19: BACKYARD ACTIVITIES  (Buzz Tag, Hide-a-Crumb, Ghost Wings, Backyard Field Guide)
   One activity coordinator per room: the race host rule (lowest connected, still-sending slot). Its snapshot ('as') has a
   schema version, room, epoch/revision, host slot, Tag state, crumb challenges and find receipts. Requests ('aq') are
   separate from accepted state, are attributed to the sending connection's participant id (from its 'ah' hello, never the
   payload's claim), and are deduped by operation id. Activity state is independent of the race ledger and of tuning.
   Personal progress (my crumb, my finds, imported crumbs, journal, ghosts, options) lives in this browser only.
   ===================================================================================================================== */
const ACT_KEY = 'likeflies.v19.act', GHOST_KEY = 'likeflies.v19.ghosts', ACT_SCHEMA = 1;
const ACT_WORLD = 'LFyard15-' + (typeof YS === 'number' ? YS : 1);           // crumb codes only work in this yard layout
const ACT_RULES = {reachMul:1, delay:2, protect:4, rewind:0.25, span:0.6, maxAge:0.5};   // a pose older than 0.5 s never tags; each pair is swept gap-free, rewinding at most 0.6 s of commonly covered time             // Buzz Tag rules (room-wide defaults)
const CRUMB_HINTS = ['Near something blue', 'Up above the lawn', 'Look underneath', 'Somewhere warm', 'By the garden', 'Near something tall', 'Close to the house', 'Where food is'];
const actClean = (s, n) => String(s == null ? '' : s).replace(/[<>&"'`\\\u0000-\u001f]/g, '').slice(0, n || 24);
const actFin = a => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);
const actStore = (() => { const d = {mine:null, found:[], imported:[], guide:{}, share:false, ghostMode:'off', scan:false, myFinds:0};
  const s = store.get(ACT_KEY, {}); const o = Object.assign(d, s && typeof s === 'object' ? s : {});
  if (!Array.isArray(o.found)) o.found = []; if (!Array.isArray(o.imported)) o.imported = []; if (!o.guide || typeof o.guide !== 'object') o.guide = {};
  o.found = o.found.filter(x => typeof x === 'string').slice(-200); o.imported = o.imported.slice(0, 8);
  if (!['off', 'mine', 'room'].includes(o.ghostMode)) o.ghostMode = 'off'; o.share = !!o.share; o.scan = !!o.scan; return o; })();
function actSave(){ try{ localStorage.setItem(ACT_KEY, JSON.stringify(actStore)); ACT.storeErr = ''; }catch(e){ ACT.storeErr = 'could not save on this browser'; } }
const ACT = {clk:new Map(), rtt:new Map(), snap:null, slotPid:new Map(), ops:[], opSet:new Set(), wasHost:false, dirty:false, poses:new Map(), host:{rdyUntil:0, protUntil:0, inelig:{}, joinT:{}},
  crumbMode:'idle', preview:null, hintIdx:0, sel:0, search:null, searchT0:0, dwell:0, band:'', chirpT:0, toneT:0, why:'', lastSeen:null, toastT:0,
  ghost:null, ghostWhy:'', gap:null, rec:null, shared:new Map(), gq:null, gqT:0, scanTgt:null, scanP:0, scanT:0, guideReady:false, storeErr:'', adoptT:0, events:[]};
function actLog(e){ ACT.events.push(Object.assign({at:+clock.elapsedTime.toFixed(2)}, e)); if (ACT.events.length > 120) ACT.events.shift(); }
function actFreshSnap(){ return {v:ACT_SCHEMA, room:net.room || '', ep:0, rev:0, hs:mySlot(), tag:{mem:{}, it:null, pas:{}, lastIt:{}, rdyLeft:0, prot:null, sep:[], rc:''}, crumbs:{}, finds:{}, names:{}}; }
ACT.snap = actFreshSnap();
const actIsHost = () => !net.peer || !net.room || raceHost() === mySlot();
function actTone(f1, f2, dur, vol){
  if (!audio || !tune.sound) return; const now = performance.now(); if (now - ACT.toneT < 140) return; ACT.toneT = now;   // volume and rate limited, original procedural tones
  try{ const ac = audio.ac, t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain(); o.type = 'triangle';
    o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + dur); g.gain.setValueAtTime(vol || 0.07, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur + 0.05);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + 0.08); }catch(e){}
}
function actToast(text, secs){ popup(text, secs || 2.4); ACT.toastT = clock.elapsedTime; }
/* ---------- my pose (same point the network sends: head in flight, body on a surface) ---------- */
const actV = new V3(), actV2 = new V3(), actV3 = new V3();
function actMyPose(out){ if (game.role === 'fly' && game.crawl) return out.copy(game.crawl.C); return camera.getWorldPosition(out); }
function actMyEligible(now){ return game.role === 'fly' && state !== 'menu' && !game.out && !(game.deadUntil > now); }
function actPidOfSlot(j){ return j === mySlot() ? racePid : ACT.slotPid.get(j) || null; }
function actSlotOfPid(pid){ if (pid === racePid) return mySlot(); for (const [j, p] of ACT.slotPid) if (p === pid && net.remotes.has(j)) return j; return null; }
/* recent pose samples per participant (coordinator uses them for swept contact); a jump clears history */
/* v0.0.19b: remote samples are placed at the SENDER's time (mapped to my clock with the smallest delay seen recently),
   not at arrival, so a remote fly and my fly crossing at the same moment line up even when packets arrive late or bunched. */
function actPushRemote(pid, recvT, sendT, p, recvP){
  if (!pid) return; let t = recvT;
  if (typeof sendT === 'number' && Number.isFinite(sendT)){
    // real-time clocks on both ends (game clocks can run at different rates); smallest delay over the last 3 s removes arrival jitter,
    // half the measured round trip (max 150 ms) removes the base delay, and no sample is placed more than 0.3 s before it arrived
    if (recvP == null) recvP = performance.now() / 1000;
    const off = recvP - sendT; let R = ACT.clk.get(pid); if (!R){ R = []; ACT.clk.set(pid, R); }
    R.push({off, at:recvP}); while (R.length > 60 || (R.length > 1 && recvP - R[0].at > 3)) R.shift();
    let mn = Infinity; for (const r of R) if (r.off < mn) mn = r.off;
    const lat = Math.min(0.15, Math.max(0, (ACT.rtt.get(pid) || 0) / 2)), age = Math.max(0, Math.min(0.3, off - mn + lat));
    t = recvT - age;
  }
  actPushPose(pid, t, p);
}
function actPushPose(pid, t, p){
  if (!pid || !p) return; let b = ACT.poses.get(pid); if (!b){ b = []; ACT.poses.set(pid, b); }
  const L = b[b.length - 1];
  if (L){ const dt = Math.max(1e-3, t - L.t), d = Math.hypot(p.x - L.x, p.y - L.y, p.z - L.z); if (d > 70 * dt + 1.5) b.length = 0; else if (t - L.t < 0.02) return; }
  if (L && t <= L.t) return; b.push({t, x:p.x, y:p.y, z:p.z}); while (b.length > 2 && t - b[0].t > 1.2) b.shift();   // always keep the last two samples (freshness is checked separately)
}
function actPoseAt(b, t, out){
  if (!b.length) return null; if (t <= b[0].t) return out.set(b[0].x, b[0].y, b[0].z);
  for (let i = 1; i < b.length; i++) if (b[i].t >= t){ const a = b[i - 1], c = b[i], u = (t - a.t) / Math.max(1e-6, c.t - a.t); return out.set(a.x + (c.x - a.x) * u, a.y + (c.y - a.y) * u, a.z + (c.z - a.z) * u); }
  const L = b[b.length - 1]; return out.set(L.x, L.y, L.z);
}
/* closest approach of two flies over time BOTH paths actually cover (never past either fly's newest sample), from
   piecewise-linear pose paths. `from` lets the coordinator sweep each pair gap-free: every covered moment is checked once,
   rewinding at most ACT_RULES.span. Positions older than ACT_RULES.maxAge never tag. */
const swA = new V3(), swB = new V3(), swR0 = new V3(), swR1 = new V3(), swC = new V3(), swBest = [new V3(), new V3()];
function actSwept(pa, pb, now, win, from){
  const A = ACT.poses.get(pa), B = ACT.poses.get(pb);
  if (!A || !B || A.length < 2 || B.length < 2) return {d:Infinity};
  const t1 = Math.min(A[A.length - 1].t, B[B.length - 1].t);
  if (now - t1 > ACT_RULES.maxAge) return {d:Infinity, stale:true};                    // stale pose: never a tag
  const t0 = Math.max(t1 - win, A[0].t, B[0].t, from == null ? -Infinity : from);
  if (!(t1 > t0)) return {d:Infinity, t1, empty:true};
  const ts = [t0]; for (const s of A) if (s.t > t0 && s.t < t1) ts.push(s.t); for (const s of B) if (s.t > t0 && s.t < t1) ts.push(s.t);
  ts.push(t1); ts.sort((x, y) => x - y);
  let best = Infinity;
  for (let i = 1; i < ts.length; i++){
    actPoseAt(A, ts[i - 1], swA); actPoseAt(B, ts[i - 1], swB); swR0.subVectors(swB, swA); const a0 = swA.clone();
    actPoseAt(A, ts[i], swA); actPoseAt(B, ts[i], swB); swR1.subVectors(swB, swA);
    swC.subVectors(swR1, swR0); const L2 = swC.lengthSq(); const u = L2 < 1e-12 ? 0 : Math.max(0, Math.min(1, -swR0.dot(swC) / L2));
    const d = swR0.clone().addScaledVector(swC, u).length();
    if (d < best){ best = d; swBest[0].copy(a0).lerp(swA, u); swBest[1].copy(swBest[0]).add(swR0.clone().addScaledVector(swC, u)); }
  }
  return {d:best, a:swBest[0].clone(), b:swBest[1].clone(), t1};
}
/* one pair, gap-free: continue from where the last check ended, never into the get-ready window or a protection window */
function actSweepPair(it, p, now, notBefore){
  const H = ACT.host, key = it + '>' + p; H.swT = H.swT || {};
  const sw = actSwept(it, p, now, ACT_RULES.span, Math.max(H.swT[key] == null ? -Infinity : H.swT[key], notBefore == null ? -Infinity : notBefore));
  if (sw.t1 != null) H.swT[key] = Math.max(H.swT[key] == null ? -Infinity : H.swT[key], sw.t1);
  return sw;
}
function actFsOf(pid){ if (pid === racePid) return tune.flyScale; const j = actSlotOfPid(pid), r = j != null ? net.remotes.get(j) : null; return r ? (r.fs || 1) : 1; }
/* tag reach: about one fly body length at the SMALLER of the two flies' sizes, so a bigger size slider never wins reach */
const actReach = (pa, pb) => 0.55 * Math.min(actFsOf(pa), actFsOf(pb)) * ACT_RULES.reachMul;
function actEligible(pid, now){
  if (pid === racePid) return actMyEligible(now);
  const j = actSlotOfPid(pid), r = j != null ? net.remotes.get(j) : null;
  return !!(r && r.kind === 'fly' && r.on === 1 && !r.out && !r.dd && now - r.recv < 1.0);
}
/* ---------- snapshot transport ---------- */
function actSnapMsg(){
  const S = ACT.snap, now = clock.elapsedTime, T = S.tag;
  T.rdyLeft = Math.max(0, +(ACT.host.rdyUntil - now).toFixed(2)); if (T.prot) T.prot.left = Math.max(0, +(ACT.host.protUntil - now).toFixed(2));
  return Object.assign({t:'as'}, JSON.parse(JSON.stringify(S)));
}
function actBroadcast(){ if (!net.peer) return; const m = actSnapMsg(); const s = JSON.stringify(m); if (s.length > 48000){ actLog({k:'snap-too-big', n:s.length}); return; } for (const c of net.conns.values()) if (c.open){ try{ c.send(m); }catch(e){} } }
function actBump(){ ACT.snap.rev++; ACT.snap.hs = mySlot(); ACT.snap.room = net.room || ''; ACT.dirty = true; }
function actOnConnOpen(conn){ try{ conn.send({t:'ah', pid:racePid, n:actClean(net.name || 'Fly', 12)}); if (actIsHost() && ACT.snap.rev > 0) conn.send(actSnapMsg()); }catch(e){} }
function actValidSnap(d){
  const isO = o => !!o && typeof o === 'object' && !Array.isArray(o), str = (x, n) => typeof x === 'string' && x.length <= n, fin = (x, lo, hi) => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;
  if (!isO(d) || d.v !== ACT_SCHEMA || !Number.isInteger(d.ep) || !Number.isInteger(d.rev) || !Number.isInteger(d.hs) || d.ep < 0 || d.rev < 0 || d.ep > 1e6 || d.rev > 1e9) return false;
  if (!str(d.room || '', 64) || (d.room || '') !== (net.room || '')) return false;
  const T = d.tag; if (!isO(T) || !isO(T.mem) || !isO(T.pas) || !isO(T.lastIt) || !Array.isArray(T.sep)) return false;
  const mk = Object.keys(T.mem); if (mk.length > 8 || !mk.every(k => str(k, 40) && isO(T.mem[k]))) return false;
  if (Object.keys(T.pas).length > 32 || !Object.entries(T.pas).every(([k, v]) => str(k, 40) && Number.isInteger(v) && v >= 0 && v < 1e6)) return false;
  if (Object.keys(T.lastIt).length > 32 || !Object.values(T.lastIt).every(v => fin(v, 0, 1e9))) return false;
  if (T.sep.length > 12 || !T.sep.every(x => str(x, 90))) return false;
  if (!(T.it === null || (str(T.it, 40) && T.mem[T.it]))) return false;
  if (!(T.rc === undefined || str(T.rc, 40)) || !(T.rdyLeft === undefined || fin(T.rdyLeft, 0, 30))) return false;
  if (!(T.prot == null || (isO(T.prot) && str(T.prot.pid, 40) && (T.prot.left === undefined || fin(T.prot.left, 0, 30))))) return false;
  if (!isO(d.names) || Object.keys(d.names).length > 32 || !Object.values(d.names).every(v => str(v, 24))) return false;
  if (!isO(d.crumbs) || Object.keys(d.crumbs).length > 8 || !isO(d.finds) || Object.keys(d.finds).length > 8) return false;
  for (const [k, c] of Object.entries(d.crumbs)){ const v = actValidCrumb(c, false); if (!v || v.id !== k) return false; d.crumbs[k] = v; }
  for (const [k, l] of Object.entries(d.finds)) if (!d.crumbs[k] || !Array.isArray(l) || l.length > 16 || !l.every(x => str(x, 40))) return false;
  return true;
}
function actOnSnap(j, d){
  const S = ACT.snap;
  if (!actValidSnap(d)) { actLog({k:'snap-reject', why:'malformed', j}); return; }
  if (d.hs !== j){ actLog({k:'snap-reject', why:'sender is not the stated coordinator', j, hs:d.hs}); return; }
  if (j !== raceHost()){ ACT.pendSnap = {j, d, t:clock.elapsedTime}; actLog({k:'snap-hold', why:'sender is not my current coordinator', j}); return; }   // kept briefly in case my view of the coordinator is a moment behind
  if (!(d.ep > S.ep || (d.ep === S.ep && d.rev > S.rev) || (d.ep === S.ep && d.rev === S.rev && d.hs < S.hs))) return;   // old or reordered: ignored
  const prev = ACT.lastSeen || S; delete d.t; ACT.snap = d; ACT.adoptT = clock.elapsedTime; ACT.lastSeen = JSON.parse(JSON.stringify(d));
  ACT.host.rdyUntil = clock.elapsedTime + (d.tag.rdyLeft || 0); ACT.host.protUntil = clock.elapsedTime + ((d.tag.prot && d.tag.prot.left) || 0);
  actAfterChange(prev, d);
}
/* what changed for me: toasts and tones only (never award anything from a snapshot) */
function actAfterChange(prev, S){
  if (!S || !S.tag) return; if (!prev || !prev.tag) prev = actFreshSnap();   // v0.0.19b: the first change of a session no longer throws
  const me = racePid, pT = prev.tag, T = S.tag;
  if (T.rc && T.rc !== pT.rc && T.it){
    const nm = p => actClean(S.names[p] || 'a fly', 16);
    if (T.it === me){ actToast("You're IT! Get ready... " + ACT_RULES.delay + ' s', 2.6); actTone(330, 660, 0.18, 0.08); }
    else if (pT.it === me){ actToast('You tagged ' + nm(T.it) + '!', 2.4); actTone(660, 990, 0.15, 0.08); }
    else if (T.mem[me]) actToast(nm(pT.it) + ' tagged ' + nm(T.it), 1.8);
    ACT.pulseT = clock.elapsedTime;
  } else if (T.it !== pT.it && T.it === me && T.mem[me]){ actToast("You're IT (picked to start). Get ready...", 2.6); actTone(330, 660, 0.18, 0.08); }
  for (const [cid, list] of Object.entries(S.finds || {})){
    const was = (prev.finds && prev.finds[cid]) || [];
    if (list.includes(me) && !was.includes(me)){ if (!actStore.found.includes(cid)){ actStore.found.push(cid); actStore.myFinds = (actStore.myFinds || 0) + 1; actSave(); }
      const c = S.crumbs[cid]; actToast('Found ' + actClean(c ? c.n : 'a', 16) + "'s crumb! Hide your own next?", 3); actTone(880, 1760, 0.2, 0.08); ACT.sparkT = clock.elapsedTime; ACT.search = null; }
  }
  if (actStore.mine && net.room && !S.crumbs[actStore.mine.id] && !ACT.minePub){ ACT.minePub = true; actRequest({op:'hide', ch:actStore.mine}); }   // my browser-saved crumb joins the room
  actDomDirty();
}
let actOpN = 0;
function actRequest(o){
  o.id = racePid.slice(-6) + '.' + Date.now().toString(36) + '.' + (actOpN++);
  if (actIsHost()){ actApply(racePid, o, true); return; }
  const h = raceHost(), c = net.conns.get(h);
  if (c && c.open){ try{ c.send(Object.assign({t:'aq'}, o)); }catch(e){} }
}
function actOnMessage(j, d){
  if (!d || typeof d !== 'object') return;
  if (d.t === 'ah'){ if (typeof d.pid === 'string' && d.pid.length <= 40 && !ACT.slotPid.has(j)){ ACT.slotPid.set(j, d.pid); ACT.snap.names[d.pid] = ACT.snap.names[d.pid] || actClean(d.n, 12); } return; }
  if (d.t === 'as'){ actOnSnap(j, d); return; }
  if (d.t === 'ap'){ const c = net.conns.get(j); if (c && c.open && Number.isFinite(d.s)) try{ c.send({t:'aP', s:d.s}); }catch(e){} return; }   // v0.0.19b: echo the coordinator's ping
  if (d.t === 'aP'){ const pid = ACT.slotPid.get(j), rt = performance.now() / 1000 - d.s; if (pid && Number.isFinite(rt) && rt >= 0 && rt < 2){ const o = ACT.rtt.get(pid); ACT.rtt.set(pid, o == null ? rt : o * 0.7 + rt * 0.3); } return; }
  if (d.t === 'aq'){ const pid = ACT.slotPid.get(j); if (!pid || !actIsHost()) return; actApply(pid, d, false); return; }   // identity comes from the connection, not the payload
  if (d.t === 'gq' || d.t === 'gc' || d.t === 'gn') ghostOnMessage(j, d);
}
/* ---------- coordinator: apply one request ---------- */
function actApply(pid, d, local){
  const S = ACT.snap, T = S.tag, now = clock.elapsedTime;
  if (typeof d.id !== 'string' || d.id.length > 48 || ACT.opSet.has(d.id)) return;
  ACT.opSet.add(d.id); ACT.ops.push(d.id); if (ACT.ops.length > 300) ACT.opSet.delete(ACT.ops.shift());
  const name = actClean(pid === racePid ? (net.name || 'Fly ' + mySlot()) : (S.names[pid] || 'a fly'), 12); S.names[pid] = name;
  if (d.op === 'join'){ if (T.mem[pid] || Object.keys(T.mem).length >= 8) return; T.mem[pid] = {n:name}; T.pas[pid] = T.pas[pid] || 0; ACT.host.joinT[pid] = now; actLog({k:'join', pid}); actBump(); }
  else if (d.op === 'leave'){ if (!T.mem[pid]) return; delete T.mem[pid]; if (T.it === pid){ T.it = null; } actLog({k:'leave', pid}); actBump(); }
  else if (d.op === 'hide' || d.op === 'import'){
    const ch = actValidCrumb(d.ch, true); if (!ch) return;
    if (d.op === 'hide'){ ch.by = pid; ch.n = name; }
    ch.own = pid; ch.imp = d.op === 'import' ? 1 : 0;
    if (S.crumbs[ch.id] && S.crumbs[ch.id].own !== pid) return;                       // nobody else can replace or move it
    if (d.op === 'hide') for (const [k, c] of Object.entries(S.crumbs)) if (c.own === pid && !c.imp && k !== ch.id) delete S.crumbs[k];   // one active authored crumb each
    if (!S.crumbs[ch.id] && Object.keys(S.crumbs).length >= 8) return;
    S.crumbs[ch.id] = ch; S.finds[ch.id] = S.finds[ch.id] || []; actLog({k:d.op, pid, cid:ch.id}); actBump();
  }
  else if (d.op === 'unhide'){ const c = S.crumbs[d.cid]; if (!c || c.own !== pid) return; delete S.crumbs[d.cid]; delete S.finds[d.cid]; actBump(); }
  else if (d.op === 'find'){
    const c = S.crumbs[d.cid]; if (!c) return; const list = S.finds[d.cid] = S.finds[d.cid] || [];
    if (pid === c.by || list.includes(pid) || list.length >= 16) return;   // the original hider never finds their own; an importer (own) may seek it; one receipt per seeker
    const b = ACT.poses.get(pid), L = b && b[b.length - 1];
    if (!L || now - L.t > 0.6) { actLog({k:'find-reject', why:'no fresh pose', pid}); return; }
    actV.set(L.x, L.y, L.z); actV2.fromArray(c.p).addScaledVector(actV3.fromArray(c.nrm), 0.05);
    if (actV.distanceTo(actV2) > crumbFindR(actFsOf(pid)) * 1.6 || occluded(actV, actV2)){ actLog({k:'find-reject', why:'not close/visible', pid}); return; }
    list.push(pid); actLog({k:'find', pid, cid:d.cid}); actBump();
  }
}
/* ---------- coordinator tick: membership, IT choice, swept contact ---------- */
function actHostTick(now){
  const S = ACT.snap, T = S.tag, H = ACT.host;
  if (!ACT.wasHost){ ACT.wasHost = true; if (net.peer && net.room && (S.rev > 0 || S.ep > 0)){ S.ep++; actBump(); actLog({k:'host-takeover', ep:S.ep}); } }
  // members who are gone (no connection for the presence timeout) leave; eligibility is tracked separately
  for (const pid of Object.keys(T.mem)){ if (pid !== racePid && actSlotOfPid(pid) == null){ delete T.mem[pid]; if (T.it === pid) T.it = null; actLog({k:'gone', pid}); actBump(); } }
  const mem = Object.keys(T.mem), elig = mem.filter(p => actEligible(p, now) && now - (H.joinT[p] || -9) > 1.5);
  if (T.it && !T.mem[T.it]) T.it = null;
  if (T.it && !actEligible(T.it, now)){ H.inelig[T.it] = H.inelig[T.it] || now; } else if (T.it) delete H.inelig[T.it];
  const adminSwap = T.it && H.inelig[T.it] && now - H.inelig[T.it] > 3;
  if ((!T.it || adminSwap) && elig.length >= 2){                                         // pick IT: least recently IT, then id order; never award a pass
    const pool = elig.filter(p => p !== T.it).sort((a, b) => (T.lastIt[a] || 0) - (T.lastIt[b] || 0) || (a < b ? -1 : 1));
    if (pool.length){ const was = T.it; T.it = pool[0]; T.lastIt[T.it] = S.rev + 1; H.rdyUntil = now + ACT_RULES.delay; T.prot = null; T.rc = ''; delete H.inelig[was]; actLog({k:'it-admin', it:T.it, was}); actBump(); }
  }
  if (!T.it || elig.length < 2 || !elig.includes(T.it) || now < H.rdyUntil) return;
  for (const p of elig){
    if (p === T.it) continue;
    if (T.prot && T.prot.pid === p && now < H.protUntil) continue;                     // the previous IT gets a real escape
    const reach = actReach(T.it, p), key = T.it < p ? T.it + '|' + p : p + '|' + T.it;
    const sw = actSweepPair(T.it, p, now, Math.max(H.rdyUntil, T.prot && T.prot.pid === p ? H.protUntil : -Infinity));   // nothing before IT was ready or while this fly was protected
    if (T.sep.includes(key)){ if (sw.d > 2 * reach && sw.d < Infinity) T.sep = T.sep.filter(k => k !== key); continue; }   // the same pair must separate before a fresh contact
    if (!(sw.d <= reach)) continue;
    if (occluded(sw.a, sw.b)){ actLog({k:'tag-blocked', it:T.it, p}); continue; }
    const was = T.it; T.pas[was] = (T.pas[was] || 0) + 1; T.it = p; T.lastIt[p] = S.rev + 1;
    T.rc = 'T' + S.ep + '.' + (S.rev + 1); T.prot = {pid:was, left:ACT_RULES.protect}; H.protUntil = now + ACT_RULES.protect; H.rdyUntil = now + ACT_RULES.delay; H.swT = {};
    if (!T.sep.includes(key)) T.sep.push(key); T.sep = T.sep.slice(-12);
    actLog({k:'tag', from:was, to:p, d:+sw.d.toFixed(3), reach:+reach.toFixed(3)});
    actBump(); break;
  }
}
/* ---------- Buzz Tag: local actions and visuals ---------- */
const actInTag = () => !!ACT.snap.tag.mem[racePid];
function actTagJoin(){
  if (game.role !== 'fly'){ actToast('Buzz Tag is for flies. Switch to Fly first.'); return; }
  ACT.wantTag = true; if (race.phase === 'running') actToast('Buzz Tag on: your race trial was stopped. Leave Tag to race again.', 3);
  raceOff('playing Buzz Tag'); actRequest({op:'join'}); actDomDirty();
}
function actTagLeave(why){ ACT.wantTag = false; if (actInTag() || ACT.snap.tag.mem[racePid] !== undefined) actRequest({op:'leave'}); if (why) actToast('Left Buzz Tag: ' + why, 2.2); actDomDirty(); }
const tagMarks = new Map();
const tagHaloMat = new THREE.MeshBasicMaterial({color:0xffb020, transparent:true, opacity:0.75, depthWrite:false}), tagRunMat = new THREE.MeshBasicMaterial({color:0x3aa0ff, transparent:true, opacity:0.9, depthWrite:false});
tagHaloMat.userData.noRetro = true; tagRunMat.userData.noRetro = true;
const tagHaloGeo = new THREE.TorusGeometry(0.36, 0.035, 6, 24), tagDotGeo = new THREE.OctahedronGeometry(0.06, 0);
function actBadge(text, color){ const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96; const g = cv.getContext('2d');
  g.fillStyle = color; g.beginPath(); if (g.roundRect) g.roundRect(6, 10, 244, 76, 30); else g.rect(6, 10, 244, 76); g.fill();
  g.fillStyle = '#1a1206'; g.font = 'bold 54px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(text, 128, 68);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(cv), transparent:true, depthTest:true})); sp.material.userData.noRetro = true; sp.scale.set(0.36, 0.135, 1); return sp; }
function actTagVisuals(now){
  const T = ACT.snap.tag, show = actInTag() || ACT.wantTag;
  const want = new Set();
  if (show) for (const pid of Object.keys(T.mem)){
    if (pid === racePid) continue; const j = actSlotOfPid(pid), r = j != null ? net.remotes.get(j) : null; if (!r || r.kind !== 'fly' || !r.g.visible) continue;
    want.add(pid); let m = tagMarks.get(pid);
    if (!m){ m = {g:new THREE.Group(), halo:new THREE.Mesh(tagHaloGeo, tagHaloMat), dot:new THREE.Mesh(tagDotGeo, tagRunMat), badge:actBadge('IT', '#ffb020')}; m.g.add(m.halo, m.dot, m.badge); m.g.traverse(o => { o.frustumCulled = false; }); scene.add(m.g); tagMarks.set(pid, m); }
    const it = T.it === pid, fs = r.fs || 1;
    m.g.position.copy(r.pos); m.g.scale.setScalar(fs);                                   // a marker beside the avatar: never scales or moves the fly itself
    m.halo.visible = it; m.badge.visible = it; m.dot.visible = !it;
    if (it){ m.halo.rotation.set(Math.PI / 2, 0, now * 2); const k = 1 + 0.12 * Math.sin(now * 7); m.halo.scale.set(k, k, k); m.badge.position.set(0, 0.62, 0); }
    else m.dot.position.set(0, 0.42, 0);
  }
  for (const [pid, m] of tagMarks) if (!want.has(pid)){ scene.remove(m.g); tagMarks.delete(pid); }
}
function actTagHud(now){
  const T = ACT.snap.tag; if (!actInTag() && !ACT.wantTag) return '';
  if (!actInTag()) return 'Buzz Tag: joining...';
  const n = Object.keys(T.mem).length, nm = p => actClean(ACT.snap.names[p] || 'a fly', 12);
  if (n < 2) return 'Buzz Tag: waiting for another fly · Leave in Activities';
  const elig = Object.keys(T.mem).filter(p => p === racePid ? actMyEligible(now) : true).length;
  if (!T.it) return 'Buzz Tag: picking IT...';
  const rdy = Math.max(0, ACT.host.rdyUntil - now), passes = T.pas[racePid] || 0;
  if (T.it === racePid) return rdy > 0 ? "YOU'RE IT · get ready " + rdy.toFixed(1) + ' s' : "YOU'RE IT · touch another fly · passes " + passes;
  const j = actSlotOfPid(T.it), r = j != null ? net.remotes.get(j) : null; actMyPose(actV);
  const dist = r ? actV.distanceTo(r.pos) : null, prot = T.prot && T.prot.pid === racePid && now < ACT.host.protUntil ? ' · safe ' + (ACT.host.protUntil - now).toFixed(1) + ' s' : '';
  return 'Buzz Tag: ' + nm(T.it) + ' is IT' + (rdy > 0 ? ' (ready in ' + rdy.toFixed(1) + ' s)' : '') + (dist != null ? ' · ' + dist.toFixed(0) + ' m' : '') + prot + ' · passes ' + passes;
}
/* ---------- Hide-a-Crumb ---------- */
const crumbGeo = new THREE.OctahedronGeometry(1, 0); crumbGeo.scale(1, 0.45, 0.8);
const crumbMat = new THREE.MeshLambertMaterial({color:0xffc31f, emissive:0x6a4500}), crumbGhostMat = new THREE.MeshBasicMaterial({color:0xffe27a, transparent:true, opacity:0.55, depthWrite:false});
const sparkMat = new THREE.MeshBasicMaterial({color:0xfff6c0, transparent:true, opacity:0.9, depthWrite:false}); sparkMat.userData.noRetro = true;
const crumbFindR = fs => 0.5 + 0.6 * fs;
function actMakeCrumb(preview){
  const g = new THREE.Group(), m = new THREE.Mesh(crumbGeo, preview ? crumbGhostMat : crumbMat); m.scale.setScalar(0.09); g.add(m);
  const sp = [0, 1, 2, 3].map(i => { const s = new THREE.Mesh(tagDotGeo, sparkMat); s.scale.setScalar(0.25); g.add(s); return s; }); g.userData.sp = sp; g.userData.m = m;
  g.traverse(o => { o.frustumCulled = false; }); scene.add(g); return g;
}
function actLandmark(p){ let best = '', bd = 1e9; for (const so of solids){ const l = so.label || ''; if (!l || /lawn|fence|ground|^the $/.test(l) || !so.bc) continue; const d = so.bc.distanceTo(p) - (so.br || 0) * 0.5; if (d < bd){ bd = d; best = l; } } return best || 'the yard'; }
function actRingNear(p){ for (let i = 0; i < rings.length; i++){ const r = rings[i]; if (r.mesh.position.distanceTo(p) < r.rad + 1.2) return i; } return -1; }
/* a placement must be a static, supported, reachable spot inside the yard */
const PL_A = new V3(), PL_B = new V3(), PL_N = new V3();
function actCheckPlace(p, n){
  if (!actFin(p) || !actFin(n)) return 'not a real position';
  PL_A.fromArray(p); PL_N.fromArray(n); const nl = PL_N.length(); if (nl < 0.5 || nl > 1.5) return 'bad surface direction'; PL_N.divideScalar(nl);
  if (PL_A.x < YARD.x0 + 1 || PL_A.x > YARD.x1 - 1 || PL_A.z < YARD.z0 + 1 || PL_A.z > YARD.z1 - 1 || PL_A.y < -0.05 || PL_A.y > 120) return 'outside the yard';
  const d0 = field(PL_A, gather(PL_A, 2)), lab = (FR.pr && FR.pr.label) || 'the lawn';
  if (Math.abs(d0) > 0.12) return 'not on a surface';
  if (/duck|chicken|human|grill lid|swatter/.test(lab)) return 'that surface moves (' + lab + ')';
  PL_B.copy(PL_A).addScaledVector(PL_N, 0.06); if (field(PL_B, gather(PL_B, 2)) < 0.02) return 'inside something';
  PL_B.copy(PL_A).addScaledVector(PL_N, 0.45); if (field(PL_B, gather(PL_B, 2)) < 0.22) return 'no room for a fly to reach it';
  for (const s of SPAWNS) if (Math.hypot(PL_A.x - s.x, PL_A.z - s.z) < 4 && PL_A.y < 8) return 'too close to a spawn can';
  if (actRingNear(PL_A) >= 0) return 'inside a race ring';
  return '';
}
function actValidCrumb(c, fresh){
  if (!c || typeof c !== 'object') return null;
  if (typeof c.id !== 'string' || !/^[A-Za-z0-9._-]{6,48}$/.test(c.id)) return null;
  if (c.wk !== ACT_WORLD || !actFin(c.p) || !actFin(c.nrm) || !Number.isInteger(c.h) || c.h < 0 || c.h >= CRUMB_HINTS.length) return null;
  const o = {v:1, id:c.id, by:actClean(c.by, 40), n:actClean(c.n, 16) || 'a fly', wk:c.wk, p:c.p.map(v => +(+v).toFixed(3)), nrm:c.nrm.map(v => +(+v).toFixed(3)), h:c.h, at:Number.isFinite(c.at) ? c.at : 0, own:actClean(c.own, 40), imp:c.imp ? 1 : 0};
  if (fresh && actCheckPlace(o.p, o.nrm)) return null;
  return o;
}
function actCrumbStart(){
  if (game.role !== 'fly' || !game.crawl){ actToast('Land on a surface first, then press Hide here.', 2.6); return; }
  if (game.crawl.host){ actToast("Crumbs can't go on a moving body. Pick a still surface.", 2.6); return; }
  const cr = game.crawl, n = cr.N.clone().normalize(), p = cr.C.clone();
  for (let k = 0; k < 4; k++){ const d = field(p, gather(p, 2)); p.addScaledVector(n, -d); if (Math.abs(d) < 0.003) break; }
  const pa = p.toArray().map(v => +v.toFixed(3)), na = n.toArray().map(v => +v.toFixed(3)), why = actCheckPlace(pa, na);
  if (!ACT.preview) ACT.preview = {g:actMakeCrumb(true)};
  Object.assign(ACT.preview, {p:pa, n:na, why}); ACT.crumbMode = 'preview';
  actToast(why ? "Can't hide here: " + why + '. Move and press Hide here again.' : 'Crumb preview placed. Confirm to hide it, or Cancel.', 3); actDomDirty();
}
function actCrumbConfirm(){
  const P = ACT.preview; if (!P || P.why) return actToast('Pick a valid spot first (Hide here).');
  const ch = {v:1, id:racePid.slice(-8) + '-' + Date.now().toString(36), by:racePid, n:actClean(net.name || 'Fly', 16), wk:ACT_WORLD, p:P.p, nrm:P.n, h:ACT.hintIdx % CRUMB_HINTS.length, at:Date.now(), own:racePid};
  if (actStore.mine && actStore.mine.id) actRequest({op:'unhide', cid:actStore.mine.id});
  actStore.mine = ch; actSave(); ACT.minePub = true;
  if (net.peer && net.room) actRequest({op:'hide', ch}); else { ACT.snap.crumbs[ch.id] = Object.assign({}, ch); ACT.snap.finds[ch.id] = []; }
  actCrumbCancel(true); actToast('Crumb hidden! Hint: ' + CRUMB_HINTS[ch.h] + '. Export it from the page menu to share later.', 3.2); actTone(520, 780, 0.12);
}
function actCrumbCancel(quiet){ if (ACT.preview){ scene.remove(ACT.preview.g); ACT.preview = null; } ACT.crumbMode = 'idle'; if (!quiet) actToast('Hide cancelled.'); actDomDirty(); }
function actCrumbDelete(){ if (!actStore.mine) return; const id = actStore.mine.id; actRequest({op:'unhide', cid:id}); delete ACT.snap.crumbs[id]; actStore.mine = null; actSave(); actToast('Your crumb was removed.'); actDomDirty(); }
function actCrumbList(){
  const out = [], seen = new Set();
  for (const c of Object.values(ACT.snap.crumbs)){ out.push(Object.assign({room:true}, c)); seen.add(c.id); }
  if (!net.room){ if (actStore.mine && !seen.has(actStore.mine.id)){ out.push(Object.assign({room:false, local:true}, actStore.mine)); seen.add(actStore.mine.id); }
    for (const c of actStore.imported) if (!seen.has(c.id)){ out.push(Object.assign({room:false, local:true}, c)); seen.add(c.id); } }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}
const actFoundMine = id => actStore.found.includes(id) || ((ACT.snap.finds[id] || []).includes(racePid));
function actCrumbSearch(){
  const L = actCrumbList(); if (!L.length) return actToast('No crumbs to find yet. Hide one, or import a code.');
  const c = L[ACT.sel % L.length]; if (c.by === racePid) return actToast("That's your own crumb. Pick another (Next crumb).");
  ACT.search = c.id; ACT.searchT0 = clock.elapsedTime; ACT.dwell = 0; ACT.hintBig = false; actToast('Searching for ' + actClean(c.n, 16) + "'s crumb: " + CRUMB_HINTS[c.h], 3); actDomDirty();
}
const crumbViews = new Map();
function actCrumbTick(dt, now){
  // preview
  if (ACT.preview){ const P = ACT.preview; P.g.position.fromArray(P.p).addScaledVector(actV.fromArray(P.n), 0.07 * tune.flyScale + 0.03); P.g.userData.m.material = P.why ? crumbGhostMat : crumbMat; P.g.rotation.y = now * 1.5; P.g.scale.setScalar(Math.max(0.6, tune.flyScale * 1.6)); }
  // visible crumbs: mine, found by me, or anyone's when close
  actMyPose(actV3); const list = actCrumbList(), want = new Set();
  for (const c of list){
    actV.fromArray(c.p); const d = actV3.distanceTo(actV), mine = c.by === racePid, found = actFoundMine(c.id);   // an imported friend crumb stays hidden from its importer until found
    if (!(mine || found || d < 4)) continue;
    want.add(c.id); let g = crumbViews.get(c.id); if (!g){ g = actMakeCrumb(false); crumbViews.set(c.id, g); }
    g.position.copy(actV).addScaledVector(actV2.fromArray(c.nrm), 0.07 * tune.flyScale + 0.03); g.rotation.y = now * 1.2; g.scale.setScalar(Math.max(0.6, tune.flyScale * 1.6));
    g.userData.sp.forEach((s, i) => { const a = now * 2 + i * 1.57; s.position.set(Math.cos(a) * 0.16, 0.06 + 0.05 * Math.sin(now * 5 + i), Math.sin(a) * 0.16); s.visible = !found || (ACT.sparkT && now - ACT.sparkT < 2); });
  }
  for (const [id, g] of crumbViews) if (!want.has(id)){ scene.remove(g); crumbViews.delete(id); }
  // searching: scent meter and the find dwell
  if (!ACT.search) return;
  const c = list.find(x => x.id === ACT.search); if (!c || actFoundMine(c.id)){ ACT.search = null; return; }
  if (race.phase === 'running'){ ACT.band = 'paused (racing)'; return; }
  actV.fromArray(c.p); const d = actV3.distanceTo(actV);
  ACT.band = d < 5 ? 'HOT' : d < 15 ? 'Warm' : 'Cold';
  if (ACT.band === 'HOT' && now - ACT.chirpT > 1.4){ ACT.chirpT = now; actTone(1200, 1500, 0.05, 0.04); }
  if (!ACT.hintBig && now - ACT.searchT0 > 60) ACT.hintBig = true;
  actV2.copy(actV).addScaledVector(PL_N.fromArray(c.nrm), 0.05); camera.getWorldPosition(swC);
  const close = d < crumbFindR(tune.flyScale) && actMyEligible(now) && (!occluded(swC, actV2) || !occluded(actV3, actV2));
  ACT.dwell = close ? ACT.dwell + dt : Math.max(0, ACT.dwell - dt);
  if (ACT.dwell >= 0.4 && !ACT.findSent){
    ACT.findSent = true; setTimeout(() => { ACT.findSent = false; }, 1500);
    if (c.room && net.room) actRequest({op:'find', cid:c.id});
    else { if (!actStore.found.includes(c.id)){ actStore.found.push(c.id); actStore.myFinds = (actStore.myFinds || 0) + 1; actSave(); } actToast('Found ' + actClean(c.n, 16) + "'s crumb! Hide your own next?", 3); actTone(880, 1760, 0.2); ACT.sparkT = now; ACT.search = null; actDomDirty(); }
  }
}
function actCrumbHud(now){
  if (ACT.crumbMode === 'preview') return ACT.preview && ACT.preview.why ? "Crumb: can't hide here (" + ACT.preview.why + ')' : 'Crumb: preview placed · Confirm or Cancel in Activities';
  if (!ACT.search) return ''; const c = actCrumbList().find(x => x.id === ACT.search); if (!c) return '';
  const pulse = ACT.band === 'HOT' ? (Math.sin(now * 10) > 0 ? '◆◆◆' : '◇◇◇') : ACT.band === 'Warm' ? '◆◆◇' : '◆◇◇';
  return 'Crumb scent ' + pulse + ' ' + ACT.band + ' · ' + CRUMB_HINTS[c.h] + (ACT.hintBig ? ' · near ' + actLandmark(actV.fromArray(c.p)) : '');
}
function actExportCode(){
  const c = actStore.mine; if (!c) return '';
  const o = {v:1, id:c.id, by:c.by, n:c.n, wk:c.wk, p:c.p, nrm:c.nrm, h:c.h, at:c.at};
  return 'LFC1:' + btoa(unescape(encodeURIComponent(JSON.stringify(o))));
}
function actImportCode(code){
  try{
    code = String(code || '').replace(/\s+/g, ''); if (!code) return 'Paste a crumb code first.';
    if (code.length > 4096) return 'That code is too long (over 4 KB).';
    if (!/^LFC1:[A-Za-z0-9+/=]+$/.test(code)) return 'Not a Like Flies crumb code.';
    let o; try{ o = JSON.parse(decodeURIComponent(escape(atob(code.slice(5))))); }catch(e){ return 'That code is damaged.'; }
    if (!o || o.v !== 1) return 'Unknown crumb code version.';
    if (o.wk !== ACT_WORLD) return 'That crumb was hidden in a different yard layout (' + actClean(o.wk, 20) + ').';
    const c = actValidCrumb(Object.assign({}, o, {own:racePid}), false); if (!c) return 'That code has bad data.';
    const why = actCheckPlace(c.p, c.nrm); if (why) return 'That spot does not work in this build: ' + why + '.';
    if (c.by === racePid) return 'That is your own crumb.';
    if (net.room){ actRequest({op:'import', ch:c}); return 'Imported into this room for everyone here. Pick it with Next crumb.'; }
    if (!actStore.imported.some(x => x.id === c.id)){ actStore.imported.push(c); actStore.imported = actStore.imported.slice(-8); actSave(); }
    return 'Imported on this browser. Pick it with Next crumb.';
  }catch(e){ return 'Could not import that code.'; }
}
/* ---------- Ghost Wings ---------- */
const ghostStore = (() => { const g = store.get(GHOST_KEY, {}); return g && typeof g === 'object' && !Array.isArray(g) ? g : {}; })();
function ghostSave(){ try{ localStorage.setItem(GHOST_KEY, JSON.stringify(ghostStore)); }catch(e){ ACT.storeErr = 'ghost not saved (browser storage full)'; } }
const ghostView = (() => {
  const g = new THREE.Group(), mat = new THREE.MeshBasicMaterial({color:0x9ff6ff, transparent:true, opacity:0.42, depthWrite:false}), wm = new THREE.MeshBasicMaterial({color:0xffffff, transparent:true, opacity:0.3, depthWrite:false, side:THREE.DoubleSide});
  mat.userData.noRetro = true; wm.userData.noRetro = true;
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), mat); body.scale.set(0.13, 0.11, 0.3); g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), mat); head.scale.setScalar(0.1); head.position.set(0, 0.02, -0.25); g.add(head);
  const wg = new THREE.PlaneGeometry(0.32, 0.14); const wl = new THREE.Mesh(wg, wm), wr = new THREE.Mesh(wg, wm); wl.position.set(-0.2, 0.08, 0.02); wr.position.set(0.2, 0.08, 0.02); wl.rotation.x = wr.rotation.x = -Math.PI / 2; g.add(wl, wr);
  g.userData.w = [wl, wr]; g.visible = false; g.traverse(o => { o.frustumCulled = false; o.raycast = () => {}; }); scene.add(g); return g;
})();
let ghostLabel = null;
function ghostKey(start, sig){ return start + '|' + sig; }
function ghostValid(R){
  if (!R || typeof R !== 'object' || !Array.isArray(R.s) || R.s.length < 2 || R.s.length > 3600 || !Number.isInteger(R.start) || R.start < 0 || R.start >= RN()) return false;
  if (typeof R.sig !== 'string' || R.sig.length > 24 || !Number.isFinite(R.cs) || R.cs < 100 || R.cs > 360000) return false;
  let last = -1; for (const s of R.s){ if (!Array.isArray(s) || s.length !== 5 || !s.every(Number.isInteger)) return false; if (s[0] < last) return false; last = s[0];
    if (Math.abs(s[1]) > 40000 || Math.abs(s[3]) > 40000 || s[2] < -500 || s[2] > 20000) return false; }
  return last <= R.cs + 300;
}
function ghostRecTick(){
  if (race.phase !== 'running'){ if (ACT.rec && ACT.rec.run !== race.runId) ACT.rec = null; return; }
  const t = raceNow() - race.t0;
  if (!ACT.rec || ACT.rec.run !== race.runId) ACT.rec = {run:race.runId, start:race.start, sig:race.sigStart, comp:race.compStart, s:[], over:false, nextT:0};
  const R = ACT.rec; if (R.over || t < R.nextT) return; R.nextT = t + 0.2;   // about 5 samples a second
  if (R.s.length >= 3600){ R.over = true; return; }
  actMyPose(actV); eul.setFromQuaternion(camera.getWorldQuaternion(qAt), 'YXZ');
  R.s.push([Math.round(t * 100), Math.round(actV.x * 100), Math.round(actV.y * 100), Math.round(actV.z * 100), Math.round(eul.y * 100)]);
}
function ghostOnFinish(res){
  const R = ACT.rec; if (!R || R.run !== res.runId) return;
  if (res.status === 'practice'){ ACT.ghostWhy = 'Practice lap: ghost not kept'; return; }
  if (R.over){ actToast('Lap counted. That lap was too long to keep as a ghost.', 2.5); return; }
  actMyPose(actV); R.s.push([res.cs, Math.round(actV.x * 100), Math.round(actV.y * 100), Math.round(actV.z * 100), R.s.length ? R.s[R.s.length - 1][4] : 0]);
  const sig = res.ranked ? res.comp : R.sig, key = ghostKey(R.start, sig), old = ghostStore[key];
  const rep = {v:1, k:key, start:R.start, sig, cs:res.cs, run:res.runId, pid:racePid, n:actClean(net.name || 'Fly', 16), g:race.times.map(x => Math.round(x * 100)), s:R.s, at:Date.now()};
  if (!ghostValid(rep)) return;
  if (JSON.stringify(rep).length > 131072){ actToast('Lap counted. Ghost too big to keep.', 2.5); return; }
  if (old && old.cs <= res.cs) return;
  ghostStore[key] = rep; const keys = Object.keys(ghostStore).sort((a, b) => (ghostStore[b].at || 0) - (ghostStore[a].at || 0)); for (const k of keys.slice(6)) delete ghostStore[k];
  ghostSave(); actToast('Ghost Wings saved your best line from ring ' + (R.start + 1) + '.', 2.4); actDomDirty();
}
function ghostFindForRace(){
  const mode = actStore.ghostMode; if (mode === 'off') return {why:''};
  if (mode === 'mine'){
    const sig = (net.room && race.sigStart === race.compStart) ? race.compStart : race.sigStart;
    const R = ghostStore[ghostKey(race.start, sig)] || ghostStore[ghostKey(race.start, race.sigStart)];
    return R ? {rep:R, label:'My best'} : {why:'No matching ghost for this start'};
  }
  const B = boardRows(); if (!B.crown) return {why:'No room record yet'};
  if (B.crown.start !== race.start || race.sigStart !== race.compStart) return {why:'No matching ghost for this start (record started at ring ' + (B.crown.start + 1) + ')'};
  if (B.crown.pid === racePid){ const R = ghostStore[ghostKey(race.start, race.compStart)]; return R ? {rep:R, label:'Room record (mine)'} : {why:'Record is yours, ghost not saved'}; }
  const R = ACT.shared.get(B.crown.runId); return R ? {rep:R, label:'Room record'} : {why:ACT.ghostWhy || 'Record available, ghost not shared'};
}
function ghostOnRaceStart(){ const f = ghostFindForRace(); ACT.gap = null; if (f.rep){ ghostPlay(f.rep, race.t0, f.label, 'race'); ACT.ghostWhy = ''; } else { ghostStop(); ACT.ghostWhy = f.why; } }
function ghostPlay(R, t0, label, kind){
  ACT.ghost = {R, t0, kind, i:0, label};
  if (ghostLabel){ scene.remove(ghostLabel); const k = labels.indexOf(ghostLabel); if (k >= 0) labels.splice(k, 1); }
  ghostLabel = makeLabel(actClean(R.n, 12) + ' · GHOST', 0x9ff6ff); ghostLabel.material.userData.noRetro = true; scene.add(ghostLabel);
}
function ghostStop(){ ACT.ghost = null; ghostView.visible = false; if (ghostLabel){ scene.remove(ghostLabel); const k = labels.indexOf(ghostLabel); if (k >= 0) labels.splice(k, 1); ghostLabel = null; } }
function ghostWatch(){
  const sig = race.sigStart || localSig(), start = race.phase === 'off' ? 0 : race.start;
  let R = ghostStore[ghostKey(start, net.room && compSig() === localSig() ? compSig() : localSig())];
  let demo = false; if (!R){ const all = Object.values(ghostStore).sort((a, b) => b.at - a.at); R = all[0]; demo = true; }
  if (!R) return actToast('No saved ghost yet. Finish a race lap first.', 2.5);
  ghostPlay(R, raceNow(), demo ? 'Route replay (start ring ' + (R.start + 1) + ')' : 'Route replay', 'watch');
  actToast((demo ? 'Demonstration replay from ring ' + (R.start + 1) : 'Replaying your route from ring ' + (R.start + 1)) + '. It plays once.', 2.6);
}
const ghQ = new THREE.Quaternion();
function ghostTick(now){
  ghostRecTick();
  const G = ACT.ghost; if (!G){ ghostView.visible = false; return; }
  if (G.kind === 'race' && race.phase !== 'running' && race.phase !== 'finished'){ ghostStop(); return; }
  if (game.role !== 'fly'){ ghostStop(); return; }
  const S = G.R.s, t = (raceNow() - G.t0) * 100;
  if (t > S[S.length - 1][0] + 150){ ghostStop(); return; }                          // plays once, then fades out
  while (G.i < S.length - 2 && S[G.i + 1][0] < t) G.i++;
  const a = S[G.i], b = S[Math.min(S.length - 1, G.i + 1)], u = Math.max(0, Math.min(1, (t - a[0]) / Math.max(1, b[0] - a[0])));
  ghostView.position.set((a[1] + (b[1] - a[1]) * u) / 100, (a[2] + (b[2] - a[2]) * u) / 100, (a[3] + (b[3] - a[3]) * u) / 100);
  let dy = (b[4] - a[4]) / 100; if (dy > Math.PI) dy -= 2 * Math.PI; if (dy < -Math.PI) dy += 2 * Math.PI;
  ghostView.rotation.set(0, a[4] / 100 + dy * u, 0); ghostView.scale.setScalar(tune.flyScale); ghostView.visible = true;
  const fl = Math.sin(now * 40) * 0.35; ghostView.userData.w[0].rotation.z = fl; ghostView.userData.w[1].rotation.z = -fl;
  if (ghostLabel){ ghostLabel.position.copy(ghostView.position); ghostLabel.position.y += 0.35 * tune.flyScale; }
  if (G.kind === 'race' && race.phase === 'running' && race.done >= 2 && G.R.g && G.R.g[race.done - 1] != null) ACT.gap = race.times[race.done - 1] - G.R.g[race.done - 1] / 100;   // same gate, same start: a real time gap
}
function ghostHud(){
  if (ACT.ghost && ACT.ghost.kind === 'watch') return 'Ghost Wings: ' + ACT.ghost.label;
  if (actStore.ghostMode === 'off' || race.phase === 'off') return '';
  if (ACT.ghost) return 'Ghost: ' + ACT.ghost.label + (ACT.gap != null ? ' · ' + (ACT.gap >= 0 ? '+' : '') + ACT.gap.toFixed(2) + ' s at this gate' : '');
  return ACT.ghostWhy ? 'Ghost: ' + ACT.ghostWhy : '';
}
/* sharing: only with the owner's consent, in bounded chunks, never in pose updates */
function ghostRequestShared(now){
  if (actStore.ghostMode !== 'room' || !net.room || now - ACT.gqT < 10) return;
  const B = boardRows(); if (!B.crown || B.crown.pid === racePid || ACT.shared.has(B.crown.runId)) return;
  ACT.gqT = now; const j = actSlotOfPid(B.crown.pid), c = j != null ? net.conns.get(j) : null;
  if (!c || !c.open){ ACT.ghostWhy = 'Record holder is not here, ghost unavailable'; return; }
  ACT.gq = {rid:racePid.slice(-6) + now.toFixed(2), run:B.crown.runId, from:j, parts:[], n:0, t0:now};
  try{ c.send({t:'gq', rid:ACT.gq.rid, start:B.crown.start, sig:compSig()}); }catch(e){}
}
function ghostOnMessage(j, d){
  if (d.t === 'gq'){
    const c = net.conns.get(j); if (!c || !c.open || typeof d.rid !== 'string' || d.rid.length > 40) return;
    if (!actStore.share){ try{ c.send({t:'gn', rid:d.rid, why:'Record available, ghost not shared'}); }catch(e){} return; }
    const R = Number.isInteger(d.start) && typeof d.sig === 'string' ? ghostStore[ghostKey(d.start, d.sig)] : null;
    if (!R){ try{ c.send({t:'gn', rid:d.rid, why:'Record holder has no saved ghost for it'}); }catch(e){} return; }
    const s = JSON.stringify(R), n = Math.ceil(s.length / 8000); if (n > 20) return;
    for (let i = 0; i < n; i++) try{ c.send({t:'gc', rid:d.rid, i, n, d:s.slice(i * 8000, (i + 1) * 8000)}); }catch(e){}
    return;
  }
  const Q = ACT.gq; if (!Q || d.rid !== Q.rid || j !== Q.from) return;
  if (d.t === 'gn'){ ACT.ghostWhy = actClean(d.why, 60); ACT.gq = null; return; }
  if (!Number.isInteger(d.i) || !Number.isInteger(d.n) || d.n < 1 || d.n > 20 || d.i < 0 || d.i >= d.n || typeof d.d !== 'string' || d.d.length > 8000 || Q.parts[d.i] != null) return;
  Q.parts[d.i] = d.d; Q.n++;
  if (Q.n === d.n){ ACT.gq = null; let R = null; try{ R = JSON.parse(Q.parts.join('')); }catch(e){}
    if (R && ghostValid(R) && R.run === Q.run){ ACT.shared.set(R.run, R); while (ACT.shared.size > 2) ACT.shared.delete(ACT.shared.keys().next().value); ACT.ghostWhy = ''; actLog({k:'ghost-shared', run:R.run, bytes:Q.parts.join('').length}); actDomDirty(); }
    else { ACT.ghostWhy = 'Shared ghost was invalid, ignored'; actLog({k:'ghost-reject'}); } }
}
/* ---------- Backyard Field Guide ---------- */
const GUIDE = [
  {id:'sunflower', name:'Sunflower', note:'A sunflower is a landing pad, a lookout tower and a snack bar all at once. Five stars.'},
  {id:'chicken', name:'Chicken', note:'Giant, feathery and always hungry. Keep your distance and never land on the beak.'},
  {id:'duck', name:'Rubber duck', note:'Floats forever, never blinks. Nobody knows what the duck has seen.'},
  {id:'tomato', name:'Tomato cluster', note:'Shiny red planets on a green vine. They smell amazing in the sun.'},
  {id:'moth', name:'Under-the-chair secret', note:'A paper moth someone tucked under the chair. Who left it there? A mystery for another day.'}];
let guideMoth = null;
function guideInit(){
  if (ACT.guideReady || !solids || !solids.length) return;
  const pick = (re, fn) => { const L = solids.filter(s => re.test(s.label || '') && s.bc); return L.length ? (fn ? L.sort(fn)[0] : L[0]) : null; };
  const T = {sunflower:pick(/^a sunflower$/, (a, b) => b.bc.y - a.bc.y), chicken:pick(/^the chicken$/), duck:pick(/^the rubber duck$/, (a, b) => (b.br || 0) - (a.br || 0)), tomato:pick(/tomato/, (a, b) => b.bc.y - a.bc.y)};
  if (!T.tomato){ T.tomato = pick(/^a flower$/); GUIDE[3].name = 'Flower patch'; GUIDE[3].note = 'Bright petals, sweet smells, and the best people-watching in the yard.'; }
  const chair = pick(/^a lawn chair$/);
  if (chair){                                                                            // a tiny paper moth stuck under the chair seat (new, noncolliding)
    let at = null; const c = chair.bc;
    for (let y = 0.15; y < c.y + (chair.br || 3) && !at; y += 0.04){ const q = new V3(c.x, y, c.z); const d = field(q, gather(q, 2)); if ((FR.pr && FR.pr.label) === 'a lawn chair' && d < 0.12 && y > 0.6){ at = q; } }
    if (!at) at = new V3(c.x, Math.max(0.6, c.y * 0.6), c.z);
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d'); guideIcon(g, 'moth', 0, 0, 128, true);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(cv), transparent:true, side:THREE.DoubleSide, depthWrite:false}));
    m.rotation.x = Math.PI / 2; m.position.copy(at).add(new V3(0, -0.04, 0)); m.frustumCulled = false; m.raycast = () => {}; scene.add(m); guideMoth = m;
    T.moth = {bc:m.position, br:0.14, label:'paper moth'};
  }
  if (typeof LIFE !== 'undefined' && LIFE.duck && LIFE.duck.g) T.duck = {label:'the rubber duck', bc:new V3(), br:Math.max(2, (LIFE.duck.pb && LIFE.duck.pb.r) || 4) * 1.15, live:true};   // the floating duck itself, not the pool
  ACT.guideT = T; ACT.guideReady = true;
}
function guideIcon(g, id, x, y, s, on){
  g.save(); g.translate(x + s / 2, y + s / 2); g.scale(s / 100, s / 100);
  const col = (c, d) => on ? c : d || '#3a4a40';
  if (id === 'sunflower'){ for (let k = 0; k < 12; k++){ g.rotate(Math.PI / 6); g.fillStyle = col('#ffd23f'); g.beginPath(); g.ellipse(0, -28, 8, 16, 0, 0, Math.PI * 2); g.fill(); } g.fillStyle = col('#6b3d14', '#2a352e'); g.beginPath(); g.arc(0, 0, 18, 0, Math.PI * 2); g.fill(); }
  else if (id === 'chicken'){ g.fillStyle = col('#f4f1e8'); g.beginPath(); g.ellipse(0, 10, 30, 24, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(18, -16, 14, 0, Math.PI * 2); g.fill(); g.fillStyle = col('#e2352b', '#2a352e'); g.beginPath(); g.arc(18, -32, 7, 0, Math.PI * 2); g.fill(); g.fillStyle = col('#ffb020', '#2a352e'); g.beginPath(); g.moveTo(31, -16); g.lineTo(42, -12); g.lineTo(31, -9); g.fill(); }
  else if (id === 'duck'){ g.fillStyle = col('#ffd23f'); g.beginPath(); g.ellipse(-4, 14, 32, 18, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(14, -12, 15, 0, Math.PI * 2); g.fill(); g.fillStyle = col('#ff8a1f', '#2a352e'); g.beginPath(); g.ellipse(32, -9, 10, 5, 0, 0, Math.PI * 2); g.fill(); }
  else if (id === 'tomato'){ for (const [dx, dy] of [[-14, 8], [14, 8], [0, -12]]){ g.fillStyle = col('#e2352b'); g.beginPath(); g.arc(dx, dy, 16, 0, Math.PI * 2); g.fill(); } g.fillStyle = col('#2fae3e', '#2a352e'); g.fillRect(-3, -40, 6, 16); }
  else { g.fillStyle = col('#efe6cf'); g.beginPath(); g.moveTo(0, -6); g.lineTo(-40, -26); g.lineTo(-30, 22); g.closePath(); g.fill(); g.beginPath(); g.moveTo(0, -6); g.lineTo(40, -26); g.lineTo(30, 22); g.closePath(); g.fill();
    g.fillStyle = col('#7a5a3a', '#2a352e'); g.fillRect(-4, -18, 8, 40); g.fillStyle = col('#c9874a', '#2a352e'); g.beginPath(); g.arc(-22, -6, 5, 0, Math.PI * 2); g.arc(22, -6, 5, 0, Math.PI * 2); g.fill(); }
  if (!on){ g.fillStyle = 'rgba(13,24,19,0.35)'; g.fillRect(-50, -50, 100, 100); }
  g.restore();
}
const guideRet = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const tex = new THREE.CanvasTexture(cv);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.03), new THREE.MeshBasicMaterial({map:tex, transparent:true, depthTest:false, depthWrite:false}));
  m.material.userData.noRetro = true; m.position.set(0, 0, -0.16); m.renderOrder = 997; m.visible = false; m.frustumCulled = false; camera.add(m);
  m.userData.draw = f => { const g = cv.getContext('2d'); g.clearRect(0, 0, 128, 128); g.lineWidth = 10; g.strokeStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(64, 64, 48, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = '#ffd23f'; g.beginPath(); g.arc(64, 64, 48, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f); g.stroke(); g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(64, 64, 6, 0, Math.PI * 2); g.fill(); tex.needsUpdate = true; };
  return m; })();
const gdCam = new V3(), gdDir = new V3(), gdV = new V3(), gdNear = new V3();
function guideTick(dt, now){
  guideInit(); if (!ACT.guideReady){ guideRet.visible = false; return; }
  { const t = ACT.guideT.duck; if (t && t.live){ const D = LIFE.duck; D.g.updateWorldMatrix(true, false); t.bc.copy(D.bo).applyMatrix4(D.g.matrixWorld); } }   // follows the bobbing, drifting duck
  const on = actStore.scan && game.role === 'fly' && state !== 'menu' && !menuOpen;
  if (!on){ guideRet.visible = false; ACT.scanTgt = null; ACT.scanP = 0; ACT.scanT = now; return; }   // v0.0.19c: time spent with scan off or in a menu never counts
  if (now - ACT.scanT < 0.1) return; const step = Math.min(0.15, Math.max(0, now - ACT.scanT)); ACT.scanT = now;   // v0.0.19c: first activation / background pause cannot award a long dwell          // a modest 10 checks a second
  camera.getWorldPosition(gdCam); camera.getWorldDirection(gdDir);
  let best = null, bd = 1e9;
  for (const e of GUIDE){ if (actStore.guide[e.id]) continue; const t = ACT.guideT[e.id]; if (!t) continue;
    gdV.subVectors(t.bc, gdCam); const d = gdV.length(), r = Math.max(0.12, (t.br || 1) * (e.id === 'moth' ? 1 : 0.7));
    if (d - r > 14 || d < 1e-3) continue;
    const ang = Math.acos(Math.max(-1, Math.min(1, gdDir.dot(gdV) / d)));
    if (ang > Math.atan(r / d) + 0.05) continue;                                          // looking at THIS target, not the water or the yard behind it
    gdNear.copy(t.bc).addScaledVector(gdV, -Math.min(r * 1.02, d * 0.5) / d);
    if (occluded(gdCam, gdNear)) continue;                                                 // no scans through walls
    if (d < bd){ bd = d; best = e.id; } }
  if (best && best !== ACT.scanTgt){ ACT.scanTgt = best; ACT.scanP = Math.min(ACT.scanP, 0.2); }
  if (best) ACT.scanP += step; else { ACT.scanP = Math.max(0, ACT.scanP - step * 0.8); if (ACT.scanP === 0) ACT.scanTgt = null; }
  guideRet.visible = ACT.scanP > 0.02; if (guideRet.visible) guideRet.userData.draw(Math.min(1, ACT.scanP / 1.2));
  if (best && ACT.scanP >= 1.2){ actStore.guide[best] = {at:Date.now()}; actSave(); ACT.scanP = 0; ACT.scanTgt = null;
    const e = GUIDE.find(x => x.id === best), n = GUIDE.filter(x => actStore.guide[x.id]).length;
    actToast('Field Guide: ' + e.name + ' discovered! (' + n + '/5)', 3); actTone(700, 1400, 0.25, 0.07); actLog({k:'guide', id:best}); actDomDirty(); }
}
const GUIDE_SHORT = {sunflower:'Sunflower', chicken:'Chicken', duck:'Duck', tomato:'Tomato', moth:'Moth'};   // v0.0.19c: headset strip labels
function guideHud(){ if (!actStore.scan) return ''; const n = GUIDE.filter(x => actStore.guide[x.id]).length; if (ACT.scanTgt) return 'Field Guide: scanning... ' + Math.round(100 * Math.min(1, ACT.scanP / 1.2)) + '%'; return 'Field Guide scan on · ' + n + '/5 found'; }
/* ---------- the can-side Activities sign (visual only, no collider) ---------- */
let actSign = null;
function actSignInit(){
  if (actSign) return; const s = SPAWNS[0]; if (!s) return;
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256; const g = cv.getContext('2d');
  g.fillStyle = '#f4e3b5'; g.fillRect(0, 0, 512, 256); g.strokeStyle = '#7a4b22'; g.lineWidth = 14; g.strokeRect(7, 7, 498, 242);
  g.fillStyle = '#3b2412'; g.font = 'bold 66px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText('ACTIVITIES', 256, 100);
  g.font = 'bold 34px system-ui, sans-serif'; g.fillText('Tag · Crumbs · Ghosts · Guide', 256, 160); g.font = '30px system-ui, sans-serif'; g.fillText('Open the menu: Activities tab', 256, 212);
  const grp = new THREE.Group(), wood = new THREE.MeshLambertMaterial({color:0x7a4b22});
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4, 0.3), wood); post.position.y = 2; grp.add(post);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), new THREE.MeshLambertMaterial({map:new THREE.CanvasTexture(cv), side:THREE.DoubleSide})); board.position.y = 4.4; grp.add(board);
  const ix = s.x - Math.sign(s.x) * 7, iz = s.z - Math.sign(s.z) * 3; grp.position.set(ix, 0, iz); grp.rotation.y = Math.atan2(-Math.sign(s.x), -Math.sign(s.z));
  grp.traverse(o => { o.raycast = () => {}; }); scene.add(grp); actSign = grp;
}
/* ---------- per-frame driver ---------- */
let actDomT = 0, actDomNeed = true;
function actDomDirty(){ actDomNeed = true; }
function actTick(dt, now){
  actSignInit();
  actMyPose(actV); actPushPose(racePid, now, actV);
  if (ACT.wantTag && game.role !== 'fly'){ actTagLeave('switched to Human'); }
  if (actInTag() && race.phase !== 'off') raceOff('playing Buzz Tag');
  if ((net.room || '') !== ACT.roomSeen){ if (ACT.roomSeen !== undefined) actRoomReset(); ACT.roomSeen = net.room || ''; }
  for (const j of [...ACT.slotPid.keys()]) if (!net.conns.has(j)) ACT.slotPid.delete(j);   // a slot can be reused by someone else later
  if (ACT.pendSnap){ const P = ACT.pendSnap; if (now - P.t > 8) ACT.pendSnap = null; else if (P.j === raceHost()){ ACT.pendSnap = null; actOnSnap(P.j, P.d); } }
  if (actIsHost() && net.peer && now - (ACT.pingT || 0) > 2 && Object.keys(ACT.snap.tag.mem).length > 1){ ACT.pingT = now; const ps = performance.now() / 1000; for (const c of net.conns.values()) if (c.open) try{ c.send({t:'ap', s:ps}); }catch(e){} }
  if (actIsHost()){ actHostTick(now); if (net.peer && net.conns.size && ACT.snap.rev > 0 && now - (ACT.resendT || 0) > 3){ ACT.resendT = now; ACT.dirty = true; } } else ACT.wasHost = false;
  if (ACT.dirty){ ACT.dirty = false; actBroadcast(); const prev = ACT.lastSeen || actFreshSnap(); ACT.lastSeen = JSON.parse(JSON.stringify(ACT.snap)); actAfterChange(prev, ACT.snap); }
  actTagVisuals(now); actCrumbTick(dt, now); ghostTick(now); ghostRequestShared(now); guideTick(dt, now);
  if (actSign){ actMyPose(actV2); const d = Math.hypot(actV2.x - actSign.position.x, actV2.z - actSign.position.z); if (d < 9 && actV2.y < 12 && !ACT.signSeen){ ACT.signSeen = true; actToast('Activities: open the menu and pick the Activities tab.', 3); } }
  if (state === 'menu' && (actDomNeed || now - actDomT > 1)){ actDomT = now; actDomNeed = false; actRenderDom(); }
  if (menuOpen && panelPage === 'Activities' && now - (ACT.panelT || 0) > 0.5){ ACT.panelT = now; drawPanel(); }
}
function actHudLine(now){ return actTagHud(now) || actCrumbHud(now) || ghostHud() || guideHud(); }
function actRoomReset(){ ACT.snap = actFreshSnap(); ACT.lastSeen = null; ACT.clk.clear(); ACT.rtt.clear(); ACT.pendSnap = null; ACT.host.swT = {}; ACT.slotPid.clear(); ACT.poses.clear(); ACT.wasHost = false; ACT.minePub = false; ACT.wantTag = false; ACT.shared.clear(); ACT.gq = null; ACT.search = null; for (const [, m] of tagMarks) scene.remove(m.g); tagMarks.clear(); actDomDirty(); }
/* ---------- menus: page (desktop) and headset panel ---------- */
function actCards(now){
  const T = ACT.snap.tag, n = Object.keys(T.mem).length, nm = p => actClean(ACT.snap.names[p] || 'a fly', 12), inT = actInTag();
  const L = actCrumbList(), c = L.length ? L[ACT.sel % L.length] : null, gN = GUIDE.filter(x => actStore.guide[x.id]).length;
  const tagStatus = !inT && !ACT.wantTag ? (n ? n + ' playing · ' + (T.it ? nm(T.it) + ' is IT' : 'waiting') : 'Nobody playing yet') + (net.room ? '' : ' · join a room to play with friends')
    : (n < 2 ? 'You are in. Waiting for another fly...' : (T.it === racePid ? "You're IT" : (T.it ? nm(T.it) + ' is IT' : 'picking IT')) + ' · ' + n + ' playing · your passes ' + (T.pas[racePid] || 0));
  const crumbStatus = ACT.crumbMode === 'preview' ? (ACT.preview && ACT.preview.why ? "Can't hide here: " + ACT.preview.why : 'Preview placed · hint: ' + CRUMB_HINTS[ACT.hintIdx % CRUMB_HINTS.length])
    : (c ? (L.indexOf(c) + 1) + '/' + L.length + ' · ' + actClean(c.n, 12) + ': ' + CRUMB_HINTS[c.h] + (actFoundMine(c.id) ? ' · FOUND' : '') + (c.by === racePid ? ' · yours' : (c.own === racePid && c.imp ? ' · imported by you' : '')) + (c.local ? ' · this browser' : ' · room') : 'No crumbs yet') +
      ' · my finds ' + (actStore.myFinds || 0) + (actStore.mine ? ' · my crumb hidden' : '') + (ACT.search ? ' · searching (' + ACT.band + ')' : '');
  const gm = actStore.ghostMode, gS = Object.keys(ghostStore).length;
  const ghostStatus = 'Mode: ' + (gm === 'off' ? 'Off' : gm === 'mine' ? 'My best' : 'Shared room record') + ' · ' + gS + ' saved ' + (gS === 1 ? 'ghost' : 'ghosts') + ' · sharing ' + (actStore.share ? 'on' : 'off') + (ACT.ghost ? ' · playing' : ACT.ghostWhy ? ' · ' + ACT.ghostWhy : '');
  const guideStatus = gN + '/5 discovered · scan ' + (actStore.scan ? 'ON: look at a creature or thing up close' : 'off');
  return [
    {title:'Buzz Tag', status:tagStatus, help:'IT touches another fly to pass it on. 2 s to get ready, 4 s safe for the last IT.', btns:[[inT || ACT.wantTag ? 'Leave Tag' : 'Join Buzz Tag', () => (inT || ACT.wantTag) ? actTagLeave() : actTagJoin()]]},
    {title:'Hide-a-Crumb', status:crumbStatus, help:'Land somewhere sneaky, Hide here, then Confirm. Seekers follow the scent: Cold, Warm, HOT.', btns:ACT.crumbMode === 'preview'
      ? [['Confirm', actCrumbConfirm], ['Next hint', () => { ACT.hintIdx++; actDomDirty(); }], ['Cancel', () => actCrumbCancel()]]
      : [['Hide here', actCrumbStart], ['Next crumb', () => { ACT.sel++; actDomDirty(); }], [ACT.search ? 'Stop search' : 'Find this', () => { if (ACT.search){ ACT.search = null; actDomDirty(); } else actCrumbSearch(); }], ACT.search ? ['Stronger hint', () => { ACT.hintBig = true; actDomDirty(); }] : (actStore.mine ? ['Delete mine', actCrumbDelete] : null)].filter(Boolean)},
    {title:'Ghost Wings', status:ghostStatus, help:'Race a lap, then follow your ghost from the same start ring. Ghosts never collide or score.', btns:[['Off', () => { actStore.ghostMode = 'off'; actSave(); ghostStop(); actDomDirty(); }], ['My best', () => { actStore.ghostMode = 'mine'; actSave(); actDomDirty(); }], ['Record', () => { actStore.ghostMode = 'room'; ACT.gqT = -99; actSave(); actDomDirty(); }], [actStore.share ? 'Share: on' : 'Share: off', () => { actStore.share = !actStore.share; actSave(); actDomDirty(); }], ['Watch', ghostWatch]]},
    {title:'Backyard Field Guide', status:guideStatus, help:'Turn scan on, then look at something close for a moment to add it to your journal.', btns:[[actStore.scan ? 'Scan: ON' : 'Scan: off', () => { actStore.scan = !actStore.scan; actSave(); actDomDirty(); }]], guide:true}];
}
const ACT_PANEL_BTNS = [];
function actDrawPanel(c){
  ACT_PANEL_BTNS.length = 0; const cards = actCards(clock.elapsedTime); let y = ROW0 - 4;
  c.textAlign = 'left';
  cards.forEach((k, ci) => {
    const h = k.guide ? 250 : 192; c.fillStyle = 'rgba(238,245,234,0.06)'; rr(c, 24, y, PW - 48, h - 10, 14); c.fill();
    c.fillStyle = ['#ffb020', '#ffd23f', '#9ff6ff', '#7fe3d6'][ci]; c.font = 'bold 28px system-ui, sans-serif'; c.fillText(k.title, 40, y + 34);
    const wrap = (txt, maxW, n) => { const out = []; let cur = ''; for (const w of String(txt).split(' ')){ const t = cur ? cur + ' ' + w : w; if (c.measureText(t).width > maxW && cur){ out.push(cur); cur = w; } else cur = t; } if (cur) out.push(cur); if (out.length > n){ out.length = n; out[n - 1] += '…'; } return out; };
    c.fillStyle = '#eef5ea'; c.font = '20px system-ui, sans-serif'; wrap(k.status, PW - 90, 2).forEach((t, i) => c.fillText(t, 40, y + 60 + i * 23));
    c.fillStyle = '#a7baa6'; c.font = '17px system-ui, sans-serif'; c.fillText(wrap(k.help, PW - 90, 1)[0], 40, y + 105);
    let x = 40; const bh = 52, by = y + 118;
    for (const [label, fn] of k.btns){ c.font = 'bold 22px system-ui, sans-serif'; const bw = Math.max(110, c.measureText(label).width + 30); if (x + bw > PW - 36) break;
      c.fillStyle = 'rgba(127,227,214,0.22)'; rr(c, x, by, bw, bh, 12); c.fill(); c.fillStyle = '#eef5ea'; c.textAlign = 'center'; c.fillText(label, x + bw / 2, by + 35); c.textAlign = 'left';
      ACT_PANEL_BTNS.push({x, y:by, w:bw, h:bh, fn}); x += bw + 10; }
    if (k.guide){ let gx = x + 10; GUIDE.forEach(e => { const on = !!actStore.guide[e.id]; guideIcon(c, e.id, gx, by - 4, 56, on); c.fillStyle = on ? '#eef5ea' : '#6f7d72'; c.font = '13px system-ui, sans-serif'; c.textAlign = 'center'; c.fillText(on ? (GUIDE_SHORT[e.id] || e.name) : '?', gx + 28, by + 70); c.textAlign = 'left'; gx += 66; }); }
    y += h;
  });
}
function actPanelPress(px, py){ for (const b of ACT_PANEL_BTNS) if (px >= b.x && px < b.x + b.w && py >= b.y && py < b.y + b.h){ try{ b.fn(); }catch(e){ console.warn(e); } return true; } return false; }
function actRenderDom(){
  const el = $('#actBody'); if (!el) return;
  // v0.0.19c: keep the crumb-code draft, focus and selection across redraws
  const ta0 = $('#actCode'), draft = ta0 ? ta0.value : (ACT.codeDraft || ''), hadFocus = !!ta0 && document.activeElement === ta0;
  const sel = ta0 ? [ta0.selectionStart, ta0.selectionEnd, ta0.selectionDirection] : null; ACT.codeDraft = draft;
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[ch]));
  const cards = actCards(clock.elapsedTime); ACT.domFns = [];
  el.innerHTML = cards.map((k, ci) => '<div class="actcard"><b>' + esc(k.title) + '</b><p>' + esc(k.status) + '</p><small>' + esc(k.help) + '</small><div class="actions">' +
    k.btns.map(([label, fn]) => { ACT.domFns.push(fn); return '<button type="button" data-actfn="' + (ACT.domFns.length - 1) + '">' + esc(label) + '</button>'; }).join('') + '</div>' +
    (k.guide ? '<div class="journal">' + GUIDE.map(e => '<div class="jentry' + (actStore.guide[e.id] ? ' on' : '') + '"><canvas width="64" height="64" data-gicon="' + e.id + '"></canvas><span>' + esc(actStore.guide[e.id] ? e.name : '???') + '</span>' + (actStore.guide[e.id] ? '<small>' + esc(e.note) + '</small>' : '') + '</div>').join('') + '</div>' : '') +
    (ci === 1 ? '<div class="actions"><button type="button" data-actx="export">Export my crumb code</button><button type="button" data-actx="download">Download crumb JSON</button></div><textarea id="actCode" rows="2" maxlength="4200" placeholder="Paste a friend\'s crumb code (LFC1:...) here"></textarea><div class="actions"><button type="button" data-actx="import">Import code</button></div><p class="note" id="actCodeNote">' + esc(ACT.codeNote || 'Room crumbs last while someone stays in the room. Your own crumb and finds stay on this browser. Codes carry a hide to a later session.') + '</p>' : '') + '</div>').join('');
  el.querySelectorAll('canvas[data-gicon]').forEach(cv => guideIcon(cv.getContext('2d'), cv.dataset.gicon, 0, 0, 64, !!actStore.guide[cv.dataset.gicon]));
  const ta1 = $('#actCode');
  if (ta1){ ta1.value = draft; if (hadFocus){ try{ ta1.focus({preventScroll:true}); }catch(e){ ta1.focus(); } if (sel && sel[0] != null) try{ ta1.setSelectionRange(Math.min(sel[0], draft.length), Math.min(sel[1], draft.length), sel[2] || 'none'); }catch(e){} } }
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-actfn],[data-actx]'); if (!b) return;
  if (b.dataset.actfn != null){ const fn = (ACT.domFns || [])[+b.dataset.actfn]; if (fn) fn(); actRenderDom(); return; }
  const x = b.dataset.actx, ta = $('#actCode');
  if (x === 'export'){ const code = actExportCode(); ACT.codeNote = code ? 'Code copied below. Send it to a friend.' : 'Hide a crumb first.'; actRenderDom(); if (code){ const t = $('#actCode'); t.value = code; ACT.codeDraft = code; try{ navigator.clipboard.writeText(code); }catch(err){} } }
  else if (x === 'download'){ const code = actExportCode(); if (!code){ ACT.codeNote = 'Hide a crumb first.'; actRenderDom(); return; } const blob = new Blob([JSON.stringify({likeFliesCrumb:code}, null, 1)], {type:'application/json'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'like-flies-crumb.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
  else if (x === 'import'){ let v = ta ? ta.value : ''; try{ const j = JSON.parse(v); if (j && typeof j.likeFliesCrumb === 'string') v = j.likeFliesCrumb; }catch(err){} ACT.codeNote = actImportCode(v); actRenderDom(); }
});

