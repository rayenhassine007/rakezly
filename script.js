// ── SETTINGS PANEL ───────────────────────────────────────────
let settingsPanelOpen = false;
function toggleSettingsPanel() {
  settingsPanelOpen = !settingsPanelOpen;
  document.getElementById('settingsSlidePanel').classList.toggle('open', settingsPanelOpen);
  document.getElementById('settingsFixedBtn').classList.toggle('active', settingsPanelOpen);
  if (bgPanelOpen) toggleBgPanel();
  // close theme panel
  document.getElementById('themePanel').classList.remove('open');
  document.getElementById('themeFixedBtn').classList.remove('active');
  // close player panel
  document.getElementById('playerPanel').classList.remove('open');
  document.getElementById('playerFixedBtn').classList.remove('active');
}
// ── FULLSCREEN ────────────────────────────────────────────────
function toggleFS() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(()=>{});
    document.getElementById('fsBtn').textContent = '✕';
  } else {
    document.exitFullscreen();
    document.getElementById('fsBtn').textContent = '⛶';
  }
}
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) document.getElementById('fsBtn').textContent = '⛶';
  forceVideoResume();
});

// Resume video when tab becomes visible again
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') forceVideoResume();
});

// Track the last time the video actually advanced a frame
let _lastTimeUpdate = 0;
(function() {
  const video = document.getElementById('bgVideo');
  video.addEventListener('timeupdate', () => { _lastTimeUpdate = Date.now(); });
  let _stallTimer = null;
  function onStall() {
    clearTimeout(_stallTimer);
    _stallTimer = setTimeout(() => {
      if (video.src && document.visibilityState === 'visible') {
        video.load(); video.play().catch(() => {});
      }
    }, 800);
  }
  video.addEventListener('stalled', onStall);
  video.addEventListener('suspend', () => {
    if (document.visibilityState === 'visible' && video.src && video.paused) onStall();
  });
})();

// Attempt to resume; if video still isn't advancing after a second, force-reload it
function forceVideoResume() {
  const video = document.getElementById('bgVideo');
  if (!video || !video.src) return;
  setTimeout(() => {
    video.play().catch(() => {});
    // Check 1s later if timeupdate has fired — if not, video is truly stuck
    setTimeout(() => {
      if (Date.now() - _lastTimeUpdate > 950) {
        video.load(); video.play().catch(() => {});
      }
    }, 1000);
  }, 150);
}

// ── BACKGROUND PANEL ─────────────────────────────────────────
let bgPanelOpen = false;
let currentObjectURL = null;

// ── PER-THEME BG STORAGE (IndexedDB) ─────────────────────────
const IDB_NAME = 'rakezly_bgs', IDB_STORE = 'bgs', IDB_VER = 1;
let _idb = null;

function openIDB() {
  if (_idb) return Promise.resolve(_idb);
  return new Promise((res, rej) => {
    const req = indexedDB.open(IDB_NAME, IDB_VER);
    req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE);
    req.onsuccess = e => { _idb = e.target.result; res(_idb); };
    req.onerror = () => rej(req.error);
  });
}

// In-memory cache so theme switches are instant after first load
const _bgCache = {};

async function saveBgForTheme(theme, file) {
  const rec = { blob: file, name: file.name, type: file.type };
  _bgCache[theme] = rec;
  // Revoke old URL for this theme so it gets recreated fresh
  if (_urlCache[theme]) { URL.revokeObjectURL(_urlCache[theme].url); delete _urlCache[theme]; }
  const db = await openIDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(rec, theme);
    tx.oncomplete = res; tx.onerror = () => rej(tx.error);
  });
}

async function loadBgForTheme(theme) {
  if (theme in _bgCache) return _bgCache[theme];
  const db = await openIDB();
  return new Promise((res) => {
    const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(theme);
    req.onsuccess = () => { _bgCache[theme] = req.result || null; res(_bgCache[theme]); };
    req.onerror = () => { _bgCache[theme] = null; res(null); };
  });
}

// Preload all theme bgs into cache on startup so first switch is also instant
async function preloadAllBgs() {
  await Promise.all(['lofi', 'greens', 'cherry-blues', 'moonlight'].map(t => loadBgForTheme(t)));
}

async function clearBgForTheme(theme) {
  _bgCache[theme] = null;
  if (_urlCache[theme]) { URL.revokeObjectURL(_urlCache[theme].url); delete _urlCache[theme]; }
  const db = await openIDB();
  return new Promise((res) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(theme);
    tx.oncomplete = res; tx.onerror = res;
  });
}

function updateBgBadge(theme) {
  const badge = document.getElementById('bgThemeBadge');
  const names = {
    lofi: 'Lofi',
    greens: 'Greens',
    'cherry-blues': 'Cherry Blues',
    moonlight: 'Moonlight'
  };
  if (badge) badge.textContent = (names[theme] || 'This') + ' background';
}

// Cache Object URLs per theme — avoids recreating them on every switch
// so iframes/videos are never torn down and reloaded unnecessarily
const _urlCache = {}; // theme -> { url, isHTML, isVideo, name }

function getOrCreateURL(theme, rec) {
  if (_urlCache[theme] && _urlCache[theme].url) return _urlCache[theme];
  const file = rec.blob instanceof File ? rec.blob : new File([rec.blob], rec.name, { type: rec.type });
  const url = URL.createObjectURL(file);
  const entry = {
    url,
    isHTML: rec.type === 'text/html' || rec.name.endsWith('.html'),
    isVideo: rec.type.startsWith('video/'),
    name: rec.name
  };
  _urlCache[theme] = entry;
  return entry;
}

function applyBgFromRecord(rec, theme) {
  const video = document.getElementById('bgVideo');
  const frame = document.getElementById('bgFrame');

  if (!rec) {
    // Clear everything
    video.classList.remove('ready'); video.src = ''; video.style.display = 'none';
    frame.classList.remove('ready'); frame.src = '';
    document.body.style.backgroundImage = '';
    document.getElementById('uploadText').textContent = 'Upload a video, image or HTML';
    document.getElementById('mediaUpload').value = '';
    return;
  }

  const entry = getOrCreateURL(theme || currentTheme, rec);

  // Only update if the src actually changed — prevents iframe reload
  if (entry.isHTML) {
    video.classList.remove('ready'); video.src = ''; video.style.display = 'none';
    document.body.style.backgroundImage = '';
    if (frame.src !== entry.url) {
      frame.src = entry.url;
    }
    frame.classList.add('ready');
    frame.style.pointerEvents = 'none';
  } else if (entry.isVideo) {
    frame.classList.remove('ready'); frame.src = '';
    document.body.style.backgroundImage = '';
    if (video.src !== entry.url) {
      video.src = entry.url;
      video.load(); video.play().catch(()=>{});
      video.oncanplay = () => video.classList.add('ready');
    }
    video.style.display = 'block';
  } else {
    video.classList.remove('ready'); video.src = ''; video.style.display = 'none';
    frame.classList.remove('ready'); frame.src = '';
    document.body.style.backgroundImage = `url(${entry.url})`;
    document.body.style.backgroundSize = 'cover';
    document.body.style.backgroundPosition = 'center';
    document.body.style.backgroundRepeat = 'no-repeat';
  }

  const name = entry.name.length > 22 ? entry.name.slice(0,20)+'…' : entry.name;
  document.getElementById('uploadText').textContent = '✓ ' + name;
  document.getElementById('mediaUpload').value = '';
}

function toggleBgPanel() {
  bgPanelOpen = !bgPanelOpen;
  document.getElementById('bgPanel').classList.toggle('open', bgPanelOpen);
  document.querySelector('.btn-bg-toggle').classList.toggle('active', bgPanelOpen);
  if (bgPanelOpen) updateRemoveDefaultBtnVisibility();
  // close theme panel
  document.getElementById('themePanel').classList.remove('open');
  document.getElementById('themeFixedBtn').classList.remove('active');
  // close player panel
  document.getElementById('playerPanel').classList.remove('open');
  document.getElementById('playerFixedBtn').classList.remove('active');
}


function themeLabel(theme) {
  return ({
    lofi: '✿ lofi',
    greens: '⬡ greens',
    'cherry-blues': '✦ cherry blues',
    moonlight: '☽ moonlight'
  })[theme] || 'theme';
}

async function loadMedia(event) {
  const file = event.target.files[0];
  if (!file) return;
  // saveBgForTheme also clears the old URL cache for this theme
  await saveBgForTheme(currentTheme, file);
  // applyBgFromRecord will create and cache a fresh URL
  applyBgFromRecord(_bgCache[currentTheme], currentTheme);
  showToast('Background saved for ' + themeLabel(currentTheme));
}

function setDim(v) {
  document.getElementById('bgOverlay').style.background = `rgba(0,0,0,${v/100})`;
  document.getElementById('dimVal').textContent = v + '%';
  localStorage.setItem('sf_dim', v);
}

function setBlur(v) {
  document.getElementById('blurWrap').style.filter = v > 0 ? `blur(${v}px)` : '';
  document.getElementById('bgOverlay').style.backdropFilter = v > 0 ? `blur(${v}px)` : '';
  document.getElementById('bgOverlay').style.webkitBackdropFilter = v > 0 ? `blur(${v}px)` : '';
  document.getElementById('blurVal').textContent = v + 'px';
  localStorage.setItem('sf_blur', v);
}

function setGlass(v) {
  const alpha = v / 100;
  const bg = currentTheme === 'moonlight' ? `rgba(8,8,8,${alpha})` : `rgba(20,10,35,${alpha})`;
  document.documentElement.style.setProperty('--glass-bg', bg);
  const bAlpha = Math.min(alpha * 0.75, 0.5).toFixed(2);
  const borderRgb = currentTheme === 'moonlight' ? '220,220,220' : '192,132,252';
  document.documentElement.style.setProperty('--glass-border', `rgba(${borderRgb},${bAlpha})`);
  document.getElementById('glassVal').textContent = v + '%';
}

async function clearMedia() {
  await clearBgForTheme(currentTheme);
  applyBgFromRecord(null);
  showToast('Background cleared for ' + themeLabel(currentTheme));
}

function setGlassOpac(v) {
  const alpha = (v / 100).toFixed(2);

  const baseColor = currentTheme === 'cherry-blues' ? '9, 18, 42' :
                    currentTheme === 'greens'       ? '5, 20, 8' :
                    currentTheme === 'moonlight'    ? '8, 8, 8' :
                                                       '30, 15, 35';

  const glassBg = `rgba(${baseColor}, ${alpha})`;

  // Set both :root and body because theme classes define their own CSS variables on body.
  document.documentElement.style.setProperty('--glass-bg', glassBg);
  document.body.style.setProperty('--glass-bg', glassBg);

  document.getElementById('glassOpacVal').textContent = v + '%';
  localStorage.setItem('sf_glass_opac', v);
}

function setGlassBlur(v) {
  const blur = `blur(${v}px)`;
  document.documentElement.style.setProperty('--glass-blur', blur);
  document.body.style.setProperty('--glass-blur', blur);
  document.getElementById('glassBlurVal').textContent = v + 'px';
  localStorage.setItem('sf_glass_blur', v);
}

function setGlassBorder(v) {
  const alpha = (v / 100).toFixed(2);

  const borderColor = currentTheme === 'cherry-blues' ? '143, 211, 255' :
                      currentTheme === 'greens'       ? '74, 222, 128' :
                      currentTheme === 'moonlight'    ? '220, 220, 220' :
                                                         '249, 168, 212';

  const glassBorder = `rgba(${borderColor}, ${alpha})`;

  // Set both :root and body because theme classes define their own CSS variables on body.
  document.documentElement.style.setProperty('--glass-border', glassBorder);
  document.body.style.setProperty('--glass-border', glassBorder);

  document.getElementById('glassBordVal').textContent = v + '%';
  localStorage.setItem('sf_glass_bord', v);
}

// ── CONFIG ────────────────────────────────────────────────────
let MODES = {
  work:  parseInt(localStorage.getItem('sf_work'))  || 25,
  break: parseInt(localStorage.getItem('sf_break')) || 5,
  long:  parseInt(localStorage.getItem('sf_long'))  || 15
};
let autoStartBreak = true;
let autoStartWork  = true;
let alarmType = 'bell';

// ── ALARM ─────────────────────────────────────────────────────
function playAlarm() {
  if (alarmType === 'none') return;
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const sounds = {
      bell: () => {
        [523, 659, 784].forEach((freq, i) => {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination);
          o.type = 'sine'; o.frequency.value = freq;
          g.gain.setValueAtTime(0, ctx.currentTime + i*0.18);
          g.gain.linearRampToValueAtTime(0.35, ctx.currentTime + i*0.18 + 0.05);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i*0.18 + 0.8);
          o.start(ctx.currentTime + i*0.18);
          o.stop(ctx.currentTime + i*0.18 + 0.8);
        });
      },
      digital: () => {
        [880, 880, 1100].forEach((freq, i) => {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination);
          o.type = 'square'; o.frequency.value = freq;
          g.gain.setValueAtTime(0.2, ctx.currentTime + i*0.12);
          g.gain.setValueAtTime(0, ctx.currentTime + i*0.12 + 0.09);
          o.start(ctx.currentTime + i*0.12);
          o.stop(ctx.currentTime + i*0.12 + 0.1);
        });
      },
      soft: () => {
        [396, 528, 660, 792].forEach((freq, i) => {
          const o = ctx.createOscillator(), g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination);
          o.type = 'sine'; o.frequency.value = freq;
          g.gain.setValueAtTime(0, ctx.currentTime + i*0.22);
          g.gain.linearRampToValueAtTime(0.25, ctx.currentTime + i*0.22 + 0.1);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i*0.22 + 1.2);
          o.start(ctx.currentTime + i*0.22);
          o.stop(ctx.currentTime + i*0.22 + 1.2);
        });
      }
    };
    (sounds[alarmType] || sounds.bell)();
  } catch(e) { console.warn('Alarm:', e); }
}

// ── QUICK ADD/SUBTRACT MINUTES ────────────────────────────────
function addMins(m) {
  const delta = m * 60;
  remainSecs = Math.max(5, remainSecs + delta);
  // also grow totalSecs so the bar doesn't go over 100%
  if (remainSecs > totalSecs) totalSecs = remainSecs;
  updateDisplay(); updateBar();
  if(window.Room)Room.onLocalChange();
}
let TOTAL_CYCLES = parseInt(localStorage.getItem('sf_cycles')) || 4, pendingCycles = parseInt(localStorage.getItem('sf_cycles')) || 4;

// ── STATE ─────────────────────────────────────────────────────
let mode='work', totalSecs, remainSecs;
let running=false, ticker=null, cycleIndex=0;

// ── SESSION PERSISTENCE ───────────────────────────────────────
// How long before a closed session expires and resets (ms). Default: 1 hour.
const SESSION_EXPIRY_MS = 31 * 60 * 1000;

function saveTimerState() {
  localStorage.setItem('sf_ts', JSON.stringify({
    mode, totalSecs, remainSecs,
    running,
    cycleIndex,
    savedAt: Date.now()   // always stamp so expiry works whether paused or running
  }));
}
function restoreTimerState() {
  try {
    const raw = localStorage.getItem('sf_ts');
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (!s || s.remainSecs == null) return false;
    // Expire session if away too long
    if (s.savedAt && (Date.now() - s.savedAt) > SESSION_EXPIRY_MS) {
      localStorage.removeItem('sf_ts');
      return false;
    }
    mode               = s.mode || 'work';
    totalSecs          = s.totalSecs;
    cycleIndex         = s.cycleIndex || 0;
    // If it was running, subtract elapsed time since page closed
    let restored = s.remainSecs;
    if (s.running && s.savedAt) {
      const elapsed = Math.floor((Date.now() - s.savedAt) / 1000);
      restored = Math.max(0, s.remainSecs - elapsed);
    }
    remainSecs = restored;
    return true;
  } catch(e) { return false; }
}
function clearTimerState() { localStorage.removeItem('sf_ts'); }

function buildSeq() {
  const s=[];
  for(let i=0;i<TOTAL_CYCLES;i++){
    s.push({type:'work',idx:i});
    s.push(i<TOTAL_CYCLES-1?{type:'brk',idx:i}:{type:'lng',idx:i});
  }
  return s;
}
let seq=buildSeq();

