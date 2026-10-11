// Đồng bộ với Firebase Realtime Database.
// - Trang VĐV (index.html): chỉ đọc, nhận thay đổi theo thời gian thực.
// - Trang BTC (admin/index.html): đăng nhập, ghi mỗi khi có thay đổi.
const FB_VER = '10.14.1';
const $ = id => document.getElementById(id);
const App = window.App;
const cfg = window.FIREBASE_CONFIG;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clock = () => new Date().toLocaleTimeString('vi-VN');

async function loadFb() {
  if (window.__FB_TEST) return window.__FB_TEST;
  const base = `https://www.gstatic.com/firebasejs/${FB_VER}/`;
  const [a, d, u] = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-database.js'), import(base + 'firebase-auth.js')]);
  return { ...a, ...d, ...u };
}

function say(text, bad) {
  if (App.mode === 'view') { const l = $('live'); l.className = bad ? 'off' : ''; l.innerHTML = '<i></i>' + esc(text); }
  else $('syncbox').innerHTML = `<div class="note ${bad ? 'bad' : ''}">${esc(text)}</div>`;
}

/* chuẩn hoá để so sánh dữ liệu máy với máy chủ (Firebase bỏ giá trị rỗng/null) */
function cn(x) {
  const strip = v => {
    if (v == null || v === '') return undefined;
    if (Array.isArray(v)) { const a = v.map(strip).filter(e => e !== undefined); return a.length ? a : undefined; }
    if (typeof v === 'object') {
      const keys = Object.keys(v);
      if (keys.length && keys.every((k, i) => String(i) === k)) return strip(keys.map(k => v[k]));
      const o = {}; keys.sort().forEach(k => { const s = strip(v[k]); if (s !== undefined) o[k] = s; });
      return Object.keys(o).length ? o : undefined;
    }
    return v;
  };
  return JSON.stringify(strip(JSON.parse(JSON.stringify(x ?? null))) ?? null);
}
const clean = x => JSON.parse(JSON.stringify(x));
const encodeRes = res => { const o = {}; Object.keys(res || {}).forEach(id => { const r = res[id]; o[App.keyEnc(id)] = { ta: r.ta, tb: r.tb, sa: r.sa ?? null, sb: r.sb ?? null }; }); return o; };

(async () => {
  if (!cfg || /DÁN|PASTE/i.test(cfg.apiKey || '')) { say('Chưa điền firebase-config.js. Mở file đó và dán thông tin Firebase vào.', true); return; }
  const fb = await loadFb();
  const app = fb.initializeApp(cfg);
  const db = fb.getDatabase(app);
  if (App.mode === 'view') startView(fb, db); else startAdmin(fb, app, db);
})().catch(e => say('Không kết nối được Firebase: ' + (e && e.message || e), true));

/* ---------------- TRANG VĐV ---------------- */
function startView(fb, db) {
  let last = null, online = false;
  const paint = () => {
    const l = $('live');
    if (!online) { l.className = 'off'; l.innerHTML = '<i></i>Mất kết nối, đang thử lại…'; }
    else { l.className = 'on'; l.innerHTML = '<i></i>Trực tiếp' + (last ? ' · cập nhật ' + last : ''); }
  };
  const stamp = () => { last = clock(); paint(); };
  fb.onValue(fb.ref(db, '.info/connected'), s => { online = !!s.val(); paint(); });
  fb.onValue(fb.ref(db, 'tournament/cfg'), s => { App.setCfg(s.val()); stamp(); });
  fb.onValue(fb.ref(db, 'tournament/cats'), s => { App.setCats(s.val()); stamp(); });
  const rr = fb.ref(db, 'tournament/res');
  fb.onChildAdded(rr, s => { App.patchRes(s.key, s.val()); stamp(); });
  fb.onChildChanged(rr, s => { App.patchRes(s.key, s.val()); stamp(); });
  fb.onChildRemoved(rr, s => { App.patchRes(s.key, null); stamp(); });
  // Gói miễn phí giới hạn 100 kết nối cùng lúc: ngắt khi tab bị ẩn, nối lại khi mở lại.
  document.addEventListener('visibilitychange', () => { document.hidden ? fb.goOffline(db) : fb.goOnline(db); });
}

