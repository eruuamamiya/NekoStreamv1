// NekoStream — Bot WhatsApp Saluran (notifikasi anime baru update)
// Jalankan: node bot.js   (butuh Node.js 18+)
const fs = require('fs'), path = require('path');

/* ===================== KONFIGURASI (bisa lewat env) ===================== */
const cfg = {
  API:      process.env.API || 'https://api.nekostream.online/otakudesu',
  KURAMA:   process.env.KURAMA || 'https://api.nekostream.online/kuramanime', // sumber banner/poster
  SITE:     (process.env.SITE_URL || 'https://v1.nekostream.online').replace(/\/$/, ''),   // alamat situs (env SITE_URL bisa menimpa)
  CHANNEL:  (process.env.CHANNEL || 'https://whatsapp.com/channel/0029VbCT7xIAjPXN42MZrF32').trim(), // link saluran ATAU 1203...@newsletter
  PAIR:     (process.env.PAIR_NUMBER || '6281287892264').replace(/\D/g, ''), // nomor WA bot (kosongkan lewat PAIR_NUMBER= untuk login QR)
  EVERY:    Math.max(1, +process.env.INTERVAL_MIN || 10) * 60000,
  MAX:      Math.max(1, +process.env.MAX_PER_CYCLE || 5),
  DELAY:    4000,                                               // jeda antar kiriman (ms)
  STATE:    path.join(__dirname, 'state.json'),
  AUTH:     path.join(__dirname, 'auth'),
};

/* ===================== NORMALISASI DATA (sama seperti app.js) ===================== */
const aid = o => o.animeId || o.anime_id || o.id || o.slug || String(o.href || o.url || o.link || '').split('/').filter(Boolean).pop();
const pic = o => o.poster || o.image || o.thumb || o.thumbnail || o.cover || o.img || o.imageUrl || o.poster_url || '';
const ttl = o => o.title || o.name || o.judul || '';
const isA = o => o && typeof o === 'object' && !Array.isArray(o) && ttl(o) && pic(o);
function collect(o, out = [], dep = 0) {
  if (!o || typeof o !== 'object' || dep > 6) return out;
  if (Array.isArray(o)) {
    if (o.length && o.filter(isA).length >= Math.ceil(o.length / 2)) { out.push(o); return out; }
    o.forEach(x => collect(x, out, dep + 1)); return out;
  }
  for (const k in o) collect(o[k], out, dep + 1); return out;
}
const findList = o => { const c = collect(o); return c.length ? c.sort((a, b) => b.length - a.length)[0] : []; };

const keyOf = o => `${o.episodes ?? ''}|${o.latestReleaseDate || o.lastReleaseDate || ''}`;

/* Bandingkan daftar terbaru dengan yang pernah dikirim -> daftar yang perlu diumumkan */
function diff(list, seen) {
  return list.filter(o => aid(o) && seen[aid(o)] !== keyOf(o));
}

function caption(o) {
  const lines = [`🔔 *${ttl(o)}*`];
  if (o.episodes != null && o.episodes !== '') lines.push(`📺 Episode: ${o.episodes}`);
  const when = [o.releaseDay, o.latestReleaseDate || o.lastReleaseDate].filter(Boolean).join(' · ');
  if (when) lines.push(`🗓️ ${when}`);
  if (cfg.SITE) lines.push('', `▶️ Nonton: ${cfg.SITE}/#/anime/${encodeURIComponent(aid(o))}`);
  return lines.join('\n');
}

/* ===================== STATE ===================== */
let st = { ready: false, seen: {}, channelJid: '', channelSrc: '', banner: {} };
try { st = { ...st, ...JSON.parse(fs.readFileSync(cfg.STATE, 'utf8')) }; } catch {}
st.seen = st.seen || {}; st.banner = st.banner || {};

// Catat anime sebagai sudah dikirim. Hapus dulu supaya posisinya pindah ke paling baru,
// jadi anime long-running tidak ikut terpangkas lalu diumumkan ulang.
const mark = (id, key) => { delete st.seen[id]; st.seen[id] = key; };