function renderCycles() {
  const row=document.getElementById('cyclesRow'); row.innerHTML='';
  seq.forEach((slot,i)=>{
    const d=document.createElement('div');
    d.className='cycle-dot '+slot.type;
    if(i<cycleIndex)d.classList.add('done');
    if(i===cycleIndex)d.classList.add('active');
    d.textContent=slot.type==='work'?slot.idx+1:slot.type==='brk'?'·':'∞';
    d.title=slot.type==='work'?`Focus #${slot.idx+1}`:slot.type==='brk'?'Short Break':'Long Break';
    row.appendChild(d);
  });
  const cur=seq[cycleIndex];
  const done=seq.slice(0,cycleIndex).filter(s=>s.type==='work').length;
  const lbl=!cur?'Done!':cur.type==='work'?`Focus #${cur.idx+1}`:cur.type==='brk'?'Short Break':'Long Break';
  const info=document.createElement('div'); info.className='cycle-info';
  info.innerHTML=`<strong>${lbl}</strong>${done}/${TOTAL_CYCLES}`;
  row.appendChild(info);
}

// ── SETTINGS ─────────────────────────────────────────────────
let settingsOpen=false;
function toggleSettings(){
  settingsOpen=!settingsOpen;
  if(settingsOpen){
    document.getElementById('setWork').value = MODES.work;
    document.getElementById('setBreak').value = MODES.break;
    document.getElementById('setLong').value = MODES.long;
    document.getElementById('cycleCountVal').textContent = pendingCycles;
  }
  document.getElementById('settingsPanel').classList.toggle('open',settingsOpen);
}
function chgCycles(d){pendingCycles=Math.max(1,Math.min(8,pendingCycles+d));document.getElementById('cycleCountVal').textContent=pendingCycles;}
function applySettings(){
  MODES.work =Math.min(90,Math.max(1,+document.getElementById('setWork').value||25));
  MODES.break=Math.min(30,Math.max(1,+document.getElementById('setBreak').value||5));
  MODES.long =Math.min(60,Math.max(1,+document.getElementById('setLong').value||15));
  TOTAL_CYCLES=pendingCycles; seq=buildSeq(); cycleIndex=0;
  // Save settings so they persist after closing/reopening
  localStorage.setItem('sf_work', MODES.work);
  localStorage.setItem('sf_break', MODES.break);
  localStorage.setItem('sf_long', MODES.long);
  localStorage.setItem('sf_cycles', TOTAL_CYCLES);
  stopTimer(); clearTimerState(); initTimer('work'); renderCycles(); setTab('work');
  showToast(t('msg.settings')); toggleSettings();
}

// ── TIMER ─────────────────────────────────────────────────────
function initTimer(m){
  // normalize internal cycle type names to MODES keys
  if(m==='brk') m='break';
  if(m==='lng') m='long';
  mode=m; totalSecs=MODES[m]*60; remainSecs=totalSecs;
  updateDisplay(); updateBar();
  const cc=m==='work'?'wc':m==='break'?'bc':'lc';
  document.getElementById('timerDisplay').className='timer-display '+cc;
  document.getElementById('progressBar').className='timer-progress-bar '+cc;
  const btn=document.getElementById('startBtn');
  btn.className='btn btn-primary'+(m!=='work'?' bm':'');
  btn.textContent=t('timer.start');
}
function updateDisplay(){
  const m=Math.floor(remainSecs/60),s=remainSecs%60;
  document.getElementById('tMins').textContent=m.toString().padStart(2,'0');
  document.getElementById('tSecs').textContent=s.toString().padStart(2,'0');
  document.title=`${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')} — rakezly`;
}
function updateBar(){
  const pct = (remainSecs/totalSecs*100);
  document.getElementById('progressBar').style.width = pct + '%';
  const animal = document.getElementById('progressAnimal');
  if (animal) animal.style.left = pct + '%';
}
function toggleTimer(){running?pauseTimer():startTimer();}
function setRunningVisual(on){
  const d = document.getElementById('timerDisplay');
  const bar = document.getElementById('progressBar');
  if (d) d.classList.toggle('is-running', on);
  if (bar) bar.classList.toggle('is-running', on);
}

function startTimer(){
  running=true;
  setRunningVisual(true);
  const btn=document.getElementById('startBtn');
  btn.textContent=t('timer.pause'); btn.classList.add('running');
  document.getElementById('timerDisplay').classList.remove('blink');
  saveTimerState(); // capture running=true + savedAt timestamp immediately
  ticker=setInterval(()=>{remainSecs--;updateDisplay();updateBar();saveTimerState();if(remainSecs<=0){clearInterval(ticker);onDone();}},1000);
  if(window.Room)Room.onLocalChange();
}
function pauseTimer(){
  setRunningVisual(false);
  running=false; clearInterval(ticker);
  const btn=document.getElementById('startBtn');
  btn.textContent=t('timer.resume'); btn.classList.remove('running');
  document.getElementById('timerDisplay').classList.add('blink');
  saveTimerState();
  if(window.Room)Room.onLocalChange();
}
function stopTimer(){
  setRunningVisual(false);
  running=false; clearInterval(ticker);
  document.getElementById('startBtn').classList.remove('running');
  document.getElementById('timerDisplay').classList.remove('blink');
}
function resetTimer(){
  stopTimer();
  clearTimerState();
  // mode is already a MODES key ('work','break','long') since initTimer normalizes it
  const safeMode = (mode==='brk'||mode==='break') ? 'break' : (mode==='lng'||mode==='long') ? 'long' : 'work';
  initTimer(safeMode);
  if(window.Room)Room.onLocalChange();
}
function skipSession(){
  stopTimer();
  if(mode==='work'){
    // Credit the minutes actually focused before skipping. Goal progress is
    // deliberately not ticked — a partial session isn't a finished pomodoro.
    const minsPassed = Math.floor((totalSecs - remainSecs) / 60);
    if(minsPassed >= 1 && window.Study) Study.logSession(minsPassed);
  }
  advance();
  if(window.Room)Room.onLocalChange();
}
function onDone(){
  stopTimer();
  if(mode==='work'){
    // Credit the actual session length, which +1/+5 buttons may have grown.
    const focusMins = Math.max(1, Math.round(totalSecs/60));
    if(window.Goals) Goals.onPomodoro();
    if(window.Study) Study.logSession(focusMins);
    showToast(t('msg.pomodoroDone'));
    tryNotify('Pomodoro complete!','Time for a break.');
    playAlarm();
  }else{
    showToast(t('msg.breakOver'));
    tryNotify('Break over!','Back to work.');
    playAlarm();
  }
  if(mode==='work' && autoStartBreak) setTimeout(()=>{ advance(); setTimeout(startTimer,400); }, 600);
  else if(mode!=='work' && autoStartWork) setTimeout(()=>{ advance(); setTimeout(startTimer,400); }, 600);
  else advance();
}
function advance(){
  cycleIndex++;
  if(cycleIndex>=seq.length){cycleIndex=0;showToast(t('msg.roundDone'));}
  const next=seq[cycleIndex]; setTab(next.type); initTimer(next.type); renderCycles();
  saveTimerState();
}
function setTab(m){
  m = m==='brk' ? 'break' : m==='lng' ? 'long' : m;
  document.querySelectorAll('.mode-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === m));
}
function switchMode(m){
  if (window.Chrono) Chrono.exit();
  stopTimer(); setTab(m); initTimer(m); renderCycles(); saveTimerState();
  if(window.Room)Room.onLocalChange();
}

function tryNotify(t,b){if('Notification'in window&&Notification.permission==='granted')new Notification(t,{body:b});else if('Notification'in window&&Notification.permission!=='denied')Notification.requestPermission();}

let toastTO;
function showToast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTO);toastTO=setTimeout(()=>t.classList.remove('show'),3200);}

// ── MUSIC PLAYER PANEL ──────────────────────────────────────
function togglePlayerPanel() {
  const panel = document.getElementById('playerPanel');
  const btn   = document.getElementById('playerFixedBtn');
  const isOpen = panel.classList.contains('open');
  // Close all other panels
  document.getElementById('bgPanel').classList.remove('open');
  document.getElementById('settingsSlidePanel').classList.remove('open');
  document.getElementById('themePanel').classList.remove('open');
  document.getElementById('settingsFixedBtn').classList.remove('active');
  document.getElementById('themeFixedBtn').classList.remove('active');
  document.querySelector('.btn-bg-toggle').classList.remove('active');
  panel.classList.toggle('open', !isOpen);
  btn.classList.toggle('active', !isOpen);
}

function loadPlayerUrl() {
  const raw = document.getElementById('playerUrlInput').value.trim();
  if (!raw) return;
  const embedUrl = resolvePlayerEmbed(raw);
  if (!embedUrl) { showToast('That link is not supported'); return; }
  const iframe   = document.getElementById('playerIframe');
  const wrap     = document.getElementById('playerEmbedWrap');
  const empty    = document.getElementById('playerEmpty');
  const clearBtn = document.getElementById('playerClearBtn');
  const controls = document.getElementById('playerControls');

  // Reset state
  controls.classList.remove('visible');
  scWidget = null;

  iframe.src     = embedUrl.url;
  iframe.style.height = embedUrl.height + 'px';
  wrap.classList.add('has-player');
  empty.style.display = 'none';
  clearBtn.classList.add('visible');

  // SoundCloud: kick off widget init — it retries internally until SC API is ready
  if (embedUrl.src === 'soundcloud') {
    scWidget = null; scWidgetReady = false;
    controls.classList.add('visible');
    updateCtrlLabels('soundcloud');
    initSCWidget();
  }

  // YouTube: just show the embed, no controls needed
  if (embedUrl.src === 'youtube') {
    ytPlayer = null; ytPlayerReady = false;
    const ytUrl = embedUrl.url + '&enablejsapi=1';
    iframe.src = ytUrl;
    initYTPlayer();
  }

  // highlight badge
  document.querySelectorAll('.player-badge').forEach(b => b.classList.remove('active-src'));
  const match = document.querySelector(`.player-badge[data-src="${embedUrl.src}"]`);
  if (match) match.classList.add('active-src');
  showToast('Player loaded');
  localStorage.setItem('sf_player_url', raw);
}

function resolvePlayerEmbed(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace('www.', '');

    // YouTube
    if (host === 'youtube.com' || host === 'youtu.be' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      let vid = u.searchParams.get('v');
      let list = u.searchParams.get('list');
      if (!vid && host === 'youtu.be') vid = u.pathname.slice(1).split('?')[0];
      if (!vid && u.pathname.includes('/shorts/')) vid = u.pathname.split('/shorts/')[1].split('/')[0];
      if (!vid && u.pathname.includes('/embed/')) vid = u.pathname.split('/embed/')[1].split('?')[0];
      if (vid) return { url: `https://www.youtube.com/embed/${vid}?autoplay=1&rel=0`, height: 230, src: 'youtube', rawUrl: url };
      if (list) return { url: `https://www.youtube.com/embed/videoseries?list=${list}&autoplay=1`, height: 230, src: 'youtube', rawUrl: url };
    }

    // Spotify
    if (host === 'open.spotify.com') {
      const path = u.pathname;
      // Tracks/episodes: compact. Everything else (playlist/album/artist): tall enough to show shuffle+repeat footer
      const isTrack = path.startsWith('/track/') || path.startsWith('/episode/');
      const h = isTrack ? 152 : 460;
      return { url: `https://open.spotify.com/embed${path}?utm_source=generator&theme=0`, height: h, src: 'spotify' };
    }

    // SoundCloud
    if (host === 'soundcloud.com') {
      const encoded = encodeURIComponent(url);
      return { url: `https://w.soundcloud.com/player/?url=${encoded}&auto_play=true&color=%23c084fc&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=false&buying=false&liking=false&download=false&sharing=false`, height: 166, src: 'soundcloud' };
    }
  } catch(e) {}
  return null;
}

let ytPlayer = null, ytPlayerReady = false, ytIsPlaying = false;

function clearPlayer() {
  const iframe   = document.getElementById('playerIframe');
  const wrap     = document.getElementById('playerEmbedWrap');
  const empty    = document.getElementById('playerEmpty');
  const clearBtn = document.getElementById('playerClearBtn');
  const controls = document.getElementById('playerControls');
  iframe.src = '';
  wrap.classList.remove('has-player');
  empty.style.display = '';
  clearBtn.classList.remove('visible');
  controls.classList.remove('visible');
  scWidget = null; scWidgetReady = false; scIsPlaying = false; scShuffleOn = false; scRepeatOn = false;
  ytPlayer = null; ytPlayerReady = false; ytIsPlaying = false;
  document.getElementById('ctrlPlay').textContent = '▶';
  document.getElementById('ctrlShuffle').classList.remove('active');
  document.querySelectorAll('.player-badge').forEach(b => b.classList.remove('active-src'));
  document.getElementById('playerUrlInput').value = '';
  localStorage.removeItem('sf_player_url');
  showToast('Player cleared');
}

// ── YOUTUBE PLAYER API ────────────────────────────────────

// Load YT IFrame API script once
(function loadYTScript() {
  if (!document.getElementById('yt-iframe-api')) {
    const tag = document.createElement('script');
    tag.id = 'yt-iframe-api';
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  }
})();

function initYTPlayer() {
  // Wait until YT API and iframe are ready
  if (typeof YT === 'undefined' || !YT.Player) {
    setTimeout(initYTPlayer, 400); return;
  }
  const iframe = document.getElementById('playerIframe');
  if (!iframe.src || !iframe.src.includes('youtube.com')) return;
  try {
    ytPlayer = new YT.Player('playerIframe', {
      events: {
        onReady: () => {
          ytPlayerReady = true;
          document.getElementById('ctrlPlay').textContent = '⏸';
          ytIsPlaying = true;
        },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.PLAYING) {
            ytIsPlaying = true;
            document.getElementById('ctrlPlay').textContent = '⏸';
          } else if (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED) {
            ytIsPlaying = false;
            document.getElementById('ctrlPlay').textContent = '▶';
          }
        }
      }
    });
  } catch(e) { setTimeout(initYTPlayer, 400); }
}

function ytTogglePlay() {
  if (!ytPlayer || !ytPlayerReady) return;
  if (ytIsPlaying) ytPlayer.pauseVideo(); else ytPlayer.playVideo();
}
function ytSkipForward() {
  if (!ytPlayer || !ytPlayerReady) return;
  const t = ytPlayer.getCurrentTime();
  ytPlayer.seekTo(Math.max(0, t + 10), true);
}
function ytSkipBackward() {
  if (!ytPlayer || !ytPlayerReady) return;
  const t = ytPlayer.getCurrentTime();
  ytPlayer.seekTo(Math.max(0, t - 10), true);
}
function ytNextVideo() {
  if (!ytPlayer || !ytPlayerReady) return;
  try { ytPlayer.nextVideo(); } catch(e) {}
}
function ytPrevVideo() {
  if (!ytPlayer || !ytPlayerReady) return;
  try { ytPlayer.previousVideo(); } catch(e) {}
}

// ── UNIFIED CONTROL ROUTING ────────────────────────────────
function getActiveSrc() {
  const badge = document.querySelector('.player-badge.active-src');
  return badge ? badge.dataset.src : null;
}
function ctrlPlayPause() {
  const src = getActiveSrc();
  if (src === 'youtube') ytTogglePlay();
  else if (src === 'soundcloud') scTogglePlay();
}
function ctrlPrev() {
  const src = getActiveSrc();
  if (src === 'youtube') { ytSkipBackward(); showToast('−10s'); }
  else if (src === 'soundcloud') scPrev();
}
function ctrlNext() {
  const src = getActiveSrc();
  if (src === 'youtube') { ytSkipForward(); showToast('+10s'); }
  else if (src === 'soundcloud') scNext();
}
function ctrlLeft() {
  const src = getActiveSrc();
  if (src === 'youtube') { ytPrevVideo(); showToast('Previous video'); }
  else if (src === 'soundcloud') scShuffle();
}

// Update button labels based on active source
function updateCtrlLabels(src) {
  const shuffle = document.getElementById('ctrlShuffle');
  const prev    = document.getElementById('ctrlPrev');
  const next    = document.getElementById('ctrlNext');
  if (src === 'youtube') {
    shuffle.title = 'Previous Video';  shuffle.textContent = '⏮⏮';
    prev.title    = '−10 seconds';     prev.textContent    = '−10s';
    next.title    = '+10 seconds';     next.textContent    = '+10s';
  } else {
    shuffle.title = 'Shuffle'; shuffle.textContent = '⇌';
    prev.title    = 'Previous'; prev.textContent   = '⏮';
    next.title    = 'Next';     next.textContent    = '⏭';
  }
}

