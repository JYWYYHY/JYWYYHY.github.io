// 使用公共 CORS 代理
const CORS_PROXY = 'https://corsproxy.io/?url=';
const API_TARGET = 'https://api.luosu.top';
const PLATFORM_ENDPOINTS = { wymusic:'/api/wymusic/index.php', kgmusic:'/api/kgmusic/index.php', qqmusic:'/api/qqmusic/index.php' };

let state = { platform:'wymusic', songs:[], currentIndex:-1 };

function $(id){ return document.getElementById(id); }

$('platformTabs').addEventListener('click', e => {
  const btn = e.target.closest('button'); if(!btn) return;
  document.querySelectorAll('.platform-tabs button').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.platform = btn.dataset.platform;
  $('resultList').innerHTML = '<div class="placeholder">重新搜索</div>';
});

async function doSearch(){
  const kw = $('keyword').value.trim(); 
  if(!kw) return;
  $('resultList').innerHTML = '<div class="placeholder">搜索中…</div>';
  
  try {
    const path = PLATFORM_ENDPOINTS[state.platform];
    const targetUrl = `https://api.luosu.top${path}?ss=${encodeURIComponent(kw)}&format=json&t=20`;
    
    const params = new URLSearchParams({
      key: "b0328f2d",
      url: targetUrl
    });
    
    // 发起请求
    const res = await fetch('https://corsproxy.io/?' + params);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    
    // 兼容解析
    let list = json.data?.songs || json.data || json.songs || [];
    if(!list.length) throw new Error('无结果');
    
    state.songs = list.map(normalizeSong);
    renderList();
  } catch(e) {
    console.error(e);
    $('resultList').innerHTML = `<div class="placeholder err">搜索失败：${e.message}</div>`;
  }
}

function normalizeSong(s, i){
  let artist = typeof s.singer === 'string' ? s.singer : '未知';
  return {
    id: s.songmid || s.id || s.songid || String(i),
    hash: s.hash || '',
    name: s.name || s.songname || '未知歌曲',
    artist: artist, duration: s.duration || s.interval || 0, raw: s
  };
}

function renderList(){
  $('resultList').innerHTML = state.songs.map((s,i) => `
    <div class="song-item ${i===state.currentIndex?'active':''}" onclick="selectSong(${i})">
      <span class="idx">${i+1}</span>
      <div class="meta">
        <div class="title">${s.name}</div>
        <div class="sub">${s.artist}</div>
      </div>
    </div>
  `).join('');
}

function selectSong(index){
  state.currentIndex = index;
  state.triedProxy = false; 
  renderList();
  const s = state.songs[index];
  $('nowName').textContent = s.name;
  $('nowArtist').textContent = s.artist;
  $('officialBtn').disabled = false;
}

function openOfficial(){
  const s = state.songs[state.currentIndex]; if(!s) return;
  let url = '';
  if (state.platform === 'wymusic') url = `https://music.163.com/song?id=${s.id}`;
  else if (state.platform === 'qqmusic') url = `https://y.qq.com/n/ryqq/songDetail/${s.id}`;
  else if (state.platform === 'kgmusic') url = `https://www.kugou.com/song/#hash=${s.hash}`;
  
  if(url) window.open(url, '_blank');
}