const save = () => {
  const ids = Object.keys(st.seen); if (ids.length > 600) ids.slice(0, ids.length - 600).forEach(k => delete st.seen[k]);
  const bk = Object.keys(st.banner); if (bk.length > 600) bk.slice(0, bk.length - 600).forEach(k => delete st.banner[k]);
  try { // tulis ke file sementara lalu rename, supaya state tidak rusak kalau STB mati mendadak
    const tmp = cfg.STATE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(st, null, 1));
    fs.renameSync(tmp, cfg.STATE);
  } catch (e) { console.error('Gagal simpan state:', e.message); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ===================== BANNER DARI KURAMANIME ===================== */
const normT = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const nums = s => new Set(normT(s).match(/\d+/g) || []);
function sim(a, b) { // kemiripan judul (0..1), angka season/part ikut dihitung
  const A = new Set(normT(a).split(' ').filter(Boolean)), B = new Set(normT(b).split(' ').filter(Boolean));
  if (!A.size || !B.size) return 0;
  let n = 0; A.forEach(x => B.has(x) && n++);
  let s = n / (A.size + B.size - n);
  const na = nums(a), nb = nums(b);
  if (na.size !== nb.size || [...na].some(x => !nb.has(x))) s *= 0.7; // beda season/part -> turunkan skor
  return s;
}
function bestMatch(list, title) {
  let best = null, bs = 0;
  for (const o of list) { const s = sim(ttl(o), title); if (s > bs) { bs = s; best = o; } }
  return bs >= 0.6 ? best : null;
}
async function bannerFor(o) { // tidak pernah throw; '' kalau tidak ketemu
  const id = aid(o), t = ttl(o);
  if (st.banner[id]) return st.banner[id];
  const base = t.replace(/\s*(\(?(season|part|cour)\s*\d+\)?|\d+(st|nd|rd|th)\s+season)\s*$/i, '').trim();
  let jp = ''; // judul Jepang dari detail anime Otakudesu
  try {
    const dr = await fetch(`${cfg.API}/anime/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(15000) });
    if (dr.ok) { const dj = await dr.json(), d = dj.data?.details ?? dj.data?.detail ?? dj.data ?? dj; jp = String(d.japanese || '').trim(); }
  } catch (e) { console.warn('Detail anime gagal (judul Jepang):', e.message); }
  let first = ''; // cadangan: hasil pertama (terlama) dari pencarian judul Jepang
  for (const q of [...new Set([jp, t, base])].filter(Boolean)) {
    try {
      const r = await fetch(`${cfg.KURAMA}/anime?search=${encodeURIComponent(q)}&order_by=oldest`, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) continue;
      const j = await r.json(), hit = bestMatch(findList(j.data ?? j), t);
      if (hit && pic(hit)) return (st.banner[id] = pic(hit));
      if (q === jp && !first) { const l = findList(j.data ?? j); if (l.length) first = pic(l[0]); }
    } catch (e) { console.warn('Banner Kuramanime gagal:', e.message); }
  }
  return first; // tidak di-cache supaya dicoba lagi nanti kalau judul pasnya sudah muncul
}

/* Unduh gambar sendiri (ada timeout & cek tipe) supaya tidak menggantung / mengirim file rusak */
async function fetchImg(u) {
  const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const ct = r.headers.get('content-type') || '';
  if (ct && !/^image\//i.test(ct)) throw new Error('bukan gambar (' + ct + ')');
  const buf = Buffer.from(await r.arrayBuffer());
  if (!buf.length) throw new Error('gambar kosong');
  if (buf.length > 8 * 1024 * 1024) throw new Error('gambar terlalu besar');
  return buf;
}

/* ===================== WHATSAPP ===================== */
let sock = null, open = false, busy = false, pairAsked = false;

async function resolveChannel() {
  const c = cfg.CHANNEL;
  if (!c) throw new Error('CHANNEL belum diisi (link saluran atau JID @newsletter).');
  if (st.channelJid && st.channelSrc === c) return st.channelJid; // cache hanya berlaku kalau CHANNEL tidak berubah
  if (c.endsWith('@newsletter')) { st.channelJid = c; st.channelSrc = c; save(); return c; }
  const m = c.match(/channel\/([\w-]+)/i);
  if (!m) throw new Error('Format CHANNEL tidak dikenali.');
  const meta = await sock.newsletterMetadata('invite', m[1]);
  if (!meta || !meta.id) throw new Error('Gagal mengambil ID saluran dari link.');
  console.log('ID saluran:', meta.id, '|', meta.name || '');
  st.channelJid = meta.id; st.channelSrc = c; save(); return st.channelJid;
}

async function send(jid, o) {
  const cap = caption(o);
  // urutan: banner Kuramanime -> poster Otakudesu -> teks saja
  const imgs = [await bannerFor(o), pic(o)].filter((u, i, a) => u && a.indexOf(u) === i);
  for (const img of imgs) {
    try { return await sock.sendMessage(jid, { image: await fetchImg(img), caption: cap }); }
    catch (e) { console.warn('Kirim gambar gagal (' + img + '):', e.message); }
  }
  return await sock.sendMessage(jid, { text: cap });
}

async function cycle() {
  if (busy || !open) return; busy = true;
  try {
    const r = await fetch(cfg.API + '/ongoing?page=1', { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error('API ' + r.status);
    const j = await r.json(), list = findList(j.data ?? j);
    if (!list.length) { console.log('Daftar kosong dari API, lewati.'); return; }

    if (!st.ready) { // jalan pertama: catat saja, jangan spam saluran
      list.forEach(o => { const id = aid(o); if (id) mark(id, keyOf(o)); });
      st.ready = true; save();
      console.log(`Inisialisasi: ${list.length} anime dicatat. Notifikasi dikirim mulai update berikutnya.`); return;
    }
    const fresh = diff(list, st.seen).slice(0, cfg.MAX).reverse(); // paling lama dulu
    if (!fresh.length) { console.log(new Date().toLocaleTimeString(), 'Tidak ada update baru.'); return; }
    const jid = await resolveChannel();
    for (let i = 0; i < fresh.length; i++) {
      const o = fresh[i];
      if (!open) { console.log('Koneksi putus di tengah pengiriman, dilanjutkan di siklus berikutnya.'); break; }
      try { await send(jid, o); mark(aid(o), keyOf(o)); save(); console.log('Terkirim:', ttl(o), keyOf(o)); }
      catch (e) { console.error('Gagal kirim', ttl(o), '-', e.message); }
      if (i < fresh.length - 1) await sleep(cfg.DELAY);
    }
  } catch (e) { console.error('Cycle error:', e.message); }
  finally { busy = false; }
}

let reconnectTimer = null;
async function start() {
  const b = await import('@whiskeysockets/baileys');
  const make = b.makeWASocket || (b.default && b.default.default) || b.default;
  const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = b;
  const pino = require('pino');
  const { state, saveCreds } = await useMultiFileAuthState(cfg.AUTH);
  const { version } = await fetchLatestBaileysVersion().catch(() => ({}));

  const s = make({ auth: state, version, logger: pino({ level: 'silent' }), browser: ['NekoStream', 'Chrome', '1.0'] });
  sock = s;
  s.ev.on('creds.update', saveCreds);
  s.ev.on('connection.update', async u => {
    if (s !== sock) return; // abaikan event dari socket lama supaya tidak menyambung ulang ganda
    const { connection, lastDisconnect, qr } = u;
    if (qr && !state.creds.registered) {
      if (cfg.PAIR && !pairAsked) {
        pairAsked = true;
        try { const code = await s.requestPairingCode(cfg.PAIR);
          console.log(`\nKODE PAIRING: ${code}\nWhatsApp > Perangkat tertaut > Tautkan perangkat > Tautkan dengan nomor telepon\n`);
        } catch (e) { console.error('Gagal minta kode pairing:', e.message); pairAsked = false; }
      } else if (!cfg.PAIR) {
        try { require('qrcode-terminal').generate(qr, { small: true }); } catch { console.log('QR:', qr); }
        console.log('Scan QR di atas lewat WhatsApp > Perangkat tertaut.');
      }
    }
    if (connection === 'open') { open = true; console.log('✅ WhatsApp tersambung.'); cycle(); }
    if (connection === 'close') {
      open = false;
      const code = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output && lastDisconnect.error.output.statusCode;
      if (code === DisconnectReason.loggedOut) {
        console.error('Sesi keluar (logged out). Hapus folder "auth" lalu jalankan ulang untuk login lagi.'); process.exit(1);
      }
      console.log('Koneksi putus (' + code + '), menyambung ulang…'); pairAsked = false;
      try { s.ev.removeAllListeners(); } catch {}
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => start().catch(e => { console.error('Gagal menyambung ulang:', e.message); reconnectTimer = setTimeout(() => start().catch(() => {}), 15000); }), 5000);
    }
  });
}

if (require.main === module) {
  if (!cfg.CHANNEL) console.warn('⚠️  Isi env CHANNEL dengan link saluran WhatsApp kamu.');
  process.on('unhandledRejection', e => console.error('Unhandled rejection:', e && e.message || e));
  process.on('uncaughtException', e => console.error('Uncaught exception:', e && e.message || e));
  start().catch(e => { console.error(e); process.exit(1); });
  setInterval(cycle, cfg.EVERY);
}
module.exports = { findList, diff, keyOf, caption, bestMatch, mark };
