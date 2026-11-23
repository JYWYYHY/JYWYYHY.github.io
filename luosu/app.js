const CORS_PROXY = 'https://corsproxy.io/?';
const API_TARGET = 'https://api.luosu.top';
const VKEYS_API = 'https://api.vkeys.cn/v2';

const PLATFORM_ENDPOINTS = { wymusic:'/api/wymusic/index.php', kgmusic:'/api/kgmusic/index.php', qqmusic:'/api/qqmusic/index.php' };
// 平台映射（洛苏 -> vkeys）
const PLATFORM_MAPPING = { wymusic: 'netease', qqmusic: 'tencent', kgmusic: 'kugou' };

const PLATFORM_QUALITIES = {
  wymusic: [
    { value: 'standard', label: '标准 (standard)' }, { value: 'higher', label: '较高 (higher)' },
    { value: 'exhigh', label: '极高 (exhigh)' }, { value: 'lossless', label: '无损 (lossless)' },
    { value: 'hires', label: 'Hi-Res (hires)' }, { value: 'jyeffect', label: '沉浸环绕 (jyeffect)' },
    { value: 'sky', label: '天空音效 (sky)' }, { value: 'dolby', label: '杜比全景声 (dolby)' },
    { value: 'jymaster', label: '超清母带 (jymaster)' }
  ],
  qqmusic: [
    { value: 'standard', label: '标准 (standard)' }, { value: 'higher', label: '较高 (higher)' },
    { value: 'exhigh', label: '极高 (exhigh)' }, { value: 'lossless', label: '无损 (lossless)' },
    { value: 'hires', label: 'Hi-Res (hires)' }
  ],
  kgmusic: [
    { value: 'standard', label: '标准 (standard)' }, { value: 'higher', label: '较高 (higher)' },
    { value: 'exhigh', label: '极高 (exhigh)' }, { value: 'lossless', label: '无损 (lossless)' }
  ]
};

const API_KEY = "b0328f2d"; // ⚠️ 请确保这是你 corsproxy.io 的 Key
const defaultSettings = { limit: '20', quality: 'higher', dlCover: false, dlLyric: false };
let settings = JSON.parse(localStorage.getItem('luosu_settings')) || defaultSettings;

let state = { platform:'wymusic', songs:[], currentIndex:-1, currentDetail: null, lyricLines:[], lyricTimer:null };

function $(id){ return document.getElementById(id); }
function setStatus(msg, isErr) { const el=$('status'); if(el){ el.textContent=msg; el.className=isErr?'err':''; } }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmtTime(sec){ sec=Math.floor(Number(sec)||0); return Math.floor(sec/60) + ':' + String(sec%60).padStart(2,'0'); }