// ── SOUNDCLOUD WIDGET API ──────────────────────────────────
let scWidget = null, scIsPlaying = false, scShuffleOn = false, scRepeatOn = false;
let scTracks = [], scWidgetReady = false;

function initSCWidget() {
  // Retry until the SC Widget API script has loaded
  if (typeof SC === 'undefined' || !window.SC || !window.SC.Widget) {
    setTimeout(initSCWidget, 400);
    return;
  }
  const iframe = document.getElementById('playerIframe');
  // Guard: if iframe src is gone (user cleared), stop
  if (!iframe.src || !iframe.src.includes('soundcloud.com')) return;
  try {
    scWidget = SC.Widget(iframe);
  } catch(e) { setTimeout(initSCWidget, 400); return; }

  scWidgetReady = false;

  scWidget.bind(SC.Widget.Events.READY, () => {
    scWidgetReady = true;
    // Fetch track list for shuffle
    scWidget.getSounds(sounds => { scTracks = sounds || []; });
    // Widget starts playing automatically — reflect that
    scIsPlaying = true;
    document.getElementById('ctrlPlay').textContent = '⏸';
  });
  scWidget.bind(SC.Widget.Events.PLAY, () => {
    scIsPlaying = true;
    document.getElementById('ctrlPlay').textContent = '⏸';
  });
  scWidget.bind(SC.Widget.Events.PAUSE, () => {
    scIsPlaying = false;
    document.getElementById('ctrlPlay').textContent = '▶';
  });
  scWidget.bind(SC.Widget.Events.FINISH, () => {
    scIsPlaying = false;
    document.getElementById('ctrlPlay').textContent = '▶';
    // Auto-advance: repeat or shuffle
    if (scRepeatOn) {
      scWidget.seekTo(0); scWidget.play();
    } else if (scShuffleOn && scTracks.length > 1) {
      scPlayRandom();
    }
  });
}

function scTogglePlay() {
  if (!scWidget || !scWidgetReady) return;
  if (scIsPlaying) scWidget.pause(); else scWidget.play();
}
function scNext() {
  if (!scWidget || !scWidgetReady) return;
  if (scShuffleOn && scTracks.length > 1) { scPlayRandom(); return; }
  scWidget.next();
}
function scPrev() {
  if (!scWidget || !scWidgetReady) return;
  scWidget.prev();
}
function scPlayRandom() {
  if (!scWidget || scTracks.length === 0) return;
  const idx = Math.floor(Math.random() * scTracks.length);
  scWidget.skip(idx);
}
function scShuffle() {
  scShuffleOn = !scShuffleOn;
  document.getElementById('ctrlShuffle').classList.toggle('active', scShuffleOn);
  showToast(scShuffleOn ? 'Shuffle on' : 'Shuffle off');
}
function scToggleRepeat() {
  scRepeatOn = !scRepeatOn;
  document.getElementById('ctrlRepeat').classList.toggle('active', scRepeatOn);
  showToast(scRepeatOn ? 'Repeat on' : 'Repeat off');
}

// Click badge to set placeholder example and highlight selection
document.querySelectorAll('.player-badge').forEach(badge => {
  badge.addEventListener('click', () => {
    const examples = {
      youtube:    'https://www.youtube.com/watch?v=jfKfPfyJRdk',
      spotify:    'https://open.spotify.com/playlist/37i9dQZF1DX8NTLI2TtZa6',
      soundcloud: 'https://soundcloud.com/lofi-hip-hop-music/sets/lofi-hip-hop-radio'
    };
    const src = badge.dataset.src;
    document.getElementById('playerUrlInput').placeholder = examples[src] || 'paste link here...';
    // Highlight the clicked badge
    document.querySelectorAll('.player-badge').forEach(b => b.classList.remove('active-src'));
    badge.classList.add('active-src');
  });
});

// Restore player on load
(function restorePlayer() {
  const saved = localStorage.getItem('sf_player_url');
  if (saved) {
    document.getElementById('playerUrlInput').value = saved;
    loadPlayerUrl();
  }
})();

// ── INIT ──────────────────────────────────────────────────────
function init(){
  // Hide video element initially
  document.getElementById('bgVideo').style.display='none';
  // Preload both theme bgs into memory cache, then apply current theme
  // Never let a storage failure block the background: if IndexedDB is
  // unavailable (private mode, blocked storage, quota) the preload rejects,
  // and without this catch applyTheme would never run at all.
  preloadAllBgs()
    .catch(e => console.warn('bg preload failed, continuing without cache', e))
    .then(() => applyTheme(currentTheme));
  // Restore timer state from last session, or start fresh
  const restored = restoreTimerState();
  if (restored) {
    // Rebuild seq in case TOTAL_CYCLES changed
    seq = buildSeq();
    // Clamp cycleIndex in case seq length changed
    if (cycleIndex >= seq.length) cycleIndex = 0;
    // Normalise mode key
    const safeMode = (mode==='brk') ? 'break' : (mode==='lng') ? 'long' : mode;
    mode = safeMode;
    // Set totalSecs from current MODES in case settings changed
    if (!totalSecs) totalSecs = MODES[safeMode] * 60;
    updateDisplay(); updateBar();
    // Restore timer display color + button state
    const cc = mode==='work'?'wc':mode==='break'?'bc':'lc';
    document.getElementById('timerDisplay').className = 'timer-display '+cc;
    document.getElementById('progressBar').className = 'timer-progress-bar '+cc;
    setTab(mode);
    const btn = document.getElementById('startBtn');
    btn.className = 'btn btn-primary' + (mode!=='work'?' bm':'');
    btn.textContent = t('timer.start');
    if (remainSecs <= 0) { clearTimerState(); initTimer(mode); }
    renderCycles();
    showToast(t('msg.restored'));
  } else {
    renderCycles(); initTimer('work');
  }
  if('Notification'in window&&Notification.permission==='default')Notification.requestPermission();

  // ── Restore BG & Glass slider settings ──────────────────────
  const _dim  = localStorage.getItem('sf_dim');
  const _blur = localStorage.getItem('sf_blur');
  const _gopac = localStorage.getItem('sf_glass_opac');
  const _gblur = localStorage.getItem('sf_glass_blur');
  const _gbord = localStorage.getItem('sf_glass_bord');
  if (_dim  !== null) { const v = parseInt(_dim);   document.getElementById('dimSlider').value  = v; setDim(v); }
  if (_blur !== null) { const v = parseInt(_blur);  document.getElementById('blurSlider').value = v; setBlur(v); }
  if (_gopac !== null) { const v = parseInt(_gopac); document.getElementById('glassOpacSlider').value = v; setGlassOpac(v); }
  if (_gblur !== null) { const v = parseInt(_gblur); document.getElementById('glassBlurSlider').value = v; setGlassBlur(v); }
  if (_gbord !== null) { const v = parseInt(_gbord); document.getElementById('glassBordSlider').value = v; setGlassBorder(v); }

  loadQuote();
}

const QUOTES = [
  {t:"The secret of getting ahead is getting started.", a:"— Mark Twain"},
  {t:"Focus on being productive instead of busy.", a:"— Tim Ferriss"},
  {t:"You don't have to be great to start, but you have to start to be great.", a:"— Zig Ziglar"},
  {t:"It's not that I'm so smart, it's just that I stay with problems longer.", a:"— Albert Einstein"},
  {t:"Done is better than perfect.", a:"— Sheryl Sandberg"},
  {t:"The way to get started is to quit talking and begin doing.", a:"— Walt Disney"},
  {t:"Energy and persistence conquer all things.", a:"— Benjamin Franklin"},
  {t:"Concentration is the root of all the higher abilities in man.", a:"— Bruce Lee"},
  {t:"One hour of focused work is worth more than a day of distraction.", a:"— Anonymous"},
  {t:"Small steps every day lead to giant leaps over time.", a:"— Anonymous"},
];
function loadQuote(){
  const q=QUOTES[Math.floor(Math.random()*QUOTES.length)];
  document.getElementById('quoteText').textContent='"'+q.t+'"';
  document.getElementById('quoteAuthor').textContent=q.a;
}

// ── THEME ─────────────────────────────────────────────────────
// Default theme backgrounds (Cloudinary URLs)
const THEME_DEFAULT_BG = {
  lofi:    'https://res.cloudinary.com/dsmqfgweb/video/upload/v1779389584/Video_Project_oqt9aw.mp4',
  greens:  'https://res.cloudinary.com/dsmqfgweb/video/upload/v1779365046/river_mmya3j.mp4',
  'cherry-blues': 'https://res.cloudinary.com/dsmqfgweb/video/upload/v1779371239/blues_2_onb2j0.mp4',
  moonlight: 'https://res.cloudinary.com/dsmqfgweb/video/upload/v1779706166/1768922296_radpl7.mp4'
};

// Lofi is the default: it carries the cosy study-room look best.
// 'cyber' and 'edo-gold' were retired — migrate anyone still stored on them.
const RETIRED_THEMES = ['cyber', 'edo-gold'];
let currentTheme = localStorage.getItem('sf_theme') || 'lofi';
if (RETIRED_THEMES.indexOf(currentTheme) !== -1) {
  currentTheme = 'lofi';
  try { localStorage.setItem('sf_theme', currentTheme); } catch(e) {}
}

async function applyTheme(t) {
  currentTheme = t;
  document.body.classList.toggle('theme-lofi',   t === 'lofi');
  document.body.classList.toggle('theme-greens', t === 'greens');
  document.body.classList.toggle('theme-cherry-blues', t === 'cherry-blues');
  document.body.classList.toggle('theme-moonlight', t === 'moonlight');
  document.querySelectorAll('.theme-option').forEach(el => {
    el.classList.toggle('selected', el.id === 'theme-' + t);
  });
  localStorage.setItem('sf_theme', t);
  updateBgBadge(t);
  // Load user's saved background for this theme
  const rec = await loadBgForTheme(t);
  if (rec) {
    // User has a custom bg — use it
    applyBgFromRecord(rec, t);
  } else {
    // Check if user removed the default bg for this theme
    const removed = localStorage.getItem('sf_defbg_removed_' + t);
    if (removed) {
      applyBgFromRecord(null, t);
    } else {
      // Apply the default theme video
      applyDefaultThemeBg(t);
    }
  }
  // Refresh glass effects
  const opacVal = parseInt(document.getElementById('glassOpacSlider').value);
  const blurVal = parseInt(document.getElementById('glassBlurSlider').value);
  const bordVal = parseInt(document.getElementById('glassBordSlider').value);
  setGlassOpac(opacVal);
  setGlassBlur(blurVal);
  setGlassBorder(bordVal);
  // Update progress animal
  updateAnimalSVG(t);
}

function applyDefaultThemeBg(t) {
  const url = THEME_DEFAULT_BG[t];
  if (!url) return;
  const video = document.getElementById('bgVideo');
  const frame = document.getElementById('bgFrame');
  frame.classList.remove('ready'); frame.src = '';
  document.body.style.backgroundImage = '';
  video.style.display = '';
  video.classList.remove('ready');
  video.src = url;
  video.load();
  video.play().catch(() => {});
  video.oncanplay = () => video.classList.add('ready');
  // If the video 404s or is blocked, say so instead of failing silently —
  // the themed gradient behind #bgWrap stays visible either way.
  video.onerror = () => {
    video.classList.remove('ready');
    console.warn('Theme background video failed to load:', url,
                 '— falling back to the theme gradient.');
  };
  document.getElementById('uploadText').textContent = 'Upload a video, image or HTML';
  document.getElementById('mediaUpload').value = '';
}

function removeDefaultBg() {
  localStorage.setItem('sf_defbg_removed_' + currentTheme, '1');
  // Also clear any cached/saved bg so it doesn't override the removal
  clearBgForTheme(currentTheme);
  applyBgFromRecord(null, currentTheme);
  showToast('Default background removed');
  updateRemoveDefaultBtnVisibility();
}

function restoreDefaultBg() {
  localStorage.removeItem('sf_defbg_removed_' + currentTheme);
  applyDefaultThemeBg(currentTheme);
  showToast('Default background restored');
  updateRemoveDefaultBtnVisibility();
}

function updateRemoveDefaultBtnVisibility() {
  const btn = document.getElementById('removeDefaultBgBtn');
  const restoreBtn = document.getElementById('restoreDefaultBgBtn');
  if (!btn || !restoreBtn) return;
  const removed = localStorage.getItem('sf_defbg_removed_' + currentTheme);
  btn.style.display = removed ? 'none' : '';
  restoreBtn.style.display = removed ? '' : 'none';
}

function setTheme(t) {
  applyTheme(t);
  const msgs = { lofi: '✿ lofi theme', greens: '⬡ greens theme', 'cherry-blues': '✦ cherry blues theme', moonlight: '☽ moonlight theme' };
  showToast(msgs[t] || 'theme applied');
  updateRemoveDefaultBtnVisibility();
}

function toggleThemePanel() {
  const panel = document.getElementById('themePanel');
  const btn = document.getElementById('themeFixedBtn');
  const isOpen = panel.classList.contains('open');
  document.getElementById('bgPanel').classList.remove('open');
  document.getElementById('settingsSlidePanel').classList.remove('open');
  document.getElementById('settingsFixedBtn').classList.remove('active');
  document.querySelector('.btn-bg-toggle').classList.remove('active');
  document.getElementById('playerPanel').classList.remove('open');
  document.getElementById('playerFixedBtn').classList.remove('active');
  panel.classList.toggle('open', !isOpen);
  btn.classList.toggle('active', !isOpen);
}

