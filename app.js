const API='https://api.nekostream.online/otakudesu';
const $=s=>document.querySelector(s), app=$('#app');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ls={get(k,d){try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}};
const cache=new Map();
async function api(p,opt){
  if(!opt&&cache.has(p))return cache.get(p);
  const r=await fetch(API+p,opt); if(!r.ok)throw new Error('API '+r.status);
  const j=await r.json(); window.__last={p,j}; if(!opt)cache.set(p,j); return j;
}
/* normalisasi data: tahan terhadap variasi nama field */
const aid=o=>o.animeId||o.anime_id||o.genreId||o.id||o.slug||String(o.href||o.url||o.link||'').split('/').filter(Boolean).pop();
const pic=o=>o.poster||o.image||o.thumb||o.thumbnail||o.cover||o.img||o.imageUrl||o.poster_url||'';
const ttl=o=>o.title||o.name||o.judul||'';
const isA=o=>o&&typeof o==='object'&&!Array.isArray(o)&&ttl(o)&&pic(o);
function collect(o,path='',out=[],dep=0){
  if(!o||typeof o!=='object'||dep>6)return out;
  if(Array.isArray(o)){ if(o.length&&o.filter(isA).length>=Math.ceil(o.length/2)){out.push({path,list:o});return out}
    o.forEach((x,i)=>collect(x,path+'.'+i,out,dep+1));return out}
  for(const k in o)collect(o[k],path?path+'.'+k:k,out,dep+1);return out}
function findList(o){const c=collect(o);return c.length?c.slice().sort((a,b)=>b.list.length-a.list.length)[0].list:[]}
function anyList(o,dep=0){ if(!o||typeof o!=='object'||dep>6)return[];
  if(Array.isArray(o)){ if(o.length&&typeof o[0]==='object'&&ttl(o[0]))return o; for(const x of o){const r=anyList(x,dep+1);if(r.length)return r}return[]}
  for(const k in o){const r=anyList(o[k],dep+1);if(r.length)return r}return[]}
/* cari daftar episode di mana pun posisinya & samakan nama field */
const epLabel=t=>{t=String(t??'').trim();return /^\d+(\.\d+)?$/.test(t)?'Episode '+t:(t||'Episode')};
function findEps(o,depth=0){
  if(!o||typeof o!=='object'||depth>5)return[];
  if(Array.isArray(o)){
    if(o.length&&typeof o[0]==='object'&&(o[0].episodeId||o[0].episode_id||/episode/i.test(String(o[0].href||o[0].url||o[0].otakudesuUrl||o[0].slug||'')))){
      return o.map(e=>({episodeId:e.episodeId||e.episode_id||e.id||String(e.href||e.url||e.otakudesuUrl||e.slug||'').split('/').filter(Boolean).pop(),
        title:epLabel(e.title||e.episode||(e.eps!=null?e.eps:'')),date:e.date||e.releaseDate||e.uploadedAt||''}))}
    for(const x of o){const r=findEps(x,depth+1);if(r.length)return r}return[]}
  const pref=['episodeList','episodes','episode_list','eps','episode'];
  for(const k of pref){if(Array.isArray(o[k])){const r=findEps(o[k],depth+1);if(r.length)return r}}
  for(const k in o){if(k==='recommendedAnimeList')continue;const r=findEps(o[k],depth+1);if(r.length)return r}
  return[]}
const epNum=e=>{const m=String(e.title).match(/(\d+(?:\.\d+)?)/g);return m?parseFloat(m[m.length-1]):NaN};

/* ---------- banner dari Kuramanime (cache di localStorage) ---------- */
const KURAMA='https://api.nekostream.online/kuramanime';
const normT=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const numsT=s=>new Set(normT(s).match(/\d+/g)||[]);
function simT(x,y){const A=new Set(normT(x).split(' ').filter(Boolean)),B=new Set(normT(y).split(' ').filter(Boolean));if(!A.size||!B.size)return 0;
  let n=0;A.forEach(k=>B.has(k)&&n++);let s=n/(A.size+B.size-n);const na=numsT(x),nb=numsT(y);
  if(na.size!==nb.size||[...na].some(k=>!nb.has(k)))s*=0.7;return s}