// 通用代理请求封装
async function proxyFetchJson(url) {
  const proxyUrl = CORS_PROXY + `key=${API_KEY}&url=${encodeURIComponent(url)}`;
  const res = await fetch(proxyUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* ---------- 设置相关 ---------- */
function updateQualityOptions() {
  const currentQualities = PLATFORM_QUALITIES[state.platform];
  let currentSettingValid = currentQualities.some(q => q.value === settings.quality);
  if (!currentSettingValid) {
    settings.quality = 'higher';
    localStorage.setItem('luosu_settings', JSON.stringify(settings));
  }
  const html = currentQualities.map(q => `<option value="${q.value}">${q.label}</option>`).join('');
  if ($('setQuality')) $('setQuality').innerHTML = html;
  if ($('downloadQualitySelect')) $('downloadQualitySelect').innerHTML = html;
}

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
    const json = await proxyFetchJson(targetUrl);
    
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
  let artist = '未知';
  let rawArtist = s.singer || s.singername || s.artist || s.ar || s.artists || s.author;
  if (rawArtist) {
    if (typeof rawArtist === 'string') artist = rawArtist.replace(/\//g, ' / ');
    else if (Array.isArray(rawArtist)) {
      artist = rawArtist.map(a => a?.name || a).filter(Boolean).join(' / ');
    }
  }

  let duration = s.duration || s.interval || 0;
  if (duration > 10000) duration = duration / 1000;

  // 为 vkeys 准备纯数字 ID
  let vkeysId = s.id || s.songid || s.songId || '';
  
  return {
    id: s.songmid || s.id || String(i), // 洛苏用的 ID
    vkeysId: vkeysId,                  // vkeys 用的 ID
    songmid: s.songmid || '',          // 备用参数
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

/* ---------- 播放逻辑 ---------- */
async function selectSong(index){
  state.currentIndex = index;
  state.currentDetail = null;
  renderList();
  
  const s = state.songs[index];
  $('nowName').textContent = s.name;
  $('nowArtist').textContent = s.artist;
  $('nowAlbum').textContent = '专辑：—';
  $('officialBtn').disabled = false;
  $('downloadBtn').disabled = true;
  
  setStatus('获取播放地址…');
  $('lyricArea').innerHTML = '<div class="placeholder">加载中…</div>';
  clearLyricTimer();
  
  const audio = $('audio');
  audio.pause(); audio.removeAttribute('src'); audio.load();

  try {
    // 1. 洛苏拿播放链接
    const path = PLATFORM_ENDPOINTS[state.platform];
    const keyword = s.name + (s.artist && s.artist !== '未知' ? ' ' + s.artist : '');
    const targetUrl = `${API_TARGET}${path}?ss=${keyword}&n=1&format=json&yz=${settings.quality}`;
    
    const json = await proxyFetchJson(targetUrl);
    let detail = null;
    if (json.data && !Array.isArray(json.data) && (json.data.play_url || json.data.url)) {
      detail = json.data;
    } else {
      let list = json.data?.songs || json.data || json.songs || [];
      if (list.length) detail = list[0];
    }

    if (!detail) throw new Error('洛苏未获取到详情');
    state.currentDetail = detail;

    // 专辑名
    const albumName = detail.album || detail.albumname || detail.albumName || (detail.al && detail.al.name) || '';
    if (albumName) $('nowAlbum').textContent = '专辑：' + albumName;

    let playUrl = detail.play_url || detail.url || detail.playUrl || detail.src || '';
    if(!playUrl) throw new Error('未获取到播放地址');
    if (playUrl.startsWith('http://')) playUrl = playUrl.replace('http://', 'https://');

    // 2. 拿封面（洛苏默认）
    let finalPic = detail.cover_url || detail.pic || detail.albumPic || '';
    if (finalPic) $('cover').src = finalPic.startsWith('http://') ? finalPic.replace('http://', 'https://') : finalPic;

    // 3. vkeys 补充歌词
    let lyricText = detail.lyric || detail.lrc || '';
    
    // 只有网易云和QQ音乐用 vkeys 歌词，酷狗暂时没有接口
    if (s.vkeysId && state.platform !== 'kgmusic') {
      try {
        const vkeysSource = PLATFORM_MAPPING[state.platform];
        let vkeysUrl = `${VKEYS_API}/music/${vkeysSource}/lyric?id=${s.vkeysId}`;
        
        // 如果 QQ 音乐直接用 id 拿不到，尝试用 mid (songmid) 兜底
        console.log('[vkeys 请求歌词]', vkeysUrl);
        let vkeysRes = await proxyFetchJson(vkeysUrl);
        
        if ((!vkeysRes.data || !vkeysRes.data.lrc) && state.platform === 'qqmusic' && s.songmid) {
           vkeysUrl = `${VKEYS_API}/music/tencent/lyric?mid=${s.songmid}`;
           vkeysRes = await proxyFetchJson(vkeysUrl);
        }

        if (vkeysRes && vkeysRes.data && vkeysRes.data.lrc) {
          lyricText = vkeysRes.data.lrc;
          if (vkeysRes.data.tlyric) {
            lyricText += '\n' + vkeysRes.data.tlyric; // 追加翻译
          }
        }
      } catch (err) {
        console.warn('vkeys 歌词获取失败，使用洛苏歌词兜底', err);
      }
    }

    // 4. 渲染歌词
    state.lyricLines = parseLRC(lyricText);
    renderLyric();

    // 5. 播放
    audio.src = playUrl;
    await audio.play();
    setStatus('播放中');
    $('downloadBtn').disabled = false;
    startLyricSync(audio);

  } catch(e) {
    setStatus('播放失败：' + e.message, true);
    if (settings.quality !== 'standard') {
       $('lyricArea').innerHTML = `<div class="placeholder err">该歌曲可能不支持 [${settings.quality}] 音质，请去右上角设置里降级为 standard 后重试。</div>`;
    } else {
       $('lyricArea').innerHTML = `<div class="placeholder err">播放失败：${escapeHtml(e.message)}</div>`;
    }
  }
}

/* ---------- 歌词解析 ---------- */
function parseLRC(text) {
  if (!text || typeof text !== 'string') return [];
  
  const linesMap = new Map();
  const re = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/g;
  let m;
  
  while ((m = re.exec(text)) !== null) {
    const t = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + parseInt(m[3].padEnd(3, '0'), 10) / 1000;
    const content = m[4].trim();
    
    if (content) {
      if (linesMap.has(t)) {
        // 如果时间戳相同，说明是翻译，合并换行
        linesMap.set(t, linesMap.get(t) + '\n' + content);
      } else {
        linesMap.set(t, content);
      }
    }
  }

  const lines = Array.from(linesMap, ([time, content]) => ({ time, content }));
  lines.sort((a, b) => a.time - b.time);
  return lines;
}

function renderLyric() {
  const box = $('lyricArea');
  if (!state.lyricLines.length) {
    box.innerHTML = '<div class="placeholder">暂无歌词</div>';
    return;
  }
  box.innerHTML = state.lyricLines.map((l, i) => `
    <div class="lyric-line" data-i="${i}" style="white-space: pre-wrap;">${escapeHtml(l.content)}</div>
  `).join('');
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

/* ---------- 下载逻辑 ---------- */
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
    
    const json = await proxyFetchJson(targetUrl);
    
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

    window.open(downloadUrl, '_blank');
    
    // 附带歌词
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

    // 附带封面
    if (settings.dlCover) {
      const pic = detail.cover_url || detail.pic || detail.albumPic || '';
      if (pic) {
        const httpPic = pic.startsWith('http://') ? pic.replace('http://', 'https://') : pic;
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

/* ---------- 初始化 ---------- */
window.addEventListener('beforeunload', clearLyricTimer);
updateQualityOptions();