// ── PROGRESS ANIMALS ─────────────────────────────────────────
const THEME_ANIMALS = {
  lofi: `<svg viewBox="0 0 24 28" xmlns="http://www.w3.org/2000/svg">
    <!-- Tail (behind body, drawn first) -->
    <path d="M16 23 Q22 21 22 14 Q22 9 17 11.5" stroke="#f9a8d4" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <!-- Body -->
    <ellipse cx="11.5" cy="20" rx="7" ry="7.2" fill="rgba(249,168,212,0.16)" stroke="#f9a8d4" stroke-width="1.3"/>
    <!-- Neck fill (hides gap between head & body) -->
    <rect x="9" y="14" width="5" height="4" fill="rgba(249,168,212,0.16)" stroke="none"/>
    <line x1="9" y1="14" x2="9" y2="17.5" stroke="#f9a8d4" stroke-width="1.3"/>
    <line x1="14" y1="14" x2="14" y2="17.5" stroke="#f9a8d4" stroke-width="1.3"/>
    <!-- Head -->
    <circle cx="11" cy="10" r="5.8" fill="rgba(249,168,212,0.16)" stroke="#f9a8d4" stroke-width="1.3"/>
    <!-- Left ear -->
    <path d="M7.5 7.5 L7 2 L11.5 6" fill="#f9a8d4"/>
    <!-- Right ear -->
    <path d="M11.5 6 L16 2 L15.5 7.5" fill="#f9a8d4"/>
    <!-- Ear inner details -->
    <path d="M8.3 7 L8.5 4 L11 6.5" fill="rgba(255,200,225,0.55)"/>
    <path d="M11.5 6.5 L14.5 4 L14.8 7.5" fill="rgba(255,200,225,0.55)"/>
    <!-- Closed sleepy eye -->
    <path d="M8 9.8 Q10.5 7.8 13 9.8" stroke="#f9a8d4" stroke-width="1.4" fill="rgba(249,168,212,0.18)" stroke-linecap="round"/>
    <!-- Tiny eyelash -->
    <line x1="8.5" y1="9.5" x2="8" y2="8.3" stroke="#f9a8d4" stroke-width="0.8" stroke-linecap="round" opacity="0.7"/>
    <!-- Nose -->
    <path d="M10 12 Q11 13 12 12 Q11 11.2 10 12 Z" fill="#f9a8d4" opacity="0.8"/>
    <!-- Front paw -->
    <ellipse cx="9" cy="26.5" rx="2.8" ry="1.4" fill="rgba(249,168,212,0.28)" stroke="#f9a8d4" stroke-width="1.1"/>
    <!-- Tiny toe lines on paw -->
    <line x1="8" y1="25.8" x2="8" y2="27" stroke="#f9a8d4" stroke-width="0.7" stroke-linecap="round" opacity="0.5"/>
    <line x1="10" y1="25.8" x2="10" y2="27" stroke="#f9a8d4" stroke-width="0.7" stroke-linecap="round" opacity="0.5"/>
  </svg>`,

  greens: `<svg viewBox="0 0 26 24" xmlns="http://www.w3.org/2000/svg">
    <circle cx="7.5" cy="8.5" r="4" fill="rgba(74,222,128,0.2)" stroke="#4ade80" stroke-width="1.3"/>
    <circle cx="18.5" cy="8.5" r="4" fill="rgba(74,222,128,0.2)" stroke="#4ade80" stroke-width="1.3"/>
    <circle cx="7.5" cy="8.5" r="1.8" fill="#4ade80"/>
    <circle cx="18.5" cy="8.5" r="1.8" fill="#4ade80"/>
    <circle cx="7.5" cy="8" r="0.7" fill="rgba(10,20,14,0.6)"/>
    <circle cx="18.5" cy="8" r="0.7" fill="rgba(10,20,14,0.6)"/>
    <ellipse cx="13" cy="17" rx="9" ry="6.5" fill="rgba(74,222,128,0.14)" stroke="#4ade80" stroke-width="1.3"/>
    <path d="M9 18 Q13 22 17 18" stroke="#4ade80" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    <ellipse cx="6" cy="22.5" rx="4" ry="1.8" fill="rgba(74,222,128,0.28)" stroke="#4ade80" stroke-width="1"/>
    <ellipse cx="20" cy="22.5" rx="4" ry="1.8" fill="rgba(74,222,128,0.28)" stroke="#4ade80" stroke-width="1"/>
  </svg>`,

  'cherry-blues': `<svg viewBox="0 0 24 26" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 12 Q3 3 12 3 Q21 3 21 12 Z" fill="rgba(255,107,157,0.18)" stroke="#ff6b9d" stroke-width="1.3"/>
    <path d="M3 12 Q3 10 12 10 Q21 10 21 12" fill="rgba(143,211,255,0.12)" stroke="none"/>
    <circle cx="8.5" cy="9.5" r="1.5" fill="#ffd6e7"/>
    <circle cx="15.5" cy="9.5" r="1.5" fill="#ffd6e7"/>
    <circle cx="8.5" cy="9.5" r="0.6" fill="#ff6b9d"/>
    <circle cx="15.5" cy="9.5" r="0.6" fill="#ff6b9d"/>
    <path d="M7 12.5 Q5.5 17 6.5 21" stroke="#ff6b9d" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    <path d="M10 12.5 Q8.5 18 9.5 22.5" stroke="#8fd3ff" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    <path d="M12 12.5 Q12 18 12 23" stroke="#ff6b9d" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    <path d="M14 12.5 Q15.5 18 14.5 22.5" stroke="#8fd3ff" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    <path d="M17 12.5 Q18.5 17 17.5 21" stroke="#ff6b9d" stroke-width="1.2" fill="none" stroke-linecap="round"/>
  </svg>`,


  moonlight: `<svg viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <mask id="cMask">
        <circle cx="13" cy="14" r="12" fill="white"/>
        <circle cx="19" cy="14" r="10" fill="black"/>
      </mask>
    </defs>
    <!-- clean crescent: big circle with a circle masked out from the right -->
    <circle cx="13" cy="14" r="12" fill="rgba(232,220,160,0.85)" stroke="#d4c870" stroke-width="0.8" mask="url(#cMask)"/>
    <!-- sleepy eye -->
    <path d="M 8 12.5 Q 10 11 12 12.5" stroke="#887820" stroke-width="1" fill="none" stroke-linecap="round" mask="url(#cMask)"/>
    <!-- smile -->
    <path d="M 8.5 16 Q 10.5 17.5 12.5 16" stroke="#887820" stroke-width="0.85" fill="none" stroke-linecap="round" mask="url(#cMask)"/>
    <!-- cheek -->
    <ellipse cx="7.5" cy="14.2" rx="1.8" ry="1.1" fill="rgba(255,140,100,0.2)" mask="url(#cMask)"/>
    <!-- tiny star -->
    <circle cx="3" cy="5" r="0.5" fill="#f0e890" opacity="0.8"/>
    <line x1="3" y1="3.6" x2="3" y2="4.4" stroke="#f0e890" stroke-width="0.4" opacity="0.6"/>
    <line x1="1.6" y1="5" x2="2.4" y2="5" stroke="#f0e890" stroke-width="0.4" opacity="0.6"/>
  </svg>`
};

function updateAnimalSVG(theme) {
  const animal = document.getElementById('progressAnimal');
  if (!animal) return;
  const svg = THEME_ANIMALS[theme] || THEME_ANIMALS.lofi;
  animal.innerHTML = svg;
}

// ── LIVE CLOCK ─────────────────────────────────────────
function updateClock() {
  const now = new Date();
  // Clock and date follow the chosen app language, not the browser's:
  // French convention is 24-hour, English keeps AM/PM.
  const lang = window.I18N ? I18N.current() : 'en';
  const loc  = lang === 'fr' ? 'fr-FR' : 'en-GB';
  const h24  = lang === 'fr';

  let h = now.getHours();
  const m = now.getMinutes();
  const s = now.getSeconds();
  const ampm = h24 ? '' : (h >= 12 ? 'PM' : 'AM');
  if (!h24) h = h % 12 || 12;

  document.getElementById('clockHours').textContent = String(h).padStart(2, '0');
  document.getElementById('clockMins').textContent  = String(m).padStart(2, '0');
  document.getElementById('clockSecs').textContent  = String(s).padStart(2, '0');
  document.getElementById('clockAmpm').textContent  = ampm;

  const el = document.getElementById('liveDate');
  if (el) {
    // Language is part of the cache key, otherwise switching to French
    // would leave yesterday's English string until midnight.
    const key = now.toDateString() + '|' + lang;
    if (el.dataset.day !== key) {
      el.dataset.day = key;
      el.textContent = now.toLocaleDateString(loc, {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      });
    }
  }
}
updateClock();
setInterval(updateClock, 1000);


// ── SHARED ROOM (Supabase Realtime) ───────────────────────────
// Real-time synced timer. Every local timer action broadcasts a full
// snapshot; receivers apply it (guarded against re-broadcast loops).
// Fully non-blocking: if Supabase is unavailable, the timer keeps working.
// ── SHARED SUPABASE CLIENT ────────────────────────────────────
// One client for realtime rooms, auth, study sessions and goals — creating
// several would give each its own auth/realtime state.
window.SB = (function(){
  const SB_URL = 'https://kucqirnkgrtebmowzwlw.supabase.co';
  const SB_KEY = 'sb_publishable_JR6QoT02BlyKUok-EHjPMw_TH-dBT9P';

  let client = null;

  function get(){
    if (!client && window.supabase && window.supabase.createClient) {
      client = window.supabase.createClient(SB_URL, SB_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          // Handled manually in Auth.init(): Spotify's OAuth callback also
          // lands on this page with ?code=, so letting Supabase grab any
          // ?code= it sees would make the two flows fight over it.
          detectSessionInUrl: false,
          flowType: 'pkce'
        },
        realtime: { params: { eventsPerSecond: 10 } }
      });
    }
    return client;
  }

  // The Supabase CDN script is async — run cb once the library shows up.
  function ready(cb){
    let tries = 0;
    (function wait(){
      const cl = get();
      if (cl) cb(cl);
      else if (tries++ < 60) setTimeout(wait, 150);
    })();
  }

  return { get: get, ready: ready };
})();

window.Room = (function(){
  const myId = Math.random().toString(36).slice(2, 10);

  let channel = null, code = null;
  let applying = false, panelOpen = false, status = 'idle', peers = 1;

  function toast(m){ if (typeof showToast === 'function') showToast(m); }

  function sb(){ return window.SB.get(); }

  function genCode(){
    const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let s = ''; for (let i=0;i<6;i++) s += A[Math.floor(Math.random()*A.length)];
    return s;
  }

  function snapshot(){ return { mode: mode, totalSecs: totalSecs, remainSecs: remainSecs, running: running }; }

  function apply(s){
    if (!s) return;
    applying = true;
    try {
      if (typeof setTab === 'function') setTab(s.mode);
      mode = s.mode; totalSecs = s.totalSecs; remainSecs = s.remainSecs;
      const cc = mode==='work'?'wc':mode==='break'?'bc':'lc';
      const td = document.getElementById('timerDisplay'); if (td) td.className = 'timer-display '+cc;
      const pb = document.getElementById('progressBar'); if (pb) pb.className = 'timer-progress-bar '+cc;
      updateDisplay(); updateBar();
      const b = document.getElementById('startBtn');
      if (s.running){
        if (!running) startTimer();               // sets label 'Pause' + starts ticker
      } else {
        if (running){ running = false; clearInterval(ticker); }   // stop ticker, no label churn
        if (b){ b.textContent = (remainSecs >= totalSecs) ? t('timer.start') : t('timer.resume'); b.classList.remove('running'); }
        if (td) td.classList.toggle('blink', remainSecs < totalSecs);
      }
    } catch(e){ console.warn('room apply', e); }
    applying = false;
  }

  function push(){
    if (channel && !applying && status === 'joined') {
      try { channel.send({ type:'broadcast', event:'sync', payload: snapshot() }); } catch(e){}
    }
  }
  function onLocalChange(){ push(); }

  function join(c){
    const cl = sb();
    if (!cl){ toast('Shared rooms are unavailable right now'); return; }
    if (channel) leave(true);
    code = c; status = 'connecting'; updateUI();
    channel = cl.channel('room:'+c, { config: { broadcast: { self:false }, presence: { key: myId } } });
    channel.on('broadcast', { event:'sync'  }, function(m){ apply(m.payload); });
    channel.on('broadcast', { event:'hello' }, function(){ push(); });   // reply to newcomers
    channel.on('presence',  { event:'sync'  }, function(){
      try { peers = Object.keys(channel.presenceState()).length || 1; } catch(e){ peers = 1; }
      updateUI();
    });
    channel.subscribe(function(st){
      if (st === 'SUBSCRIBED'){
        status = 'joined';
        try { channel.track({ at: Date.now() }); } catch(e){}
        try { channel.send({ type:'broadcast', event:'hello', payload:{} }); } catch(e){}  // request current state
        setUrl(c); toast('Joined room '+c); updateUI();
      } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT'){
        status = 'error'; updateUI(); toast('Could not connect to the room');
      }
    });
  }

  function create(){ join(genCode()); }

  function leave(silent){
    const cl = sb();
    if (channel && cl){ try { cl.removeChannel(channel); } catch(e){} }
    channel = null; code = null; status = 'idle'; peers = 1; clearUrl();
    if (!silent) toast('Left the room');
    updateUI();
  }

  function link(c){ return location.origin + '/?room=' + c; }
  function setUrl(c){ try { history.replaceState(null, '', '?room='+c); } catch(e){} }
  function clearUrl(){ try { history.replaceState(null, '', location.pathname); } catch(e){} }

  function copyLink(){
    const url = link(code);
    if (navigator.clipboard){ navigator.clipboard.writeText(url).then(function(){ toast('Link copied'); }); }
  }

  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }

  function updateUI(){
    const btn = document.getElementById('roomFixedBtn');
    if (btn) btn.classList.toggle('active', status === 'joined');
    const panel = document.getElementById('roomPanel');
    if (panel) panel.classList.toggle('open', panelOpen);
    const body = document.getElementById('roomBody');
    if (!body) return;
    if (status === 'joined'){
      body.innerHTML =
        '<div class="room-code-label">' + esc(t('room.code')) + '</div>' +
        '<div class="room-code">'+esc(code)+'</div>' +
        '<div class="room-peers"><span class="room-dot"></span>'+peers+' '+esc(t('room.online'))+'</div>' +
        '<div class="room-linkrow"><input class="room-link" readonly value="'+esc(link(code))+'"><button class="room-btn" onclick="Room.copyLink()">' + esc(t('room.copy')) + '</button></div>' +
        '<div class="room-hint">' + esc(t('room.hint')) + '</div>' +
        '<button class="room-btn room-btn-leave" onclick="Room.leave()">' + esc(t('room.leave')) + '</button>';
    } else {
      const connecting = (status === 'connecting');
      body.innerHTML =
        '<button class="room-btn room-btn-primary" onclick="Room.create()"'+(connecting?' disabled':'')+'>'+(connecting?t('room.connecting'):t('room.create'))+'</button>' +
        '<div class="room-or">' + esc(t('room.or')) + '</div>' +
        '<div class="room-joinrow"><input class="room-input" id="roomJoinInput" placeholder="e.g. GABES7" maxlength="8"><button class="room-btn" onclick="Room.joinFromInput()">' + esc(t('room.join')) + '</button></div>' +
        (status === 'error' ? '<div class="room-err">' + esc(t('room.failed')) + '</div>' : '');
    }
  }

  function joinFromInput(){
    const el = document.getElementById('roomJoinInput');
    const v = ((el && el.value) || '').trim().toUpperCase();
    if (v.length >= 4) join(v); else toast('That code is too short');
  }

  function closeOtherPanels(){
    ['bgPanel','settingsSlidePanel','themePanel','playerPanel'].forEach(function(id){ const e=document.getElementById(id); if(e) e.classList.remove('open'); });
    ['settingsFixedBtn','themeFixedBtn','playerFixedBtn'].forEach(function(id){ const e=document.getElementById(id); if(e) e.classList.remove('active'); });
    const bg=document.querySelector('.btn-bg-toggle'); if(bg) bg.classList.remove('active');
  }
  function togglePanel(){ panelOpen = !panelOpen; if(panelOpen) closeOtherPanels(); updateUI(); }
  // close the room panel whenever another fixed panel button is clicked
  ['#settingsFixedBtn','#themeFixedBtn','#playerFixedBtn','.btn-bg-toggle'].forEach(function(sel){
    const b=document.querySelector(sel); if(b) b.addEventListener('click', function(){ panelOpen=false; updateUI(); });
  });

  // auto-join from ?room=CODE once the Supabase lib is ready
  (function autoJoin(){
    const m = /[?&]room=([A-Za-z0-9]{4,12})/.exec(location.search);
    if (!m) { updateUI(); return; }
    const c = m[1].toUpperCase();
    let tries = 0;
    (function wait(){
      if (window.supabase && window.supabase.createClient){ panelOpen = true; join(c); }
      else if (tries++ < 40){ setTimeout(wait, 150); }
    })();
  })();

  return { onLocalChange: onLocalChange, create: create, join: join, refresh: updateUI,
           close: function(){ if (panelOpen){ panelOpen = false; updateUI(); } },
           joinFromInput: joinFromInput, leave: leave, copyLink: copyLink,
           togglePanel: togglePanel };
})();