/* ---------------- TRANG BTC ---------------- */
function startAdmin(fb, app, db) {
  const auth = fb.getAuth(app), T = fb.ref(db, 'tournament'), box = $('syncbox');
  let user = null, auto = false, timer = null, lastOk = null, online = true;
  let last = { cfg: '', cats: '', res: {} };
  const link = location.origin + '/';

  const snapshotOf = d => { const res = encodeRes(d.res), rs = {}; Object.keys(res).forEach(k => rs[k] = cn(res[k])); return { cfg: cn(d.cfg), cats: cn(d.cats), res: rs }; };
  const same = (a, b) => a.cfg === b.cfg && a.cats === b.cats && Object.keys(a.res).length === Object.keys(b.res).length && Object.keys(a.res).every(k => a.res[k] === b.res[k]);

  const loginUI = (err) => {
    box.innerHTML = `<div class="card" style="padding:12px"><div class="row"><b>Đồng bộ trực tiếp</b>
      <input type="email" id="em" placeholder="Email BTC" autocomplete="username"><input type="password" id="pw" placeholder="Mật khẩu" autocomplete="current-password">
      <button class="btn pri" id="login">Đăng nhập</button><span class="small" style="color:var(--bad)">${esc(err || '')}</span></div>
      <div class="small muted" style="margin-top:6px">Chưa đăng nhập thì kết quả chỉ lưu trên máy này, VĐV chưa xem được.</div></div>`;
    const go = async () => {
      try { await fb.signInWithEmailAndPassword(auth, $('em').value.trim(), $('pw').value); }
      catch (e) { loginUI('Đăng nhập không được: ' + (e.code || e.message)); }
    };
    $('login').onclick = go; $('pw').onkeydown = e => { if (e.key === 'Enter') go(); };
  };
  const okUI = () => {
    box.innerHTML = `<div class="card" style="padding:12px"><div class="row"><b id="st"></b><span class="small muted" id="when"></span>
      <span class="small">Link cho VĐV: <b style="user-select:all">${esc(link)}</b></span><button class="btn" id="out">Đăng xuất</button></div></div>`;
    $('out').onclick = () => fb.signOut(auth);
    stat();
  };
  const stat = (text, bad) => {
    const st = $('st'); if (!st) return;
    st.style.color = (bad || !online) ? 'var(--bad)' : 'var(--good)';
    st.textContent = text || (online ? '● Đang đồng bộ trực tiếp' : '● Mất mạng, sẽ gửi khi có mạng lại');
    $('when').textContent = lastOk ? 'Lần gửi cuối ' + lastOk : '';
  };
  const choiceUI = (kind, ts) => {
    const when = ts ? new Date(ts).toLocaleString('vi-VN') : '';
    box.innerHTML = `<div class="note"><b>${kind === 'empty' ? 'Máy chủ đang trống.' : 'Dữ liệu máy này khác dữ liệu trên máy chủ' + (when ? ' (máy chủ cập nhật ' + esc(when) + ')' : '') + '.'}</b>
      Chọn nguồn đúng trước khi đồng bộ:<div class="row" style="margin-top:8px">
      <button class="btn pri" id="pushall">Đẩy dữ liệu máy này lên máy chủ</button>${kind === 'empty' ? '' : '<button class="btn" id="pullall">Tải dữ liệu từ máy chủ về máy này</button>'}
      <button class="btn" id="out">Đăng xuất</button></div></div>`;
    $('pushall').onclick = pushAll; if ($('pullall')) $('pullall').onclick = pullAll; $('out').onclick = () => fb.signOut(auth);
  };
  const fail = e => { const m = /permission/i.test(e && (e.code || e.message)) ? 'Không có quyền ghi. Kiểm tra UID trong Rules.' : 'Lỗi gửi dữ liệu: ' + (e.code || e.message); stat(m, true); };

  async function pushAll() {
    try {
      const d = App.getData();
      await fb.set(T, { cfg: clean(d.cfg), cats: clean(d.cats), res: encodeRes(d.res), updatedAt: fb.serverTimestamp() });
      last = snapshotOf(d); auto = true; lastOk = clock(); okUI();
    } catch (e) { okUI(); fail(e); }
  }
  async function pullAll() {
    try {
      const v = (await fb.get(T)).val() || {};
      App.replaceAll({ cfg: v.cfg, cats: v.cats, res: v.res });
      last = snapshotOf(App.getData()); auto = true; lastOk = clock(); okUI();
    } catch (e) { okUI(); fail(e); }
  }
  async function push() {
    if (!auto || !user) return;
    const d = App.getData(), now = snapshotOf(d), res = encodeRes(d.res), upd = {};
    if (now.cfg !== last.cfg) upd['cfg'] = clean(d.cfg);
    if (now.cats !== last.cats) upd['cats'] = clean(d.cats);
    Object.keys(res).forEach(k => { if (last.res[k] !== now.res[k]) upd['res/' + k] = clean(res[k]); });
    Object.keys(last.res).forEach(k => { if (!(k in now.res)) upd['res/' + k] = null; });
    if (!Object.keys(upd).length) return;
    upd.updatedAt = fb.serverTimestamp();
    stat('Đang gửi…');
    try { await fb.update(T, upd); last = now; lastOk = clock(); stat(); } catch (e) { fail(e); }
  }
  App.onChange = () => { if (!auto) return; clearTimeout(timer); timer = setTimeout(push, 350); };

  fb.onValue(fb.ref(db, '.info/connected'), s => { online = !!s.val(); if (auto) stat(); });
  fb.onAuthStateChanged(auth, async u => {
    user = u; auto = false;
    if (!u) { loginUI(); return; }
    box.innerHTML = '<div class="note">Đang kiểm tra dữ liệu trên máy chủ…</div>';
    try {
      const v = (await fb.get(T)).val();
      if (!v) { choiceUI('empty'); return; }
      const server = snapshotOf({ cfg: v.cfg, cats: v.cats, res: (() => { const r = {}; Object.keys(v.res || {}).forEach(k => r[App.keyDec(k)] = v.res[k]); return r; })() });
      if (same(server, snapshotOf(App.getData()))) { last = server; auto = true; lastOk = clock(); okUI(); }
      else choiceUI('diff', v.updatedAt);
    } catch (e) { box.innerHTML = `<div class="note bad">Không đọc được máy chủ: ${esc(e.code || e.message)}</div>`; }
  });
}
