const CORS_PROXY = 'https://corsproxy.io/?';
const API_TARGET = 'https://api.luosu.top';
const PLATFORM_ENDPOINTS = { wymusic:'/api/wymusic/index.php', kgmusic:'/api/kgmusic/index.php', qqmusic:'/api/qqmusic/index.php' };

// 各平台支持的音质列表
const PLATFORM_QUALITIES = {
  wymusic: [
    { value: 'standard', label: '标准 (standard)' },
    { value: 'higher', label: '较高 (higher)' },
    { value: 'exhigh', label: '极高 (exhigh)' },
    { value: 'lossless', label: '无损 (lossless)' },
    { value: 'hires', label: 'Hi-Res (hires)' },
    { value: 'jyeffect', label: '沉浸环绕 (jyeffect)' },
    { value: 'sky', label: '天空音效 (sky)' },
    { value: 'dolby', label: '杜比全景声 (dolby)' },
    { value: 'jymaster', label: '超清母带 (jymaster)' }
  ],
  qqmusic: [
    { value: 'standard', label: '标准 (standard)' },
    { value: 'higher', label: '较高 (higher)' },
    { value: 'exhigh', label: '极高 (exhigh)' },
    { value: 'lossless', label: '无损 (lossless)' },
    { value: 'hires', label: 'Hi-Res (hires)' }
  ],
  kgmusic: [
    { value: 'standard', label: '标准 (standard)' },
    { value: 'higher', label: '较高 (higher)' },
    { value: 'exhigh', label: '极高 (exhigh)' },
    { value: 'lossless', label: '无损 (lossless)' }
  ]
};

const API_KEY = "b0328f2d"; // ⚠️ 你的 Key

const defaultSettings = { limit: '20', quality: 'higher', dlCover: false, dlLyric: false };
let settings = JSON.parse(localStorage.getItem('luosu_settings')) || defaultSettings;

let state = { 
  platform:'wymusic', 
  songs:[], 
  currentIndex:-1, 
  currentDetail: null, // 保存真实的详情数据
  lyricLines:[], 
  lyricTimer:null
};

function $(id){ return document.getElementById(id); }
function setStatus(msg, isErr) { const el=$('status'); if(el){ el.textContent=msg; el.className=isErr?'err':''; } }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmtTime(sec){ sec=Math.floor(Number(sec)||0); return Math.floor(sec/60) + ':' + String(sec%60).padStart(2,'0'); }

// 更新音质下拉菜单
function updateQualityOptions() {
  const currentQualities = PLATFORM_QUALITIES[state.platform];
  
  // 检查当前保存的音质是否在新平台的支持列表里
  let currentSettingValid = currentQualities.some(q => q.value === settings.quality);
  if (!currentSettingValid) {
    settings.quality = 'higher'; // 如果不在，默认切回较高
    localStorage.setItem('luosu_settings', JSON.stringify(settings));
  }

  const html = currentQualities.map(q => `<option value="${q.value}">${q.label}</option>`).join('');
  
  // 填充试听设置
  const setQuality = $('setQuality');
  if (setQuality) setQuality.innerHTML = html;
  
  // 填充下载设置
  const downloadSelect = $('downloadQualitySelect');
  if (downloadSelect) downloadSelect.innerHTML = html;
}

/* ---------- 设置相关 ---------- */
function toggleSettings() {
  const modal = $('settingsModal');
  if (!modal.classList.contains('show')) {
    updateQualityOptions();
    $('setLimit').value = settings.limit;
    $('setQuality').value = settings.quality;
    $('setDlCover').checked = settings.dlCover || false;
    $('setDlLyric').checked = settings.dlLyric || false;
    
    modal.classList.add('show');
  } else {
    modal.classList.remove('show');
  }
}

function saveSettings() {
  settings.limit = $('setLimit').value;
  settings.quality = $('setQuality').value;
  settings.dlCover = $('setDlCover').checked;
  settings.dlLyric = $('setDlLyric').checked;
  
  localStorage.setItem('luosu_settings', JSON.stringify(settings));
  $('settingsModal').classList.remove('show');
  setStatus('设置已保存');
}

