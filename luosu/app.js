// 使用公共 CORS 代理
const CORS_PROXY = 'https://corsproxy.io/?';
const API_TARGET = 'https://api.luosu.top';
const PLATFORM_ENDPOINTS = { wymusic:'/api/wymusic/index.php', kgmusic:'/api/kgmusic/index.php', qqmusic:'/api/qqmusic/index.php' };

// ⚠️ 请务必填入你 corsproxy.io 后台的完整 API Key
const API_KEY = "b0328f2d"; 

let state = { platform:'wymusic', songs:[], currentIndex:-1, lyricLines:[], lyricTimer:null };

function $(id){ return document.getElementById(id); }
function setStatus(msg, isErr) { const el=$('status'); el.textContent=msg; el.className=isErr?'err':''; }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmtTime(sec){ sec=Math.floor(Number(sec)||0); return Math.floor(sec/60) + ':' + String(sec%60).padStart(2,'0'); }

/* ---------- 平台切换 ---------- */
$('platformTabs').addEventListener('click', e => {
  const btn = e.target.closest('button'); if(!btn) return;
  document.querySelectorAll('.platform-tabs button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.platform = btn.dataset.platform;
  $('resultList').innerHTML = '<div class="placeholder">重新搜索</div>';
  $('audio').pause();
  clearLyricTimer();
});

/* ---------- 搜索 ---------- */
async function doSearch(){
  const kw = $('keyword').value.trim(); 
  if(!kw) return;
  
  const btn = $('searchBtn');
  btn.disabled = true;
  $('resultList').innerHTML = '<div class="placeholder">搜索中…</div>';
  setStatus('搜索中…');
  
  try {
    const path = PLATFORM_ENDPOINTS[state.platform];
    const targetUrl = `${API_TARGET}${path}?ss=${encodeURIComponent(kw)}&format=json&t=20`;
    
    // corsproxy.io 官方要求的传参方式
    const params = new URLSearchParams({ key: API_KEY, url: targetUrl });
    const res = await fetch(CORS_PROXY + params);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    
    let list = json.data?.songs || json.data || json.songs || [];
    if(!list.length) throw new Error('无结果');
    
    state.songs = list.map(normalizeSong);
    renderList();
    setStatus(`找到 ${state.songs.length} 首`);
  } catch(e) {
    console.error(e);
    $('resultList').innerHTML = `<div class="placeholder err">搜索失败：${e.message}</div>`;
    setStatus('搜索失败', true);
  } finally {
    btn.disabled = false;
  }
}

function normalizeSong(s, i){
  let artist = typeof s.singer === 'string' ? s.singer : (s.singer?.[0]?.name || '未知');
  return {
    id: s.songmid || s.id || s.songid || String(i),
    hash: s.hash || '',
    name: s.name || s.songname || s.title || '未知歌曲',
    artist: artist, 
    duration: s.duration || s.interval || 0, 
    raw: s
  };
}

function renderList(){
  $('resultList').innerHTML = state.songs.map((s,i) => `
    <div class="song-item ${i===state.currentIndex?'active':''}" onclick="selectSong(${i})">
      <span class="idx">${i+1}</span>
      <div class="meta">
        <div class="title">${escapeHtml(s.name)}</div>
        <div class="sub">${escapeHtml(s.artist)}</div>
      </div>
      ${s.duration ? `<span class="dur">${fmtTime(s.duration)}</span>` : ''}
    </div>
  `).join('');
}

/* ---------- 播放逻辑（纯网页版核心） ---------- */
async function selectSong(index){
  state.currentIndex = index;
  renderList();
  
  const s = state.songs[index];
  $('nowName').textContent = s.name;
  $('nowArtist').textContent = s.artist;
  $('officialBtn').disabled = false;
  
  setStatus('获取播放地址…');
  $('lyricArea').innerHTML = '<div class="placeholder">加载中…</div>';
  clearLyricTimer();
  
  const audio = $('audio');
  audio.pause(); audio.removeAttribute('src'); audio.load();

  try {
    const path = PLATFORM_ENDPOINTS[state.platform];
    const keyword = s.name + (s.artist && s.artist !== '未知' ? ' ' + s.artist : '');
    // 获取详情
    const targetUrl = `${API_TARGET}${path}?ss=${encodeURIComponent(keyword)}&n=1&format=json`;
    const params = new URLSearchParams({ key: API_KEY, url: targetUrl });
    
    const res = await fetch(CORS_PROXY + params);
    const json = await res.json();
    
    // 提取详情
    let detail = null;
    if (json.data && !Array.isArray(json.data) && (json.data.play_url || json.data.url)) {
      detail = json.data;
    } else {
      let list = json.data?.songs || json.data || json.songs || [];
      if (list.length) detail = list[0];
    }

    if (!detail) throw new Error('未获取到详情');
    
    const playUrl = detail.play_url || detail.url || detail.playUrl || detail.src || '';
    if(!playUrl) throw new Error('未获取到播放地址');

    // 封面
    const pic = detail.cover_url || detail.pic || detail.albumPic || '';
    if(pic) $('cover').src = pic;

    // 歌词
    const lyricText = detail.lyric || detail.lrc || '';
    state.lyricLines = parseLRC(lyricText);
    renderLyric();

    // 直接播放直链（纯网页版不用走本地代理，直接扔给 audio）
    audio.src = playUrl;
    await audio.play();
    setStatus('播放中');
    startLyricSync(audio);

  } catch(e) {
    setStatus('播放失败：' + e.message, true);
    $('lyricArea').innerHTML = `<div class="placeholder err">播放失败：${escapeHtml(e.message)}</div>`;
  }
}

/* ---------- 官方链接 ---------- */
function openOfficial(){
  const s = state.songs[state.currentIndex]; if(!s) return;
  let url = '';
  if (state.platform === 'wymusic') url = `https://music.163.com/song?id=${s.id}`;
  else if (state.platform === 'qqmusic') url = `https://y.qq.com/n/ryqq/songDetail/${s.id}`;
  else if (state.platform === 'kgmusic') url = `https://www.kugou.com/song/#hash=${s.hash}`;
  
  if(url) window.open(url, '_blank');
}

/* ---------- 歌词解析（与之前一致） ---------- */
function parseLRC(text) {
  if (!text || typeof text !== 'string') return [];
  const lines = [];
  const re = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const t = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + parseInt(m[3].padEnd(3, '0'), 10) / 1000;
    const content = m[4].trim();
    if (content) lines.push({ time: t, content });
  }
  lines.sort((a, b) => a.time - b.time);
  return lines;
}

function renderLyric() {
  const box = $('lyricArea');
  if (!state.lyricLines.length) {
    box.innerHTML = '<div class="placeholder">暂无歌词</div>';
    return;
  }
  box.innerHTML = state.lyricLines.map((l, i) => `<div class="lyric-line" data-i="${i}">${escapeHtml(l.content)}</div>`).join('');
}

function startLyricSync(audio) {
  clearLyricTimer();
  const lines = state.lyricLines; if (!lines.length) return;
  const els = $('lyricArea').querySelectorAll('.lyric-line');
  let last = -1;
  state.lyricTimer = setInterval(() => {
    const t = audio.currentTime; let idx = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (t >= lines[i].time) { idx = i; break; }
    }
    if (idx === last) return;
    last = idx;
    els.forEach((el, j) => el.classList.toggle('active', j === idx));
    if (idx >= 0 && els[idx]) els[idx].scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, 200);
}

function clearLyricTimer() {
  if (state.lyricTimer) { clearInterval(state.lyricTimer); state.lyricTimer = null; }
}
window.addEventListener('beforeunload', clearLyricTimer);