// ── AUTH ──────────────────────────────────────────────────────
// Signing in is optional. Guests keep the full pomodoro + goals + local
// study log, and can read the leaderboard — they just can't appear on it.
window.Auth = (function(){
  let user = null, profile = null, settled = false;
  const listeners = [];

  function toast(m){ if (typeof showToast === 'function') showToast(m); }
  function onChange(fn){ listeners.push(fn); if (settled) fn(user); }
  function emit(){ listeners.forEach(function(f){ try { f(user); } catch(e){ console.warn('auth listener', e); } }); }

  function signedIn(){ return !!user; }
  function id(){ return user ? user.id : null; }
  function name(){
    if (profile && profile.display_name) return profile.display_name;
    if (user && user.email) return user.email.split('@')[0];
    return 'student';
  }

  function cleanUrl(){
    try {
      const u = new URL(location.href);
      u.searchParams.delete('auth');
      u.searchParams.delete('code');
      history.replaceState(null, '', u.pathname + (u.search ? u.search : '') + u.hash);
    } catch(e){}
  }

  async function loadProfile(){
    const cl = window.SB.get();
    if (!cl || !user){ profile = null; return; }
    try {
      const r = await cl.from('profiles').select('display_name, section').eq('id', user.id).maybeSingle();
      profile = r.data || null;
    } catch(e){ profile = null; }
  }

  async function setSession(session){
    const before = user && user.id;
    user = (session && session.user) || null;
    if (user) await loadProfile(); else profile = null;
    settled = true;
    emit();
    // Newly signed in — push everything that was captured as a guest.
    if (user && user.id !== before){
      if (window.Study) window.Study.flush();
      if (window.Goals) window.Goals.pull();
    }
  }

  function init(){
    window.SB.ready(async function(cl){
      try {
        const q = new URLSearchParams(location.search);
        if (q.get('auth') === 'supabase' && q.get('code')){
          const r = await cl.auth.exchangeCodeForSession(q.get('code'));
          if (r.error) toast('Sign-in failed: ' + r.error.message);
          cleanUrl();
        }
        const s = await cl.auth.getSession();
        await setSession(s.data && s.data.session);
        cl.auth.onAuthStateChange(function(_evt, session){ setSession(session); });
      } catch(e){
        console.warn('auth init', e);
        settled = true; emit();
      }
    });
  }

  async function google(){
    const cl = window.SB.get();
    if (!cl) return { error: { message: t('study.unavailableAuth') } };
    const r = await cl.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin + location.pathname + '?auth=supabase' }
    });
    return r;
  }

  async function signUp(email, password, displayName){
    const cl = window.SB.get();
    if (!cl) return { ok:false, msg:'Sign-in is unavailable right now' };
    const r = await cl.auth.signUp({
      email: email, password: password,
      options: { data: { display_name: displayName } }
    });
    if (r.error) return { ok:false, msg:r.error.message };
    if (r.data && r.data.user && !r.data.session) return { ok:true, msg:'Check your inbox to confirm your email' };
    return { ok:true, msg:'Welcome, ' + displayName };
  }

  async function signIn(email, password){
    const cl = window.SB.get();
    if (!cl) return { ok:false, msg:'Sign-in is unavailable right now' };
    const r = await cl.auth.signInWithPassword({ email: email, password: password });
    if (r.error) return { ok:false, msg:r.error.message };
    return { ok:true, msg:'Signed in' };
  }

  async function signOut(){
    const cl = window.SB.get();
    if (!cl) return;
    await cl.auth.signOut();
    toast('Signed out — your study time stays on this device');
  }

  async function rename(newName){
    const cl = window.SB.get();
    if (!cl || !user) return { ok:false, msg:'Not signed in' };
    const n = String(newName || '').trim();
    if (n.length < 2 || n.length > 24) return { ok:false, msg:'Name must be 2–24 characters' };
    const r = await cl.from('profiles').update({ display_name: n }).eq('id', user.id);
    if (r.error) return { ok:false, msg:r.error.message };
    profile = profile || {}; profile.display_name = n;
    emit();
    return { ok:true, msg:'Name updated' };
  }

  return { init:init, onChange:onChange, signedIn:signedIn, id:id, name:name,
           google:google, signUp:signUp, signIn:signIn, signOut:signOut, rename:rename };
})();


// ── STUDY TIME TRACKER + LEADERBOARD ──────────────────────────
window.Study = (function(){
  // Preset subjects are the rankable ones — custom subjects are tracked and
  // counted in a student's totals, but a per-subject board only makes sense
  // when everyone is filling the same bucket.
  const PRESETS = [
    'Mathématiques','Physique-Chimie','SVT','Sciences techniques','Informatique',
    'Arabe','Français','Anglais','Allemand','Espagnol','Italien',
    'Philosophie','Histoire-Géo','Économie','Gestion'
  ];

  const K_CUR = 'sf_subject', K_CUSTOM = 'sf_subjects_custom', K_LOG = 'sf_study_log';
  const MAX_LOG_DAYS = 120;   // local history we keep
  const SYNC_WINDOW_DAYS = 14; // matches the insert policy in schema.sql

  let panelOpen = false;
  let board = [], standing = null, boardSubject = '', boardLoading = false, boardErr = '';
  let authMode = 'none'; // none | signin | signup
  // Account feedback belongs next to the form that caused it, not in a
  // toast at the far side of the screen.
  let authMsg = null;    // { kind: 'error' | 'ok', text }

  function toast(m){ if (typeof showToast === 'function') showToast(m); }
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }

  function uuid(){
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c){
      const r = Math.random()*16|0, v = (c === 'x') ? r : ((r&0x3)|0x8);
      return v.toString(16);
    });
  }

  function readJSON(k, fallback){
    try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fallback : v; }
    catch(e){ return fallback; }
  }
  function writeJSON(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }

  function customs(){ const c = readJSON(K_CUSTOM, []); return Array.isArray(c) ? c : []; }
  function isPreset(s){ return PRESETS.indexOf(s) !== -1; }
  function all(){ return PRESETS.concat(customs()); }

  function current(){
    const s = localStorage.getItem(K_CUR);
    return (s && all().indexOf(s) !== -1) ? s : PRESETS[0];
  }
  function setCurrent(s){
    if (all().indexOf(s) === -1) return;
    localStorage.setItem(K_CUR, s);
    renderSelect();
  }

  function addCustom(raw){
    const n = String(raw || '').trim().slice(0, 40);
    if (!n) return false;
    if (all().some(function(s){ return s.toLowerCase() === n.toLowerCase(); })){
      toast('"' + n + '" already exists'); return false;
    }
    const c = customs(); c.push(n); writeJSON(K_CUSTOM, c);
    setCurrent(n);
    toast('Added subject: ' + n);
    return true;
  }
  function removeCustom(n){
    writeJSON(K_CUSTOM, customs().filter(function(s){ return s !== n; }));
    if (current() === n) localStorage.setItem(K_CUR, PRESETS[0]);
    renderSelect(); render();
  }

  // ── local ledger ──
  // entry: { i:id, s:subject, m:minutes, t:epoch ms, p:preset, u:1 when unsynced }
  function log(){ const l = readJSON(K_LOG, []); return Array.isArray(l) ? l : []; }
  function saveLog(l){
    const cutoff = Date.now() - MAX_LOG_DAYS*86400000;
    writeJSON(K_LOG, l.filter(function(e){ return e && e.t > cutoff; }));
  }

  function weekStart(){
    const d = new Date();
    const dow = (d.getDay() + 6) % 7;      // Monday = 0, matches date_trunc('week')
    d.setHours(0,0,0,0); d.setDate(d.getDate() - dow);
    return d.getTime();
  }
  function dayStart(){ const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); }

  function sumSince(ts){
    return log().reduce(function(a, e){ return e.t >= ts ? a + e.m : a; }, 0);
  }
  function bySubjectSince(ts){
    const out = {};
    log().forEach(function(e){ if (e.t >= ts) out[e.s] = (out[e.s] || 0) + e.m; });
    return out;
  }

  function fmt(mins){
    const m = Math.max(0, Math.round(mins));
    if (m < 60) return m + 'm';
    const h = Math.floor(m/60), r = m % 60;
    return r ? (h + 'h ' + r + 'm') : (h + 'h');
  }

  // Called when a focus session completes.
  function logSession(minutes, subjectOverride){
    const mins = Math.max(1, Math.min(300, Math.round(minutes)));
    const subj = subjectOverride ||
      (window.Goals && window.Goals.activeSubject()) ||
      current();
    const l = log();
    l.push({ i: uuid(), s: subj, m: mins, t: Date.now(), p: isPreset(subj), u: 1 });
    saveLog(l);
    render();
    flush();
  }

  // Push guest-captured and offline sessions once a student is signed in.
  async function flush(){
    const cl = window.SB.get();
    if (!cl || !window.Auth || !window.Auth.signedIn()) return;
    const uid = window.Auth.id();
    const cutoff = Date.now() - SYNC_WINDOW_DAYS*86400000;
    const l = log();
    const pending = l.filter(function(e){ return e.u && e.t >= cutoff; });
    if (!pending.length) return;

    const rows = pending.map(function(e){
      return { id: e.i, user_id: uid, subject: e.s, preset: !!e.p,
               minutes: e.m, started_at: new Date(e.t).toISOString() };
    });
    try {
      const r = await cl.from('study_sessions').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
      if (r.error){ console.warn('study flush', r.error); return; }
      const done = {};
      pending.forEach(function(e){ done[e.i] = 1; });
      saveLog(log().map(function(e){ if (done[e.i]) delete e.u; return e; }));
      // Anything older than the sync window can never be uploaded — stop retrying.
      saveLog(log().map(function(e){ if (e.u && e.t < cutoff) delete e.u; return e; }));
      render();
    } catch(e){ console.warn('study flush', e); }
  }

  // ── leaderboard ──
  async function loadBoard(){
    const cl = window.SB.get();
    if (!cl){ boardErr = t('study.unavailable'); render(); return; }
    boardLoading = true; boardErr = ''; render();
    const subj = boardSubject || null;
    try {
      const r = await cl.rpc('leaderboard_week', { p_subject: subj, p_limit: 25 });
      if (r.error) throw r.error;
      board = r.data || [];
      standing = null;
      if (window.Auth && window.Auth.signedIn()){
        const s = await cl.rpc('my_week_standing', { p_subject: subj });
        if (!s.error && s.data && s.data.length) standing = s.data[0];
      }
    } catch(e){
      board = []; boardErr = (e && e.message) ? e.message : t('study.unavailable');
      // Full object, not just the message: during setup the useful part is
      // usually the Postgres hint/code (missing table, missing function,
      // RLS refusal), which never makes it into .message.
      console.warn('Leaderboard failed — see supabase/SETUP.md:', e);
    }
    boardLoading = false; render();
  }

  function setBoardSubject(s){ boardSubject = s; loadBoard(); }

  // ── subject <select> next to the timer ──
  function renderSelect(){
    const sel = document.getElementById('subjectSelect');
    if (!sel) return;
    const cur = current(), cs = customs();
    let h = '<optgroup label="' + esc(t('study.subjects')) + '">';
    PRESETS.forEach(function(s){ h += '<option value="'+esc(s)+'"'+(s===cur?' selected':'')+'>'+esc(s)+'</option>'; });
    h += '</optgroup>';
    if (cs.length){
      h += '<optgroup label="' + esc(t('study.mySubjects')) + '">';
      cs.forEach(function(s){ h += '<option value="'+esc(s)+'"'+(s===cur?' selected':'')+'>'+esc(s)+'</option>'; });
      h += '</optgroup>';
    }
    h += '<option value="__add">' + esc(t('study.addSubject')) + '</option>';
    sel.innerHTML = h;
    sel.value = cur;
  }

  // Changing the dropdown must also retag the active goal, otherwise the
  // picker would claim one subject while sessions are logged under the
  // goal's older one.
  function onSelect(el){
    if (el.value === '__add'){
      const n = window.prompt(t('study.newSubject'));
      if (!n || !addCustom(n)) renderSelect();
      if (window.Goals) window.Goals.retagActive(current());
      render();
      return;
    }
    setCurrent(el.value);
    if (window.Goals) window.Goals.retagActive(el.value);
    render();
  }

  // ── mini card in the left column ──
  function renderMini(){
    const todayEl = document.getElementById('studyToday');
    const w = document.getElementById('studyWeek');
    if (todayEl) todayEl.textContent = fmt(sumSince(dayStart()));
    if (w) w.textContent = fmt(sumSince(weekStart()));

    const bars = document.getElementById('studyMiniBars');
    if (!bars) return;
    const bs = bySubjectSince(weekStart());
    const rows = Object.keys(bs).map(function(k){ return { s:k, m:bs[k] }; })
                       .sort(function(a,b){ return b.m - a.m; }).slice(0, 4);
    if (!rows.length){
      bars.innerHTML = '<div class="study-mini-empty">' + esc(t('study.noSessions')) + '</div>';
      return;
    }
    const max = rows[0].m || 1;
    bars.innerHTML = rows.map(function(r){
      return '<div class="study-bar-row">' +
               '<span class="study-bar-name" title="'+esc(r.s)+'">'+esc(r.s)+'</span>' +
               '<span class="study-bar-track"><span class="study-bar-fill" style="width:'+Math.max(4, Math.round(r.m/max*100))+'%"></span></span>' +
               '<span class="study-bar-val">'+esc(fmt(r.m))+'</span>' +
             '</div>';
    }).join('');
  }

  // ── panel ──
  function msgBlock(){
    if (!authMsg) return '';
    return '<div class="study-msg ' + (authMsg.kind === 'error' ? 'is-error' : 'is-ok') + '">' +
             esc(authMsg.text) + '</div>';
  }

  function authBlock(){
    const inHtml = window.Auth && window.Auth.signedIn();
    if (inHtml){
      return '<div class="study-acct">' +
               '<div class="study-acct-who"><span class="study-dot"></span>'+esc(window.Auth.name())+'</div>' +
               '<button class="study-link" onclick="Study.doRename()">' + esc(t('study.rename')) + '</button>' +
               '<button class="study-link" onclick="Study.doSignOut()">' + esc(t('study.signout')) + '</button>' +
             '</div>' + msgBlock();
    }
    let h = '<div class="study-guest">' +
              '<div class="study-guest-msg">' + esc(t('study.guest')) + '</div>' +
              '<button class="study-btn study-btn-google" onclick="Study.doGoogle()">' + esc(t('study.google')) + '</button>';
    if (authMode === 'none'){
      h += '<div class="study-or">' + esc(t('study.or')) + '</div>' +
           '<div class="study-authrow">' +
             '<button class="study-btn" onclick="Study.setAuthMode(\'signin\')">' + esc(t('study.signin')) + '</button>' +
             '<button class="study-btn" onclick="Study.setAuthMode(\'signup\')">' + esc(t('study.signup')) + '</button>' +
           '</div>';
    } else {
      const up = (authMode === 'signup');
      h += '<div class="study-form">' +
             (up ? '<input class="study-input" id="authName" type="text" placeholder="' + esc(t('study.name')) + '" maxlength="24">' : '') +
             '<input class="study-input" id="authEmail" type="email" placeholder="' + esc(t('study.email')) + '" autocomplete="email">' +
             '<input class="study-input" id="authPass" type="password" placeholder="' + esc(t('study.password')) + '" autocomplete="'+(up?'new-password':'current-password')+'">' +
             '<button class="study-btn study-btn-primary" onclick="Study.doAuth()">'+(up?'Create account':'Sign in')+'</button>' +
             '<button class="study-link" onclick="Study.setAuthMode(\'none\')">' + esc(t('study.back')) + '</button>' +
           '</div>';
    }
    return h + msgBlock() + '</div>';
  }

  function standingBlock(){
    if (!window.Auth || !window.Auth.signedIn()) return '';
    if (!standing) return '<div class="study-standing-empty">' + esc(t('study.rankEmpty')) + '</div>';
    const pct = standing.percentile;
    return '<div class="study-standing">' +
             '<div class="study-rank">#'+standing.rank+'<span class="study-rank-of"> of '+standing.participants+'</span></div>' +
             '<div class="study-pct-bar"><span style="width:'+Math.max(2, Math.min(100, pct))+'%"></span></div>' +
             '<div class="study-pct-txt">you studied more than <b>'+pct+'%</b> of candidates this week</div>' +
           '</div>';
  }

  function boardBlock(){
    if (boardLoading) return '<div class="study-board-msg">' + esc(t('study.loading')) + '</div>';
    if (boardErr)     return '<div class="study-board-msg study-board-err">'+esc(boardErr)+'</div>';
    if (!board.length) return '<div class="study-board-msg">nobody has logged time'+(boardSubject?' in '+esc(boardSubject):'')+' this week yet — be first</div>';
    return '<div class="study-board">' + board.map(function(r){
      return '<div class="study-row'+(r.is_me?' me':'')+'">' +
               '<span class="study-row-rank">'+r.rank+'</span>' +
               '<span class="study-row-name">'+esc(r.display_name)+'</span>' +
               '<span class="study-row-mins">'+esc(fmt(r.minutes))+'</span>' +
             '</div>';
    }).join('') + '</div>';
  }

  function render(){
    renderMini();
    const btn = document.getElementById('studyFixedBtn');
    if (btn) btn.classList.toggle('active', panelOpen);
    const panel = document.getElementById('studyPanel');
    if (panel) panel.classList.toggle('open', panelOpen);
    const body = document.getElementById('studyBody');
    if (!body || !panelOpen) return;

    let filter = '<select class="study-select" onchange="Study.setBoardSubject(this.value)">' +
                 '<option value=""'+(boardSubject===''?' selected':'')+'>' + esc(t('study.allSubjects')) + '</option>';
    PRESETS.forEach(function(s){
      filter += '<option value="'+esc(s)+'"'+(boardSubject===s?' selected':'')+'>'+esc(s)+'</option>';
    });
    filter += '</select>';

    body.innerHTML =
      authBlock() +
      '<div class="study-sec-label">' + esc(t('study.myWeek')) + '</div>' +
      '<div class="study-mine">' +
        '<div class="study-mine-val">'+esc(fmt(sumSince(weekStart())))+'</div>' +
        '<div class="study-mine-sub">'+esc(fmt(sumSince(dayStart())))+' today</div>' +
      '</div>' +
      standingBlock() +
      '<div class="study-sec-label">' + esc(t('study.thisWeeksBoard')) + '</div>' +
      filter +
      boardBlock() +
      '<div class="study-hint">' + esc(t('study.resetsMonday')) + '</div>';
  }

  function closeOtherPanels(){
    ['bgPanel','settingsSlidePanel','themePanel','playerPanel','roomPanel'].forEach(function(id){
      const e = document.getElementById(id); if (e) e.classList.remove('open');
    });
    ['settingsFixedBtn','themeFixedBtn','playerFixedBtn','roomFixedBtn'].forEach(function(id){
      const e = document.getElementById(id); if (e) e.classList.remove('active');
    });
    const bg = document.querySelector('.btn-bg-toggle'); if (bg) bg.classList.remove('active');
  }

  function togglePanel(){
    panelOpen = !panelOpen;
    if (panelOpen){ closeOtherPanels(); loadBoard(); }
    render();
  }

  // ── panel actions ──
  function setAuthMode(m){ authMode = m; authMsg = null; render(); }
  function setAuthMsg(kind, text){ authMsg = { kind: kind, text: text }; render(); }

  async function doAuth(){
    const em = (document.getElementById('authEmail')||{}).value || '';
    const pw = (document.getElementById('authPass')||{}).value || '';
    const nm = (document.getElementById('authName')||{}).value || '';
    if (!em.trim() || !pw){ setAuthMsg('error', t('study.needBoth')); return; }

    authMsg = { kind: 'ok', text: t('study.working') };
    render();

    const r = (authMode === 'signup')
      ? await window.Auth.signUp(em.trim(), pw, (nm.trim() || em.split('@')[0]).slice(0,24))
      : await window.Auth.signIn(em.trim(), pw);

    authMsg = { kind: r.ok ? 'ok' : 'error', text: r.msg };
    if (r.ok){ authMode = 'none'; loadBoard(); }
    render();
  }

  async function doGoogle(){
    setAuthMsg('ok', t('study.working'));
    const r = await window.Auth.google();
    // Only reached when the redirect never happened, i.e. it failed.
    if (r && r.error) setAuthMsg('error', r.error.message);
  }

  async function doSignOut(){
    await window.Auth.signOut();
    authMode = 'none';
    setAuthMsg('ok', t('study.signedOut'));
    loadBoard(); render();
  }

  async function doRename(){
    const n = window.prompt(t('study.renamePrompt'), window.Auth.name());
    if (n == null) return;
    const r = await window.Auth.rename(n);
    authMsg = { kind: r.ok ? 'ok' : 'error', text: r.msg };
    if (r.ok) loadBoard();
    render();
  }

  function init(){
    renderSelect();
    render();
    if (window.Auth) window.Auth.onChange(function(){ render(); });
    ['#settingsFixedBtn','#themeFixedBtn','#playerFixedBtn','#roomFixedBtn','.btn-bg-toggle'].forEach(function(sel){
      const b = document.querySelector(sel);
      if (b) b.addEventListener('click', function(){ if (panelOpen){ panelOpen = false; render(); } });
    });
  }

  return { init:init, doGoogle:doGoogle,
           close: function(){ if (panelOpen){ panelOpen = false; render(); } },
           PRESETS:PRESETS, all:all, current:current, setCurrent:setCurrent,
           isPreset:isPreset, addCustom:addCustom, removeCustom:removeCustom,
           onSelect:onSelect, logSession:logSession, flush:flush, fmt:fmt,
           togglePanel:togglePanel, setBoardSubject:setBoardSubject,
           setAuthMode:setAuthMode, doAuth:doAuth, doSignOut:doSignOut, doRename:doRename,
           render:render };
})();