/* ---------- 平台切换 ---------- */
$('platformTabs').addEventListener('click', e => {
  const btn = e.target.closest('button'); if(!btn) return;
  document.querySelectorAll('.platform-tabs button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.platform = btn.dataset.platform;
  updateQualityOptions();
  $('resultList').innerHTML = '<div class="placeholder">重新搜索</div>';
  $('audio').pause();
  clearLyricTimer();
});

/* ---------- 搜索 ---------- */
async function doSearch(){
  const kw = $('keyword').value.trim(); 
  if(!kw) return;
  
  const btn = $('searchBtn');
  if (btn) btn.disabled = true; 
  $('resultList').innerHTML = '<div class="placeholder">搜索中…</div>';
  setStatus('搜索中…');
  
  try {
    const path = PLATFORM_ENDPOINTS[state.platform];
    const targetUrl = `${API_TARGET}${path}?ss=${kw}&format=json&t=${settings.limit}`;
    const fetchUrl = CORS_PROXY + `key=${API_KEY}&url=${encodeURIComponent(targetUrl)}`;
    
    const res = await fetch(fetchUrl);
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
    if (btn) btn.disabled = false;
  }
}

function normalizeSong(s, i){
  // 1. 深度兼容所有平台的歌手字段
  let artist = '未知';
  let rawArtist = s.singer || s.singername || s.artist || s.ar || s.artists || s.author;
  
  if (rawArtist) {
    if (typeof rawArtist === 'string') {
      artist = rawArtist.replace(/\//g, ' / ');
    } else if (Array.isArray(rawArtist) && rawArtist.length > 0) {
      const names = rawArtist.map(a => {
        if (typeof a === 'string') return a;
        return a && a.name ? a.name : '';
      }).filter(Boolean);
      if (names.length > 0) artist = names.join(' / ');
    }
  }

  // 2. 时长处理
  let duration = s.duration || s.interval || 0;
  if (duration > 10000) duration = duration / 1000;

  return {
    id: s.songmid || s.id || s.songid || String(i),
    hash: s.hash || '',
    name: s.name || s.songname || s.title || '未知歌曲',
    artist: artist, 
    duration: duration, 
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

/* ---------- 在线试听逻辑 ---------- */
async function selectSong(index){
  state.currentIndex = index;
  state.currentDetail = null; // 重置详情
  renderList();
  
  const s = state.songs[index];
  $('nowName').textContent = s.name;
  $('nowArtist').textContent = s.artist;
  $('officialBtn').disabled = false;
  $('downloadBtn').disabled = true;
  
  setStatus('获取播放地址…');
  $('lyricArea').innerHTML = '<div class="placeholder">加载中…</div>';
  clearLyricTimer();
  
  const audio = $('audio');
  audio.pause(); audio.removeAttribute('src'); audio.load();

  try {
    const path = PLATFORM_ENDPOINTS[state.platform];
    const keyword = s.name + (s.artist && s.artist !== '未知' ? ' ' + s.artist : '');
    
    // 请求试听音质
    const targetUrl = `${API_TARGET}${path}?ss=${keyword}&n=1&format=json&yz=${settings.quality}`;
    const fetchUrl = CORS_PROXY + `key=${API_KEY}&url=${encodeURIComponent(targetUrl)}`;
    
    const res = await fetch(fetchUrl);
    const json = await res.json();
    
    let detail = null;
    if (json.data && !Array.isArray(json.data) && (json.data.play_url || json.data.url)) {
      detail = json.data;
    } else {
      let list = json.data?.songs || json.data || json.songs || [];
      if (list.length) detail = list[0];
    }

    if (!detail) throw new Error('未获取到详情');
    
    // 保存真实详情数据，供官方跳转和下载使用
    state.currentDetail = detail;

    let playUrl = detail.play_url || detail.url || detail.playUrl || detail.src || '';
    if(!playUrl) throw new Error('未获取到播放地址');

    if (playUrl.startsWith('http://')) playUrl = playUrl.replace('http://', 'https://');

    const pic = detail.cover_url || detail.pic || detail.albumPic || '';
    if(pic) $('cover').src = pic.startsWith('http://') ? pic.replace('http://', 'https://') : pic;

    const lyricText = detail.lyric || detail.lrc || '';
    state.lyricLines = parseLRC(lyricText);
    renderLyric();

    audio.src = playUrl;
    await audio.play();
    // 写入系统媒体控制中心
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: s.name,
        artist: s.artist,
        album: detail.album || '未知专辑',
        artwork: [
          { src: $('cover').src, sizes: '96x96', type: 'image/jpeg' },
          { src: $('cover').src, sizes: '128x128', type: 'image/jpeg' },
          { src: $('cover').src, sizes: '192x192', type: 'image/jpeg' },
          { src: $('cover').src, sizes: '256x256', type: 'image/jpeg' },
          { src: $('cover').src, sizes: '384x384', type: 'image/jpeg' },
          { src: $('cover').src, sizes: '512x512', type: 'image/jpeg' }
        ]
      });
      
      // 绑定媒体按键（比如蓝牙耳机按下一首）
      navigator.mediaSession.setActionHandler('play', () => audio.play());
      navigator.mediaSession.setActionHandler('pause', () => audio.pause());
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        if (state.currentIndex > 0) selectSong(state.currentIndex - 1);
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        if (state.currentIndex < state.songs.length - 1) selectSong(state.currentIndex + 1);
      });
    }
    setStatus('播放中');
    $('downloadBtn').disabled = false; // 允许点击下载
    startLyricSync(audio);

  } catch(e) {
    setStatus('播放失败：' + e.message, true);
    if (settings.quality !== 'standard') {
       $('lyricArea').innerHTML = `<div class="placeholder err">该歌曲可能不支持 [${settings.quality}] 音质，请去右上角设置里降级为 standard 后重试。</div>`;
    } else {
       $('lyricArea').innerHTML = `<div class="placeholder err">播放失败：${escapeHtml(e.message)}</div>`;
    }
  } // 👈 补全了 catch 的闭合
} // 👈 补全了 selectSong 的闭合