function bestMatch(list,title){let best=null,bs=0;for(const o of list){const s=simT(ttl(o),title);if(s>bs){bs=s;best=o}}return bs>=0.6?best:null}
async function banner(title,id,jp){
  if(!title)return '';
  const bn=ls.get('bn',{}); if(bn[title])return bn[title];
  const base=title.replace(/\s*(\(?(season|part|cour)\s*\d+\)?|\d+(st|nd|rd|th)\s+season)\s*$/i,'').trim();
  if(!jp&&id){ try{ const dr=await fetch(API+'/anime/'+encodeURIComponent(id)); if(dr.ok){const dj=await dr.json(),dd=dj.data?.details??dj.data?.detail??dj.data??dj; jp=String(dd.japanese||'').trim()} }catch{} }
  let first=''; /* cadangan: hasil pertama (terlama) dari pencarian judul Jepang */
  for(const q of [...new Set([jp,title,base])].filter(Boolean)){
    try{ const r=await fetch(KURAMA+'/anime?search='+encodeURIComponent(q)+'&order_by=oldest'); if(!r.ok)continue;
      const j=await r.json(), hit=bestMatch(findList(j.data??j),title);
      if(hit){ const u=pic(hit), m=ls.get('bn',{}); m[title]=u; const ks=Object.keys(m); if(ks.length>300)delete m[ks[0]]; ls.set('bn',m); return u }
      if(q===jp&&!first){const l=findList(j.data??j);if(l.length)first=pic(l[0])}
    }catch{}
  }
  return first}
function card(o){
  const sub=o.episodes!=null&&o.episodes!==''?'Eps '+o.episodes:(o.score?'★ '+o.score:(o.status||''));
  const meta=[o.releaseDay,o.latestReleaseDate||o.lastReleaseDate].filter(Boolean).join(' · ');
  return `<a class="card" href="#/anime/${encodeURIComponent(aid(o))}"><div class="im" style="background-image:url('${esc(pic(o))}')">${sub?`<span class="bd">${esc(sub)}</span>`:''}</div><div class="tt">${esc(ttl(o))}</div><div class="mt">${esc(meta)||'&nbsp;'}</div></a>`}
const grid=l=>l.length?`<div class="grid">${l.map(card).join('')}</div>`:'<div class="err">Tidak ada data.</div>';
const loading=()=>app.innerHTML='<div class="ld"><div class="sp2"></div>Memuat…</div>';
const fail=e=>app.innerHTML=`<div class="err">😿 Gagal memuat data.<br><small>${esc(e.message)}</small><br><br><button class="btn g" onclick="route()">Coba lagi</button></div>`;
function pager(base,page,json,n){
  const pg=json.pagination||{}; const next=pg.hasNextPage??(n>0), prev=pg.hasPrevPage??(page>1);
  return `<div class="pg">${prev?`<a class="btn g" href="#/${base}/${page-1}">← Sebelumnya</a>`:''}<span>Hal. ${page}${pg.totalPages?' / '+pg.totalPages:''}</span>${next?`<a class="btn g" href="#/${base}/${page+1}">Berikutnya →</a>`:''}</div>`}