// ── DAILY GOALS ───────────────────────────────────────────────
// Local-first: works signed out, mirrored to Supabase when signed in.
// One goal is "active"; every completed focus session ticks it up.
window.Goals = (function(){
  const K_ITEMS = 'sf_goals', K_DAY = 'sf_goals_day', K_ACTIVE = 'sf_goal_active';

  let items = [], activeId = null;

  function toast(m){ if (typeof showToast === 'function') showToast(m); }
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }
  function uuid(){
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c){
      const r = Math.random()*16|0, v = (c === 'x') ? r : ((r&0x3)|0x8);
      return v.toString(16);
    });
  }
  function today(){
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }

  function load(){
    try { const v = JSON.parse(localStorage.getItem(K_ITEMS)); items = Array.isArray(v) ? v : []; }
    catch(e){ items = []; }
    activeId = localStorage.getItem(K_ACTIVE) || null;

    // New day: finished goals are archived away, unfinished ones roll over
    // with their progress intact.
    const stored = localStorage.getItem(K_DAY);
    const todayKey = today();
    if (stored !== todayKey){
      const carried = items.filter(function(g){ return !g.done; })
                           .map(function(g){ g.day = todayKey; g.updated = Date.now(); return g; });
      const dropped = items.length - carried.length;
      items = carried;
      localStorage.setItem(K_DAY, todayKey);
      save();
      if (dropped > 0) setTimeout(function(){ toast(t('goals.newDay', { n: dropped })); }, 900);
    }
    if (activeId && !items.some(function(g){ return g.id === activeId; })) activeId = null;
  }

  function save(){
    try {
      localStorage.setItem(K_ITEMS, JSON.stringify(items));
      localStorage.setItem(K_DAY, today());
      if (activeId) localStorage.setItem(K_ACTIVE, activeId); else localStorage.removeItem(K_ACTIVE);
    } catch(e){}
  }

  function find(id){ return items.filter(function(g){ return g.id === id; })[0] || null; }
  function active(){ return activeId ? find(activeId) : null; }
  function activeSubject(){ const a = active(); return (a && a.subject) || null; }

  function add(title, est, subject){
    const clean = String(title || '').trim().slice(0, 120);
    if (!clean) return;
    const g = {
      id: uuid(), day: today(), title: clean,
      subject: subject || (window.Study ? window.Study.current() : null),
      est: Math.max(1, Math.min(20, parseInt(est) || 1)),
      progress: 0, done: false,
      pos: items.length, updated: Date.now()
    };
    items.push(g);
    if (!activeId) activeId = g.id;
    save(); render(); push([g]);
  }

  function addFromInput(){
    const inp = document.getElementById('goalInput');
    const est = document.getElementById('goalEst');
    if (!inp) return;
    const v = inp.value;
    if (!v.trim()) return;
    add(v, est ? est.value : 1);
    inp.value = '';
    if (est) est.value = 1;
  }

  function toggle(id){
    const g = find(id); if (!g) return;
    const wasDone = g.done;
    g.done = !g.done;
    if (!wasDone && g.done && typeof burstConfetti === 'function'){
      burstConfetti(document.querySelector('.goal-item') || null);
    }
    if (g.done && g.progress < g.est) g.progress = g.est;
    if (!g.done && g.progress >= g.est) g.progress = Math.max(0, g.est - 1);
    g.updated = Date.now();
    if (g.done && activeId === id){
      const next = items.filter(function(x){ return !x.done; })[0];
      activeId = next ? next.id : null;
    }
    save(); render(); push([g]);
  }

  function setActive(id){
    const g = find(id); if (!g || g.done) return;
    activeId = (activeId === id) ? null : id;
    // Point the subject picker at whatever the newly focused goal is tagged
    // with, so it always shows where the next session will be logged.
    if (activeId && g.subject && window.Study) window.Study.setCurrent(g.subject);
    save(); render();
  }

  // Retag the focused goal when the subject picker changes.
  function retagActive(subject){
    const g = active();
    if (!g || !subject || g.subject === subject) return;
    g.subject = subject; g.updated = Date.now();
    save(); render(); push([g]);
  }

  function remove(id){
    const g = find(id);
    items = items.filter(function(x){ return x.id !== id; });
    if (activeId === id) activeId = null;
    save(); render();
    if (g) del(g.id);
  }

  // Called by onDone() when a focus session finishes.
  function onPomodoro(){
    const g = active();
    if (!g) return;
    g.progress = (g.progress || 0) + 1;
    g.updated = Date.now();
    if (g.progress >= g.est && !g.done){
      g.done = true;
      toast(t('goals.complete', { title: g.title }));
      if (typeof burstConfetti === 'function'){
        const row = document.querySelector('.goal-item.active') ||
                    document.querySelector('.goals-card');
        burstConfetti(row);
      }
      const next = items.filter(function(x){ return !x.done; })[0];
      activeId = next ? next.id : null;
    }
    save(); render(); push([g]);
  }

  // ── cloud mirror ──
  function row(g, uid){
    return { id: g.id, user_id: uid, day: g.day || today(), title: g.title,
             subject: g.subject || null, est_pomos: g.est, done_pomos: g.progress || 0,
             done: !!g.done, position: g.pos || 0, updated_at: new Date(g.updated || Date.now()).toISOString() };
  }

  async function push(subset){
    const cl = window.SB.get();
    if (!cl || !window.Auth || !window.Auth.signedIn()) return;
    const uid = window.Auth.id();
    const rows = (subset || items).map(function(g){ return row(g, uid); });
    if (!rows.length) return;
    try {
      const r = await cl.from('goals').upsert(rows, { onConflict: 'id' });
      if (r.error) console.warn('goals push', r.error);
    } catch(e){ console.warn('goals push', e); }
  }

  async function del(id){
    const cl = window.SB.get();
    if (!cl || !window.Auth || !window.Auth.signedIn()) return;
    try { await cl.from('goals').delete().eq('id', id); } catch(e){ console.warn('goals delete', e); }
  }

  // On sign-in: merge today's remote goals in, newest edit wins, then push back.
  async function pull(){
    const cl = window.SB.get();
    if (!cl || !window.Auth || !window.Auth.signedIn()) return;
    try {
      const r = await cl.from('goals').select('*').eq('day', today());
      if (r.error){ console.warn('goals pull', r.error); return; }
      (r.data || []).forEach(function(rr){
        const local = find(rr.id);
        const remote = { id: rr.id, day: rr.day, title: rr.title, subject: rr.subject,
                         est: rr.est_pomos, progress: rr.done_pomos, done: rr.done,
                         pos: rr.position, updated: new Date(rr.updated_at).getTime() };
        if (!local) items.push(remote);
        else if (remote.updated > (local.updated || 0)) Object.assign(local, remote);
      });
      items.sort(function(a,b){ return (a.pos||0) - (b.pos||0); });
      save(); render(); push();
    } catch(e){ console.warn('goals pull', e); }
  }

  // ── render ──
  function render(){
    const list = document.getElementById('goalsList');
    const count = document.getElementById('goalsCount');
    const doneN = items.filter(function(g){ return g.done; }).length;
    if (count) count.textContent = doneN + '/' + items.length;

    if (list){
      if (!items.length){
        list.innerHTML = '<div class="goals-empty">' + esc(t('goals.empty')) + '</div>';
      } else {
        list.innerHTML = items.map(function(g){
          const isActive = (g.id === activeId);
          const dots = Array.from({length: Math.min(g.est, 8)}, function(_, i){
            return '<span class="goal-dot'+(i < g.progress ? ' filled' : '')+'"></span>';
          }).join('');
          return '<div class="goal-item'+(g.done?' done':'')+(isActive?' active':'')+'">' +
                   '<button class="goal-check" onclick="Goals.toggle(\''+g.id+'\')" title="'+(g.done?'reopen':'mark done')+'">'+(g.done?'✓':'')+'</button>' +
                   '<div class="goal-main" onclick="Goals.setActive(\''+g.id+'\')" title="'+(isActive?'focusing on this':'click to focus this goal')+'">' +
                     '<div class="goal-title">'+esc(g.title)+'</div>' +
                     '<div class="goal-meta">' +
                       (g.subject ? '<span class="goal-subj">'+esc(g.subject)+'</span>' : '') +
                       '<span class="goal-dots">'+dots+'</span>' +
                       '<span class="goal-prog">'+Math.min(g.progress, g.est)+'/'+g.est+'</span>' +
                     '</div>' +
                   '</div>' +
                   '<button class="goal-del" onclick="Goals.remove(\''+g.id+'\')" title="remove">×</button>' +
                 '</div>';
        }).join('');
      }
    }

    // Mirror the active goal into the existing task input.
    const ti = document.getElementById('taskInput');
    if (ti){
      const a = active();
      if (a){ ti.value = a.title; ti.classList.add('has-goal'); }
      else { ti.classList.remove('has-goal'); }
    }
  }

  function init(){
    load();
    render();

    // Restore the picker to the focused goal's subject on page load.
    const a0 = active();
    if (a0 && a0.subject && window.Study) window.Study.setCurrent(a0.subject);

    const inp = document.getElementById('goalInput');
    if (inp) inp.addEventListener('keydown', function(e){ if (e.key === 'Enter'){ e.preventDefault(); addFromInput(); } });

    // Typing a task and hitting Enter turns it into today's active goal.
    const ti = document.getElementById('taskInput');
    if (ti) ti.addEventListener('keydown', function(e){
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const v = ti.value.trim();
      if (!v) return;
      const a = active();
      if (a && a.title === v) return;
      add(v, 1);
      toast(t('goals.added'));
    });

    if (window.Auth) window.Auth.onChange(function(u){ if (u) pull(); });
  }

  return { init:init, add:add, addFromInput:addFromInput, toggle:toggle, setActive:setActive,
           retagActive:retagActive, remove:remove, onPomodoro:onPomodoro,
           activeSubject:activeSubject, active:active, pull:pull, render:render };
})();




// ── STUDY STOPWATCH (chronomètre d'étude) ─────────────────────
// A count-up companion to the pomodoro: no target, no cycles. Kept as its
// own module rather than a fourth entry in MODES, because the pomodoro
// state machine (seq, cycleIndex, advance, Room sync) assumes every mode
// has a fixed length.
window.Chrono = (function(){
  const KEY = 'sf_chrono';

  let active = false, running = false;
  let startedAt = 0, accum = 0, ticker = null;

  function block(){ return document.querySelector('.timer-block'); }

  // Keep the Pomodoro/Chrono switch in step with the actual state.
  function syncSwitch(){
    const pom = document.getElementById('switchPomodoro');
    const chr = document.getElementById('switchChrono');
    if (pom) pom.classList.toggle('active', !active);
    if (chr) chr.classList.toggle('active', active);
  }
  function toast(m){ if (typeof showToast === 'function') showToast(m); }

  function elapsedMs(){ return accum + (running ? Date.now() - startedAt : 0); }

  function save(){
    try { localStorage.setItem(KEY, JSON.stringify({
      active: active, running: running, accum: accum, startedAt: startedAt
    })); } catch(e){}
  }

  function render(){
    const ms = elapsedMs();
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('cHours', String(h));
    set('cMins', String(m).padStart(2, '0'));
    set('cSecs', String(sec).padStart(2, '0'));
    const btn = document.getElementById('chronoBtn');
    if (btn){
      btn.textContent = running ? t('timer.pause') : (ms > 0 ? t('timer.resume') : t('timer.start'));
      btn.classList.toggle('running', running);
    }
  }

  function tick(){ render(); save(); }

  function enter(){
    if (active) return;
    if (typeof stopTimer === 'function') stopTimer();   // never run both clocks
    active = true;
    const b = block(); if (b) b.classList.add('chrono-mode');
    syncSwitch();
    render(); save();
  }

  // Leaving the stopwatch banks whatever is on it, so a mode switch can
  // never silently throw away studied time.
  function exit(){
    if (!active) return;
    pause();
    if (Math.floor(elapsedMs() / 60000) >= 1) commit(true);
    else { accum = 0; }
    active = false;
    const b = block(); if (b) b.classList.remove('chrono-mode');
    // Put the Focus/Break/Long highlight back on whichever session is loaded.
    if (typeof setTab === 'function' && typeof mode !== 'undefined') setTab(mode);
    syncSwitch();
    render(); save();
  }

  function start(){
    if (running) return;
    running = true; startedAt = Date.now();
    clearInterval(ticker); ticker = setInterval(tick, 1000);
    render(); save();
  }

  function pause(){
    if (!running) return;
    accum += Date.now() - startedAt;
    running = false;
    clearInterval(ticker); ticker = null;
    render(); save();
  }

  function toggle(){ running ? pause() : start(); }

  function reset(){
    pause(); accum = 0; render(); save();
    toast(t('chrono.reset'));
  }

  // Logs the elapsed time to Study Time, and credits the focused goal one
  // pomodoro for every whole focus-length block studied.
  function commit(quiet){
    const mins = Math.floor(elapsedMs() / 60000);
    if (mins < 1){ if (!quiet) toast(t('chrono.nothing')); return; }

    if (window.Study) Study.logSession(mins);

    let blocks = 0;
    const per = (typeof MODES === 'object' && MODES.work) ? MODES.work : 25;
    if (window.Goals && Goals.active()){
      blocks = Math.floor(mins / per);
      for (let i = 0; i < blocks; i++) Goals.onPomodoro();
    }

    accum = 0; startedAt = Date.now();
    render(); save();

    const label = mins >= 60
      ? Math.floor(mins/60) + 'h ' + (mins % 60) + 'm'
      : mins + 'm';
    toast('Saved ' + label + (blocks ? ' · ' + blocks + ' pomodoro' + (blocks>1?'s':'') + ' credited' : ''));
  }

  function init(){
    let st = null;
    try { st = JSON.parse(localStorage.getItem(KEY)); } catch(e){}
    if (st && st.active){
      active = true;
      accum = st.accum || 0;
      const b = block(); if (b) b.classList.add('chrono-mode');
      if (st.running && st.startedAt){
        // Keep counting across a reload instead of losing the session.
        accum += Date.now() - st.startedAt;
        running = false;
        start();
      }
    }
    syncSwitch();
    render();
  }

  return { init:init, enter:enter, exit:exit, toggle:toggle,
           start:start, pause:pause, reset:reset,
           save:function(){ commit(false); },
           isActive:function(){ return active; } };
})();