/* ---------- 官方页面跳转 ---------- */
function openOfficial(){
  const s = state.songs[state.currentIndex]; 
  if(!s) return;
  
  const realDetail = state.currentDetail || s.raw;
  let url = '';
  
  if (state.platform === 'wymusic') {
    const realId = realDetail.id || realDetail.songid || s.id;
    url = `https://music.163.com/song?id=${realId}`;
  } else if (state.platform === 'qqmusic') {
    const realMid = realDetail.songmid || realDetail.mid || s.id;
    url = `https://y.qq.com/n/ryqq/songDetail/${realMid}`;
  } else if (state.platform === 'kgmusic') {
    const realHash = realDetail.hash || realDetail.FileHash || s.hash;
    url = `https://www.kugou.com/song/#hash=${realHash}`;
  }
  
  if(url) window.open(url, '_blank');
}

/* ---------- 独立下载逻辑 ---------- */
function openDownloadModal() {
  if (!state.currentDetail && !state.currentIndex) return;
  updateQualityOptions();
  $('downloadModal').classList.add('show');
}

async function confirmDownload() {
  const s = state.songs[state.currentIndex];
  if(!s) return;

  const yz = $('downloadQualitySelect').value;
  const btn = $('confirmDownloadBtn');
  
  btn.disabled = true;
  btn.textContent = '请求中…';
  
  try {
    const path = PLATFORM_ENDPOINTS[state.platform];
    const keyword = s.name + (s.artist && s.artist !== '未知' ? ' ' + s.artist : '');
    const targetUrl = `${API_TARGET}${path}?ss=${keyword}&n=1&format=json&yz=${yz}`;
    const fetchUrl = CORS_PROXY + `key=${API_KEY}&url=${encodeURIComponent(targetUrl)}`;
    
    const res = await fetch(fetchUrl);
    const json = await res.json();
    
    let detail = null;
    if (json.data && !Array.isArray(json.data) && (json.data.play_url || json.data.url)) {
      detail = json.data;
    } else {
      let list = json.data?.songs || json.data || json.songs || [];
      if (list.length) detail = list[0];
    }

    if (!detail) throw new Error('未获取到该音质的链接');
    
    let downloadUrl = detail.play_url || detail.url || detail.playUrl || detail.src || '';
    if(!downloadUrl) throw new Error('该音质暂无下载链接');

    if (downloadUrl.startsWith('http://')) downloadUrl = downloadUrl.replace('http://', 'https://');

    // 1. 提取音源（新标签页打开）
    window.open(downloadUrl, '_blank');
    
    // 2. 如果勾选了附带歌词，生成并下载 LRC
    if (settings.dlLyric && state.lyricLines.length > 0) {
      const lrcText = state.lyricLines.map(l => {
        const m = Math.floor(l.time / 60).toString().padStart(2, '0');
        const sec = Math.floor(l.time % 60).toString().padStart(2, '0');
        const ms = Math.floor((l.time % 1) * 100).toString().padStart(2, '0');
        return `[${m}:${sec}.${ms}]${l.content}`;
      }).join('\n');
      
      const blob = new Blob([lrcText], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${s.artist} - ${s.name}.lrc`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    // 3. 如果勾选了附带封面，新标签页打开封面（由于跨域，无法静默保存）
    if (settings.dlCover) {
      const pic = detail.cover_url || detail.pic || detail.albumPic || '';
      if (pic) {
        const httpPic = pic.startsWith('http://') ? pic.replace('http://', 'https://') : pic;
        // 延迟一下打开，避免被浏览器拦截弹窗
        setTimeout(() => window.open(httpPic, '_blank'), 300);
      }
    }
    
    $('downloadModal').classList.remove('show');
    setStatus(`已提取 [${yz}] 音源`);
  } catch(e) {
    setStatus('下载获取失败：' + e.message, true);
    alert('获取失败：' + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '开始下载';
  }
}

/* ---------- 歌词解析 ---------- */
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
updateQualityOptions(); // 初始化下拉框