/* ---------- halaman ---------- */
async function home(){
  const j=await api('/home'), d=j.data??j;
  const cs=collect(d), pick=re=>(cs.find(c=>re.test(c.path))||{}).list;
  let on=pick(/ongoing|latest|new|update|recent/i), co=pick(/complete|finish|tamat/i);
  if(!on)on=(cs[0]||{}).list||[]; if(!co)co=(cs.find(c=>c.list!==on)||{}).list||[];
  const hs=on.slice(0,5); let i=0;
  app.innerHTML=`<div class="hero" id="hero"></div>
  <h2 class="t">Sedang Tayang</h2>${grid(on)}<div class="pg"><a class="btn g" href="#/ongoing/1">Lihat semua →</a></div>
  <h2 class="t">Baru Selesai</h2>${grid(co)}<div class="pg"><a class="btn g" href="#/completed/1">Lihat semua →</a></div>`;
  const hero=$('#hero'); if(!hs.length){hero.remove();return}
  const show=n=>{i=n;const o=hs[n];hero.innerHTML=`<div class="bg" style="background-image:url('${esc((o.__b||pic(o)))}')"></div><div class="in"><img src="${esc((o.__b||pic(o)))}" alt=""><div><span class="chip" style="color:#fff;border-color:#fff5">${esc(o.releaseDay||'Terbaru')}${o.episodes?' · Eps '+esc(o.episodes):''}</span><h1>${esc(ttl(o))}</h1><p>${esc(o.latestReleaseDate||o.lastReleaseDate||'Tonton sekarang dengan subtitle Indonesia.')}</p><a class="btn" href="#/anime/${encodeURIComponent(aid(o))}">▶ Tonton</a></div></div><div class="dots">${hs.map((_,k)=>`<i class="${k==n?'on':''}" data-i="${k}"></i>`).join('')}</div>`;
    hero.querySelectorAll('.dots i').forEach(x=>x.onclick=()=>{clearInterval(tm);show(+x.dataset.i)})};
  show(0); const tm=setInterval(()=>{if(!document.body.contains(hero))return clearInterval(tm);show((i+1)%hs.length)},6000);
  hs.forEach(o=>banner(ttl(o),aid(o)).then(u=>{if(u){o.__b=u;if(document.body.contains(hero))show(i)}}));
}
function history(){
  const h=ls.get('hist',[]);
  app.innerHTML=`<h2 class="t">Riwayat · Lanjut Menonton${h.length?` <button class="btn g" id="hc" style="padding:5px 12px;font-size:.8rem;margin-left:8px">🗑 Hapus semua</button>`:''}</h2>`+
  (h.length?`<div class="eps">${h.map(x=>`<a class="ep" href="#/episode/${encodeURIComponent(x.id)}"><span>${esc(x.title)}</span><small>▶ Lanjut</small></a>`).join('')}</div>`
  :'<div class="err">Belum ada riwayat tontonan.<br><small>Episode yang kamu buka akan muncul di sini.</small></div>');
  const b=$('#hc'); if(b)b.onclick=()=>{if(confirm('Hapus semua riwayat tontonan?')){ls.set('hist',[]);history()}};
  document.title='Riwayat — NekoStream'}
async function listPage(kind,page){
  const j=await api(`/${kind}?page=${page}`), l=findList(j.data??j);
  app.innerHTML=`<h2 class="t">${kind=='ongoing'?'Sedang Tayang':'Anime Selesai'}</h2>${grid(l)}${pager(kind,page,j,l.length)}`}