// ── LANGUAGE ──────────────────────────────────────────────────
// Small hand-rolled i18n: a dictionary per language, `t()` for strings
// built in JS, and data-i18n attributes for the static markup.
// Global function declaration so it hoists and is safe to call from any
// module regardless of definition order.
function t(key, vars){
  return window.I18N ? I18N.t(key, vars) : key;
}

window.I18N = (function(){
  const KEY = 'sf_lang';

  const DICT = {
    en: {
      'nav.focus': 'Focus', 'nav.planner': 'Planner',
      'tip.study': 'Study time & leaderboard', 'tip.room': 'Shared room',
      'tip.player': 'Music player', 'tip.theme': 'Theme',
      'tip.background': 'Background', 'tip.settings': 'Settings',
      'tip.fullscreen': 'Fullscreen', 'tip.language': 'Language',

      'timer.pomodoro': 'Pomodoro', 'timer.chrono': 'Chrono',
      'timer.chronoTip': "Study stopwatch — counts up instead of down",
      'timer.focus': 'Focus', 'timer.break': 'Break', 'timer.long': 'Long break',
      'timer.start': 'Start', 'timer.pause': 'Pause', 'timer.resume': 'Resume',
      'timer.reset': 'Reset', 'timer.skip': 'Skip',
      'timer.task': 'What are you working on?', 'timer.subject': 'Subject',
      'timer.saveSession': 'Save this session',
      'chrono.hint': 'Counts up with no target. Saving logs the time to your subject.',
      'chrono.reset': 'Stopwatch reset', 'chrono.nothing': 'Nothing to save yet',
      'chrono.saved': 'Saved {time}', 'chrono.credited': '{n} pomodoro(s) credited',

      'goals.title': "Today's goals", 'goals.add': 'Add a goal…',
      'goals.addBtn': 'Add goal', 'goals.est': 'Estimated pomodoros',
      'goals.hint': 'Tap a goal to focus it — finished sessions count toward it.',
      'goals.empty': 'Nothing yet — add what you want to finish today',
      'goals.complete': 'Goal complete: {title}',
      'goals.added': "Added to today's goals",
      'goals.newDay': 'New day — {n} goal(s) cleared',

      'study.title': 'Study time', 'study.today': 'Today', 'study.week': 'This week',
      'study.board': 'Leaderboard', 'study.noSessions': 'No sessions yet this week',
      'study.myWeek': 'my week', 'study.thisWeeksBoard': "this week's board",
      'study.guest': "You're a guest — your time is saved on this device. Sign in to appear on the board.",
      'study.google': 'Continue with Google', 'study.or': 'or',
      'study.signin': 'Sign in', 'study.signup': 'Create account', 'study.back': 'Back',
      'study.signout': 'Sign out', 'study.rename': 'Rename',
      'study.email': 'Email', 'study.password': 'Password', 'study.name': 'Display name',
      'study.allSubjects': 'All subjects', 'study.loading': 'Loading…',
      'study.resetsMonday': 'The board resets every Monday',
      'study.rankEmpty': 'Log a focus session to get your rank',
      'study.percentile': 'You studied more than <b>{pct}%</b> of candidates this week',
      'study.of': 'of', 'study.nobody': 'Nobody has logged time this week yet — be first',
      'study.unavailable': 'Leaderboard unavailable',
      'study.addSubject': '＋ add a subject…', 'study.newSubject': 'New subject name',
      'study.needBoth': 'Enter an email and a password.',
      'study.working': 'Working…', 'study.signedOut': 'Signed out. Your study time stays on this device.',
      'study.renamePrompt': 'Display name (shown on the leaderboard)',
      'study.unavailableAuth': 'Sign-in is unavailable right now.',
      'study.mySubjects': 'My subjects', 'study.subjects': 'Subjects',

      'room.title': 'Shared room', 'room.create': 'Create a room',
      'room.or': 'Or join with a code', 'room.join': 'Join', 'room.copy': 'Copy',
      'room.code': 'Room code', 'room.leave': 'Leave room',
      'room.hint': 'Share the link or code — everyone controls the timer',
      'room.online': 'online', 'room.connecting': 'Connecting…',
      'room.failed': 'Connection failed — try again',

      'player.title': 'Music player', 'player.paste': 'Paste a link…',
      'player.load': 'Load', 'player.clear': 'Clear player',
      'player.empty': 'Paste a YouTube, Spotify or SoundCloud link to play.',

      'theme.title': 'Theme',
      'theme.lofiDesc': 'soft pink · warm · cosy',
      'theme.greensDesc': 'emerald · nature · calm',
      'theme.cherryDesc': 'deep blue · cherry · elegant',
      'theme.moonDesc': 'silver · quiet · cinematic',

      'bg.title': 'Background', 'bg.upload': 'Upload a video, image or HTML',
      'bg.dim': 'Dim', 'bg.blur': 'Blur', 'bg.glass': 'Card glass',
      'bg.opacity': 'Opacity', 'bg.border': 'Border',
      'bg.clear': 'Clear background', 'bg.remove': 'Remove default',
      'bg.restore': 'Restore default', 'bg.suffix': '{name} background',

      'set.title': 'Settings', 'set.focus': 'Focus', 'set.break': 'Break',
      'set.long': 'Long', 'set.min': 'min', 'set.cycles': 'Cycles per round',
      'set.autoBreak': 'Auto start break', 'set.autoWork': 'Auto start pomodoro',
      'set.alarm': 'Alarm sound', 'set.bell': 'Bell', 'set.digital': 'Digital',
      'set.soft': 'Soft chime', 'set.none': 'None', 'set.apply': 'Apply & reset',
      'set.language': 'Language',

      'plan.weekly': 'Weekly planner', 'plan.monthly': 'Monthly planner',
      'plan.from': 'From', 'plan.to': 'to', 'plan.print': 'Print',
      'plan.thisWeek': 'This week', 'plan.today': 'Today',
      'plan.prev': 'Previous', 'plan.next': 'Next',
      'plan.dayPlaceholder': 'Plan for this day…',
      'plan.hint': 'Everything you type saves automatically on this device.',
      'plan.cleared': 'Planner cleared',
      'plan.clear': 'Clear this week', 'plan.clearMonth': 'Clear this month',

      'msg.pomodoroDone': 'Pomodoro complete — take a break',
      'msg.breakOver': 'Break over — back to focus',
      'msg.roundDone': 'Round complete — starting over',
      'msg.restored': 'Session restored', 'msg.settings': 'Settings applied',
    },

    fr: {
      'nav.focus': 'Focus', 'nav.planner': 'Planning',
      'tip.study': "Temps d'étude & classement", 'tip.room': 'Salle partagée',
      'tip.player': 'Lecteur de musique', 'tip.theme': 'Thème',
      'tip.background': 'Arrière-plan', 'tip.settings': 'Paramètres',
      'tip.fullscreen': 'Plein écran', 'tip.language': 'Langue',

      'timer.pomodoro': 'Pomodoro', 'timer.chrono': 'Chrono',
      'timer.chronoTip': "Chronomètre d'étude — compte à l'endroit",
      'timer.focus': 'Focus', 'timer.break': 'Pause', 'timer.long': 'Longue pause',
      'timer.start': 'Démarrer', 'timer.pause': 'Pause', 'timer.resume': 'Reprendre',
      'timer.reset': 'Réinitialiser', 'timer.skip': 'Passer',
      'timer.task': 'Sur quoi travailles-tu ?', 'timer.subject': 'Matière',
      'timer.saveSession': 'Enregistrer cette session',
      'chrono.hint': "Compte à l'endroit, sans objectif. L'enregistrement ajoute le temps à ta matière.",
      'chrono.reset': 'Chronomètre remis à zéro', 'chrono.nothing': 'Rien à enregistrer pour le moment',
      'chrono.saved': '{time} enregistré', 'chrono.credited': '{n} pomodoro(s) crédité(s)',

      'goals.title': "Objectifs du jour", 'goals.add': 'Ajouter un objectif…',
      'goals.addBtn': 'Ajouter', 'goals.est': 'Pomodoros estimés',
      'goals.hint': 'Touche un objectif pour le cibler — les sessions terminées y sont comptées.',
      'goals.empty': 'Rien pour le moment — ajoute ce que tu veux finir aujourd’hui',
      'goals.complete': 'Objectif atteint : {title}',
      'goals.added': 'Ajouté aux objectifs du jour',
      'goals.newDay': 'Nouveau jour — {n} objectif(s) effacé(s)',

      'study.title': "Temps d'étude", 'study.today': "Aujourd'hui", 'study.week': 'Cette semaine',
      'study.board': 'Classement', 'study.noSessions': 'Aucune session cette semaine',
      'study.myWeek': 'ma semaine', 'study.thisWeeksBoard': 'classement de la semaine',
      'study.guest': "Tu es invité — ton temps est enregistré sur cet appareil. Connecte-toi pour apparaître au classement.",
      'study.google': 'Continuer avec Google', 'study.or': 'ou',
      'study.signin': 'Se connecter', 'study.signup': 'Créer un compte', 'study.back': 'Retour',
      'study.signout': 'Se déconnecter', 'study.rename': 'Renommer',
      'study.email': 'E-mail', 'study.password': 'Mot de passe', 'study.name': "Nom affiché",
      'study.allSubjects': 'Toutes les matières', 'study.loading': 'Chargement…',
      'study.resetsMonday': 'Le classement se remet à zéro chaque lundi',
      'study.rankEmpty': 'Enregistre une session pour obtenir ton rang',
      'study.percentile': 'Tu as étudié plus que <b>{pct}%</b> des candidats cette semaine',
      'study.of': 'sur', 'study.nobody': "Personne n'a encore enregistré de temps cette semaine — sois le premier",
      'study.unavailable': 'Classement indisponible',
      'study.addSubject': '＋ ajouter une matière…', 'study.newSubject': 'Nom de la matière',
      'study.needBoth': 'Saisis un e-mail et un mot de passe.',
      'study.working': 'En cours…', 'study.signedOut': 'Déconnecté. Ton temps d’étude reste sur cet appareil.',
      'study.renamePrompt': 'Nom affiché (visible au classement)',
      'study.unavailableAuth': 'La connexion est indisponible pour le moment.',
      'study.mySubjects': 'Mes matières', 'study.subjects': 'Matières',

      'room.title': 'Salle partagée', 'room.create': 'Créer une salle',
      'room.or': 'Ou rejoindre avec un code', 'room.join': 'Rejoindre', 'room.copy': 'Copier',
      'room.code': 'Code de la salle', 'room.leave': 'Quitter la salle',
      'room.hint': 'Partage le lien ou le code — tout le monde contrôle le minuteur',
      'room.online': 'en ligne', 'room.connecting': 'Connexion…',
      'room.failed': 'Échec de la connexion — réessaie',

      'player.title': 'Lecteur de musique', 'player.paste': 'Colle un lien…',
      'player.load': 'Charger', 'player.clear': 'Vider le lecteur',
      'player.empty': 'Colle un lien YouTube, Spotify ou SoundCloud pour lancer la lecture.',

      'theme.title': 'Thème',
      'theme.lofiDesc': 'rose doux · chaleureux · cosy',
      'theme.greensDesc': 'émeraude · nature · calme',
      'theme.cherryDesc': 'bleu profond · cerise · élégant',
      'theme.moonDesc': 'argent · silencieux · cinématique',

      'bg.title': 'Arrière-plan', 'bg.upload': 'Importe une vidéo, une image ou du HTML',
      'bg.dim': 'Assombrir', 'bg.blur': 'Flou', 'bg.glass': 'Verre des cartes',
      'bg.opacity': 'Opacité', 'bg.border': 'Bordure',
      'bg.clear': "Effacer l'arrière-plan", 'bg.remove': 'Retirer par défaut',
      'bg.restore': 'Restaurer par défaut', 'bg.suffix': 'Arrière-plan {name}',

      'set.title': 'Paramètres', 'set.focus': 'Focus', 'set.break': 'Pause',
      'set.long': 'Longue', 'set.min': 'min', 'set.cycles': 'Cycles par série',
      'set.autoBreak': 'Démarrer la pause automatiquement',
      'set.autoWork': 'Démarrer le pomodoro automatiquement',
      'set.alarm': 'Son d’alarme', 'set.bell': 'Cloche', 'set.digital': 'Numérique',
      'set.soft': 'Carillon doux', 'set.none': 'Aucun', 'set.apply': 'Appliquer & réinitialiser',
      'set.language': 'Langue',

      'plan.weekly': 'Planning hebdomadaire', 'plan.monthly': 'Planning mensuel',
      'plan.from': 'De', 'plan.to': 'à', 'plan.print': 'Imprimer',
      'plan.thisWeek': 'Cette semaine', 'plan.today': "Aujourd'hui",
      'plan.prev': 'Précédent', 'plan.next': 'Suivant',
      'plan.dayPlaceholder': 'Plan pour ce jour…',
      'plan.hint': 'Tout ce que tu écris est enregistré automatiquement sur cet appareil.',
      'plan.cleared': 'Planning effacé',
      'plan.clear': 'Effacer la semaine', 'plan.clearMonth': 'Effacer le mois',

      'msg.pomodoroDone': 'Pomodoro terminé — fais une pause',
      'msg.breakOver': 'Pause terminée — retour au travail',
      'msg.roundDone': 'Série terminée — on recommence',
      'msg.restored': 'Session restaurée', 'msg.settings': 'Paramètres appliqués',
    }
  };

  let lang = 'en';
  const listeners = [];

  function detect(){
    const saved = localStorage.getItem(KEY);
    if (saved && DICT[saved]) return saved;
    const nav = (navigator.language || 'en').toLowerCase();
    return nav.indexOf('fr') === 0 ? 'fr' : 'en';
  }

  function tr(key, vars){
    const table = DICT[lang] || DICT.en;
    let out = table[key] != null ? table[key] : (DICT.en[key] != null ? DICT.en[key] : key);
    if (vars) Object.keys(vars).forEach(function(k){
      out = out.split('{' + k + '}').join(vars[k]);
    });
    return out;
  }

  // Walks the static markup. Elements opt in with data-i18n (text),
  // data-i18n-ph (placeholder) or data-i18n-title (tooltip).
  function apply(){
    document.querySelectorAll('[data-i18n]').forEach(function(el){
      el.textContent = tr(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function(el){
      el.setAttribute('placeholder', tr(el.getAttribute('data-i18n-ph')));
    });
    document.querySelectorAll('[data-i18n-title]').forEach(function(el){
      const s = tr(el.getAttribute('data-i18n-title'));
      el.setAttribute('title', s);
      if (el.hasAttribute('aria-label')) el.setAttribute('aria-label', s);
    });
    document.documentElement.setAttribute('lang', lang);
    listeners.forEach(function(fn){ try { fn(lang); } catch(e){ console.warn('i18n listener', e); } });
  }

  function set(next){
    if (!DICT[next] || next === lang) return;
    lang = next;
    try { localStorage.setItem(KEY, lang); } catch(e){}
    apply();
    // Re-render everything that builds its own markup.
    ['Study', 'Goals', 'Planner'].forEach(function(m){
      if (window[m] && window[m].render) window[m].render();
    });
    if (window.Room && Room.refresh) Room.refresh();
    syncButtons();
  }

  function syncButtons(){
    document.querySelectorAll('[data-lang]').forEach(function(b){
      b.classList.toggle('active', b.getAttribute('data-lang') === lang);
    });
  }

  function init(){
    lang = detect();
    apply();
    syncButtons();
  }

  return { init:init, apply:apply, set:set, t:tr,
           current:function(){ return lang; },
           onChange:function(fn){ listeners.push(fn); } };
})();


// ── PLANNER (weekly + monthly) ────────────────────────────────
// Its own view rather than another card on the timer screen: a weekly grid
// needs real space, and the focus screen is deliberately one no-scroll page.
// Local-first — everything is keyed by ISO week / month in localStorage.
window.Planner = (function(){
  const K_WEEK = 'sf_plan_week', K_MONTH = 'sf_plan_month', K_RANGE = 'sf_plan_range';

  let weekRef = null;    // any date inside the shown week
  let monthRef = null;   // any date inside the shown month
  let saveTimer = null;

  function toast(m){ if (typeof showToast === 'function') showToast(m); }
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }

  function readJSON(k){
    try { const v = JSON.parse(localStorage.getItem(k)); return v && typeof v === 'object' ? v : {}; }
    catch(e){ return {}; }
  }
  function writeJSON(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }

  function locale(){ return window.I18N ? (I18N.current() === 'fr' ? 'fr-FR' : 'en-GB') : 'en-GB'; }

  // ── date helpers ──
  function startOfWeek(d){
    const x = new Date(d); x.setHours(0,0,0,0);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));   // Monday
    return x;
  }
  function ymd(d){
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }
  function weekKey(d){ return ymd(startOfWeek(d)); }
  function monthKey(d){ return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0'); }
  function sameDay(a,b){ return ymd(a) === ymd(b); }

  function range(){
    const r = readJSON(K_RANGE);
    return { from: Number.isFinite(r.from) ? r.from : 8, to: Number.isFinite(r.to) ? r.to : 22 };
  }
  function setRange(which, val){
    const r = range();
    r[which] = Math.max(0, Math.min(23, parseInt(val) || 0));
    if (r.to <= r.from) r.to = Math.min(23, r.from + 1);
    writeJSON(K_RANGE, r);
    render();
  }

  // ── persistence (debounced so typing isn't a write per keystroke) ──
  function stash(store, bucket, cell, value){
    clearTimeout(saveTimer);
    const all = readJSON(store);
    if (!all[bucket]) all[bucket] = {};
    if (value.trim()) all[bucket][cell] = value;
    else delete all[bucket][cell];
    saveTimer = setTimeout(function(){ writeJSON(store, all); }, 250);
    // keep the in-memory copy current for an immediate re-render
    writeJSON(store, all);
  }

  function onWeekInput(el){
    stash(K_WEEK, weekKey(weekRef), el.dataset.cell, el.value);
    el.classList.toggle('has-content', !!el.value.trim());
  }
  function onMonthInput(el){
    stash(K_MONTH, monthKey(monthRef), el.dataset.cell, el.value);
    el.classList.toggle('has-content', !!el.value.trim());
  }

  // ── navigation ──
  function shiftWeek(n){ weekRef.setDate(weekRef.getDate() + n*7); render(); }
  function shiftMonth(n){ monthRef.setMonth(monthRef.getMonth() + n, 1); render(); }
  function todayWeek(){ weekRef = new Date(); render(); }
  function todayMonth(){ monthRef = new Date(); render(); }

  function clearWeek(){
    const all = readJSON(K_WEEK); delete all[weekKey(weekRef)]; writeJSON(K_WEEK, all);
    render(); toast(t('plan.cleared'));
  }
  function clearMonth(){
    const all = readJSON(K_MONTH); delete all[monthKey(monthRef)]; writeJSON(K_MONTH, all);
    render(); toast(t('plan.cleared'));
  }

  function printView(){ window.print(); }

  // ── rendering ──
  function renderWeek(){
    const host = document.getElementById('weekGrid');
    const label = document.getElementById('weekLabel');
    if (!host) return;

    const start = startOfWeek(weekRef);
    const data = readJSON(K_WEEK)[weekKey(weekRef)] || {};
    const r = range();
    const today = new Date();

    if (label){
      const end = new Date(start); end.setDate(end.getDate() + 6);
      const f = { day: 'numeric', month: 'short' };
      label.textContent = start.toLocaleDateString(locale(), f) + ' – ' +
                          end.toLocaleDateString(locale(), Object.assign({ year: 'numeric' }, f));
    }

    let head = '<div class="pl-cell pl-corner"></div>';
    for (let i = 0; i < 7; i++){
      const d = new Date(start); d.setDate(d.getDate() + i);
      const isToday = sameDay(d, today);
      head += '<div class="pl-cell pl-head' + (isToday ? ' is-today' : '') + '">' +
                '<span class="pl-dayname">' + esc(d.toLocaleDateString(locale(), { weekday: 'short' })) + '</span>' +
                '<span class="pl-daynum">' + d.getDate() + '</span>' +
              '</div>';
    }

    let body = '';
    for (let h = r.from; h <= r.to; h++){
      body += '<div class="pl-cell pl-hour">' + String(h).padStart(2,'0') + ':00</div>';
      for (let i = 0; i < 7; i++){
        const d = new Date(start); d.setDate(d.getDate() + i);
        const cell = i + '-' + h;
        const isToday = sameDay(d, today);
        const filled = (data[cell] || '').trim() ? ' has-content' : '';
        body += '<textarea class="pl-cell pl-slot' + (isToday ? ' is-today' : '') + filled + '" ' +
                  'data-cell="' + cell + '" rows="1" ' +
                  'oninput="Planner.onWeekInput(this)">' + esc(data[cell] || '') + '</textarea>';
      }
    }

    host.innerHTML = head + body;
    host.classList.remove('swap'); void host.offsetWidth; host.classList.add('swap');

    const fromSel = document.getElementById('planFrom');
    const toSel = document.getElementById('planTo');
    if (fromSel && !fromSel.dataset.built){
      let o = '';
      for (let h = 0; h < 24; h++) o += '<option value="'+h+'">' + String(h).padStart(2,'0') + ':00</option>';
      fromSel.innerHTML = o; toSel.innerHTML = o;
      fromSel.dataset.built = toSel.dataset.built = '1';
    }
    if (fromSel) fromSel.value = String(r.from);
    if (toSel) toSel.value = String(r.to);
  }

  function renderMonth(){
    const host = document.getElementById('monthGrid');
    const label = document.getElementById('monthLabel');
    if (!host) return;

    const first = new Date(monthRef.getFullYear(), monthRef.getMonth(), 1);
    const data = readJSON(K_MONTH)[monthKey(monthRef)] || {};
    const today = new Date();

    if (label){
      label.textContent = first.toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
    }

    let out = '';
    const wkStart = startOfWeek(first);
    for (let i = 0; i < 7; i++){
      const d = new Date(wkStart); d.setDate(d.getDate() + i);
      out += '<div class="pl-cell pl-head">' + esc(d.toLocaleDateString(locale(), { weekday: 'short' })) + '</div>';
    }

    const daysInMonth = new Date(monthRef.getFullYear(), monthRef.getMonth() + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7;               // Monday-first offset
    const cells = Math.ceil((lead + daysInMonth) / 7) * 7;

    for (let i = 0; i < cells; i++){
      const dayNum = i - lead + 1;
      if (dayNum < 1 || dayNum > daysInMonth){
        out += '<div class="pl-cell pl-day is-empty"></div>';
        continue;
      }
      const d = new Date(monthRef.getFullYear(), monthRef.getMonth(), dayNum);
      const isToday = sameDay(d, today);
      out += '<div class="pl-cell pl-day' + (isToday ? ' is-today' : '') + '">' +
               '<span class="pl-daynum">' + dayNum + '</span>' +
               '<textarea class="pl-note' + ((data[dayNum]||'').trim() ? ' has-content' : '') +
                 '" data-cell="' + dayNum + '" rows="1" ' +
                 'placeholder="' + esc(t('plan.dayPlaceholder')) + '" ' +
                 'oninput="Planner.onMonthInput(this)">' + esc(data[dayNum] || '') + '</textarea>' +
             '</div>';
    }
    host.innerHTML = out;
    host.classList.remove('swap'); void host.offsetWidth; host.classList.add('swap');
  }

  function render(){ renderWeek(); renderMonth(); }

  function init(){
    weekRef = new Date();
    monthRef = new Date();
    render();
    if (window.I18N) I18N.onChange(function(){ render(); });
  }

  return { init:init, render:render,
           onWeekInput:onWeekInput, onMonthInput:onMonthInput,
           shiftWeek:shiftWeek, shiftMonth:shiftMonth,
           todayWeek:todayWeek, todayMonth:todayMonth,
           clearWeek:clearWeek, clearMonth:clearMonth,
           setRange:setRange, print:printView };
})();


// ── VIEW SWITCH (focus ⇄ planner) ─────────────────────────────
function showView(name){
  document.body.classList.toggle('view-planner', name === 'planner');
  document.querySelectorAll('[data-view]').forEach(function(b){
    b.classList.toggle('active', b.getAttribute('data-view') === name);
  });
  try { localStorage.setItem('sf_view', name); } catch(e){}
  window.scrollTo(0, 0);
}


// ── BOOTSTRAP ─────────────────────────────────────────────────
// init() runs much earlier in this file, before any of the modules above
// exist, so everything modular is started here instead.
// Order matters: I18N first, otherwise the modules render raw keys before a
// dictionary is loaded. Study and Goals register their Auth.onChange
// listeners before Auth resolves a session, so a restored login still
// triggers their sync.
I18N.init();
init();          // must follow I18N.init(): it translates during startup
Study.init();
Goals.init();
Auth.init();
Chrono.init();
Planner.init();

// Anything the modules rendered during init still needs translating.
I18N.apply();

showView(localStorage.getItem('sf_view') === 'planner' ? 'planner' : 'focus');


// ── CELEBRATION & MICRO-INTERACTIONS ──────────────────────────
// Small, meaningful feedback: a burst when a goal is finished, a pop when a
// tracked number changes. Both no-op under prefers-reduced-motion so the
// calm setting stays genuinely calm.
function prefersReducedMotion(){
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function burstConfetti(origin){
  if (prefersReducedMotion()) return;
  const styles = getComputedStyle(document.body);
  const colours = ['--accent', '--break', '--long']
    .map(v => styles.getPropertyValue(v).trim())
    .filter(Boolean);
  if (!colours.length) colours.push('#f2a8c4');

  let x = window.innerWidth / 2, y = window.innerHeight / 2;
  if (origin && origin.getBoundingClientRect){
    const r = origin.getBoundingClientRect();
    if (r.width) { x = r.left + r.width / 2; y = r.top + r.height / 2; }
  }

  const frag = document.createDocumentFragment();
  for (let i = 0; i < 18; i++){
    const el = document.createElement('span');
    el.className = 'confetti-piece';
    const angle = (Math.PI * 2 * i) / 18 + Math.random() * 0.4;
    const dist = 60 + Math.random() * 90;
    el.style.left = x + 'px';
    el.style.top  = y + 'px';
    el.style.background = colours[i % colours.length];
    el.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
    el.style.setProperty('--dy', (Math.sin(angle) * dist + 40) + 'px');
    el.style.setProperty('--rot', (Math.random() * 540 - 270) + 'deg');
    el.style.setProperty('--dur', (0.8 + Math.random() * 0.5) + 's');
    frag.appendChild(el);
    setTimeout(function(){ el.remove(); }, 1400);
  }
  document.body.appendChild(frag);
}

// Re-triggers the CSS animation by forcing a reflow between class removals.
function bump(el){
  if (!el || prefersReducedMotion()) return;
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

// Watches the tracked figures and pops them whenever their text changes.
(function watchValues(){
  const ids = ['studyToday', 'studyWeek', 'goalsCount'];
  const last = {};
  setInterval(function(){
    ids.forEach(function(id){
      const el = document.getElementById(id);
      if (!el) return;
      const v = el.textContent;
      if (last[id] !== undefined && last[id] !== v) bump(el);
      last[id] = v;
    });
  }, 400);
})();


// ── SETUP DIAGNOSTIC ──────────────────────────────────────────
// Run checkSupabase() in the browser console. Reports exactly which part of
// supabase/SETUP.md is done, so a failure points at a step instead of a
// generic "unavailable".
async function checkSupabase(){
  const out = {};
  const cl = window.SB && window.SB.get();

  if (!cl){
    console.error('Supabase library did not load — check the CDN <script> tag in index.html.');
    return { client: 'FAILED to load' };
  }
  out.client = 'OK loaded';

  async function probe(label, run){
    try {
      const r = await run();
      out[label] = r.error ? ('FAILED: ' + r.error.message + (r.error.hint ? ' | hint: ' + r.error.hint : ''))
                           : 'OK';
      if (r.error) console.warn(label, r.error);
    } catch(e){ out[label] = 'FAILED: ' + (e && e.message); }
  }

  await probe('step1_leaderboard_fn', () => cl.rpc('leaderboard_week', { p_subject: null, p_limit: 5 }));
  await probe('step1_table_profiles', () => cl.from('profiles').select('id').limit(1));
  await probe('step1_table_sessions', () => cl.from('study_sessions').select('id').limit(1));
  await probe('step1_table_goals',    () => cl.from('goals').select('id').limit(1));

  try {
    const s = await cl.auth.getSession();
    out.step2_signed_in = (s.data && s.data.session)
      ? ('OK as ' + s.data.session.user.email)
      : 'not signed in (fine — sign in to test the board)';
  } catch(e){ out.step2_signed_in = 'FAILED: ' + e.message; }

  const bad = Object.keys(out).filter(k => String(out[k]).indexOf('FAILED') === 0);
  console.table(out);
  console.log(bad.length
    ? 'Not ready yet. See supabase/SETUP.md for: ' + bad.join(', ')
    : 'Supabase is set up correctly.');
  return out;
}


// ── CLICK-AWAY DISMISS ────────────────────────────────────────
// One handler for every popover. Study and Room own a panelOpen flag of
// their own, so they are closed through close() rather than by stripping
// the class — otherwise their state would drift from the DOM and the next
// click on their button would need pressing twice.
function closeAllPanels(){
  const settings = document.getElementById('settingsSlidePanel');
  if (settings){
    settings.classList.remove('open');
    const b = document.getElementById('settingsFixedBtn');
    if (b) b.classList.remove('active');
  }
  if (typeof settingsPanelOpen !== 'undefined') settingsPanelOpen = false;

  const bg = document.getElementById('bgPanel');
  if (bg){
    bg.classList.remove('open');
    const b = document.querySelector('.btn-bg-toggle');
    if (b) b.classList.remove('active');
  }
  if (typeof bgPanelOpen !== 'undefined') bgPanelOpen = false;

  ['themePanel', 'playerPanel'].forEach(function(id){
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
  });
  ['themeFixedBtn', 'playerFixedBtn'].forEach(function(id){
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });

  if (window.Study && Study.close) Study.close();
  if (window.Room && Room.close) Room.close();
}

document.addEventListener('click', function(e){
  // Inside a popover, or on the control that opens one — those manage
  // themselves. The language pills are exempt so switching language does
  // not shut the panel you are reading.
  if (e.target.closest('.popover')) return;
  if (e.target.closest('.dock-btn')) return;
  if (e.target.closest('.lang-toggle')) return;
  closeAllPanels();
});

// Escape is the other half of the same expectation.
document.addEventListener('keydown', function(e){
  if (e.key === 'Escape') closeAllPanels();
});
