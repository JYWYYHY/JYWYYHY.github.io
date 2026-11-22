const CORS_PROXY = 'https://corsproxy.io/?';
const API_TARGET = 'https://api.luosu.top';
const METING_API = 'https://meting.liveling.top/api';

// 平台映射（洛苏 -> Meting）
const PLATFORM_ENDPOINTS = { wymusic:'/api/wymusic/index.php', kgmusic:'/api/kgmusic/index.php', qqmusic:'/api/qqmusic/index.php' };
const METING_SOURCES = { wymusic: 'netease', qqmusic: 'tencent', kgmusic: 'kugou' };

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

const API_KEY = "b0328f2d"; // ⚠️ 你的 corsproxy Key
const defaultSettings = { limit: '20', quality: 'higher', dlCover: false, dlLyric: false };
let settings = JSON.parse(localStorage.getItem('luosu_settings')) || defaultSettings;

let state = { platform:'wymusic', songs:[], currentIndex:-1, currentDetail: null, lyricLines:[], lyricTimer:null };

function $(id){ return document.getElementById(id); }
function setStatus(msg, isErr) { const el=$('status'); if(el){ el.textContent=msg; el.className=isErr?'err':''; } }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmtTime(sec){ sec=Math.floor(Number(sec)||0); return Math.floor(sec/60) + ':' + String(sec%60).padStart(2,'0'); }

// 通用跨域请求封装（视 meting 是否支持直接跨域而定，保险起见走代理）
async function proxyFetch(url) {
  const proxyUrl = CORS_PROXY + `key=${API_KEY}&url=${encodeURIComponent(url)}`;
  return fetch(proxyUrl).then(res => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });
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
    const json = await proxyFetch(targetUrl);
    
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

  // 提取纯数字 ID（Meting API 需要）
  let metingId = s.id || s.songid || s.songId || '';
  // 针对酷狗的特殊处理
  if (state.platform === 'kgmusic' && !/^\d+$/.test(metingId)) {
      metingId = s.album_audio_id || s.audio_id || s.hash || '';
  }

  return {
    id: s.songmid || s.id || String(i), // 洛苏使用的 ID
    metingId: metingId,                 // Meting 使用的纯数字 ID
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

/* ---------- 播放逻辑（融合 Meting 元数据） ---------- */
async function selectSong(index){
  state.currentIndex = index;
  state.currentDetail = null;
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
    // 1. 先向洛苏请求播放直链（这块最强）
    const path = PLATFORM_ENDPOINTS[state.platform];
    const keyword = s.name + (s.artist && s.artist !== '未知' ? ' ' + s.artist : '');
    const targetUrl = `${API_TARGET}${path}?ss=${keyword}&n=1&format=json&yz=${settings.quality}`;
    
    const json = await proxyFetch(targetUrl);
    let detail = null;
    if (json.data && !Array.isArray(json.data) && (json.data.play_url || json.data.url)) {
      detail = json.data;
    } else {
      let list = json.data?.songs || json.data || json.songs || [];
      if (list.length) detail = list[0];
    }

    if (!detail) throw new Error('洛苏未获取到详情');
    state.currentDetail = detail;

    let playUrl = detail.play_url || detail.url || detail.playUrl || detail.src || '';
    if(!playUrl) throw new Error('未获取到播放地址');
    if (playUrl.startsWith('http://')) playUrl = playUrl.replace('http://', 'https://');

    // 2. 向 Meting API 请求完美的元数据和歌词
    let finalPic = detail.cover_url || detail.pic || '';
    let lyricText = detail.lyric || detail.lrc || '';

    // 只有在有纯数字 ID 时才请求 Meting
    if (s.metingId) {
      try {
        const source = METING_SOURCES[state.platform];
        
        // 2.1 获取元数据（为了封面和专辑）
        const metingSongUrl = `${METING_API}?server=${source}&type=song&id=${s.metingId}`;
        const metingSong = await proxyFetch(metingSongUrl);
        if (metingSong && metingSong[0]) {
          if (metingSong[0].pic) finalPic = metingSong[0].pic; // 拿更高清的封面
          if (metingSong[0].name) $('nowName').textContent = metingSong[0].name;
          if (metingSong[0].artist) $('nowArtist').textContent = metingSong[0].artist;
        }

        // 2.2 获取歌词（带翻译）
        const metingLrcUrl = `${METING_API}?server=${source}&type=lrc&id=${s.metingId}`;
        const metingLrc = await proxyFetch(metingLrcUrl);
        if (metingLrc && metingLrc.lyric) {
          lyricText = metingLrc.lyric; 
          // 如果有翻译歌词，合并进去
          if (metingLrc.tlyric) {
            lyricText += "\n" + metingLrc.tlyric; 
          }
        }
      } catch (err) {
        console.warn('Meting API 获取补充信息失败，降级使用洛苏数据', err);
      }
    }

    // 3. 渲染封面
    if (finalPic) $('cover').src = finalPic.startsWith('http://') ? finalPic.replace('http://', 'https://') : finalPic;

    // 4. 解析歌词（加入双语匹配逻辑）
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

/* ---------- 歌词解析（完美支持时间轴合并双语） ---------- */
function parseLRC(text) {
  if (!text || typeof text !== 'string') return [];
  
  const linesMap = new Map();
  const re = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/g;
  let m;
  
  // 把 lrc 和 tlyric 拼在一起后，同一时间轴的会自动合并
  while ((m = re.exec(text)) !== null) {
    const t = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + parseInt(m[3].padEnd(3, '0'), 10) / 1000;
    const content = m[4].trim();
    
    if (content) {
      // 如果这个时间点已经有歌词了（说明是翻译）
      if (linesMap.has(t)) {
        linesMap.set(t, linesMap.get(t) + '\n' + content);
      } else {
        linesMap.set(t, content);
      }
    }
  }

  // 转成数组并排序
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
  // 用 CSS 的 white-space: pre-wrap 配合换行，把翻译显示在原歌词下方
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

// 后续的 openOfficial, download, 绑定事件保持不变
// ... （保留你原有的 openOfficial 和 download 逻辑） ...