async function allAnime(){
  const j=await api('/anime'), d=j.data??j;
  let groups=null;
  (function walk(o,dep=0){ if(groups||!o||typeof o!=='object'||dep>5)return;
    if(Array.isArray(o)){
      if(o.length&&o.every(x=>x&&typeof x==='object'&&Array.isArray(x.animeList||x.list||x.anime))){
        groups=o.map(x=>({k:String(x.startWith||x.letter||x.key||x.title||'#'),l:x.animeList||x.list||x.anime}));return}
      o.forEach(x=>walk(x,dep+1));return}
    for(const k in o)walk(o[k],dep+1)})(d);
  if(!groups){ /* respons datar -> kelompokkan sendiri per huruf awal */
    const g={}; anyList(d).forEach(a=>{const c=(ttl(a)[0]||'#').toUpperCase();const k=/[A-Z]/.test(c)?c:'#';(g[k]=g[k]||[]).push(a)});
    groups=Object.keys(g).sort().map(k=>({k,l:g[k]}))}
  groups=groups.filter(g=>g.l&&g.l.length);
  if(!groups.length){app.innerHTML='<div class="err">Daftar anime kosong.</div>';return}
  const total=groups.reduce((n,g)=>n+g.l.length,0);
  app.innerHTML=`<h2 class="t">Daftar Anime <small style="color:var(--mut);font-weight:400;font-size:.85rem">${total} judul</small></h2>
  <input class="lf" id="lf" placeholder="Filter judul…" autocomplete="off">
  <div class="az">${groups.map(g=>`<a href="#/list" data-g="${esc(g.k)}">${esc(g.k)}</a>`).join('')}</div>
  <div id="lgs">${groups.map(g=>`<section class="lg" id="g-${esc(g.k)}"><h3>${esc(g.k)}</h3><div class="ll">${g.l.map(a=>`<a href="#/anime/${encodeURIComponent(aid(a))}" data-t="${esc(ttl(a).toLowerCase())}">${esc(ttl(a))}</a>`).join('')}</div></section>`).join('')}</div>`;
  app.querySelectorAll('.az a').forEach(a=>a.onclick=e=>{e.preventDefault();document.getElementById('g-'+a.dataset.g)?.scrollIntoView({behavior:'smooth'})});
  $('#lf').oninput=e=>{const q=e.target.value.trim().toLowerCase();
    app.querySelectorAll('.lg').forEach(sec=>{let n=0;sec.querySelectorAll('.ll a').forEach(a=>{const ok=!q||a.dataset.t.includes(q);a.style.display=ok?'':'none';if(ok)n++});sec.style.display=n?'':'none'})};
  document.title='Daftar Anime — NekoStream'}
async function genres(){
  const j=await api('/genre'); const l=(j.data?.genreList&&j.data.genreList.length?j.data.genreList:anyList(j.data??j));
  app.innerHTML=`<h2 class="t">Semua Genre</h2><div class="chips">${l.map(g=>`<a class="chip" href="#/genre/${encodeURIComponent(aid(g))}/1">${esc(ttl(g))}</a>`).join('')}</div>`}
async function byGenre(id,page){
  const j=await api(`/genre/${encodeURIComponent(id)}?page=${page}`), l=findList(j.data??j);
  app.innerHTML=`<h2 class="t">Genre: ${esc(id)}</h2>${grid(l)}${pager('genre/'+encodeURIComponent(id),page,j,l.length)}`}
async function schedule(){
  const j=await api('/schedule'); let days=(j.data??j).days; if(!Array.isArray(days)||!days.length)days=collect(j.data??j).map(c=>({day:c.path.split('.').filter(x=>isNaN(x)).pop(),animeList:c.list}));
  app.innerHTML=`<h2 class="t">Jadwal Rilis</h2>`+days.map(d=>`<div class="day"><h2 class="t" style="font-size:1.05rem;color:var(--a)">${esc(d.day)}</h2>${(d.animeList||[]).length?`<div class="chips">${d.animeList.map(a=>`<a class="chip" href="#/anime/${encodeURIComponent(aid(a))}">${esc(a.title)}</a>`).join('')}</div>`:''}</div>`).join('')}
async function search(q){
  const j=await api('/search?q='+encodeURIComponent(q)), l=findList(j.data??j);
  app.innerHTML=`<h2 class="t">Hasil untuk “${esc(q)}”</h2>${grid(l)}`}
async function detail(id){
  const j=await api('/anime/'+encodeURIComponent(id));
  /* API mengembalikan { data: { details: {...} } } */
  const d=j.data?.details??j.data?.detail??j.data??j;
  const eps=findEps(d), seen=new Set(ls.get('seen',[]));
  const asc=eps.length>1&&epNum(eps[0])<epNum(eps[eps.length-1]);
  const first=eps.length?(asc?eps[0]:eps[eps.length-1]):null;
  if(!eps.length)console.warn('Episode tidak ditemukan. Isi data:',d);
  const val=v=>Array.isArray(v)?v.map(x=>typeof x==='object'?ttl(x):x).join(', '):(v&&typeof v==='object'?ttl(v):v);
  const keys=[['Judul Jepang',['japanese']],['Skor',['score']],['Tipe',['type']],['Status',['status']],['Total Episode',['episodes']],['Durasi',['duration']],['Rilis',['aired']],['Studio',['studios','studio']],['Produser',['producers','producer']]];
  const info=keys.map(([lb,ks])=>{const k=ks.find(x=>d[x]!=null&&d[x]!=='');return k?[lb,val(d[k])]:null}).filter(Boolean);
  const sy=d.synopsis;
  const syn=Array.isArray(sy?.paragraphList)?sy.paragraphList.join('\n\n'):Array.isArray(sy?.paragraphs)?sy.paragraphs.join('\n\n'):(typeof sy==='string'?sy:'');
  /* batch */
  let batchId=d.batch&&(d.batch.batchId||d.batch.id);
  if(!batchId&&d.batch){const u=d.batch.otakudesuUrl||d.batch.url;if(u)batchId=String(u).split('/').filter(Boolean).pop()}
  const recs=d.recommendedAnimeList||[];
  app.innerHTML=`<div class="det"><div><img src="${esc(pic(d))}" alt="">${first?`<a class="btn" style="width:100%;justify-content:center" href="#/episode/${encodeURIComponent(first.episodeId)}">▶ Mulai Menonton</a>`:''}</div>
  <div><h1 style="font-size:1.8rem">${esc(d.title)}</h1>
  <div class="chips" style="margin-top:10px">${(d.genreList||[]).map(g=>`<a class="chip" href="#/genre/${encodeURIComponent(aid(g))}/1">${esc(ttl(g))}</a>`).join('')}</div>
  <div class="info">${info.map(([lb,v])=>`<div>${lb}: <b>${esc(v)}</b></div>`).join('')}</div>
  <h2 class="t" style="margin:18px 0 8px;font-size:1.05rem">Sinopsis</h2>
  <p style="color:var(--mut);line-height:1.7;white-space:pre-line">${esc(syn)||'Sinopsis tidak tersedia.'}</p></div></div>
  <h2 class="t">Daftar Episode</h2><div class="eps">${eps.map(e=>`<a class="ep ${seen.has(e.episodeId)?'seen':''}" href="#/episode/${encodeURIComponent(e.episodeId)}"><span>${esc(e.title||('Episode '+e.eps))}</span><small>${esc(e.date||'')}</small></a>`).join('')||'<div class="err">Belum ada episode.<br><small>Jika seharusnya ada, buka Console browser (F12) dan kirim isi log "Episode tidak ditemukan" agar bisa dicocokkan.</small></div>'}</div>
  ${recs.length?`<h2 class="t">Rekomendasi</h2>${grid(recs)}`:''}`;
  document.title=(d.title||'Anime')+' — NekoStream';
  banner(d.title,null,d.japanese).then(u=>{const im=app.querySelector('.det img');if(u&&im)im.src=u})}
/* ---- helper streaming: tahan terhadap variasi struktur respons ---- */
const firstUrl=(o,dep=0)=>{ if(o==null||dep>5)return '';
  if(typeof o==='string'){ const m=o.match(/<iframe[^>]+src=["']([^"']+)/i); if(m)return m[1]; return /^(https?:)?\/\//i.test(o.trim())?o.trim():''}
  if(typeof o!=='object')return '';
  for(const k of ['url','link','embed','streamingUrl','streaming_url','src','iframe','embedUrl']){const r=firstUrl(o[k],dep+1);if(r)return r}
  for(const k in o){const r=firstUrl(o[k],dep+1);if(r)return r}
  return ''};
function findServers(o,title='',out=[],dep=0){
  if(!o||typeof o!=='object'||dep>7)return out;
  if(Array.isArray(o)){
    const sv=o.filter(x=>x&&typeof x==='object'&&(x.serverId||x.server_id));
    if(sv.length&&sv.length>=o.length/2){out.push({title,list:sv.map(x=>({title:x.title||x.name||x.server||'Server',serverId:x.serverId||x.server_id}))});return out}
    o.forEach(x=>findServers(x,x&&(x.title||x.quality)||title,out,dep+1));return out}
  const t=(typeof o.title==='string'&&o.title)||(typeof o.quality==='string'&&o.quality)||title;
  for(const k in o)findServers(o[k],t,out,dep+1);return out}
function findDownloads(o,out=[],dep=0){
  if(!o||typeof o!=='object'||dep>7)return out;
  if(Array.isArray(o)){
    const ul=x=>x&&typeof x==='object'&&(Array.isArray(x.urls)?x.urls:Array.isArray(x.urlList)?x.urlList:Array.isArray(x.links)?x.links:null);
    if(o.length&&o.every(x=>ul(x)&&ul(x).length))return o.forEach(x=>out.push({title:x.title||x.quality||'',size:x.size||'',urls:ul(x).map(u=>({title:u.title||u.name||'Link',url:u.url||u.link||u.href||''})).filter(u=>u.url)}))||out;
    o.forEach(x=>findDownloads(x,out,dep+1));return out}
  for(const k in o)findDownloads(o[k],out,dep+1);return out}
const epRef=(o)=>o&&typeof o==='object'?(o.episodeId||o.episode_id||o.id||String(o.href||o.url||'').split('/').filter(Boolean).pop()):(o||'');
async function getServer(sid){
  let r; try{ r=await api('/server/'+encodeURIComponent(sid)) }
  catch(e){ r=await api('/server/'+encodeURIComponent(sid),{method:'POST'}) }
  let u=firstUrl(r.data??r);
  if(!u){ try{ r=await api('/server/'+encodeURIComponent(sid),{method:'POST'}); u=firstUrl(r.data??r) }catch{} }
  return u}
const frame=u=>`<iframe src="${esc(u)}" referrerpolicy="no-referrer" allowfullscreen allow="autoplay; fullscreen; picture-in-picture"></iframe>`;

function adNotice(force){
  try{ if(!force&&sessionStorage.getItem('adn'))return; sessionStorage.setItem('adn','1') }catch{}
  if($('#adn'))return;
  document.body.insertAdjacentHTML('beforeend',`<div id="adn" style="position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;padding:18px"><div style="max-width:440px;width:100%;background:var(--bg2);color:var(--tx);border:1px solid #e0a43a;border-radius:16px;padding:22px;line-height:1.6;font-size:.92rem">
  <h2 style="font-size:1.15rem;margin-bottom:10px">⚠️ Pemberitahuan Penting</h2>
  <p>Iklan yang muncul di dalam video berasal dari <b>server pihak ketiga</b>, <b>bukan dari kami</b>, dan kami tidak mendapat keuntungan darinya.</p>
  <p style="margin-top:8px"><b>Judi online dilarang</b> dan melanggar hukum. Jangan tergiur iklan judi, slot, atau pinjol.</p>
  <p style="margin-top:8px">💡 <b>Saran:</b> pakai browser <b>Brave</b> (pemblokir iklan bawaan) dan pasang ekstensi <b>ad blocker</b> agar nonton lebih nyaman dan aman.</p>
  <button class="btn" id="adnx" style="margin-top:16px;width:100%;justify-content:center">Saya mengerti</button></div></div>`);
  const c=()=>$('#adn')?.remove(); $('#adnx').onclick=c; $('#adn').onclick=e=>{if(e.target.id==='adn')c()}}
async function episode(id){
  const j=await api('/episode/'+encodeURIComponent(id));
  const root=j.data??j, d=root.details??root.detail??root.episode??root;
  const s=ls.get('seen',[]); if(!s.includes(id)){s.unshift(id);ls.set('seen',s.slice(0,500))}
  const title=d.title||root.title||id;
  const h=ls.get('hist',[]).filter(x=>x.id!==id); h.unshift({id,title}); ls.set('hist',h.slice(0,50));
  const animeId=d.animeId||d.anime?.animeId||root.animeId;
  const prev=(d.hasPrevEpisode??!!d.prevEpisode)&&epRef(d.prevEpisode), next=(d.hasNextEpisode??!!d.nextEpisode)&&epRef(d.nextEpisode);
  const qs=findServers(d.server??d).map(q=>({title:String(q.title||'').trim(),list:q.list.filter(v=>!/filedon/i.test(v.title))})).filter(q=>q.list.length);
  const def=firstUrl(d.defaultStreamingUrl)||firstUrl(d.streamingUrl)||firstUrl(d.stream)||firstUrl(d.iframe)||firstUrl(d.embed);
  const blocked=u=>/desustream/i.test(u||''), useDef=def&&!(blocked(def)&&qs.length);
  const dls=findDownloads(d.downloadUrl??d.download??d);
  const eps=findEps(d.info??d), seenSet=new Set(ls.get('seen',[]));
  app.innerHTML=`<h1 style="font-size:1.35rem;margin-bottom:14px">${esc(title)}</h1>
  <div style="display:flex;gap:10px;align-items:flex-start;margin-bottom:12px;padding:11px 14px;border-radius:12px;background:var(--card);border:1px solid #e0a43a;font-size:.84rem;line-height:1.55"><span style="font-size:1.1rem">⚠️</span><div><b>Pemberitahuan:</b> Iklan yang muncul di dalam video berasal dari server pihak ketiga, <b>bukan dari kami</b>, dan kami tidak mendapat keuntungan darinya. <b>Judi online dilarang</b> dan melanggar hukum, jangan tergiur iklan judi, slot, atau pinjol.<br>💡 <b>Saran:</b> gunakan browser <b>Brave</b> dan pasang ekstensi <b>ad blocker</b>.</div></div>
  <div class="player" id="pl">${useDef?frame(def):(qs.length?'<div class="ld"><div class="sp2"></div>Memuat server…</div>':'<div class="err">Video belum tersedia untuk episode ini.</div>')}</div>
  <div class="srv" style="margin:8px 0 0"><b style="min-width:0">Video error?</b><button id="nx">⏭ Coba server lain</button><a class="chip" id="op" target="_blank" rel="noopener noreferrer" ${def?`href="${esc(def)}"`:'style="display:none"'}>Buka di tab baru ↗</a></div>
  <div style="display:flex;gap:10px;margin:14px 0;flex-wrap:wrap">${prev?`<a class="btn g" href="#/episode/${encodeURIComponent(prev)}">← Sebelumnya</a>`:''}${animeId?`<a class="btn g" href="#/anime/${encodeURIComponent(animeId)}">☰ Semua Episode</a>`:''}${next?`<a class="btn" style="margin:0" href="#/episode/${encodeURIComponent(next)}">Berikutnya →</a>`:''}</div>
  ${qs.length||useDef?`<h2 class="t" style="margin-top:6px">Pilih Server</h2>`:''}${useDef?`<div class="srv"><b>Utama</b><button id="dfl" class="on">Default</button></div>`:''}
  ${qs.length?qs.map(q=>`<div class="srv"><b>${esc(q.title)}</b>${q.list.map(v=>`<button data-s="${esc(v.serverId)}">${esc(v.title)}</button>`).join('')}</div>`).join(''):''}
  ${dls.length?`<h2 class="t">Unduh</h2>`+dls.map(q=>`<div class="srv"><b>${esc(q.title||'')}${q.size?' · '+esc(q.size):''}</b>${(q.urls||[]).map(u=>`<a class="chip" target="_blank" rel="noopener noreferrer" href="${esc(u.url)}">${esc(u.title)}</a>`).join('')}</div>`).join(''):''}
  ${eps.length?`<h2 class="t">Daftar Episode</h2><div class="eps">${eps.map(e=>`<a class="ep ${seenSet.has(e.episodeId)&&e.episodeId!==id?'seen':''}" ${e.episodeId===id?'style="border-color:var(--a);color:var(--a)"':''} href="#/episode/${encodeURIComponent(e.episodeId)}"><span>${esc(e.title)}</span><small>${e.episodeId===id?'▶ diputar':esc(e.date||'')}</small></a>`).join('')}</div>`:''}`;
  const pl=$('#pl'); adNotice();
  let idx=-1; const setOpen=u=>{const a=$('#op');a.href=u;a.style.display=''};
  const pick=async b=>{
    app.querySelectorAll('.srv button').forEach(x=>x.classList.remove('on')); b.classList.add('on'); idx=btns.indexOf(b);
    pl.innerHTML='<div class="ld"><div class="sp2"></div>Memuat server…</div>';
    try{ const u=await getServer(b.dataset.s);
      if(u)setOpen(u);
      if(u&&blocked(u)){pl.innerHTML=`<div class="err">Server ini menolak diputar di dalam situs (diblokir host).<br><a class="btn g" target="_blank" rel="noopener noreferrer" href="${esc(u)}">Buka di tab baru ↗</a></div>`;return false}
      pl.innerHTML=u?frame(u):'<div class="err">Server ini tidak tersedia, coba server lain.</div>';
      return !!u
    }catch(e){ pl.innerHTML='<div class="err">Gagal memuat server, coba server lain.</div>'; return false } };
  const btns=[...app.querySelectorAll('.srv button[data-s]')];
  btns.forEach(b=>b.onclick=()=>pick(b));
  if($('#dfl'))$('#dfl').onclick=e=>{app.querySelectorAll('.srv button').forEach(x=>x.classList.remove('on'));e.target.classList.add('on');idx=-1;pl.innerHTML=frame(def);setOpen(def)};
  $('#nx').onclick=async()=>{const st=idx;for(let n=1;n<=btns.length;n++){if(await pick(btns[(st+n)%btns.length]))return}};
  /* tidak ada link default -> otomatis coba server satu per satu sampai ada yang jalan */
  if(!useDef&&btns.length){ let ok=false; for(const b of btns){ if(await pick(b)){ok=true;break} } if(!ok&&def){pl.innerHTML=`<div class="err">Semua server menolak diputar di dalam situs.<br><a class="btn" target="_blank" rel="noopener noreferrer" href="${esc(def)}">▶ Buka video di tab baru</a></div>`;setOpen(def)} }
  if(!def&&!btns.length)console.warn('Server/video tidak ditemukan. Isi data:',d);
  document.title=title+' — NekoStream'}

/* ---------- router ---------- */
async function route(){
  const p=(location.hash.slice(1)||'/').split('/').filter(Boolean).map(decodeURIComponent);
  const [a,b,c]=p; document.title='NekoStream — Nonton Anime Sub Indo'; scrollTo(0,0);
  document.querySelectorAll('#nav a').forEach(x=>x.classList.toggle('on',x.dataset.k===(a||'home')||(a=='genres'&&x.dataset.k=='genre')));
  loading();
  try{
    if(!a)await home();
    else if(a=='ongoing'||a=='completed')await listPage(a,+b||1);
    else if(a=='history')history();
    else if(a=='list')await allAnime();
    else if(a=='genres')await genres();
    else if(a=='genre')await byGenre(b,+c||1);
    else if(a=='schedule')await schedule();
    else if(a=='search')await search(b||'');
    else if(a=='anime')await detail(b);
    else if(a=='episode')await episode(b);
    else app.innerHTML='<div class="err">Halaman tidak ditemukan.</div>';
  }catch(e){fail(e)}
}
addEventListener('hashchange',route);
$('#sf').onsubmit=e=>{e.preventDefault();const q=$('#q').value.trim();if(q)location.hash='#/search/'+encodeURIComponent(q)};
const root=document.documentElement; root.dataset.theme=ls.get('theme','dark');
$('#th').onclick=()=>{root.dataset.theme=root.dataset.theme=='dark'?'light':'dark';ls.set('theme',root.dataset.theme)};

route();
