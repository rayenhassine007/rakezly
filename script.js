// ── SETTINGS PANEL ───────────────────────────────────────────
let settingsPanelOpen = false;

function closeSettingsPanel(){
  settingsPanelOpen = false;
  const p = document.getElementById('settingsSlidePanel');
  if (p) p.classList.remove('open');
  const b = document.getElementById('settingsFixedBtn');
  if (b) b.classList.remove('active');
}

function showThemeListView(instant){
  themeBgOpen = false;
  const list = document.getElementById('themeListView');
  const bg = document.getElementById('themeBgView');
  const panel = document.getElementById('themePanel');
  if (list) list.setAttribute('aria-hidden', 'false');
  if (bg) bg.setAttribute('aria-hidden', 'true');
  if (panel) {
    if (instant) panel.classList.add('theme-no-transition');
    else panel.classList.add('theme-animate-back');
    panel.classList.remove('bg-view', 'theme-animate-forward');
    if (instant) {
      requestAnimationFrame(function(){
        requestAnimationFrame(function(){
          panel.classList.remove('theme-no-transition');
        });
      });
    } else {
      setTimeout(function(){ panel.classList.remove('theme-animate-back'); }, 260);
    }
  }
}

function showThemeBgView(){
  themeBgOpen = true;
  const list = document.getElementById('themeListView');
  const bg = document.getElementById('themeBgView');
  const panel = document.getElementById('themePanel');
  if (list) list.setAttribute('aria-hidden', 'true');
  if (bg) bg.setAttribute('aria-hidden', 'false');
  if (panel) {
    panel.classList.remove('theme-animate-back');
    panel.classList.add('bg-view', 'theme-animate-forward');
    setTimeout(function(){ panel.classList.remove('theme-animate-forward'); }, 260);
  }
  updateRemoveDefaultBtnVisibility();
}

function resetThemePanelView(){
  themeBgOpen = false;
  const list = document.getElementById('themeListView');
  const bg = document.getElementById('themeBgView');
  const panel = document.getElementById('themePanel');
  if (list) list.setAttribute('aria-hidden', 'false');
  if (bg) bg.setAttribute('aria-hidden', 'true');
  if (panel) {
    panel.classList.add('theme-no-transition');
    panel.classList.remove('bg-view', 'theme-animate-forward', 'theme-animate-back');
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){
        panel.classList.remove('theme-no-transition');
      });
    });
  }
}

function closeThemePanel(){
  const p = document.getElementById('themePanel');
  const b = document.getElementById('themeFixedBtn');
  if (p) p.classList.remove('open');
  if (b) b.classList.remove('active');
}

function closePlayerPanel(){
  const p = document.getElementById('playerPanel');
  if (p) p.classList.remove('open');
  const b = document.getElementById('playerFixedBtn');
  if (b) b.classList.remove('active');
}

function closeStudyPanel(){
  if (window.Study && Study.closeStudy) Study.closeStudy();
}

function closeRoomPanel(){
  if (window.Room && Room.close) Room.close();
}

function closeDockPopovers(except){
  if (except !== 'settings') closeSettingsPanel();
  if (except !== 'theme') closeThemePanel();
  if (except !== 'player') closePlayerPanel();
  if (except !== 'study') closeStudyPanel();
  if (except !== 'room') closeRoomPanel();
}

function toggleSettingsPanel() {
  const panel = document.getElementById('settingsSlidePanel');
  const btn = document.getElementById('settingsFixedBtn');
  const willOpen = !(panel && panel.classList.contains('open'));
  closeDockPopovers(willOpen ? 'settings' : null);
  settingsPanelOpen = willOpen;
  if (panel) panel.classList.toggle('open', willOpen);
  if (btn) btn.classList.toggle('active', willOpen);
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
    // Check 1s later if timeupdate has fired. if not, video is truly stuck
    setTimeout(() => {
      if (Date.now() - _lastTimeUpdate > 950) {
        video.load(); video.play().catch(() => {});
      }
    }, 1000);
  }, 150);
}

// ── BACKGROUND (inside theme panel) ──────────────────────────
let themeBgOpen = false;
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

// Cache Object URLs per theme. avoids recreating them on every switch
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

  // Only update if the src actually changed. prevents iframe reload
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

function onThemeOptionActivate(theme){
  if (theme !== currentTheme) setTheme(theme);
  else updateRemoveDefaultBtnVisibility();
  showThemeBgView();
}

function initThemeOptions(){
  document.querySelectorAll('.theme-option[data-theme]').forEach(function(el){
    if (el.dataset.themeBound) return;
    el.dataset.themeBound = '1';
    el.addEventListener('click', function(){
      onThemeOptionActivate(el.getAttribute('data-theme'));
    });
    el.addEventListener('keydown', function(e){
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onThemeOptionActivate(el.getAttribute('data-theme'));
      }
    });
  });
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
  document.title=`${m.toString().padStart(2,'0')}:${s.toString().padStart(2,'0')} · rakezly`;
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
    // deliberately not ticked. a partial session isn't a finished pomodoro.
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
function setTab(m, animate){
  m = m==='brk' ? 'break' : m==='lng' ? 'long' : m;
  document.querySelectorAll('.mode-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === m));
  if (animate) animateModeSwitch();
  updateAllTabIndicators();
  if (typeof blurPillTabFocus === 'function') blurPillTabFocus();
}
function switchMode(m){
  if (window.Chrono) Chrono.exit();
  stopTimer(); setTab(m, true); initTimer(m); renderCycles(); saveTimerState();
  if(window.Room)Room.onLocalChange();
}

function tryNotify(t,b){if('Notification'in window&&Notification.permission==='granted')new Notification(t,{body:b});else if('Notification'in window&&Notification.permission!=='denied')Notification.requestPermission();}

let toastTO;
function showToast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toastTO);toastTO=setTimeout(()=>t.classList.remove('show'),3200);}

// ── MUSIC PLAYER PANEL ──────────────────────────────────────
// Shared rooms sync YouTube only (reliable play/pause/seek).
// Spotify / SoundCloud still work alone, as simple local embeds.
// Mute is always local. it never leaves this browser.
let currentPlayerRaw = '';
let currentPlayerSrc = null;
let playerApplyingRemote = false;
let localMusicMuted = false;
let knownPositionSec = 0;
let spotifyCtrl = null;
let spotifyPlaying = false;
let musicNotifyTimer = null;
let scInitTries = 0;
let ytInitTries = 0;

function inSharedRoom(){
  return !!(window.Room && Room.inRoom && Room.inRoom());
}

// Hide Spotify / SoundCloud while in a room and show the YouTube-only note.
function syncPlayerRoomMode(){
  const inRoom = inSharedRoom();
  document.querySelectorAll('.player-badge[data-src="spotify"], .player-badge[data-src="soundcloud"]').forEach(function(b){
    b.hidden = inRoom;
    b.style.display = inRoom ? 'none' : '';
  });
  const note = document.getElementById('playerRoomNote');
  if (note) {
    note.hidden = !inRoom;
    if (inRoom && typeof t === 'function') note.textContent = t('player.roomYoutubeNote');
  }
  const empty = document.getElementById('playerEmpty');
  if (empty && !document.getElementById('playerEmbedWrap').classList.contains('has-player')) {
    const icon = empty.querySelector('.player-empty-icon');
    const iconHtml = icon ? icon.outerHTML : '<div class="player-empty-icon">♫</div>';
    empty.innerHTML = iconHtml + (inRoom
      ? (typeof t === 'function' ? t('player.roomYoutubeNote') : 'Only YouTube is available in a shared room.')
      : 'Paste a YouTube, Spotify or SoundCloud link to play.');
  }
  if (inRoom) {
    document.querySelectorAll('.player-badge').forEach(function(b){ b.classList.remove('active-src'); });
    const yt = document.querySelector('.player-badge[data-src="youtube"]');
    if (yt) yt.classList.add('active-src');
    const input = document.getElementById('playerUrlInput');
    if (input) input.placeholder = 'https://www.youtube.com/watch?v=…';
  }
}

function togglePlayerPanel() {
  const panel = document.getElementById('playerPanel');
  const btn   = document.getElementById('playerFixedBtn');
  const willOpen = !(panel && panel.classList.contains('open'));
  closeDockPopovers(willOpen ? 'player' : null);
  if (panel) panel.classList.toggle('open', willOpen);
  if (btn) btn.classList.toggle('active', willOpen);
  syncPlayerRoomMode();
}

// Only push music on explicit user actions. never from embed state
// events (those caused sync loops that froze Clear / controls).
function notifyMusicLocal(){
  if (playerApplyingRemote || !inSharedRoom()) return;
  clearTimeout(musicNotifyTimer);
  musicNotifyTimer = setTimeout(function(){
    if (playerApplyingRemote) return;
    if (window.Room && Room.onMusicLocalChange) Room.onMusicLocalChange();
  }, 200);
}

function guardMusicControl(){
  if (inSharedRoom() && Room.canControlMusic && !Room.canControlMusic()){
    showToast(typeof t === 'function' ? t('room.musicLocked') : 'Only the host can control music right now');
    return false;
  }
  return true;
}

// YT.Player replaces the <iframe> node. Always tear it down and ensure a
// fresh iframe exists before loading another source. otherwise Clear and
// Spotify/SoundCloud loads silently break.
function ensurePlayerIframe(){
  const wrap = document.getElementById('playerEmbedWrap');
  if (!wrap) return null;
  let iframe = document.getElementById('playerIframe');
  if (!iframe || iframe.tagName !== 'IFRAME') {
    wrap.innerHTML = '<iframe id="playerIframe" allow="autoplay; encrypted-media; clipboard-write" allowfullscreen title="Music player"></iframe>';
    iframe = document.getElementById('playerIframe');
  }
  return iframe;
}

function destroyPlayers(){
  try {
    if (ytPlayer) {
      if (typeof ytPlayer.stopVideo === 'function') ytPlayer.stopVideo();
      if (typeof ytPlayer.destroy === 'function') ytPlayer.destroy();
    }
  } catch(e){}
  ytPlayer = null; ytPlayerReady = false; ytIsPlaying = false;
  scWidget = null; scWidgetReady = false; scIsPlaying = false;
  scShuffleOn = false; scRepeatOn = false; scTracks = [];
  spotifyCtrl = null; spotifyPlaying = false;
  scInitTries = 0; ytInitTries = 0;
  const iframe = ensurePlayerIframe();
  if (iframe) {
    try { iframe.src = 'about:blank'; } catch(e){}
  }
}

function loadPlayerUrl(opt) {
  const opts = opt || {};
  const fromRemote = !!opts.fromRemote;
  if (!fromRemote && !guardMusicControl()) return;

  const raw = (opts.url != null ? opts.url : (document.getElementById('playerUrlInput').value || '')).trim();
  if (!raw) return;
  const embedUrl = resolvePlayerEmbed(raw);
  if (!embedUrl) { if (!fromRemote) showToast('That link is not supported'); return; }

  // Shared rooms: YouTube only. Spotify/SoundCloud embeds can't be synced
  // reliably and were breaking Clear / controls.
  if (inSharedRoom() && embedUrl.src !== 'youtube') {
    if (!fromRemote) {
      showToast(typeof t === 'function' ? t('player.roomYoutubeOnly') : 'In a shared room, use a YouTube link');
    }
    return;
  }

  const wrap     = document.getElementById('playerEmbedWrap');
  const empty    = document.getElementById('playerEmpty');
  const clearBtn = document.getElementById('playerClearBtn');
  const controls = document.getElementById('playerControls');

  destroyPlayers();
  const iframe = ensurePlayerIframe();
  if (!iframe) return;

  knownPositionSec = opts.positionSec != null ? Number(opts.positionSec) || 0 : 0;
  document.getElementById('playerUrlInput').value = raw;
  currentPlayerRaw = raw;
  currentPlayerSrc = embedUrl.src;

  iframe.style.height = embedUrl.height + 'px';
  wrap.classList.add('has-player');
  empty.style.display = 'none';
  clearBtn.classList.add('visible');

  document.querySelectorAll('.player-badge').forEach(b => b.classList.remove('active-src'));
  const match = document.querySelector(`.player-badge[data-src="${embedUrl.src}"]`);
  if (match) match.classList.add('active-src');
  updateCtrlLabels(embedUrl.src);

  if (embedUrl.src === 'youtube') {
    controls.classList.add('visible');
    iframe.src = embedUrl.url + (embedUrl.url.indexOf('?') >= 0 ? '&' : '?') + 'enablejsapi=1&origin=' + encodeURIComponent(location.origin);
    initYTPlayer({ seekSec: knownPositionSec, playing: opts.playing });
  } else if (embedUrl.src === 'soundcloud') {
    controls.classList.add('visible');
    iframe.src = embedUrl.url;
    initSCWidget({ seekSec: knownPositionSec, playing: opts.playing });
  } else if (embedUrl.src === 'spotify') {
    // Local-only embed. no IFrame API (it fought the DOM and froze the panel).
    controls.classList.remove('visible');
    iframe.src = embedUrl.url;
  }

  if (!fromRemote) {
    showToast('Player loaded');
    localStorage.setItem('sf_player_url', raw);
    notifyMusicLocal();
  }
  applyLocalMuteState();
}

function resolvePlayerEmbed(url) {
  try {
    const u = new URL(url);
    const host = u.hostname.replace('www.', '');

    if (host === 'youtube.com' || host === 'youtu.be' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      let vid = u.searchParams.get('v');
      let list = u.searchParams.get('list');
      if (!vid && host === 'youtu.be') vid = u.pathname.slice(1).split('?')[0];
      if (!vid && u.pathname.includes('/shorts/')) vid = u.pathname.split('/shorts/')[1].split('/')[0];
      if (!vid && u.pathname.includes('/embed/')) vid = u.pathname.split('/embed/')[1].split('?')[0];
      if (vid) return { url: `https://www.youtube.com/embed/${vid}?autoplay=1&rel=0`, height: 230, src: 'youtube', rawUrl: url };
      if (list) return { url: `https://www.youtube.com/embed/videoseries?list=${list}&autoplay=1`, height: 230, src: 'youtube', rawUrl: url };
    }

    if (host === 'open.spotify.com') {
      const path = u.pathname;
      const isTrack = path.startsWith('/track/') || path.startsWith('/episode/');
      const h = isTrack ? 152 : 460;
      return { url: `https://open.spotify.com/embed${path}?utm_source=generator&theme=0`, height: h, src: 'spotify', rawUrl: url };
    }

    if (host === 'soundcloud.com') {
      const encoded = encodeURIComponent(url);
      return { url: `https://w.soundcloud.com/player/?url=${encoded}&auto_play=true&color=%23c084fc&hide_related=true&show_comments=false&show_user=true&show_reposts=false&show_teaser=false&visual=false&buying=false&liking=false&download=false&sharing=false`, height: 166, src: 'soundcloud', rawUrl: url };
    }
  } catch(e) {}
  return null;
}

let ytPlayer = null, ytPlayerReady = false, ytIsPlaying = false;

function clearPlayer(opt) {
  const opts = opt || {};
  if (!opts.fromRemote && !guardMusicControl()) return;

  destroyPlayers();
  const wrap     = document.getElementById('playerEmbedWrap');
  const empty    = document.getElementById('playerEmpty');
  const clearBtn = document.getElementById('playerClearBtn');
  const controls = document.getElementById('playerControls');
  if (wrap) wrap.classList.remove('has-player');
  if (empty) empty.style.display = '';
  if (clearBtn) clearBtn.classList.remove('visible');
  if (controls) controls.classList.remove('visible');
  currentPlayerRaw = '';
  currentPlayerSrc = null;
  knownPositionSec = 0;
  const playBtn = document.getElementById('ctrlPlay');
  if (playBtn) playBtn.textContent = '▶';
  const shuffle = document.getElementById('ctrlShuffle');
  if (shuffle) shuffle.classList.remove('active');
  document.querySelectorAll('.player-badge').forEach(b => b.classList.remove('active-src'));
  const input = document.getElementById('playerUrlInput');
  if (input) input.value = '';
  if (!opts.fromRemote) {
    localStorage.removeItem('sf_player_url');
    showToast('Player cleared');
    notifyMusicLocal();
  }
}

// ── YOUTUBE PLAYER API ────────────────────────────────────

(function loadYTScript() {
  if (!document.getElementById('yt-iframe-api')) {
    const tag = document.createElement('script');
    tag.id = 'yt-iframe-api';
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
  }
})();

function initYTPlayer(opt) {
  const opts = opt || {};
  if (typeof YT === 'undefined' || !YT.Player) {
    if (ytInitTries++ > 40) return;
    setTimeout(function(){ initYTPlayer(opts); }, 400); return;
  }
  const iframe = document.getElementById('playerIframe');
  if (!iframe || !iframe.src || iframe.src.indexOf('youtube.com') < 0) return;
  ytInitTries = 0;
  try {
    ytPlayer = new YT.Player('playerIframe', {
      events: {
        onReady: function() {
          ytPlayerReady = true;
          const seek = opts.seekSec != null ? Number(opts.seekSec) : 0;
          if (seek > 0) { try { ytPlayer.seekTo(seek, true); } catch(e){} }
          const wantPlay = opts.playing !== false;
          try {
            if (wantPlay) ytPlayer.playVideo();
            else ytPlayer.pauseVideo();
          } catch(e){}
          ytIsPlaying = wantPlay;
          const b = document.getElementById('ctrlPlay');
          if (b) b.textContent = wantPlay ? '⏸' : '▶';
          applyLocalMuteState();
        },
        onStateChange: function(e) {
          if (e.data === YT.PlayerState.PLAYING) {
            ytIsPlaying = true;
            const b = document.getElementById('ctrlPlay');
            if (b) b.textContent = '⏸';
            try { knownPositionSec = ytPlayer.getCurrentTime() || knownPositionSec; } catch(err){}
          } else if (e.data === YT.PlayerState.PAUSED || e.data === YT.PlayerState.ENDED) {
            ytIsPlaying = false;
            const b = document.getElementById('ctrlPlay');
            if (b) b.textContent = '▶';
            try { knownPositionSec = ytPlayer.getCurrentTime() || knownPositionSec; } catch(err){}
          }
        }
      }
    });
  } catch(e) {
    if (ytInitTries++ > 40) return;
    setTimeout(function(){ initYTPlayer(opts); }, 400);
  }
}

function ytTogglePlay() {
  if (!ytPlayer || !ytPlayerReady) return;
  if (ytIsPlaying) ytPlayer.pauseVideo(); else ytPlayer.playVideo();
}
function ytSkipForward() {
  if (!ytPlayer || !ytPlayerReady) return;
  const t = ytPlayer.getCurrentTime();
  knownPositionSec = Math.max(0, t + 10);
  ytPlayer.seekTo(knownPositionSec, true);
}
function ytSkipBackward() {
  if (!ytPlayer || !ytPlayerReady) return;
  const t = ytPlayer.getCurrentTime();
  knownPositionSec = Math.max(0, t - 10);
  ytPlayer.seekTo(knownPositionSec, true);
}
function ytNextVideo() {
  if (!ytPlayer || !ytPlayerReady) return;
  try { ytPlayer.nextVideo(); } catch(e){}
}
function ytPrevVideo() {
  if (!ytPlayer || !ytPlayerReady) return;
  try { ytPlayer.previousVideo(); } catch(e){}
}

// ── UNIFIED CONTROL ROUTING ────────────────────────────────
function getActiveSrc() {
  if (currentPlayerSrc) return currentPlayerSrc;
  const badge = document.querySelector('.player-badge.active-src');
  return badge ? badge.dataset.src : null;
}
function ctrlPlayPause() {
  if (!guardMusicControl()) return;
  const src = getActiveSrc();
  if (src === 'youtube') ytTogglePlay();
  else if (src === 'soundcloud') scTogglePlay();
  else return;
  notifyMusicLocal();
}
function ctrlPrev() {
  if (!guardMusicControl()) return;
  const src = getActiveSrc();
  if (src === 'youtube') { ytSkipBackward(); showToast('−10s'); }
  else if (src === 'soundcloud') scPrev();
  else return;
  notifyMusicLocal();
}
function ctrlNext() {
  if (!guardMusicControl()) return;
  const src = getActiveSrc();
  if (src === 'youtube') { ytSkipForward(); showToast('+10s'); }
  else if (src === 'soundcloud') scNext();
  else return;
  notifyMusicLocal();
}
function ctrlLeft() {
  if (!guardMusicControl()) return;
  const src = getActiveSrc();
  if (src === 'youtube') { ytPrevVideo(); showToast('Previous video'); }
  else if (src === 'soundcloud') scShuffle();
  else return;
  notifyMusicLocal();
}

function updateCtrlLabels(src) {
  const shuffle = document.getElementById('ctrlShuffle');
  const prev    = document.getElementById('ctrlPrev');
  const next    = document.getElementById('ctrlNext');
  if (!shuffle || !prev || !next) return;
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

function initSCWidget(opt) {
  const opts = opt || {};
  if (typeof SC === 'undefined' || !window.SC || !window.SC.Widget) {
    if (scInitTries++ > 40) return;
    setTimeout(function(){ initSCWidget(opts); }, 400);
    return;
  }
  const iframe = document.getElementById('playerIframe');
  if (!iframe || !iframe.src || iframe.src.indexOf('soundcloud.com') < 0) return;
  scInitTries = 0;
  try {
    scWidget = SC.Widget(iframe);
  } catch(e) {
    if (scInitTries++ > 40) return;
    setTimeout(function(){ initSCWidget(opts); }, 400);
    return;
  }

  scWidgetReady = false;

  scWidget.bind(SC.Widget.Events.READY, function() {
    scWidgetReady = true;
    scWidget.getSounds(function(sounds){ scTracks = sounds || []; });
    const seekMs = Math.max(0, Math.floor((opts.seekSec || 0) * 1000));
    if (seekMs > 0) { try { scWidget.seekTo(seekMs); } catch(e){} }
    const wantPlay = opts.playing !== false;
    try {
      if (wantPlay) scWidget.play();
      else scWidget.pause();
    } catch(e){}
    scIsPlaying = wantPlay;
    const b = document.getElementById('ctrlPlay');
    if (b) b.textContent = wantPlay ? '⏸' : '▶';
    applyLocalMuteState();
  });
  scWidget.bind(SC.Widget.Events.PLAY, function() {
    scIsPlaying = true;
    const b = document.getElementById('ctrlPlay');
    if (b) b.textContent = '⏸';
  });
  scWidget.bind(SC.Widget.Events.PAUSE, function() {
    scIsPlaying = false;
    const b = document.getElementById('ctrlPlay');
    if (b) b.textContent = '▶';
  });
  scWidget.bind(SC.Widget.Events.PLAY_PROGRESS, function(data) {
    if (data && typeof data.currentPosition === 'number') {
      knownPositionSec = data.currentPosition / 1000;
    }
  });
  scWidget.bind(SC.Widget.Events.FINISH, function() {
    scIsPlaying = false;
    const b = document.getElementById('ctrlPlay');
    if (b) b.textContent = '▶';
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
  const el = document.getElementById('ctrlShuffle');
  if (el) el.classList.toggle('active', scShuffleOn);
  showToast(scShuffleOn ? 'Shuffle on' : 'Shuffle off');
}
function scToggleRepeat() {
  scRepeatOn = !scRepeatOn;
  const el = document.getElementById('ctrlRepeat');
  if (el) el.classList.toggle('active', scRepeatOn);
  showToast(scRepeatOn ? 'Repeat on' : 'Repeat off');
}

// ── LOCAL MUTE (never synced) ──────────────────────────────
function applyLocalMuteState(){
  const btn = document.getElementById('ctrlMute');
  const row = document.getElementById('playerMuteRow');
  const label = document.getElementById('playerMuteLabel');
  if (btn) {
    btn.classList.toggle('active', localMusicMuted);
    btn.textContent = localMusicMuted ? '🔇' : '🔊';
  }
  if (row) row.classList.toggle('is-muted', localMusicMuted);
  if (label && typeof t === 'function') {
    label.textContent = localMusicMuted ? t('player.unmute') : t('player.mute');
  }
  const src = getActiveSrc();
  try {
    if (src === 'youtube' && ytPlayer && ytPlayerReady) {
      if (localMusicMuted) ytPlayer.mute(); else ytPlayer.unMute();
    } else if (src === 'soundcloud' && scWidget && scWidgetReady) {
      scWidget.setVolume(localMusicMuted ? 0 : 100);
    }
  } catch(e){}
}
function toggleLocalMute(){
  localMusicMuted = !localMusicMuted;
  applyLocalMuteState();
  showToast(localMusicMuted
    ? (typeof t === 'function' ? t('player.mutedToast') : 'Muted for you only')
    : (typeof t === 'function' ? t('player.unmutedToast') : 'Unmuted'));
  if (window.Room && Room.refresh) Room.refresh();
}
function isLocalMuted(){ return localMusicMuted; }

// ── MUSIC SNAPSHOT (for room sync. YouTube only) ──────────
function getMusicSnapshot(){
  const src = getActiveSrc();
  let playing = false;
  let pos = knownPositionSec;
  try {
    if (src === 'youtube' && ytPlayer && ytPlayerReady) {
      playing = ytIsPlaying;
      pos = ytPlayer.getCurrentTime() || pos;
    }
  } catch(e){}
  knownPositionSec = pos;
  return {
    url: (src === 'youtube') ? (currentPlayerRaw || '') : '',
    src: (src === 'youtube') ? 'youtube' : null,
    playing: !!playing,
    positionSec: Number(pos) || 0,
    at: Date.now()
  };
}

function applyMusicSnapshot(snap){
  if (!snap) return;
  playerApplyingRemote = true;
  try {
    const url = (snap.url || '').trim();
    if (!url) {
      if (currentPlayerRaw) clearPlayer({ fromRemote: true });
      return;
    }
    const embed = resolvePlayerEmbed(url);
    if (!embed || embed.src !== 'youtube') return;

    let pos = Number(snap.positionSec) || 0;
    if (snap.playing && snap.at) {
      pos += Math.max(0, (Date.now() - snap.at) / 1000);
    }
    const same = currentPlayerRaw === url && currentPlayerSrc === 'youtube';
    if (!same) {
      loadPlayerUrl({
        url: url, fromRemote: true, skipPersonal: true,
        positionSec: pos, playing: !!snap.playing
      });
    } else if (ytPlayer && ytPlayerReady) {
      knownPositionSec = pos;
      try { ytPlayer.seekTo(pos, true); } catch(e){}
      try {
        if (snap.playing) { if (!ytIsPlaying) ytPlayer.playVideo(); }
        else { if (ytIsPlaying) ytPlayer.pauseVideo(); }
      } catch(e){}
      applyLocalMuteState();
    }
  } finally {
    setTimeout(function(){ playerApplyingRemote = false; }, 800);
  }
}

document.querySelectorAll('.player-badge').forEach(badge => {
  badge.addEventListener('click', () => {
    const examples = {
      youtube:    'https://www.youtube.com/watch?v=jfKfPfyJRdk',
      spotify:    'https://open.spotify.com/playlist/37i9dQZF1DX8NTLI2TtZa6',
      soundcloud: 'https://soundcloud.com/lofi-hip-hop-music/sets/lofi-hip-hop-radio'
    };
    const src = badge.dataset.src;
    document.getElementById('playerUrlInput').placeholder = examples[src] || 'paste link here...';
    document.querySelectorAll('.player-badge').forEach(b => b.classList.remove('active-src'));
    badge.classList.add('active-src');
    if (inSharedRoom() && src !== 'youtube') {
      showToast(typeof t === 'function' ? t('player.roomYoutubeOnly') : 'In a shared room, use a YouTube link');
    }
  });
});

(function restorePlayer() {
  if (/[?&]room=/.test(location.search)) return;
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

  initThemeOptions();
  loadQuote();
  startQuoteRotation();
}

const QUOTES = [
  {t:"The secret of getting ahead is getting started.", a:"Mark Twain"},
  {t:"Focus on being productive instead of busy.", a:"Tim Ferriss"},
  {t:"You don't have to be great to start, but you have to start to be great.", a:"Zig Ziglar"},
  {t:"It's not that I'm so smart, it's just that I stay with problems longer.", a:"Albert Einstein"},
  {t:"Done is better than perfect.", a:"Sheryl Sandberg"},
  {t:"The way to get started is to quit talking and begin doing.", a:"Walt Disney"},
  {t:"Energy and persistence conquer all things.", a:"Benjamin Franklin"},
  {t:"Concentration is the root of all the higher abilities in man.", a:"Bruce Lee"},
  {t:"One hour of focused work is worth more than a day of distraction.", a:"Anonymous"},
  {t:"Small steps every day lead to giant leaps over time.", a:"Anonymous"},
];
let quoteIndex = -1;
let quoteTimer = null;

function loadQuote(animate){
  const card = document.querySelector('.quote-card');
  const textEl = document.getElementById('quoteText');
  const authorEl = document.getElementById('quoteAuthor');
  if (!textEl || !authorEl) return;

  function applyQuote(){
    let next = Math.floor(Math.random() * QUOTES.length);
    if (QUOTES.length > 1){
      while (next === quoteIndex) next = Math.floor(Math.random() * QUOTES.length);
    }
    quoteIndex = next;
    const q = QUOTES[quoteIndex];
    textEl.textContent = '"' + q.t + '"';
    authorEl.textContent = q.a;
    if (card) card.classList.remove('fading');
  }

  if (animate && card){
    card.classList.add('fading');
    setTimeout(applyQuote, 400);
  } else {
    applyQuote();
  }
}

function startQuoteRotation(){
  if (quoteTimer) clearInterval(quoteTimer);
  quoteTimer = setInterval(function(){ loadQuote(true); }, 5 * 60 * 1000);
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
// 'cyber' and 'edo-gold' were retired. migrate anyone still stored on them.
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
    // User has a custom bg. use it
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
  // If the video 404s or is blocked, say so instead of failing silently.
  // the themed gradient behind #bgWrap stays visible either way.
  video.onerror = () => {
    video.classList.remove('ready');
    console.warn('Theme background video failed to load:', url,
                 ' falling back to the theme gradient.');
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
  const willOpen = !(panel && panel.classList.contains('open'));
  closeDockPopovers(willOpen ? 'theme' : null);
  if (willOpen) resetThemePanelView();
  if (panel) panel.classList.toggle('open', willOpen);
  if (btn) btn.classList.toggle('active', willOpen);
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
  const ampm = h24 ? '' : (h >= 12 ? 'PM' : 'AM');
  if (!h24) h = h % 12 || 12;

  document.getElementById('clockHours').textContent = String(h).padStart(2, '0');
  document.getElementById('clockMins').textContent  = String(m).padStart(2, '0');
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
function scheduleClock(){
  updateClock();
  const now = new Date();
  const ms = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
  setTimeout(function(){
    updateClock();
    setInterval(updateClock, 60000);
  }, Math.max(0, ms));
}
scheduleClock();


// ── SHARED ROOM (Supabase Realtime) ───────────────────────────
// Real-time synced timer. Every local timer action broadcasts a full
// snapshot; receivers apply it (guarded against re-broadcast loops).
// Fully non-blocking: if Supabase is unavailable, the timer keeps working.
// ── SHARED SUPABASE CLIENT ────────────────────────────────────
// One client for realtime rooms, auth, study sessions and goals. creating
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

  // The Supabase CDN script is async. run cb once the library shows up.
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
  // How long the host can vanish (refresh / disconnect) before the next
  // person who entered the room inherits hostship.
  const HOST_GRACE_MS = 35000;

  let channel = null, code = null;
  let applying = false, panelOpen = false, status = 'idle', peers = 1;
  let isHost = false;
  let hostId = null;
  let hostToken = null; // rotates on succession so an old host can't reclaim
  let myJoinedAt = Date.now();
  // When true, everyone may control; when false, only the host.
  let allowTimer = true;
  let allowMusic = true;
  let lastTimerSnap = null;
  let lastMusicSnap = null;
  let personalStash = null; // { url } restored on leave
  let musicTick = null;
  let hostCheckTimer = null;
  let hostWatch = null;
  let hostMissingSince = null;
  let members = []; // [{ id, name, joinedAt, host }]

  function toast(m){ if (typeof showToast === 'function') showToast(m); }

  function sb(){ return window.SB.get(); }

  function inRoom(){ return status === 'joined'; }
  function canControlTimer(){ return !inRoom() || isHost || allowTimer; }
  function canControlMusic(){ return !inRoom() || isHost || allowMusic; }
  function lastMusic(){ return lastMusicSnap; }

  // ── Display name (required for guests) ─────────────────────
  function nameKey(){ return 'sf_room_display_name'; }
  function getStoredName(){
    try { return String(localStorage.getItem(nameKey()) || '').trim(); } catch(e){ return ''; }
  }
  function setStoredName(n){
    try { localStorage.setItem(nameKey(), String(n || '').trim().slice(0, 24)); } catch(e){}
  }
  function displayName(){
    // Signed-in profile always wins over a leftover guest nickname.
    if (window.Auth && window.Auth.signedIn()) {
      const authName = String(window.Auth.name() || '').trim();
      if (authName.length >= 2) return authName;
    }
    return getStoredName();
  }
  function needsName(){
    if (window.Auth && window.Auth.signedIn()) return false;
    return displayName().length < 2;
  }
  function saveNameFromInput(){
    // Guests only. signed-in users keep their Auth display name.
    if (window.Auth && window.Auth.signedIn()) return displayName();
    const el = document.getElementById('roomNameInput');
    if (!el) return displayName();
    const n = String(el.value || '').trim().slice(0, 24);
    if (n.length >= 2) setStoredName(n);
    return n;
  }
  function ensureNameOrToast(){
    if (window.Auth && window.Auth.signedIn()){
      const n = displayName();
      if (n.length >= 2) return n;
      toast(t('room.needName'));
      updateUI();
      return null;
    }
    const n = saveNameFromInput();
    if (n.length < 2){
      toast(t('room.needName'));
      updateUI();
      const el = document.getElementById('roomNameInput');
      if (el) try { el.focus(); } catch(e){}
      return null;
    }
    return n;
  }

  // ── Host token (survives refresh, invalidated on succession) ─
  function hostKey(c){ return 'sf_room_owner_v3_' + String(c || '').toUpperCase(); }
  function joinedKey(c){ return 'sf_room_joined_v1_' + String(c || '').toUpperCase(); }
  function rememberHost(c, token){
    try { sessionStorage.setItem(hostKey(c), token); } catch(e){}
  }
  function forgetHost(c){
    try { sessionStorage.removeItem(hostKey(c)); } catch(e){}
  }
  function storedHostToken(c){
    try { return sessionStorage.getItem(hostKey(c)) || ''; } catch(e){ return ''; }
  }
  function iOwnHostToken(c){
    const mine = storedHostToken(c);
    if (!mine || !hostToken) return false;
    return mine === hostToken;
  }
  function newHostToken(){
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }
  function joinStamp(c, fresh){
    try {
      if (fresh) {
        const v = String(Date.now());
        sessionStorage.setItem(joinedKey(c), v);
        return Number(v);
      }
      let v = sessionStorage.getItem(joinedKey(c));
      if (!v){
        v = String(Date.now());
        sessionStorage.setItem(joinedKey(c), v);
      }
      return Number(v);
    } catch(e){ return Date.now(); }
  }
  function forgetJoin(c){
    try { sessionStorage.removeItem(joinedKey(c)); } catch(e){}
  }

  function genCode(){
    const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    let s = ''; for (let i=0;i<6;i++) s += A[Math.floor(Math.random()*A.length)];
    return s;
  }

  function snapshot(){
    return {
      mode: mode, totalSecs: totalSecs, remainSecs: remainSecs, running: running,
      hostId: hostId, hostToken: hostToken,
      allowTimer: allowTimer, allowMusic: allowMusic
    };
  }

  function musicSnapshot(){
    if (typeof getMusicSnapshot === 'function') return getMusicSnapshot();
    return { url: '', playing: false, positionSec: 0, at: Date.now() };
  }

  function trackPresence(){
    if (!channel) return;
    try {
      channel.track({
        id: myId,
        name: displayName() || 'student',
        joinedAt: myJoinedAt,
        host: isHost,
        at: Date.now()
      });
    } catch(e){}
  }

  // permanent: true → write/rotate host token (create or succession)
  function claimHost(opts){
    const permanent = !!(opts && opts.permanent);
    const openLocks = !!(opts && opts.openLocks);
    const rotate = !!(opts && opts.rotateToken);
    isHost = true;
    hostId = myId;
    if (permanent && code){
      if (rotate || !hostToken || !iOwnHostToken(code)){
        hostToken = newHostToken();
      }
      rememberHost(code, hostToken);
    }
    if (openLocks){ allowTimer = true; allowMusic = true; }
    trackPresence();
    if (status === 'joined') {
      push();
      pushMusic();
    }
    updateUI();
  }

  function yieldHost(newHostId){
    isHost = false;
    if (newHostId) hostId = newHostId;
    trackPresence();
    updateUI();
  }

  function presentPeople(){
    if (!channel) return [];
    const out = [];
    const seen = {};
    try {
      const state = channel.presenceState() || {};
      Object.keys(state).forEach(function(k){
        (state[k] || []).forEach(function(p){
          if (!p || !p.id || seen[p.id]) return;
          seen[p.id] = 1;
          out.push({
            id: p.id,
            name: String(p.name || 'student').slice(0, 24),
            joinedAt: Number(p.joinedAt) || 0,
            host: !!p.host
          });
        });
      });
    } catch(e){}
    out.sort(function(a, b){
      if (a.joinedAt !== b.joinedAt) return a.joinedAt - b.joinedAt;
      return String(a.id).localeCompare(String(b.id));
    });
    return out;
  }

  function refreshMembers(){
    members = presentPeople();
    peers = members.length || 1;
  }

  // Next in join order after the missing host (or earliest if host unknown).
  function successorId(people, missingHostId){
    if (!people.length) return null;
    if (missingHostId){
      const idx = people.findIndex(function(p){ return p.id === missingHostId; });
      // Host not in list. pick earliest joiner overall.
      if (idx < 0) return people[0].id;
    }
    return people[0].id;
  }

  // If the host is gone for HOST_GRACE_MS, the next person who entered
  // becomes the permanent host (new token so the old host can't steal it back).
  function ensureHostAlive(){
    if (status !== 'joined' || !channel) return;
    refreshMembers();
    const people = members;
    if (!people.length) return;
    const ids = people.map(function(p){ return p.id; });
    const hostHere = !!(hostId && ids.indexOf(hostId) !== -1);

    if (hostHere) {
      hostMissingSince = null;
      isHost = (hostId === myId);
      updateUI();
      return;
    }

    // Still the token holder and reconnecting. reclaim immediately.
    if (code && iOwnHostToken(code)) {
      hostMissingSince = null;
      claimHost({ permanent: true, openLocks: false, rotateToken: false });
      return;
    }

    if (!hostMissingSince) {
      hostMissingSince = Date.now();
      toast(t('room.hostMissingToast'));
    }
    const goneFor = Date.now() - hostMissingSince;
    if (goneFor < HOST_GRACE_MS) {
      updateUI();
      return;
    }

    const next = successorId(people, hostId);
    if (next === myId) {
      if (!(isHost && hostId === myId && iOwnHostToken(code))) {
        claimHost({ permanent: true, openLocks: true, rotateToken: true });
        toast(t('room.youAreNowHost'));
      }
    } else {
      yieldHost(next);
    }
  }

  function applyMeta(s){
    if (!s) return;
    if (s.hostToken) hostToken = s.hostToken;
    const remoteHost = s.hostId || null;
    const iAmOwner = !!(code && iOwnHostToken(code));

    if (iAmOwner) {
      hostId = myId;
      isHost = true;
      if (typeof s.allowTimer === 'boolean') allowTimer = s.allowTimer;
      if (typeof s.allowMusic === 'boolean') allowMusic = s.allowMusic;
      return;
    }

    if (remoteHost && remoteHost !== myId) {
      hostId = remoteHost;
      isHost = false;
      if (typeof s.allowTimer === 'boolean') allowTimer = s.allowTimer;
      if (typeof s.allowMusic === 'boolean') allowMusic = s.allowMusic;
      return;
    }

    if (remoteHost) hostId = remoteHost;
    if (typeof s.allowTimer === 'boolean') allowTimer = s.allowTimer;
    if (typeof s.allowMusic === 'boolean') allowMusic = s.allowMusic;
    isHost = (hostId === myId);
  }

  function apply(s){
    if (!s) return;
    applying = true;
    try {
      applyMeta(s);
      lastTimerSnap = {
        mode: s.mode, totalSecs: s.totalSecs, remainSecs: s.remainSecs, running: s.running
      };
      if (typeof setTab === 'function') setTab(s.mode);
      mode = s.mode; totalSecs = s.totalSecs; remainSecs = s.remainSecs;
      const cc = mode==='work'?'wc':mode==='break'?'bc':'lc';
      const td = document.getElementById('timerDisplay'); if (td) td.className = 'timer-display '+cc;
      const pb = document.getElementById('progressBar'); if (pb) pb.className = 'timer-progress-bar '+cc;
      updateDisplay(); updateBar();
      const b = document.getElementById('startBtn');
      if (s.running){
        if (!running) startTimer();
      } else {
        if (running){ running = false; clearInterval(ticker); }
        if (b){ b.textContent = (remainSecs >= totalSecs) ? t('timer.start') : t('timer.resume'); b.classList.remove('running'); }
        if (td) td.classList.toggle('blink', remainSecs < totalSecs);
      }
    } catch(e){ console.warn('room apply', e); }
    applying = false;
    if (code && iOwnHostToken(code) && hostId !== myId) {
      claimHost({ permanent: true, openLocks: false, rotateToken: false });
    }
    updateUI();
  }

  function applyMusic(s){
    if (!s) return;
    lastMusicSnap = s;
    if (typeof applyMusicSnapshot === 'function') applyMusicSnapshot(s);
  }

  function push(){
    if (channel && !applying && status === 'joined') {
      try { channel.send({ type:'broadcast', event:'sync', payload: snapshot() }); } catch(e){}
    }
  }

  function pushMusic(){
    if (channel && status === 'joined' && canControlMusic()) {
      const payload = musicSnapshot();
      lastMusicSnap = payload;
      try { channel.send({ type:'broadcast', event:'music', payload: payload }); } catch(e){}
    }
  }

  function pushFull(){
    push();
    if (canControlMusic() || isHost) pushMusic();
  }

  function onLocalChange(){
    if (status !== 'joined') return;
    if (!canControlTimer()){
      toast(t('room.timerLocked'));
      if (lastTimerSnap) apply(Object.assign({}, lastTimerSnap, {
        hostId: hostId, hostToken: hostToken,
        allowTimer: allowTimer, allowMusic: allowMusic
      }));
      return;
    }
    push();
  }

  function onMusicLocalChange(){
    if (status !== 'joined') return;
    if (!canControlMusic()){
      toast(t('room.musicLocked'));
      if (lastMusicSnap) applyMusic(lastMusicSnap);
      return;
    }
    pushMusic();
  }

  function setAllowTimer(on){
    if (!isHost){ toast(t('room.hostOnly')); return; }
    allowTimer = !!on;
    push();
    updateUI();
  }
  function setAllowMusic(on){
    if (!isHost){ toast(t('room.hostOnly')); return; }
    allowMusic = !!on;
    push();
    updateUI();
  }
  function toggleAllowTimer(){ setAllowTimer(!allowTimer); }
  function toggleAllowMusic(){ setAllowMusic(!allowMusic); }

  function startMusicTick(){
    stopMusicTick();
    musicTick = setInterval(function(){
      if (status !== 'joined' || !canControlMusic()) return;
      const snap = musicSnapshot();
      if (snap && snap.url && snap.playing) pushMusic();
    }, 8000);
  }
  function stopMusicTick(){
    if (musicTick){ clearInterval(musicTick); musicTick = null; }
  }
  function startHostWatch(){
    stopHostWatch();
    hostWatch = setInterval(function(){
      ensureHostAlive();
      // Refresh the countdown label every tick while waiting.
      if (hostMissingSince && status === 'joined') updateUI();
    }, 1000);
  }
  function stopHostWatch(){
    if (hostWatch){ clearInterval(hostWatch); hostWatch = null; }
  }

  function stashPersonal(){
    personalStash = {
      url: (typeof currentPlayerRaw !== 'undefined' && currentPlayerRaw)
        || localStorage.getItem('sf_player_url') || ''
    };
  }
  function restorePersonal(){
    const url = personalStash && personalStash.url;
    personalStash = null;
    if (url) {
      if (typeof loadPlayerUrl === 'function') {
        loadPlayerUrl({ url: url, fromRemote: true });
        try { localStorage.setItem('sf_player_url', url); } catch(e){}
      }
    } else if (typeof clearPlayer === 'function') {
      clearPlayer({ fromRemote: true });
    }
  }

  function join(c, opts){
    const created = opts && opts.created;
    const cl = sb();
    if (!cl){ toast('Shared rooms are unavailable right now'); return; }
    if (!ensureNameOrToast()) return;
    if (channel) leave(true);

    myJoinedAt = joinStamp(c, !!created);
    const reclaim = !created && iOwnHostToken(c);
    if (created){
      isHost = true;
      hostId = myId;
      hostToken = newHostToken();
      rememberHost(c, hostToken);
      allowTimer = true;
      allowMusic = true;
    } else if (reclaim){
      isHost = true;
      hostId = myId;
      hostToken = storedHostToken(c) || hostToken;
    } else {
      isHost = false;
      hostId = null;
    }

    stashPersonal();
    // Shared rooms only sync YouTube. drop Spotify/SoundCloud embeds on entry.
    if (typeof currentPlayerSrc !== 'undefined' && currentPlayerSrc && currentPlayerSrc !== 'youtube') {
      if (typeof clearPlayer === 'function') clearPlayer({ fromRemote: true });
    }
    code = c; status = 'connecting'; hostMissingSince = null; updateUI();
    channel = cl.channel('room:'+c, { config: { broadcast: { self:false }, presence: { key: myId } } });
    channel.on('broadcast', { event:'sync'  }, function(m){ apply(m.payload); });
    channel.on('broadcast', { event:'music' }, function(m){ applyMusic(m.payload); });
    channel.on('broadcast', { event:'hello' }, function(){
      push();
      if (isHost) pushMusic();
    });
    channel.on('presence',  { event:'sync'  }, function(){
      refreshMembers();
      ensureHostAlive();
      updateUI();
    });
    channel.subscribe(function(st){
      if (st === 'SUBSCRIBED'){
        status = 'joined';
        trackPresence();
        try { channel.send({ type:'broadcast', event:'hello', payload:{} }); } catch(e){}
        if (created || reclaim) pushFull();
        setUrl(c);
        toast(created ? t('room.created')
          : reclaim ? t('room.reclaimed')
          : ('Joined room '+c));
        startMusicTick();
        startHostWatch();
        if (hostCheckTimer) clearTimeout(hostCheckTimer);
        hostCheckTimer = setTimeout(function(){ ensureHostAlive(); }, 1500);
        updateUI();
      } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT'){
        status = 'error'; updateUI(); toast('Could not connect to the room');
      }
    });
  }

  function create(){
    if (!ensureNameOrToast()) return;
    join(genCode(), { created: true });
  }

  function leave(silent){
    const cl = sb();
    const leavingCode = code;
    const owned = leavingCode && iOwnHostToken(leavingCode);
    stopMusicTick();
    stopHostWatch();
    if (hostCheckTimer){ clearTimeout(hostCheckTimer); hostCheckTimer = null; }
    if (channel && cl){ try { cl.removeChannel(channel); } catch(e){} }
    channel = null; code = null; status = 'idle'; peers = 1; members = [];
    isHost = false; hostId = null; hostToken = null;
    allowTimer = true; allowMusic = true;
    lastTimerSnap = null; lastMusicSnap = null;
    if (!silent && leavingCode){
      if (owned) forgetHost(leavingCode);
      forgetJoin(leavingCode);
    }
    hostMissingSince = null;
    clearUrl();
    restorePersonal();
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

  function toggleHtml(id, on, label, onclick){
    return '<button type="button" class="room-toggle'+(on?' is-on':'')+'" id="'+id+'" onclick="'+onclick+'">' +
      '<span class="room-toggle-switch" aria-hidden="true"></span>' +
      '<span class="room-toggle-label">'+esc(label)+'</span>' +
      '</button>';
  }

  function membersHtml(){
    const list = members.length ? members : presentPeople();
    if (!list.length){
      return '<div class="room-members-empty">' + esc(t('room.noMembers')) + '</div>';
    }
    return '<ul class="room-members">' + list.map(function(p){
      const isMe = p.id === myId;
      const isH = (hostId && p.id === hostId);
      const hostBadge = isH ? '<span class="room-host-badge">' + esc(t('room.hostBadge')) + '</span>' : '';
      const you = isMe ? '<span class="room-you-badge">' + esc(t('room.you')) + '</span>' : '';
      return '<li class="room-member'+(isH?' is-host':'')+(isMe?' is-me':'')+'">' +
               '<span class="room-member-name">'+esc(p.name || 'student')+'</span>' +
               hostBadge + you +
             '</li>';
    }).join('') + '</ul>';
  }

  function nameFieldHtml(){
    const signedIn = window.Auth && window.Auth.signedIn();
    const val = esc(displayName());
    if (signedIn && displayName()){
      return '<div class="room-name-row room-name-set">' +
               '<span class="room-name-label">' + esc(t('room.yourName')) + '</span>' +
               '<span class="room-name-value">'+val+'</span>' +
             '</div>';
    }
    return '<div class="room-name-row">' +
             '<label class="room-name-label" for="roomNameInput">' + esc(t('room.yourName')) + '</label>' +
             '<input class="room-input" id="roomNameInput" type="text" maxlength="24" ' +
               'placeholder="' + esc(t('room.namePlaceholder')) + '" value="'+val+'" ' +
               'onkeydown="if(event.key===\'Enter\'){Room.saveName();}">' +
           '</div>' +
           (needsName() ? '<div class="room-name-hint">' + esc(t('room.needName')) + '</div>' : '');
  }

  function updateUI(){
    if (typeof syncPlayerRoomMode === 'function') syncPlayerRoomMode();
    const btn = document.getElementById('roomFixedBtn');
    if (btn) btn.classList.toggle('active', status === 'joined');
    const panel = document.getElementById('roomPanel');
    if (panel) panel.classList.toggle('open', panelOpen);
    const body = document.getElementById('roomBody');
    if (!body) return;

    // Preserve name/code inputs across re-renders when possible
    const prevName = (document.getElementById('roomNameInput') || {}).value;
    const prevCode = (document.getElementById('roomJoinInput') || {}).value;

    if (status === 'joined'){
      let perms = '';
      if (isHost){
        perms =
          '<div class="room-perms">' +
            '<div class="room-perms-title">'+esc(t('room.perms'))+'</div>' +
            toggleHtml('roomAllowTimer', allowTimer, t('room.allowTimer'), 'Room.toggleAllowTimer()') +
            toggleHtml('roomAllowMusic', allowMusic, t('room.allowMusic'), 'Room.toggleAllowMusic()') +
          '</div>';
      } else {
        perms =
          '<div class="room-perms room-perms-ro">' +
            '<div class="room-perm-line">'+(allowTimer ? esc(t('room.timerOpen')) : esc(t('room.timerLocked')))+'</div>' +
            '<div class="room-perm-line">'+(allowMusic ? esc(t('room.musicOpen')) : esc(t('room.musicLocked')))+'</div>' +
          '</div>';
      }
      const muteLabel = (typeof isLocalMuted === 'function' && isLocalMuted())
        ? t('player.unmute') : t('player.mute');
      const waiting = hostMissingSince && !(hostId && members.some(function(m){ return m.id === hostId; }));
      let waitNote = '';
      if (waiting) {
        const left = Math.max(1, Math.ceil((HOST_GRACE_MS - (Date.now() - hostMissingSince)) / 1000));
        waitNote = '<div class="room-host-wait">' +
          esc(t('room.hostMissingCountdown').replace('{s}', String(left))) +
          '</div>';
      }
      body.innerHTML =
        '<div class="room-code-label">' + esc(t('room.code')) + '</div>' +
        '<div class="room-code">'+esc(code)+'</div>' +
        '<div class="room-peers"><span class="room-dot"></span>'+peers+' '+esc(t('room.online'))+
          (isHost ? ' · '+esc(t('room.youHost')) : '') +
        '</div>' +
        waitNote +
        '<div class="room-linkrow"><input class="room-link" readonly value="'+esc(link(code))+'"><button class="room-btn" onclick="Room.copyLink()">' + esc(t('room.copy')) + '</button></div>' +
        '<div class="room-sec-label">' + esc(t('room.people')) + '</div>' +
        membersHtml() +
        perms +
        '<button type="button" class="room-btn room-mute-btn'+(typeof isLocalMuted==='function'&&isLocalMuted()?' is-on':'')+'" onclick="toggleLocalMute()">'+esc(muteLabel)+'</button>' +
        '<div class="room-hint">' + esc(t('room.hint')) + '</div>' +
        '<button class="room-btn room-btn-leave" onclick="Room.leave()">' + esc(t('room.leave')) + '</button>';
    } else {
      const connecting = (status === 'connecting');
      const blocked = needsName() && !(window.Auth && window.Auth.signedIn());
      const pendingRoom = (function(){
        const m = /[?&]room=([A-Za-z0-9]{4,12})/.exec(location.search);
        return m ? m[1].toUpperCase() : '';
      })();
      body.innerHTML =
        nameFieldHtml() +
        '<button class="room-btn room-btn-primary" onclick="Room.create()"'+(connecting||blocked?' disabled':'')+'>'+(connecting?t('room.connecting'):t('room.create'))+'</button>' +
        '<div class="room-or">' + esc(t('room.or')) + '</div>' +
        '<div class="room-joinrow"><input class="room-input" id="roomJoinInput" placeholder="e.g. GABES7" maxlength="8" value="'+(prevCode?esc(prevCode):(pendingRoom&&blocked?esc(pendingRoom):''))+'"><button class="room-btn" onclick="Room.joinFromInput()"'+(connecting||blocked?' disabled':'')+'>' + esc(t('room.join')) + '</button></div>' +
        (status === 'error' ? '<div class="room-err">' + esc(t('room.failed')) + '</div>' : '');
      if (prevName && document.getElementById('roomNameInput') && !getStoredName()){
        document.getElementById('roomNameInput').value = prevName;
      }
    }
  }

  function saveName(){
    saveNameFromInput();
    updateUI();
    if (status === 'joined') trackPresence();
  }

  function joinFromInput(){
    if (!ensureNameOrToast()) return;
    const el = document.getElementById('roomJoinInput');
    const v = ((el && el.value) || '').trim().toUpperCase();
    if (v.length >= 4) join(v); else toast('That code is too short');
  }

  function closeOtherPanels(){
    if (typeof closeDockPopovers === 'function') closeDockPopovers('room');
  }
  function togglePanel(){ panelOpen = !panelOpen; if(panelOpen) closeOtherPanels(); updateUI(); }
  ['#settingsFixedBtn','#themeFixedBtn','#playerFixedBtn','#studyFixedBtn'].forEach(function(sel){
    const b=document.querySelector(sel); if(b) b.addEventListener('click', function(){ panelOpen=false; updateUI(); });
  });

  // auto-join from ?room=CODE once named + Supabase ready
  (function autoJoin(){
    const m = /[?&]room=([A-Za-z0-9]{4,12})/.exec(location.search);
    if (!m) { updateUI(); return; }
    const c = m[1].toUpperCase();
    panelOpen = true;
    let tries = 0;
    (function wait(){
      if (!(window.supabase && window.supabase.createClient)){
        if (tries++ < 40) setTimeout(wait, 150);
        else updateUI();
        return;
      }
      if (needsName()){
        updateUI(); // show name field; user joins manually after naming
        return;
      }
      join(c);
    })();
  })();

  function onAuthChanged(){
    updateUI();
    // Push the signed-in name into presence so the people list updates.
    if (status === 'joined') trackPresence();
  }
  if (window.Auth && window.Auth.onChange){
    window.Auth.onChange(onAuthChanged);
  } else {
    setTimeout(function(){
      if (window.Auth && window.Auth.onChange) window.Auth.onChange(onAuthChanged);
    }, 0);
  }

  return {
    onLocalChange: onLocalChange,
    onMusicLocalChange: onMusicLocalChange,
    create: create, join: join, refresh: updateUI,
    close: function(){ if (panelOpen){ panelOpen = false; updateUI(); } },
    joinFromInput: joinFromInput, leave: leave, copyLink: copyLink,
    togglePanel: togglePanel, saveName: saveName,
    inRoom: inRoom,
    canControlTimer: canControlTimer,
    canControlMusic: canControlMusic,
    toggleAllowTimer: toggleAllowTimer,
    toggleAllowMusic: toggleAllowMusic,
    lastMusic: lastMusic
  };
})();

// ── AUTH ──────────────────────────────────────────────────────
// Signing in is optional. Guests keep the full pomodoro + goals + local
// study log, and can read the leaderboard. they just can't appear on it.
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

  function isMissingStudyPathColumn(err){
    const msg = String((err && err.message) || err || '');
    return /study_path/i.test(msg) &&
      (/schema cache|Could not find|column.*does not exist/i.test(msg));
  }

  async function loadProfile(){
    const cl = window.SB.get();
    if (!cl || !user){ profile = null; return; }
    try {
      let r = await cl.from('profiles').select('display_name, study_path').eq('id', user.id).maybeSingle();
      if (r.error && isMissingStudyPathColumn(r.error)) {
        r = await cl.from('profiles').select('display_name').eq('id', user.id).maybeSingle();
      }
      if (r.error) throw r.error;
      profile = r.data || null;
      if (profile && profile.study_path) {
        try { localStorage.setItem('sf_study_path', JSON.stringify(profile.study_path)); } catch(e){}
      }
    } catch(e){
      console.warn('profile load', e);
      profile = null;
    }
  }

  async function setSession(session){
    const before = user && user.id;
    user = (session && session.user) || null;
    if (user) await loadProfile(); else profile = null;
    settled = true;
    emit();
    // Newly signed in. push everything that was captured as a guest.
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
    toast('Signed out. Your study time stays on this device');
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

  function studyPathRaw(){
    if (profile && profile.study_path) return profile.study_path;
    try {
      const v = JSON.parse(localStorage.getItem('sf_study_path') || 'null');
      return v;
    } catch(e){ return null; }
  }

  async function saveStudyPath(path){
    try { localStorage.setItem('sf_study_path', JSON.stringify(path)); } catch(e){}
    profile = profile || {};
    profile.study_path = path;
    const cl = window.SB.get();
    if (!cl || !user) return { ok:true, msg:'Saved locally' };
    const r = await cl.from('profiles').update({ study_path: path }).eq('id', user.id);
    if (r.error) {
      if (isMissingStudyPathColumn(r.error)) {
        return {
          ok: true,
          localOnly: true,
          msg: 'Saved on this device. Add study_path to Supabase (see supabase/migrate-study-path.sql).'
        };
      }
      return { ok:false, msg:r.error.message };
    }
    emit();
    return { ok:true, msg:'Study path saved' };
  }

  return { init:init, onChange:onChange, signedIn:signedIn, id:id, name:name,
           studyPathRaw:studyPathRaw, saveStudyPath:saveStudyPath,
           google:google, signUp:signUp, signIn:signIn, signOut:signOut, rename:rename };
})();


// ── STUDY TIME TRACKER + LEADERBOARD ──────────────────────────
window.Study = (function(){
  const K_LOG = 'sf_study_log';
  const SESSION_SUBJECT = 'study';
  const MAX_LOG_DAYS = 120;
  const SYNC_WINDOW_DAYS = 14;

  // Tunisian lycée + prépa study paths (profile metadata. not used to split the board).
  const HS_GRADES = {
    '1': null,
    '2': ['Lettres', 'Économie et gestion', 'Informatique', 'Sciences'],
    '3': ['Lettres', 'Économie et gestion', 'Informatique', 'Mathématiques', 'Sciences expérimentales', 'Sciences techniques'],
    '4': ['Lettres', 'Économie et gestion', 'Informatique', 'Mathématiques', 'Sciences expérimentales', 'Sciences techniques']
  };
  const COLLEGE_PREPA = ['MP', 'PT', 'PC', 'BG'];
  const COLLEGE_INTEG = ['MPI', 'CBA'];

  function normalizePath(p){
    if (!p || p.level !== 'college') return p;
    // Legacy: licence lived under prepa integ. lift it to its own college path.
    if (p.collegeKind === 'prepa_integ' && p.collegeTrack === 'license') {
      return { level: 'college', collegeKind: 'license', licenseName: p.licenseName || '' };
    }
    return p;
  }

  let panelOpen = false;
  let board = [], standing = null, boardLoading = false, boardErr = '';
  const BOARD_LIMIT = 300;
  const BOARD_PAGE_SIZE = 20;
  let authMode = 'none';
  let authMsg = null;
  let authGateOpen = false;
  let pathGateOpen = false;
  let pathDraft = null;
  let pathWizard = 'level';

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

  function rawPath(){
    let p = null;
    if (window.Auth && window.Auth.studyPathRaw) {
      p = window.Auth.studyPathRaw();
    }
    if (!p) p = readJSON('sf_study_path', null);
    return normalizePath(p);
  }

  function isValidPath(p){
    p = normalizePath(p);
    if (!p || !p.level) return false;
    if (p.level === 'highschool'){
      if (!HS_GRADES.hasOwnProperty(p.grade)) return false;
      const tracks = HS_GRADES[p.grade];
      if (!tracks) return true;
      return tracks.indexOf(p.track) !== -1;
    }
    if (p.level === 'college'){
      if (p.collegeKind === 'license') {
        return String(p.licenseName || '').trim().length >= 2;
      }
      if (p.collegeKind === 'prepa_classique') return COLLEGE_PREPA.indexOf(p.collegeTrack) !== -1;
      if (p.collegeKind === 'prepa_integ') {
        return p.collegeTrack === 'MPI' || p.collegeTrack === 'CBA';
      }
    }
    return false;
  }

  function pathLabel(p){
    p = normalizePath(p);
    if (!p || !isValidPath(p)) return '';
    if (p.level === 'highschool'){
      const gradeLbl = p.grade === '1' ? t('path.grade1')
        : p.grade === '4' ? t('path.grade4')
        : t('path.gradeN').replace('{n}', p.grade);
      if (p.grade === '1') return t('path.hs') + ' · ' + gradeLbl;
      return t('path.hs') + ' · ' + gradeLbl + ' · ' + p.track;
    }
    if (p.collegeKind === 'license'){
      return t('path.license') + ' · ' + String(p.licenseName || '').trim();
    }
    if (p.collegeKind === 'prepa_classique'){
      return t('path.prepaClassique') + ' · ' + p.collegeTrack;
    }
    return t('path.prepaInteg') + ' · ' + p.collegeTrack;
  }

  function getPath(){ const p = rawPath(); return isValidPath(p) ? p : null; }
  function hasStudyPath(){ return !!getPath(); }
  function needsStudyPath(){
    return !!(window.Auth && window.Auth.signedIn() && !hasStudyPath());
  }

  function syncPathGate(){
    pathGateOpen = needsStudyPath();
  }

  async function persistPath(p){
    writeJSON('sf_study_path', p);
    if (window.Auth && window.Auth.saveStudyPath){
      const r = await window.Auth.saveStudyPath(p);
      if (!r.ok) throw new Error(r.msg || 'Could not save study path');
      if (r.localOnly) toast(r.msg);
    }
  }

  function startPathWizard(){
    pathDraft = {};
    pathWizard = 'level';
    pathGateOpen = true;
    render();
  }

  function pathBtn(label, action, value){
    const valAttr = (value != null && value !== '')
      ? ' data-path-value="'+esc(String(value))+'"' : '';
    return '<button type="button" class="path-btn" data-path-action="'+esc(action)+'"'+valAttr+'>'+esc(label)+'</button>';
  }

  function pathNavRow(){
    const showBack = pathWizard !== 'level';
    const showCancel = hasStudyPath();
    if (!showBack && !showCancel) return '';
    return '<div class="path-nav-row">' +
      (showBack
        ? '<button type="button" class="study-link path-nav-back" data-path-action="back">'+esc(t('path.back'))+'</button>'
        : '<span class="path-nav-spacer"></span>') +
      (showCancel
        ? '<button type="button" class="study-link path-nav-cancel" data-path-action="cancel">'+esc(t('path.cancel'))+'</button>'
        : '') +
    '</div>';
  }

  function onPathWizardClick(e){
    const btn = e.target.closest('[data-path-action]');
    if (!btn || !pathGateOpen) return;
    e.preventDefault();
    e.stopPropagation();
    const action = btn.getAttribute('data-path-action');
    const val = btn.getAttribute('data-path-value') || '';
    switch (action){
      case 'level': pickPathLevel(val); break;
      case 'hs_grade': pickHsGrade(val); break;
      case 'hs_track': pickHsTrack(val); break;
      case 'college_kind': pickCollegeKind(val); break;
      case 'college_track': pickCollegeTrack(val); break;
      case 'back': pathBack(); break;
      case 'cancel': cancelPathWizard(); break;
      case 'save_license': saveLicensePath(); break;
    }
  }

  function pathWizardBlock(){
    if (!pathGateOpen || !(window.Auth && window.Auth.signedIn())) return '';
    pathDraft = pathDraft || {};

    let title = t('path.gateTitle');
    let body = '';

    if (pathWizard === 'level'){
      body = '<div class="path-step-label">'+esc(t('path.pickLevel'))+'</div>' +
        '<div class="path-btn-grid">' +
          pathBtn(t('path.hs'), 'level', 'highschool') +
          pathBtn(t('path.college'), 'level', 'college') +
        '</div>';
    } else if (pathWizard === 'hs_grade'){
      body = '<div class="path-step-label">'+esc(t('path.pickGrade'))+'</div>' +
        '<div class="path-btn-grid">' +
          pathBtn(t('path.grade1'), 'hs_grade', '1') +
          pathBtn(t('path.grade2'), 'hs_grade', '2') +
          pathBtn(t('path.grade3'), 'hs_grade', '3') +
          pathBtn(t('path.grade4'), 'hs_grade', '4') +
        '</div>';
    } else if (pathWizard === 'hs_track'){
      const tracks = HS_GRADES[pathDraft.grade] || [];
      body = '<div class="path-step-label">'+esc(t('path.pickTrack'))+'</div>' +
        '<div class="path-btn-grid path-btn-grid-wide">' +
          tracks.map(function(tr){ return pathBtn(tr, 'hs_track', tr); }).join('') +
        '</div>';
    } else if (pathWizard === 'college_kind'){
      body = '<div class="path-step-label">'+esc(t('path.pickCollege'))+'</div>' +
        '<div class="path-btn-grid path-btn-grid-stack">' +
          pathBtn(t('path.prepaClassique'), 'college_kind', 'prepa_classique') +
          pathBtn(t('path.prepaInteg'), 'college_kind', 'prepa_integ') +
          pathBtn(t('path.license'), 'college_kind', 'license') +
        '</div>';
    } else if (pathWizard === 'college_track'){
      const opts = pathDraft.collegeKind === 'prepa_classique' ? COLLEGE_PREPA : COLLEGE_INTEG;
      body = '<div class="path-step-label">'+esc(t('path.pickPrepa'))+'</div>' +
        '<div class="path-btn-grid">' +
          opts.map(function(tr){ return pathBtn(tr, 'college_track', tr); }).join('') +
        '</div>';
    } else if (pathWizard === 'license_name'){
      body = '<div class="path-step-label">'+esc(t('path.licensePrompt'))+'</div>' +
        '<input class="study-input" id="pathLicenseInput" type="text" maxlength="48" ' +
          'placeholder="'+esc(t('path.licensePlaceholder'))+'" value="'+esc(pathDraft.licenseName||'')+'">' +
        '<button type="button" class="study-btn study-btn-primary path-save" data-path-action="save_license">'+esc(t('path.save'))+'</button>';
    }

    return '<div class="study-path-gate" role="dialog" aria-modal="true" aria-label="'+esc(title)+'">' +
             '<div class="study-path-gate-card">' +
               '<div class="study-path-gate-title">'+esc(title)+'</div>' +
               '<div class="study-path-gate-msg">'+esc(t('path.gateMsg'))+'</div>' +
               body +
               pathNavRow() +
             '</div>' +
           '</div>';
  }

  function pathSummaryBlock(){
    if (!window.Auth || !window.Auth.signedIn()) return '';
    const p = getPath();
    if (!p) return '';
    return '<div class="study-path-set">' +
             '<span class="study-path-label">'+esc(t('path.yours'))+'</span>' +
             '<span class="study-path-value">'+esc(pathLabel(p))+'</span>' +
             '<button type="button" class="study-link" onclick="Study.changePath()">'+esc(t('path.change'))+'</button>' +
           '</div>';
  }

  function pickPathLevel(level){
    pathDraft = { level: level };
    pathWizard = (level === 'highschool') ? 'hs_grade' : 'college_kind';
    render();
  }
  function pickHsGrade(grade){
    pathDraft.grade = grade;
    if (!HS_GRADES.hasOwnProperty(grade)){ render(); return; }
    if (HS_GRADES[grade] === null){
      finishPath({ level:'highschool', grade: grade });
      return;
    }
    pathWizard = 'hs_track';
    render();
  }
  function pickHsTrack(track){
    finishPath({ level:'highschool', grade: pathDraft.grade, track: track });
  }
  function pickCollegeKind(kind){
    pathDraft.collegeKind = kind;
    if (kind === 'license'){
      pathWizard = 'license_name';
      render();
      setTimeout(function(){
        const el = document.getElementById('pathLicenseInput');
        if (el) el.focus();
      }, 50);
      return;
    }
    pathWizard = 'college_track';
    render();
  }
  function pickCollegeTrack(track){
    finishPath({ level:'college', collegeKind: pathDraft.collegeKind, collegeTrack: track });
  }
  async function saveLicensePath(){
    const el = document.getElementById('pathLicenseInput');
    const name = el ? String(el.value || '').trim().slice(0, 48) : '';
    if (name.length < 2){ toast(t('path.licenseShort')); return; }
    await finishPath({
      level:'college',
      collegeKind: 'license',
      licenseName: name
    });
  }
  async function finishPath(p){
    if (!isValidPath(p)){ toast(t('path.invalid')); return; }
    try {
      await persistPath(p);
      pathGateOpen = false;
      pathDraft = null;
      pathWizard = 'level';
      toast(t('path.saved'));
      loadBoard();
      render();
    } catch(e){
      toast((e && e.message) || t('path.saveFailed'));
    }
  }
  function pathBack(){
    if (pathWizard === 'hs_grade') pathWizard = 'level';
    else if (pathWizard === 'hs_track') pathWizard = 'hs_grade';
    else if (pathWizard === 'college_kind') pathWizard = 'level';
    else if (pathWizard === 'college_track') pathWizard = 'college_kind';
    else if (pathWizard === 'license_name') pathWizard = 'college_kind';
    render();
  }
  function changePath(){ startPathWizard(); }
  function cancelPathWizard(){
    pathGateOpen = false;
    pathDraft = null;
    pathWizard = 'level';
    render();
  }

  // ── local ledger ──
  // entry: { i:id, s:subject, m:minutes, t:epoch ms, u:1 when unsynced }
  function log(){ const l = readJSON(K_LOG, []); return Array.isArray(l) ? l : []; }
  function saveLog(l){
    const cutoff = Date.now() - MAX_LOG_DAYS*86400000;
    writeJSON(K_LOG, l.filter(function(e){ return e && e.t > cutoff; }));
  }

  function weekStart(){
    const d = new Date();
    const dow = (d.getDay() + 6) % 7;
    d.setHours(0,0,0,0); d.setDate(d.getDate() - dow);
    return d.getTime();
  }
  function dayStart(){ const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); }

  function sumSince(ts){
    return log().reduce(function(a, e){ return e.t >= ts ? a + e.m : a; }, 0);
  }

  function fmt(mins){
    const m = Math.max(0, Math.round(mins));
    if (m < 60) return m + 'm';
    const h = Math.floor(m/60), r = m % 60;
    return r ? (h + 'h ' + r + 'm') : (h + 'h');
  }

  function fmtBoardTime(mins){
    const m = Math.max(0, Math.round(mins));
    const h = Math.floor(m / 60);
    const r = m % 60;
    return h + ':' + String(r).padStart(2, '0');
  }

  function avatarHue(name){
    let h = 0;
    const s = String(name || '');
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h % 360;
  }

  function avatarInitial(name){
    const s = String(name || '?').trim();
    return esc((s[0] || '?').toUpperCase());
  }

  function boardPageCount(){
    return Math.max(1, Math.ceil(board.length / BOARD_PAGE_SIZE) || 1);
  }

  function logSession(minutes){
    const mins = Math.max(1, Math.min(300, Math.round(minutes)));
    const l = log();
    l.push({ i: uuid(), s: SESSION_SUBJECT, m: mins, t: Date.now(), u: 1 });
    saveLog(l);
    render();
    flush();
  }

  async function flush(){
    const cl = window.SB.get();
    if (!cl || !window.Auth || !window.Auth.signedIn()) return;
    const uid = window.Auth.id();
    const cutoff = Date.now() - SYNC_WINDOW_DAYS*86400000;
    const l = log();
    const pending = l.filter(function(e){ return e.u && e.t >= cutoff; });
    if (!pending.length) return;

    const rows = pending.map(function(e){
      return { id: e.i, user_id: uid, subject: SESSION_SUBJECT, preset: true,
               minutes: e.m, started_at: new Date(e.t).toISOString() };
    });
    try {
      const r = await cl.from('study_sessions').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
      if (r.error){ console.warn('study flush', r.error); return; }
      const done = {};
      pending.forEach(function(e){ done[e.i] = 1; });
      saveLog(log().map(function(e){ if (done[e.i]) delete e.u; return e; }));
      saveLog(log().map(function(e){ if (e.u && e.t < cutoff) delete e.u; return e; }));
      render();
    } catch(e){ console.warn('study flush', e); }
  }

  // ── leaderboard (total study time this week. no subject filter) ──
  async function loadBoard(){
    if (!window.Auth || !window.Auth.signedIn()){
      board = []; standing = null; boardLoading = false; boardErr = '';
      render();
      return;
    }
    const cl = window.SB.get();
    if (!cl){ boardErr = t('study.unavailable'); render(); return; }
    boardLoading = true; boardErr = ''; render();
    try {
      const r = await cl.rpc('leaderboard_week', { p_subject: null, p_limit: BOARD_LIMIT });
      if (r.error) throw r.error;
      board = r.data || [];
      standing = null;
      const s = await cl.rpc('my_week_standing', { p_subject: null });
      if (!s.error && s.data && s.data.length) standing = s.data[0];
    } catch(e){
      board = []; boardErr = (e && e.message) ? e.message : t('study.unavailable');
      console.warn('Leaderboard failed - see supabase/SETUP.md:', e);
    }
    boardLoading = false; render();
  }

  // ── mini card in the left column ──
  function renderMini(){
    const todayEl = document.getElementById('studyToday');
    const w = document.getElementById('studyWeek');
    if (todayEl) todayEl.textContent = fmt(sumSince(dayStart()));
    if (w) w.textContent = fmt(sumSince(weekStart()));

    const bars = document.getElementById('studyMiniBars');
    if (!bars) return;
    const signedIn = window.Auth && window.Auth.signedIn();
    const p = signedIn ? getPath() : null;
    if (p){
      bars.innerHTML = '<div class="study-mini-path">'+esc(pathLabel(p))+'</div>';
      return;
    }
    if (signedIn){
      bars.innerHTML = '<div class="study-mini-empty">'+esc(t('path.needPick'))+'</div>';
      return;
    }
    bars.innerHTML = '<div class="study-mini-empty">'+esc(t('study.noSessions'))+'</div>';
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

  function renderLeaderboardPage(page){
    page = Math.max(1, page || 1);
    const totalPages = boardPageCount();
    if (page > totalPages) page = totalPages;

    if (!window.Auth || !window.Auth.signedIn()){
      const fake = [3,4,5,6,7,8,9,10,11,12].map(function(n){
        return '<div class="lb-row">' +
                 '<span class="lb-rank">'+n+'</span>' +
                 '<span class="lb-avatar" style="--lb-hue:120" aria-hidden="true">•</span>' +
                 '<span class="lb-name">••••••••</span>' +
                 '<span class="lb-time">-</span>' +
               '</div>';
      }).join('');
      return '<div class="lb-wrap">' +
               '<button type="button" class="study-board-lock lb-lock" onclick="Study.openAuthGate()">' +
                 '<div class="lb-list lb-list-blurred" aria-hidden="true">'+fake+'</div>' +
                 '<span class="study-board-lock-label">' + esc(t('study.boardLocked')) + '</span>' +
               '</button>' +
               authGateBlock() +
             '</div>';
    }

    if (boardLoading) return '<div class="study-board-msg">' + esc(t('study.loading')) + '</div>';
    if (boardErr)     return '<div class="study-board-msg study-board-err">'+esc(boardErr)+'</div>';
    if (!board.length) return '<div class="study-board-msg">'+esc(t('study.nobody'))+'</div>';

    const start = (page - 1) * BOARD_PAGE_SIZE;
    const rows = board.slice(start, start + BOARD_PAGE_SIZE).map(function(r){
      const hue = avatarHue(r.display_name);
      return '<div class="lb-row'+(r.is_me?' me':'')+'">' +
               '<span class="lb-rank">'+r.rank+'</span>' +
               '<span class="lb-avatar" style="--lb-hue:'+hue+'" aria-hidden="true">'+avatarInitial(r.display_name)+'</span>' +
               '<span class="lb-name">'+esc(r.display_name)+'</span>' +
               '<span class="lb-time">'+esc(fmtBoardTime(r.minutes))+'</span>' +
             '</div>';
    }).join('');

    const prevDisabled = page <= 1;
    const nextDisabled = page >= totalPages;
    const pager = totalPages > 1
      ? '<div class="lb-pager">' +
          '<button type="button" class="lb-page-btn"' +
            (prevDisabled ? ' disabled' : ' onclick="Stats.setBoardPage('+(page-1)+')"') +
            ' aria-label="'+esc(t('stats.prevPage'))+'">&lt;</button>' +
          '<span class="lb-page-num" aria-current="page">'+page+'</span>' +
          '<button type="button" class="lb-page-btn"' +
            (nextDisabled ? ' disabled' : ' onclick="Stats.setBoardPage('+(page+1)+')"') +
            ' aria-label="'+esc(t('stats.nextPage'))+'">&gt;</button>' +
        '</div>'
      : '';

    return '<div class="lb-wrap">' +
             standingBlock() +
             '<div class="lb-list" aria-label="'+esc(t('study.board'))+'">'+rows+'</div>' +
             pager +
             '<p class="lb-hint">'+esc(t('study.resetsMonday'))+'</p>' +
             authGateBlock() +
           '</div>';
  }

  function authGateBlock(){
    if (!authGateOpen) return '';
    if (window.Auth && window.Auth.signedIn()){ authGateOpen = false; return ''; }
    let form = '';
    if (authMode === 'none'){
      form =
        '<button class="study-btn study-btn-google" onclick="Study.doGoogle()">' + esc(t('study.google')) + '</button>' +
        '<div class="study-or">' + esc(t('study.or')) + '</div>' +
        '<div class="study-authrow">' +
          '<button class="study-btn" onclick="Study.setAuthMode(\'signin\')">' + esc(t('study.signin')) + '</button>' +
          '<button class="study-btn" onclick="Study.setAuthMode(\'signup\')">' + esc(t('study.signup')) + '</button>' +
        '</div>';
    } else {
      const up = (authMode === 'signup');
      form =
        '<div class="study-form">' +
          (up ? '<input class="study-input" id="authName" type="text" placeholder="' + esc(t('study.name')) + '" maxlength="24">' : '') +
          '<input class="study-input" id="authEmail" type="email" placeholder="' + esc(t('study.email')) + '" autocomplete="email">' +
          '<input class="study-input" id="authPass" type="password" placeholder="' + esc(t('study.password')) + '" autocomplete="'+(up?'new-password':'current-password')+'">' +
          '<button class="study-btn study-btn-primary" onclick="Study.doAuth()">'+(up?'Create account':'Sign in')+'</button>' +
          '<button class="study-link" onclick="Study.setAuthMode(\'none\')">' + esc(t('study.back')) + '</button>' +
        '</div>';
    }
    return '<div class="study-auth-gate" role="dialog" aria-modal="true" aria-label="' + esc(t('study.boardGateTitle')) + '">' +
             '<div class="study-auth-gate-card">' +
               '<button type="button" class="study-auth-gate-x" onclick="Study.closeAuthGate()" aria-label="Close">×</button>' +
               '<div class="study-auth-gate-title">' + esc(t('study.boardGateTitle')) + '</div>' +
               '<div class="study-auth-gate-msg">' + esc(t('study.boardGateMsg')) + '</div>' +
               form +
               msgBlock() +
             '</div>' +
           '</div>';
  }

  function render(){
    renderMini();
    updateStudyPanel();
    updatePathGate();
    if (window.Stats && Stats.renderContent && document.body.classList.contains('view-stats')) {
      Stats.renderContent();
    }
  }

  function updateStudyPanel(){
    const btn = document.getElementById('studyFixedBtn');
    if (btn) btn.classList.toggle('active', panelOpen);
    const panel = document.getElementById('studyPanel');
    if (panel) panel.classList.toggle('open', panelOpen);
    const title = document.getElementById('studyPanelTitle');
    if (title) {
      const signedIn = window.Auth && window.Auth.signedIn();
      title.textContent = t(signedIn ? 'study.account' : 'tip.study');
    }
    const body = document.getElementById('studyBody');
    if (!body || !panelOpen) return;

    body.innerHTML =
      authBlock() +
      pathSummaryBlock() +
      '<div class="study-sec-label">' + esc(t('study.myWeek')) + '</div>' +
      '<div class="study-mine">' +
        '<div class="study-mine-val">'+esc(fmt(sumSince(weekStart())))+'</div>' +
        '<div class="study-mine-sub">'+esc(fmt(sumSince(dayStart())))+' today</div>' +
      '</div>';
  }

  function updatePathGate(){
    const root = document.getElementById('pathGateRoot');
    if (!root) return;
    root.innerHTML = pathWizardBlock();
    document.body.classList.toggle('path-gate-open', pathGateOpen);
  }

  function closeOtherPanels(){
    if (typeof closeDockPopovers === 'function') closeDockPopovers('study');
  }

  function togglePanel(){
    panelOpen = !panelOpen;
    if (panelOpen){
      closeOtherPanels();
      syncPathGate();
    }
    render();
  }

  function closeStudy(){
    if (panelOpen){ panelOpen = false; }
    render();
  }

  function closeAll(){
    panelOpen = false;
    authGateOpen = false;
    render();
  }

  // ── panel actions ──
  function setAuthMode(m){ authMode = m; authMsg = null; render(); }
  function setAuthMsg(kind, text){ authMsg = { kind: kind, text: text }; render(); }
  function openAuthGate(){
    if (window.Auth && window.Auth.signedIn()){ loadBoard(); return; }
    authGateOpen = true;
    authMode = 'none';
    authMsg = null;
    if (window.Stats && Stats.setTab) Stats.setTab('board');
    if (typeof showView === 'function') showView('stats');
    render();
  }
  function closeAuthGate(){ authGateOpen = false; authMsg = null; render(); }

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
    if (r.ok){
      authMode = 'none';
      authGateOpen = false;
      syncPathGate();
      loadBoard();
    }
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
    render();
    const gateRoot = document.getElementById('pathGateRoot');
    if (gateRoot && !gateRoot.dataset.pathBound){
      gateRoot.dataset.pathBound = '1';
      gateRoot.addEventListener('click', onPathWizardClick, true);
    }
    if (window.Auth) window.Auth.onChange(function(){
      if (window.Auth.signedIn()) authGateOpen = false;
      syncPathGate();
      loadBoard();
      render();
    });
    ['#settingsFixedBtn','#themeFixedBtn','#playerFixedBtn','#roomFixedBtn'].forEach(function(sel){
      const b = document.querySelector(sel);
      if (b) b.addEventListener('click', function(){
        if (panelOpen){ panelOpen = false; render(); }
      });
    });
  }

  return { init:init, doGoogle:doGoogle,
           close: closeAll, closeStudy:closeStudy,
           hasStudyPath:hasStudyPath, needsStudyPath:needsStudyPath, pathLabel:pathLabel, getPath:getPath,
           pickPathLevel:pickPathLevel, pickHsGrade:pickHsGrade, pickHsTrack:pickHsTrack,
           pickCollegeKind:pickCollegeKind, pickCollegeTrack:pickCollegeTrack, saveLicensePath:saveLicensePath,
           pathBack:pathBack, changePath:changePath, cancelPathWizard:cancelPathWizard,
           logSession:logSession, flush:flush, fmt:fmt, loadBoard:loadBoard,
           boardPageCount:boardPageCount, renderLeaderboardPage:renderLeaderboardPage,
           entries:log, sumSince:sumSince,
           togglePanel:togglePanel,
           setAuthMode:setAuthMode, doAuth:doAuth, doSignOut:doSignOut, doRename:doRename,
           openAuthGate:openAuthGate, closeAuthGate:closeAuthGate,
           render:render };
})();


// ── DAILY GOALS ───────────────────────────────────────────────
// Local-first: works signed out, mirrored to Supabase when signed in.
// One goal is "active"; every completed focus session ticks it up.
window.Goals = (function(){
  const K_ITEMS = 'sf_goals', K_DAY = 'sf_goals_day', K_ACTIVE = 'sf_goal_active';

  let items = [], activeId = null, editingId = null, reorderDragId = null;

  function sortItems(){
    items.sort(function(a, b){ return (a.pos || 0) - (b.pos || 0); });
  }

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
    sortItems();
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

  function add(title, est){
    const clean = String(title || '').trim().slice(0, 120);
    if (!clean) return;
    const g = {
      id: uuid(), day: today(), title: clean,
      est: Math.max(1, Math.min(20, parseInt(est) || 1)),
      progress: 0, done: false,
      pos: items.length, updated: Date.now()
    };
    items.push(g);
    activeId = g.id;
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
    save(); render();
  }

  function remove(id){
    const g = find(id);
    items = items.filter(function(x){ return x.id !== id; });
    if (activeId === id) activeId = null;
    if (editingId === id) editingId = null;
    items.forEach(function(x, i){ x.pos = i; });
    save(); render();
    if (g) del(g.id);
  }

  function startEdit(id){
    const g = find(id); if (!g) return;
    editingId = id;
    render();
    const inp = document.querySelector('.goal-edit-title');
    if (inp){ inp.focus(); inp.select(); }
  }

  function cancelEdit(){
    editingId = null;
    render();
  }

  function saveEdit(id){
    const g = find(id); if (!g) return;
    const titleEl = document.querySelector('.goal-edit-title');
    const estEl = document.querySelector('.goal-edit-est');
    const title = titleEl ? String(titleEl.value || '').trim().slice(0, 120) : '';
    const est = Math.max(1, Math.min(20, parseInt(estEl && estEl.value, 10) || 1));
    if (!title){ toast(t('goals.needTitle')); return; }
    g.title = title;
    g.est = est;
    if (g.progress > g.est) g.progress = g.est;
    if (!g.done && g.progress >= g.est){
      g.done = true;
      if (activeId === id){
        const next = items.filter(function(x){ return !x.done; })[0];
        activeId = next ? next.id : null;
      }
    } else if (g.done && g.progress < g.est){
      g.done = false;
    }
    g.updated = Date.now();
    editingId = null;
    save(); render(); push([g]);
    toast(t('goals.updated'));
  }

  function reorderGoals(fromId, toId){
    if (!fromId || !toId || fromId === toId) return;
    const fromIdx = items.findIndex(function(g){ return g.id === fromId; });
    const toIdx = items.findIndex(function(g){ return g.id === toId; });
    if (fromIdx < 0 || toIdx < 0) return;
    const moved = items.splice(fromIdx, 1)[0];
    items.splice(toIdx, 0, moved);
    items.forEach(function(g, i){
      g.pos = i;
      g.updated = Date.now();
    });
    save(); render(); push(items);
  }

  function goalEditBlock(g){
    return '<div class="goal-edit">' +
             '<input class="goal-edit-title study-input" type="text" maxlength="120" value="'+esc(g.title)+'" ' +
               'placeholder="'+esc(t('goals.add'))+'" aria-label="'+esc(t('goals.editTitle'))+'">' +
             '<div class="goal-edit-row">' +
               '<label class="goal-edit-est-wrap">' +
                 '<span class="goal-edit-est-label">'+esc(t('goals.est'))+'</span>' +
                 '<input class="goal-edit-est" type="number" min="1" max="20" value="'+g.est+'" aria-label="'+esc(t('goals.est'))+'">' +
               '</label>' +
               '<button type="button" class="goal-edit-save study-mini-btn" data-goal-action="save" data-goal-id="'+g.id+'">'+esc(t('goals.save'))+'</button>' +
               '<button type="button" class="goal-edit-cancel study-link" data-goal-action="cancel">'+esc(t('goals.cancel'))+'</button>' +
             '</div>' +
           '</div>';
  }

  function onGoalListClick(e){
    if (goalDragSuppressClick) return;
    const btn = e.target.closest('[data-goal-action]');
    if (btn){
      e.preventDefault();
      e.stopPropagation();
      const action = btn.getAttribute('data-goal-action');
      const row = btn.closest('.goal-item');
      const id = btn.getAttribute('data-goal-id') || (row ? row.dataset.goalId : '');
      if (action === 'toggle' && id) toggle(id);
      else if (action === 'focus' && id) setActive(id);
      else if (action === 'remove' && id) remove(id);
      else if (action === 'edit' && id) startEdit(id);
      else if (action === 'save' && id) saveEdit(id);
      else if (action === 'cancel') cancelEdit();
      return;
    }
    const main = e.target.closest('.goal-main');
    if (main && !editingId){
      const row = main.closest('.goal-item');
      if (row && row.dataset.goalId) setActive(row.dataset.goalId);
    }
  }

  function onGoalListKeydown(e){
    if (e.key !== 'Enter') return;
    const inEdit = e.target.closest('.goal-edit');
    if (!inEdit) return;
    e.preventDefault();
    const row = inEdit.closest('.goal-item');
    if (row && row.dataset.goalId) saveEdit(row.dataset.goalId);
  }

  let ptrDrag = null;
  let goalDragSuppressClick = false;

  function isGoalDragHandle(el){
    return !!(el && el.closest('.goal-drag'));
  }

  function clearDropTargets(list){
    if (!list) return;
    list.querySelectorAll('.goal-item').forEach(function(el){
      el.classList.remove('goal-drop-target', 'is-dragging');
      el.style.transform = '';
      el.style.zIndex = '';
      el.style.pointerEvents = '';
    });
  }

  function releaseGoalPointer(drag){
    if (!drag || !drag.row) return;
    try {
      if (drag.row.hasPointerCapture && drag.row.hasPointerCapture(drag.pointerId)){
        drag.row.releasePointerCapture(drag.pointerId);
      }
    } catch(err){}
  }

  function endPtrDrag(){
    if (!ptrDrag) return;
    const drag = ptrDrag;
    ptrDrag = null;
    document.body.classList.remove('goal-dragging');
    releaseGoalPointer(drag);
    const moved = drag.dragging;
    if (moved && drag.overId) reorderGoals(drag.id, drag.overId);
    clearDropTargets(drag.list);
    reorderDragId = null;
    if (moved){
      setTimeout(function(){ goalDragSuppressClick = false; }, 40);
    } else {
      goalDragSuppressClick = false;
    }
  }

  function onGoalPointerMove(e){
    if (!ptrDrag || e.pointerId !== ptrDrag.pointerId) return;
    const dy = e.clientY - ptrDrag.startY;
    const dx = e.clientX - ptrDrag.startX;
    if (!ptrDrag.dragging){
      if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return;
      ptrDrag.dragging = true;
      goalDragSuppressClick = true;
      reorderDragId = ptrDrag.id;
      ptrDrag.row.classList.add('is-dragging');
      document.body.classList.add('goal-dragging');
    }
    e.preventDefault();
    ptrDrag.row.style.transform = 'translateY(' + dy + 'px)';
    ptrDrag.row.style.zIndex = '3';
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const target = el && el.closest('.goal-item');
    ptrDrag.list.querySelectorAll('.goal-item').forEach(function(item){
      item.classList.toggle('goal-drop-target',
        !!(target && item === target && item.dataset.goalId !== ptrDrag.id));
    });
    ptrDrag.overId = (target && target.dataset.goalId !== ptrDrag.id) ? target.dataset.goalId : null;
  }

  function onGoalPointerUp(e){
    if (!ptrDrag || e.pointerId !== ptrDrag.pointerId) return;
    endPtrDrag();
  }

  function bindGoalList(){
    const list = document.getElementById('goalsList');
    if (!list || list.dataset.bound) return;
    list.dataset.bound = '1';
    list.addEventListener('click', onGoalListClick);
    list.addEventListener('keydown', onGoalListKeydown);

    // Reorder only from the left drag handle. keeps taps on the goal usable.
    list.addEventListener('pointerdown', function(e){
      if (e.button !== 0) return;
      if (!isGoalDragHandle(e.target)) return;
      const row = e.target.closest('.goal-item');
      if (!row || row.classList.contains('done') || row.classList.contains('editing')) return;
      if (ptrDrag) endPtrDrag();
      ptrDrag = {
        id: row.dataset.goalId, row: row, list: list,
        startY: e.clientY, startX: e.clientX, overId: null, dragging: false,
        pointerId: e.pointerId
      };
      try { row.setPointerCapture(e.pointerId); } catch(err){}
    });
    list.addEventListener('pointermove', onGoalPointerMove);
    list.addEventListener('pointerup', onGoalPointerUp);
    list.addEventListener('pointercancel', onGoalPointerUp);
    list.addEventListener('lostpointercapture', function(e){
      if (ptrDrag && e.pointerId === ptrDrag.pointerId) endPtrDrag();
    });
    window.addEventListener('blur', function(){ if (ptrDrag) endPtrDrag(); });
    document.addEventListener('visibilitychange', function(){
      if (document.hidden && ptrDrag) endPtrDrag();
    });
  }

  // Which goal should receive the next finished pomodoro?
  function goalForSession(){
    let g = active();
    if (g && !g.done) return g;
    const taskEl = document.getElementById('taskInput');
    const task = taskEl ? String(taskEl.value || '').trim().toLowerCase() : '';
    if (task){
      g = items.filter(function(x){
        return !x.done && String(x.title || '').trim().toLowerCase() === task;
      })[0];
      if (g) return g;
    }
    const open = items.filter(function(x){ return !x.done; });
    if (open.length === 1) return open[0];
    return null;
  }

  // Called by onDone() when a focus session finishes.
  function onPomodoro(){
    const g = goalForSession();
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
          const isEditing = (g.id === editingId);
          const dots = Array.from({length: Math.min(g.est, 8)}, function(_, i){
            return '<span class="goal-dot'+(i < g.progress ? ' filled' : '')+'"></span>';
          }).join('');
          const mainBlock = isEditing ? goalEditBlock(g) :
            ('<div class="goal-main" data-goal-action="focus" data-goal-id="'+g.id+'" title="'+(isActive?'focusing on this':'click to focus this goal')+'">' +
               '<div class="goal-title">'+esc(g.title)+'</div>' +
               '<div class="goal-meta">' +
                 '<span class="goal-dots">'+dots+'</span>' +
                 '<span class="goal-prog">'+Math.min(g.progress, g.est)+'/'+g.est+'</span>' +
               '</div>' +
             '</div>');
          return '<div class="goal-item'+(g.done?' done':'')+(isActive?' active':'')+(isEditing?' editing':'')+'" data-goal-id="'+g.id+'">' +
                   '<button type="button" class="goal-drag" aria-label="'+esc(t('goals.drag'))+'" title="'+esc(t('goals.drag'))+'">' +
                     '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h2M9 12h2M9 18h2M13 6h2M13 12h2M13 18h2"/></svg>' +
                   '</button>' +
                   '<button type="button" class="goal-check" data-goal-action="toggle" data-goal-id="'+g.id+'" title="'+(g.done?'reopen':'mark done')+'">'+(g.done?'✓':'')+'</button>' +
                   mainBlock +
                   (!isEditing
                     ? ('<div class="goal-actions">' +
                          '<button type="button" class="goal-edit-btn" data-goal-action="edit" data-goal-id="'+g.id+'" ' +
                            'aria-label="'+esc(t('goals.edit'))+'" title="'+esc(t('goals.edit'))+'">' +
                            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10.5-10.5a1.5 1.5 0 000-2.12l-2.38-2.38a1.5 1.5 0 00-2.12 0L4 15.5V20z"/><path d="M13.5 6.5l2 2"/></svg>' +
                          '</button>' +
                          '<button type="button" class="goal-del" data-goal-action="remove" data-goal-id="'+g.id+'" title="remove" aria-label="remove">×</button>' +
                        '</div>')
                     : '') +
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
    bindGoalList();
  }

  return { init:init, add:add, addFromInput:addFromInput, toggle:toggle, setActive:setActive,
           remove:remove, onPomodoro:onPomodoro, goalForSession:goalForSession,
           startEdit:startEdit, saveEdit:saveEdit, cancelEdit:cancelEdit, reorderGoals:reorderGoals,
           active:active, pull:pull, render:render };
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
    if (typeof updateAllTabIndicators === 'function') updateAllTabIndicators();
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
    if (typeof animateModeSwitch === 'function') animateModeSwitch();
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
    if (typeof animateModeSwitch === 'function') animateModeSwitch();
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
    if (window.Goals && Goals.goalForSession && Goals.goalForSession()){
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
      'nav.focus': 'Focus', 'nav.planner': 'Planner', 'nav.stats': 'Stats',
      'stats.heading': 'Stats', 'stats.yours': 'Your study', 'stats.leaderboard': 'Leaderboard',
      'stats.prevPage': 'Previous page', 'stats.nextPage': 'Next page',
      'stats.title': 'Your study', 'stats.thisWeek': 'This week',
      'stats.avgDay': 'Average day', 'stats.streak': 'Streak',
      'stats.days': 'd', 'stats.best': 'Best day',
      'stats.last14': 'Last 14 days', 'stats.peak': 'peak {time}',
      'stats.bySubject': 'By subject', 'stats.week': 'Week',
      'stats.month': 'Month', 'stats.all': 'All time',
      'stats.total': 'Total {time}',
      'stats.empty': 'No sessions in this range yet. Finish a focus session and it shows up here.',
      'tip.study': 'Sign in', 'tip.board': 'Leaderboard', 'tip.room': 'Shared room',
      'tip.player': 'Music player', 'tip.theme': 'Theme',
      'tip.background': 'Background', 'tip.settings': 'Settings',
      'tip.fullscreen': 'Fullscreen', 'tip.language': 'Language',
      'dock.study': 'Sign in', 'dock.room': 'Room', 'dock.player': 'Music',
      'dock.theme': 'Theme', 'dock.settings': 'Settings', 'dock.fullscreen': 'Full',

      'timer.pomodoro': 'Pomodoro', 'timer.chrono': 'Chrono',
      'timer.chronoTip': "Study stopwatch: counts up instead of down",
      'timer.focus': 'Focus', 'timer.break': 'Break', 'timer.long': 'Long break',
      'timer.start': 'Start', 'timer.pause': 'Pause', 'timer.resume': 'Resume',
      'timer.reset': 'Reset', 'timer.skip': 'Skip',
      'timer.task': 'What are you working on?',
      'timer.saveSession': 'Save this session',
      'chrono.hint': 'Counts up with no target. Saving logs your study time.',
      'chrono.reset': 'Stopwatch reset', 'chrono.nothing': 'Nothing to save yet',
      'chrono.saved': 'Saved {time}', 'chrono.credited': '{n} pomodoro(s) credited',

      'goals.title': "Today's goals", 'goals.add': 'Add a goal…',
      'goals.addBtn': 'Add goal', 'goals.est': 'Estimated pomodoros',
      'goals.hint': 'Tap a goal to focus it, edit/delete buttons are always visible on phones.',
      'goals.empty': 'Nothing yet. Add what you want to finish today',
      'goals.complete': 'Goal complete: {title}',
      'goals.added': "Added to today's goals",
      'goals.newDay': 'New day. {n} goal(s) cleared',
      'goals.edit': 'Edit goal', 'goals.save': 'Save', 'goals.cancel': 'Cancel',
      'goals.drag': 'Drag to reorder', 'goals.editTitle': 'Goal name',
      'goals.updated': 'Goal updated', 'goals.needTitle': 'Give the goal a name',

      'study.title': 'Study time', 'study.account': 'Account', 'study.today': 'Today', 'study.week': 'This week',
      'study.board': 'Leaderboard', 'study.noSessions': 'No sessions yet this week',
      'study.myWeek': 'my week', 'study.thisWeeksBoard': "this week's board",
      'study.guest': "You're a guest. Your time is saved on this device. Sign in to unlock the leaderboard.",
      'study.boardLocked': 'Sign in to see the leaderboard',
      'study.boardGateTitle': 'Leaderboard is for members',
      'study.boardGateMsg': 'Sign in or create an account to see weekly rankings and your place on the board.',
      'study.google': 'Continue with Google', 'study.or': 'or',
      'study.signin': 'Sign in', 'study.signup': 'Create account', 'study.back': 'Back',
      'study.signout': 'Sign out', 'study.rename': 'Rename',
      'study.email': 'Email', 'study.password': 'Password', 'study.name': 'Display name',
      'study.loading': 'Loading…',
      'study.resetsMonday': 'The board resets every Monday, ranked by total study time',
      'study.rankEmpty': 'Log a focus session to get your rank',
      'study.percentile': 'You studied more than <b>{pct}%</b> of candidates this week',
      'study.of': 'of', 'study.nobody': 'Nobody has logged time this week yet. Be first',
      'study.unavailable': 'Leaderboard unavailable',
      'study.needBoth': 'Enter an email and a password.',
      'study.working': 'Working…', 'study.signedOut': 'Signed out. Your study time stays on this device.',
      'study.renamePrompt': 'Display name (shown on the leaderboard)',
      'study.unavailableAuth': 'Sign-in is unavailable right now.',

      'path.gateTitle': 'What are you studying?',
      'path.gateMsg': 'Pick your level so we know who you are. Required once after sign-in.',
      'path.pickLevel': 'School level',
      'path.pickGrade': 'Which year?',
      'path.pickTrack': 'Which track?',
      'path.pickCollege': 'Which path?',
      'path.pickPrepa': 'Which speciality?',
      'path.hs': 'High school',
      'path.college': 'College / prépa',
      'path.grade1': '1st year',
      'path.grade2': '2nd year',
      'path.grade3': '3rd year',
      'path.grade4': 'BAC (4th year)',
      'path.gradeN': '{n}th year',
      'path.prepaClassique': 'Classic prepa',
      'path.prepaInteg': 'Integrated prepa',
      'path.license': 'Degree / licence',
      'path.licensePrompt': 'Which degree are you studying?',
      'path.licensePlaceholder': 'e.g. Computer science',
      'path.licenseShort': 'Enter at least 2 characters',
      'path.save': 'Save',
      'path.back': 'Back',
      'path.saved': 'Study path saved',
      'path.saveFailed': 'Could not save study path',
      'path.invalid': 'That selection is incomplete',
      'path.yours': 'You study',
      'path.change': 'Change',
      'path.cancel': 'Cancel',
      'path.needPick': 'Sign in and pick what you study',

      'room.title': 'Shared room', 'room.create': 'Create a room',
      'room.or': 'Or join with a code', 'room.join': 'Join', 'room.copy': 'Copy',
      'room.code': 'Room code', 'room.leave': 'Leave room',
      'room.hint': 'Share the link or code. Music and the timer stay in sync while you are in the room.',
      'room.online': 'online', 'room.connecting': 'Connecting…',
      'room.failed': 'Connection failed. Try again',
      'room.created': 'Room created',
      'room.reclaimed': 'Back as host',
      'room.youHost': 'you are host',
      'room.youAreNowHost': 'You are now the host',
      'room.hostMissing': 'Host disconnected. Waiting before passing the role…',
      'room.hostMissingToast': 'Host left the room. Next host in 35 seconds',
      'room.hostMissingCountdown': 'Host disconnected. Next host in {s}s',
      'room.people': 'In this room',
      'room.hostBadge': 'host',
      'room.you': 'you',
      'room.noMembers': 'No one else here yet',
      'room.yourName': 'Your name',
      'room.namePlaceholder': 'e.g. Amine',
      'room.needName': 'Enter a name (at least 2 characters) before creating or joining a room',
      'room.perms': 'Who can control',
      'room.allowTimer': 'Others can control the timer',
      'room.allowMusic': 'Others can control the music',
      'room.timerOpen': 'Timer: everyone can control',
      'room.musicOpen': 'Music: everyone can control',
      'room.timerLocked': 'Only the host can control the timer',
      'room.musicLocked': 'Only the host can control the music',
      'room.hostOnly': 'Only the host can change that',
      'player.mute': 'Mute for me',
      'player.unmute': 'Unmute',
      'player.muteTip': 'Mute only on this device',
      'player.mutedToast': 'Muted for you only. Others still hear it',
      'player.unmutedToast': 'Unmuted',
      'player.roomYoutubeOnly': 'In a shared room, only YouTube links sync. Paste a YouTube URL',
      'player.roomYoutubeNote': 'Only YouTube is available in a shared room.',

      'player.title': 'Music player', 'player.paste': 'Paste a link…',
      'player.load': 'Load', 'player.clear': 'Clear player',
      'player.empty': 'Paste a YouTube, Spotify or SoundCloud link to play.',

      'theme.title': 'Theme',
      'theme.back': 'Back to themes',
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
      'plan.weeklyTab': 'Weekly', 'plan.monthlyTab': 'Monthly',
      'plan.from': 'From', 'plan.to': 'to', 'plan.print': 'Print',
      'plan.thisWeek': 'This week', 'plan.today': 'Today',
      'plan.prev': 'Previous', 'plan.next': 'Next',
      'plan.dayPlaceholder': 'Add a task…',
      'plan.addTask': 'Add a task…',
      'plan.add': 'Add',
      'plan.removeTask': 'Remove task',
      'plan.hint': 'Add each task with +. Everything saves automatically on this device.',
      'plan.cleared': 'Planner cleared',
      'plan.clear': 'Clear this week', 'plan.clearMonth': 'Clear this month',

      'msg.pomodoroDone': 'Pomodoro complete. Take a break',
      'msg.breakOver': 'Break over. Back to focus',
      'msg.roundDone': 'Round complete. Starting over',
      'msg.restored': 'Session restored', 'msg.settings': 'Settings applied',
    },

    fr: {
      'nav.focus': 'Focus', 'nav.planner': 'Planning', 'nav.stats': 'Stats',
      'stats.heading': 'Stats', 'stats.yours': 'Ton étude', 'stats.leaderboard': 'Classement',
      'stats.prevPage': 'Page précédente', 'stats.nextPage': 'Page suivante',
      'stats.title': 'Ton étude', 'stats.thisWeek': 'Cette semaine',
      'stats.avgDay': 'Moyenne / jour', 'stats.streak': 'Série',
      'stats.days': 'j', 'stats.best': 'Meilleur jour',
      'stats.last14': '14 derniers jours', 'stats.peak': 'max {time}',
      'stats.bySubject': 'Par matière', 'stats.week': 'Semaine',
      'stats.month': 'Mois', 'stats.all': 'Tout',
      'stats.total': 'Total {time}',
      'stats.empty': 'Aucune session sur cette période. Termine une session et elle apparaîtra ici.',
      'tip.study': 'Se connecter', 'tip.board': 'Classement', 'tip.room': 'Salle partagée',
      'tip.player': 'Lecteur de musique', 'tip.theme': 'Thème',
      'tip.background': 'Arrière-plan', 'tip.settings': 'Paramètres',
      'tip.fullscreen': 'Plein écran', 'tip.language': 'Langue',
      'dock.study': 'Connexion', 'dock.room': 'Salle', 'dock.player': 'Musique',
      'dock.theme': 'Thème', 'dock.settings': 'Réglages', 'dock.fullscreen': 'Plein',

      'timer.pomodoro': 'Pomodoro', 'timer.chrono': 'Chrono',
      'timer.chronoTip': "Chronomètre d'étude: compte à l'endroit",
      'timer.focus': 'Focus', 'timer.break': 'Pause', 'timer.long': 'Longue pause',
      'timer.start': 'Démarrer', 'timer.pause': 'Pause', 'timer.resume': 'Reprendre',
      'timer.reset': 'Réinitialiser', 'timer.skip': 'Passer',
      'timer.task': 'Sur quoi travailles-tu ?',
      'timer.saveSession': 'Enregistrer cette session',
      'chrono.hint': "Compte à l'endroit, sans objectif. L'enregistrement ajoute ton temps d'étude.",
      'chrono.reset': 'Chronomètre remis à zéro', 'chrono.nothing': 'Rien à enregistrer pour le moment',
      'chrono.saved': '{time} enregistré', 'chrono.credited': '{n} pomodoro(s) crédité(s)',

      'goals.title': "Objectifs du jour", 'goals.add': 'Ajouter un objectif…',
      'goals.addBtn': 'Ajouter', 'goals.est': 'Pomodoros estimés',
      'goals.hint': 'Touche un objectif pour le cibler, les boutons modifier/supprimer restent visibles sur téléphone.',
      'goals.empty': 'Rien pour le moment. Ajoute ce que tu veux finir aujourd’hui',
      'goals.complete': 'Objectif atteint : {title}',
      'goals.added': 'Ajouté aux objectifs du jour',
      'goals.newDay': 'Nouveau jour. {n} objectif(s) effacé(s)',
      'goals.edit': 'Modifier', 'goals.save': 'Enregistrer', 'goals.cancel': 'Annuler',
      'goals.drag': 'Glisser pour réordonner', 'goals.editTitle': 'Nom de l’objectif',
      'goals.updated': 'Objectif mis à jour', 'goals.needTitle': 'Donne un nom à l’objectif',

      'study.title': "Temps d'étude", 'study.account': 'Compte', 'study.today': "Aujourd'hui", 'study.week': 'Cette semaine',
      'study.board': 'Classement', 'study.noSessions': 'Aucune session cette semaine',
      'study.myWeek': 'ma semaine', 'study.thisWeeksBoard': 'classement de la semaine',
      'study.guest': "Tu es invité. Ton temps est enregistré sur cet appareil. Connecte-toi pour débloquer le classement.",
      'study.boardLocked': 'Connecte-toi pour voir le classement',
      'study.boardGateTitle': 'Classement réservé aux membres',
      'study.boardGateMsg': 'Connecte-toi ou crée un compte pour voir le classement de la semaine et ta place.',
      'study.google': 'Continuer avec Google', 'study.or': 'ou',
      'study.signin': 'Se connecter', 'study.signup': 'Créer un compte', 'study.back': 'Retour',
      'study.signout': 'Se déconnecter', 'study.rename': 'Renommer',
      'study.email': 'E-mail', 'study.password': 'Mot de passe', 'study.name': "Nom affiché",
      'study.loading': 'Chargement…',
      'study.resetsMonday': 'Le classement se remet à zéro chaque lundi, classé par temps total',
      'study.rankEmpty': 'Enregistre une session pour obtenir ton rang',
      'study.percentile': 'Tu as étudié plus que <b>{pct}%</b> des candidats cette semaine',
      'study.of': 'sur', 'study.nobody': "Personne n'a encore enregistré de temps cette semaine. Sois le premier",
      'study.unavailable': 'Classement indisponible',
      'study.needBoth': 'Saisis un e-mail et un mot de passe.',
      'study.working': 'En cours…', 'study.signedOut': 'Déconnecté. Ton temps d’étude reste sur cet appareil.',
      'study.renamePrompt': 'Nom affiché (visible au classement)',
      'study.unavailableAuth': 'La connexion est indisponible pour le moment.',

      'path.gateTitle': 'Qu’est-ce que tu étudies ?',
      'path.gateMsg': 'Choisis ton niveau. Obligatoire une fois après connexion.',
      'path.pickLevel': 'Niveau scolaire',
      'path.pickGrade': 'Quelle année ?',
      'path.pickTrack': 'Quelle filière ?',
      'path.pickCollege': 'Quel parcours ?',
      'path.pickPrepa': 'Quelle spécialité ?',
      'path.hs': 'Lycée',
      'path.college': 'Supérieur / prépa',
      'path.grade1': '1ère année',
      'path.grade2': '2ème année',
      'path.grade3': '3ème année',
      'path.grade4': 'BAC (4ème année)',
      'path.gradeN': '{n}ème année',
      'path.prepaClassique': 'Prépa classique',
      'path.prepaInteg': 'Prépa intégrée',
      'path.license': 'Licence',
      'path.licensePrompt': 'Quelle licence suis-tu ?',
      'path.licensePlaceholder': 'ex. Informatique',
      'path.licenseShort': 'Saisis au moins 2 caractères',
      'path.save': 'Enregistrer',
      'path.back': 'Retour',
      'path.saved': 'Parcours enregistré',
      'path.saveFailed': 'Impossible d’enregistrer le parcours',
      'path.invalid': 'Sélection incomplète',
      'path.yours': 'Tu étudies',
      'path.change': 'Modifier',
      'path.cancel': 'Annuler',
      'path.needPick': 'Connecte-toi et choisis ton parcours',

      'room.title': 'Salle partagée', 'room.create': 'Créer une salle',
      'room.or': 'Ou rejoindre avec un code', 'room.join': 'Rejoindre', 'room.copy': 'Copier',
      'room.code': 'Code de la salle', 'room.leave': 'Quitter la salle',
      'room.hint': 'Partage le lien ou le code. La musique et le minuteur restent synchronisés dans la salle.',
      'room.online': 'en ligne', 'room.connecting': 'Connexion…',
      'room.failed': 'Échec de la connexion. Réessaie',
      'room.created': 'Salle créée',
      'room.reclaimed': 'De retour en tant qu’hôte',
      'room.youHost': 'tu es hôte',
      'room.youAreNowHost': 'Tu es maintenant l’hôte',
      'room.hostMissing': 'Hôte déconnecté. transfert du rôle dans un instant…',
      'room.hostMissingToast': 'L’hôte a quitté. Prochain hôte dans 35 secondes',
      'room.hostMissingCountdown': 'Hôte déconnecté. Prochain hôte dans {s}s',
      'room.people': 'Dans la salle',
      'room.hostBadge': 'hôte',
      'room.you': 'toi',
      'room.noMembers': 'Personne d’autre pour l’instant',
      'room.yourName': 'Ton prénom',
      'room.namePlaceholder': 'ex. Amine',
      'room.needName': 'Entre un prénom (au moins 2 caractères) avant de créer ou rejoindre une salle',
      'room.perms': 'Qui peut contrôler',
      'room.allowTimer': 'Les autres peuvent contrôler le minuteur',
      'room.allowMusic': 'Les autres peuvent contrôler la musique',
      'room.timerOpen': 'Minuteur : tout le monde peut contrôler',
      'room.musicOpen': 'Musique : tout le monde peut contrôler',
      'room.timerLocked': 'Seul l’hôte peut contrôler le minuteur',
      'room.musicLocked': 'Seul l’hôte peut contrôler la musique',
      'room.hostOnly': 'Seul l’hôte peut changer ça',
      'player.mute': 'Couper le son pour moi',
      'player.unmute': 'Remettre le son',
      'player.muteTip': 'Coupe le son seulement sur cet appareil',
      'player.mutedToast': 'Son coupé pour toi. Les autres entendent toujours',
      'player.unmutedToast': 'Son rétabli',
      'player.roomYoutubeOnly': 'Dans une salle partagée, seul YouTube se synchronise. Colle un lien YouTube',
      'player.roomYoutubeNote': 'Seul YouTube est disponible dans une salle partagée.',

      'player.title': 'Lecteur de musique', 'player.paste': 'Colle un lien…',
      'player.load': 'Charger', 'player.clear': 'Vider le lecteur',
      'player.empty': 'Colle un lien YouTube, Spotify ou SoundCloud pour lancer la lecture.',

      'theme.title': 'Thème',
      'theme.back': 'Retour aux thèmes',
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
      'plan.weeklyTab': 'Hebdo', 'plan.monthlyTab': 'Mensuel',
      'plan.from': 'De', 'plan.to': 'à', 'plan.print': 'Imprimer',
      'plan.thisWeek': 'Cette semaine', 'plan.today': "Aujourd'hui",
      'plan.prev': 'Précédent', 'plan.next': 'Suivant',
      'plan.dayPlaceholder': 'Ajouter une tâche…',
      'plan.addTask': 'Ajouter une tâche…',
      'plan.add': 'Ajouter',
      'plan.removeTask': 'Supprimer la tâche',
      'plan.hint': 'Ajoute chaque tâche avec +. Tout est enregistré automatiquement sur cet appareil.',
      'plan.cleared': 'Planning effacé',
      'plan.clear': 'Effacer la semaine', 'plan.clearMonth': 'Effacer le mois',

      'msg.pomodoroDone': 'Pomodoro terminé. Fais une pause',
      'msg.breakOver': 'Pause terminée. Retour au travail',
      'msg.roundDone': 'Série terminée. On recommence',
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
// Local-first. everything is keyed by ISO week / month in localStorage.
window.Planner = (function(){
  const K_WEEK = 'sf_plan_week', K_MONTH = 'sf_plan_month', K_RANGE = 'sf_plan_range';
  const K_TAB = 'sf_plan_tab';
  const COMPACT_MQ = '(max-width: 820px)';

  let weekRef = null;    // any date inside the shown week
  let monthRef = null;   // any date inside the shown month
  let saveTimer = null;
  let tab = 'week';
  let selectedMonthDay = null; // day number for phone month agenda
  let compactMq = null;

  function toast(m){ if (typeof showToast === 'function') showToast(m); }
  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }
  function isCompact(){ return compactMq ? compactMq.matches : false; }

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
    render({ animate: false });
  }

  // ── persistence ──
  // Cells store newline-separated tasks so older freeform notes still load.
  function parseTasks(raw){
    if (!raw) return [];
    return String(raw).split(/\n/).map(function(s){ return s.trim(); }).filter(Boolean);
  }
  function serializeTasks(list){
    return (list || []).join('\n');
  }
  function getCellTasks(store, bucket, cell){
    const all = readJSON(store);
    return parseTasks(all[bucket] && all[bucket][cell]);
  }
  function setCellTasks(store, bucket, cell, tasks){
    const all = readJSON(store);
    if (!all[bucket]) all[bucket] = {};
    const text = serializeTasks(tasks);
    if (text) all[bucket][cell] = text;
    else delete all[bucket][cell];
    writeJSON(store, all);
  }

  function stash(store, bucket, cell, value){
    clearTimeout(saveTimer);
    const all = readJSON(store);
    if (!all[bucket]) all[bucket] = {};
    if (value.trim()) all[bucket][cell] = value;
    else delete all[bucket][cell];
    saveTimer = setTimeout(function(){ writeJSON(store, all); }, 250);
    writeJSON(store, all);
  }

  function onWeekInput(el){
    stash(K_WEEK, weekKey(weekRef), el.dataset.cell, el.value);
  }
  function onMonthInput(el){
    stash(K_MONTH, monthKey(monthRef), el.dataset.cell, el.value);
  }

  function taskListHtml(tasks, opts){
    opts = opts || {};
    if (!tasks.length) return '<ul class="pl-tasks"></ul>';
    return '<ul class="pl-tasks">' + tasks.map(function(task, idx){
      const text = typeof task === 'string' ? task : task.text;
      const cell = typeof task === 'string' ? null : task.cell;
      const hour = typeof task === 'string' ? null : task.hour;
      const index = typeof task === 'string' ? idx : task.index;
      const hourHtml = (opts.showHour && hour != null)
        ? '<span class="pl-task-hour">' + String(hour).padStart(2,'0') + ':00</span>'
        : '';
      const cellAttr = cell != null ? ' data-cell="'+esc(String(cell))+'"' : '';
      return '<li class="pl-task"'+cellAttr+'>' +
               hourHtml +
               '<span class="pl-task-text">'+esc(text)+'</span>' +
               '<button type="button" class="pl-task-del" data-pl-action="remove" data-pl-index="'+index+'" ' +
                 'aria-label="'+esc(t('plan.removeTask'))+'" title="'+esc(t('plan.removeTask'))+'">×</button>' +
             '</li>';
    }).join('') + '</ul>';
  }

  function taskAddHtml(cell){
    const cellAttr = cell != null ? ' data-cell="'+esc(String(cell))+'"' : '';
    return '<div class="pl-task-add"'+cellAttr+'>' +
             '<input class="pl-task-input" type="text" maxlength="120" ' +
               'placeholder="'+esc(t('plan.addTask'))+'" aria-label="'+esc(t('plan.addTask'))+'">' +
             '<button type="button" class="pl-task-add-btn" data-pl-action="add" ' +
               'aria-label="'+esc(t('plan.add'))+'" title="'+esc(t('plan.add'))+'">+</button>' +
           '</div>';
  }

  function addTask(store, bucket, cell, title){
    const clean = String(title || '').trim().slice(0, 120);
    if (!clean) return false;
    const tasks = getCellTasks(store, bucket, cell);
    tasks.push(clean);
    setCellTasks(store, bucket, cell, tasks);
    return true;
  }

  function removeTask(store, bucket, cell, index){
    const tasks = getCellTasks(store, bucket, cell);
    if (index < 0 || index >= tasks.length) return;
    tasks.splice(index, 1);
    setCellTasks(store, bucket, cell, tasks);
  }

  // Flatten all hour (+ day-all) tasks for one weekday index.
  function weekDayEntries(data, dayIndex, from, to){
    const out = [];
    const allKey = dayIndex + '-all';
    parseTasks(data[allKey]).forEach(function(text, index){
      out.push({ text: text, cell: allKey, hour: null, index: index });
    });
    for (let h = from; h <= to; h++){
      const cell = dayIndex + '-' + h;
      parseTasks(data[cell]).forEach(function(text, index){
        out.push({ text: text, cell: cell, hour: h, index: index });
      });
    }
    return out;
  }

  function dayHasMonthTasks(data, dayNum){
    return parseTasks(data[dayNum]).length > 0;
  }

  function resolveCell(el){
    const withCell = el.closest('[data-cell]');
    return withCell ? withCell.getAttribute('data-cell') : null;
  }

  function onPlannerClick(e){
    const pickDay = e.target.closest('[data-pl-pick-day]');
    if (pickDay){
      selectedMonthDay = parseInt(pickDay.getAttribute('data-pl-pick-day'), 10);
      render({ animate: false });
      return;
    }

    const btn = e.target.closest('[data-pl-action]');
    if (!btn) return;
    const cell = resolveCell(btn);
    if (cell == null) return;
    e.preventDefault();
    const isWeek = !!btn.closest('#weekGrid');
    const store = isWeek ? K_WEEK : K_MONTH;
    const bucket = isWeek ? weekKey(weekRef) : monthKey(monthRef);
    const action = btn.getAttribute('data-pl-action');

    if (action === 'add'){
      const box = btn.closest('.pl-task-add') || btn.closest('[data-cell]');
      const input = box && box.querySelector('.pl-task-input');
      if (!addTask(store, bucket, cell, input ? input.value : '')) return;
      render({ animate: false });
      return;
    }
    if (action === 'remove'){
      removeTask(store, bucket, cell, parseInt(btn.getAttribute('data-pl-index'), 10));
      render({ animate: false });
    }
  }

  function onPlannerKeydown(e){
    if (e.key !== 'Enter') return;
    const input = e.target.closest('.pl-task-input');
    if (!input) return;
    e.preventDefault();
    const cell = resolveCell(input);
    if (cell == null) return;
    const isWeek = !!input.closest('#weekGrid');
    const store = isWeek ? K_WEEK : K_MONTH;
    const bucket = isWeek ? weekKey(weekRef) : monthKey(monthRef);
    if (!addTask(store, bucket, cell, input.value)) return;
    render({ animate: false });
  }

  // ── tabs ──
  function setTab(next){
    tab = (next === 'month') ? 'month' : 'week';
    try { localStorage.setItem(K_TAB, tab); } catch(e){}
    updateTabsUI();
    if (typeof blurPillTabFocus === 'function') blurPillTabFocus();
    requestAnimationFrame(function(){
      const tabs = document.querySelector('.planner-tabs');
      if (tabs && typeof updateTabIndicator === 'function') updateTabIndicator(tabs);
    });
  }

  function updateTabsUI(){
    const weekPanel = document.getElementById('planWeekPanel');
    const monthPanel = document.getElementById('planMonthPanel');
    if (weekPanel) weekPanel.hidden = tab !== 'week';
    if (monthPanel) monthPanel.hidden = tab !== 'month';
    const tabs = document.querySelector('.planner-tabs');
    if (!tabs) return;
    tabs.querySelectorAll('.planner-tab').forEach(function(btn){
      const key = btn.getAttribute('data-plan-tab');
      const active = key === tab;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    if (typeof updateTabIndicator === 'function') updateTabIndicator(tabs);
  }

  // ── navigation ──
  function shiftWeek(n){ weekRef.setDate(weekRef.getDate() + n*7); render({ animate: true }); }
  function shiftMonth(n){
    monthRef.setMonth(monthRef.getMonth() + n, 1);
    selectedMonthDay = null;
    render({ animate: true });
  }
  function todayWeek(){ weekRef = new Date(); render({ animate: true }); }
  function todayMonth(){
    monthRef = new Date();
    selectedMonthDay = monthRef.getDate();
    render({ animate: true });
  }

  function clearWeek(){
    const all = readJSON(K_WEEK); delete all[weekKey(weekRef)]; writeJSON(K_WEEK, all);
    render({ animate: false }); toast(t('plan.cleared'));
  }
  function clearMonth(){
    const all = readJSON(K_MONTH); delete all[monthKey(monthRef)]; writeJSON(K_MONTH, all);
    selectedMonthDay = null;
    render({ animate: false }); toast(t('plan.cleared'));
  }

  function printView(){ window.print(); }

  function fillHourSelects(r){
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

  function bumpSwap(host, animate){
    if (!host || !animate){
      if (host) host.classList.remove('swap');
      return;
    }
    host.classList.remove('swap'); void host.offsetWidth; host.classList.add('swap');
  }

  // ── rendering ──
  function renderWeekDesktop(host, start, data, r, today){
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
        const tasks = parseTasks(data[cell]);
        body += '<div class="pl-cell pl-slot-box' + (isToday ? ' is-today' : '') + '" data-cell="' + cell + '">' +
                  taskListHtml(tasks) +
                  taskAddHtml() +
                '</div>';
      }
    }
    host.className = 'pl-grid pl-week';
    host.innerHTML = head + body;
  }

  // Phone-style agenda: stacked days with tasks (like a calendar app week list).
  function renderWeekAgenda(host, start, data, r, today){
    let out = '';
    for (let i = 0; i < 7; i++){
      const d = new Date(start); d.setDate(d.getDate() + i);
      const isToday = sameDay(d, today);
      const entries = weekDayEntries(data, i, r.from, r.to);
      const addCell = i + '-all';
      out += '<article class="pl-agenda-day' + (isToday ? ' is-today' : '') + '">' +
               '<header class="pl-agenda-head">' +
                 '<span class="pl-agenda-dow">' + esc(d.toLocaleDateString(locale(), { weekday: 'short' })) + '</span>' +
                 '<span class="pl-agenda-num">' + d.getDate() + '</span>' +
                 '<span class="pl-agenda-full">' + esc(d.toLocaleDateString(locale(), { month: 'short', weekday: 'long' })) + '</span>' +
               '</header>' +
               taskListHtml(entries, { showHour: true }) +
               taskAddHtml(addCell) +
             '</article>';
    }
    host.className = 'pl-agenda pl-week-agenda';
    host.innerHTML = out;
  }

  function renderWeek(opts){
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

    if (isCompact()) renderWeekAgenda(host, start, data, r, today);
    else renderWeekDesktop(host, start, data, r, today);

    bumpSwap(host, opts && opts.animate);
    fillHourSelects(r);

    const toolbar = document.querySelector('.pl-toolbar-week');
    if (toolbar) toolbar.classList.toggle('is-compact-hidden', isCompact());
  }

  function renderMonthDesktop(host, first, data, today, daysInMonth, lead, cells){
    let out = '';
    const wkStart = startOfWeek(first);
    for (let i = 0; i < 7; i++){
      const d = new Date(wkStart); d.setDate(d.getDate() + i);
      out += '<div class="pl-cell pl-head">' + esc(d.toLocaleDateString(locale(), { weekday: 'short' })) + '</div>';
    }
    for (let i = 0; i < cells; i++){
      const dayNum = i - lead + 1;
      if (dayNum < 1 || dayNum > daysInMonth){
        out += '<div class="pl-cell pl-day is-empty"></div>';
        continue;
      }
      const d = new Date(monthRef.getFullYear(), monthRef.getMonth(), dayNum);
      const isToday = sameDay(d, today);
      const tasks = parseTasks(data[dayNum]);
      out += '<div class="pl-cell pl-day' + (isToday ? ' is-today' : '') + '" data-cell="' + dayNum + '">' +
               '<span class="pl-daynum">' + dayNum + '</span>' +
               taskListHtml(tasks) +
               taskAddHtml() +
             '</div>';
    }
    host.className = 'pl-grid pl-month';
    host.innerHTML = out;
  }

  // Phone calendar: month grid of day numbers + selected-day agenda below.
  function renderMonthPhone(host, first, data, today, daysInMonth, lead, cells){
    if (selectedMonthDay == null || selectedMonthDay < 1 || selectedMonthDay > daysInMonth){
      const inThisMonth = today.getMonth() === first.getMonth() &&
                          today.getFullYear() === first.getFullYear();
      selectedMonthDay = inThisMonth ? today.getDate() : 1;
    }

    const wkStart = startOfWeek(first);
    let grid = '<div class="pl-cal-dows">';
    for (let i = 0; i < 7; i++){
      const d = new Date(wkStart); d.setDate(d.getDate() + i);
      grid += '<span class="pl-cal-dow">' + esc(d.toLocaleDateString(locale(), { weekday: 'narrow' })) + '</span>';
    }
    grid += '</div><div class="pl-cal-grid">';

    for (let i = 0; i < cells; i++){
      const dayNum = i - lead + 1;
      if (dayNum < 1 || dayNum > daysInMonth){
        grid += '<span class="pl-cal-cell is-empty"></span>';
        continue;
      }
      const d = new Date(monthRef.getFullYear(), monthRef.getMonth(), dayNum);
      const isToday = sameDay(d, today);
      const selected = dayNum === selectedMonthDay;
      const has = dayHasMonthTasks(data, dayNum);
      grid += '<button type="button" class="pl-cal-cell' +
                (isToday ? ' is-today' : '') +
                (selected ? ' is-selected' : '') +
                (has ? ' has-tasks' : '') +
              '" data-pl-pick-day="' + dayNum + '" aria-label="' + dayNum + '">' +
                '<span class="pl-cal-num">' + dayNum + '</span>' +
                (has ? '<span class="pl-cal-dot" aria-hidden="true"></span>' : '') +
              '</button>';
    }
    grid += '</div>';

    const selDate = new Date(monthRef.getFullYear(), monthRef.getMonth(), selectedMonthDay);
    const tasks = parseTasks(data[selectedMonthDay]);
    const detail =
      '<div class="pl-cal-detail" data-cell="' + selectedMonthDay + '">' +
        '<div class="pl-cal-detail-head">' +
          esc(selDate.toLocaleDateString(locale(), { weekday: 'long', month: 'long', day: 'numeric' })) +
        '</div>' +
        taskListHtml(tasks) +
        taskAddHtml() +
      '</div>';

    host.className = 'pl-cal-month';
    host.innerHTML = grid + detail;
  }

  function renderMonth(opts){
    const host = document.getElementById('monthGrid');
    const label = document.getElementById('monthLabel');
    if (!host) return;

    const first = new Date(monthRef.getFullYear(), monthRef.getMonth(), 1);
    const data = readJSON(K_MONTH)[monthKey(monthRef)] || {};
    const today = new Date();

    if (label){
      label.textContent = first.toLocaleDateString(locale(), { month: 'long', year: 'numeric' });
    }

    const daysInMonth = new Date(monthRef.getFullYear(), monthRef.getMonth() + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7;
    const cells = Math.ceil((lead + daysInMonth) / 7) * 7;

    if (isCompact()) renderMonthPhone(host, first, data, today, daysInMonth, lead, cells);
    else renderMonthDesktop(host, first, data, today, daysInMonth, lead, cells);

    bumpSwap(host, opts && opts.animate);
  }

  function render(opts){
    opts = opts || {};
    renderWeek(opts);
    renderMonth(opts);
    updateTabsUI();
  }

  function init(){
    weekRef = new Date();
    monthRef = new Date();
    selectedMonthDay = (new Date()).getDate();
    try {
      const saved = localStorage.getItem(K_TAB);
      tab = (saved === 'month') ? 'month' : 'week';
    } catch(e){ tab = 'week'; }

    compactMq = window.matchMedia(COMPACT_MQ);
    const onMq = function(){ render({ animate: false }); };
    if (compactMq.addEventListener) compactMq.addEventListener('change', onMq);
    else if (compactMq.addListener) compactMq.addListener(onMq);

    render({ animate: false });
    const weekHost = document.getElementById('weekGrid');
    const monthHost = document.getElementById('monthGrid');
    if (weekHost && !weekHost.dataset.bound){
      weekHost.dataset.bound = '1';
      weekHost.addEventListener('click', onPlannerClick);
      weekHost.addEventListener('keydown', onPlannerKeydown);
    }
    if (monthHost && !monthHost.dataset.bound){
      monthHost.dataset.bound = '1';
      monthHost.addEventListener('click', onPlannerClick);
      monthHost.addEventListener('keydown', onPlannerKeydown);
    }
    if (window.I18N) I18N.onChange(function(){ render({ animate: false }); });
  }

  return { init:init, render:render, setTab:setTab,
           onWeekInput:onWeekInput, onMonthInput:onMonthInput,
           shiftWeek:shiftWeek, shiftMonth:shiftMonth,
           todayWeek:todayWeek, todayMonth:todayMonth,
           clearWeek:clearWeek, clearMonth:clearMonth,
           setRange:setRange, print:printView };
})();


// ── VIEW SWITCH (focus ⇄ planner ⇄ stats) ─────────────────────
function blurPillTabFocus(){
  const el = document.activeElement;
  if (!el) return;
  if (el.matches('.view-btn, .mode-tab, .switch-btn, .stats-tab, .planner-tab')){
    el.blur();
  }
}

function updateTabIndicator(container){
  if (!container) return;
  const ind = container.querySelector('.tab-indicator');
  const active = container.querySelector('.view-btn.active, .mode-tab.active, .switch-btn.active, .stats-tab.active, .planner-tab.active');
  if (!ind || !active){
    if (ind) ind.style.opacity = '0';
    return;
  }
  const cr = container.getBoundingClientRect();
  const ar = active.getBoundingClientRect();
  if (!cr.width || !ar.width){
    ind.style.opacity = '0';
    return;
  }
  ind.style.width = ar.width + 'px';
  ind.style.height = ar.height + 'px';
  ind.style.transform = 'translate(' + (ar.left - cr.left) + 'px,' + (ar.top - cr.top) + 'px)';
  ind.style.opacity = '1';
}

function updateAllTabIndicators(){
  document.querySelectorAll('.viewswitch, .mode-tabs, .mode-switch, .stats-tabs, .planner-tabs').forEach(updateTabIndicator);
}

function animateModeSwitch(){
  const chronoOn = window.Chrono && Chrono.isActive && Chrono.isActive();
  const el = chronoOn
    ? document.getElementById('chronoDisplay')
    : document.getElementById('timerDisplay');
  if (!el || el.offsetParent === null) return;
  el.classList.remove('mode-switch-bump');
  void el.offsetWidth;
  el.classList.add('mode-switch-bump');
}

function showView(name){
  document.body.classList.toggle('view-planner', name === 'planner');
  document.body.classList.toggle('view-stats', name === 'stats');
  if (name === 'stats' && window.Stats) Stats.onShow();
  if (name === 'planner' && window.Planner && Planner.render) Planner.render({ animate: false });
  document.querySelectorAll('[data-view]').forEach(function(b){
    b.classList.toggle('active', b.getAttribute('data-view') === name);
  });
  try { localStorage.setItem('sf_view', name); } catch(e){}
  window.scrollTo(0, 0);
  updateAllTabIndicators();
  blurPillTabFocus();
  requestAnimationFrame(function(){ updateAllTabIndicators(); });
}





// ── CELEBRATION & MICRO-INTERACTIONS ──────────────────────────
function prefersReducedMotion(){
  return false;
}

function burstConfetti(origin){
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
  if (!el) return;
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
    console.error('Supabase library did not load - check the CDN <script> tag in index.html.');
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
      : 'not signed in (fine - sign in to test the board)';
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
// the class. otherwise their state would drift from the DOM and the next
// click on their button would need pressing twice.
function closeAllPanels(){
  if (typeof closeDockPopovers === 'function') closeDockPopovers();
}

// Where the click started has to be recorded in the CAPTURE phase, before
// any inline onclick runs. A control inside a panel often re-renders that
// panel's innerHTML, which detaches the clicked node. and closest() on a
// detached node returns null, so a bubble-phase check would conclude the
// click came from outside and close the very panel being used.
let clickOrigin = null;
document.addEventListener('click', function(e){
  const el = e.target;
  clickOrigin = (el && el.closest) ? {
    inPanel: !!(el.closest('.popover') || el.closest('.study-path-gate')),
    onDock:  !!el.closest('.dock-btn'),
    onLang:  !!el.closest('.lang-toggle'),
    opensPanel: !!el.closest('.study-mini-btn')
  } : null;
}, true);

document.addEventListener('click', function(){
  // Inside a popover, or on the control that opens one. those manage
  // themselves. The language pills are exempt so switching language does
  // not shut the panel you are reading.
  if (clickOrigin && (clickOrigin.inPanel || clickOrigin.onDock || clickOrigin.onLang || clickOrigin.opensPanel)) return;
  closeAllPanels();
});

// Escape is the other half of the same expectation.
document.addEventListener('keydown', function(e){
  if (e.key === 'Escape') closeAllPanels();
});


// ── SHEET CLOSE AFFORDANCE ────────────────────────────────────
// On phones a popover becomes a bottom sheet that covers the dock, so the
// icon that opened it is no longer tappable. Tapping outside works, but
// nothing says so. every panel gets an explicit close control instead.
// Injected once here rather than repeated six times in the markup.
(function addPopoverCloseButtons(){
  document.querySelectorAll('.popover').forEach(function(panel){
    if (!panel.querySelector('.popover-sheet-handle')) {
      const handle = document.createElement('div');
      handle.className = 'popover-sheet-handle';
      handle.setAttribute('role', 'presentation');
      handle.innerHTML = '<span class="popover-sheet-grab" aria-hidden="true"></span>';
      panel.insertBefore(handle, panel.firstChild);
    }
    wrapPopoverSheetHead(panel);
    if (!panel.querySelector('.popover-close')) {
      const btn = document.createElement('button');
      btn.className = 'popover-close';
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Close');
      btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
      btn.addEventListener('click', function(e){
        e.stopPropagation();
        closeAllPanels();
      });
      const head = panel.querySelector('.popover-sheet-head');
      if (head) panel.insertBefore(btn, head.nextSibling);
      else panel.insertBefore(btn, panel.firstChild);
    }
  });
})();

function wrapPopoverSheetHead(panel){
  if (panel.querySelector('.popover-sheet-head')) return;
  const handle = panel.querySelector('.popover-sheet-handle');
  if (!handle) return;

  const head = document.createElement('div');
  head.className = 'popover-sheet-head';
  panel.insertBefore(head, handle);
  head.appendChild(handle);

  const directTitle = panel.querySelector(':scope > .popover-title');
  if (directTitle) head.appendChild(directTitle);
}

// Drag the sheet handle down to dismiss (mobile bottom sheets only).
(function initSheetDragDismiss(){
  const SHEET_MQ = window.matchMedia('(max-width: 960px)');
  let drag = null;
  let dragDismissed = false;

  function sheetMode(){ return SHEET_MQ.matches; }

  function clearPanelDragStyle(panel){
    if (!panel) return;
    panel.classList.remove('sheet-dragging');
    panel.style.transition = '';
    panel.style.transform = '';
  }

  function finishDrag(panel, dy){
    const threshold = Math.min(130, panel.offsetHeight * 0.2);
    if (dy > threshold) {
      dragDismissed = true;
      panel.style.transition = 'transform .24s cubic-bezier(.4, 0, .2, 1)';
      panel.style.transform = 'translateY(100%)';
      window.setTimeout(function(){
        closeAllPanels();
        clearPanelDragStyle(panel);
        dragDismissed = false;
      }, 240);
      return;
    }
    panel.style.transition = 'transform .22s cubic-bezier(.4, 0, .2, 1)';
    panel.style.transform = '';
    window.setTimeout(function(){ clearPanelDragStyle(panel); }, 220);
  }

  document.addEventListener('pointerdown', function(e){
    if (!sheetMode()) return;
    if (e.target.closest('.popover-close, button, input, select, textarea, a, label')) return;

    const head = e.target.closest('.popover-sheet-head');
    const panel = head
      ? head.closest('.popover')
      : e.target.closest('.popover.open');

    if (!panel || !panel.classList.contains('open')) return;

    if (!head) {
      const rect = panel.getBoundingClientRect();
      if (e.clientY - rect.top > 88) return;
    }

    drag = {
      panel: panel,
      startY: e.clientY,
      pointerId: e.pointerId,
      captureEl: head || panel
    };
    panel.classList.add('sheet-dragging');
    drag.captureEl.setPointerCapture(e.pointerId);
    e.preventDefault();
  }, { passive: false });

  document.addEventListener('pointermove', function(e){
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dy = Math.max(0, e.clientY - drag.startY);
    drag.panel.style.transform = 'translateY(' + dy + 'px)';
  });

  function endDrag(e){
    if (!drag || e.pointerId !== drag.pointerId) return;
    const panel = drag.panel;
    const captureEl = drag.captureEl;
    const dy = Math.max(0, e.clientY - drag.startY);
    drag = null;
    try { captureEl.releasePointerCapture(e.pointerId); } catch(err){}
    finishDrag(panel, dy);
  }

  document.addEventListener('pointerup', endDrag);
  document.addEventListener('pointercancel', endDrag);

  // Ignore the click that follows a drag-dismiss so we do not double-close.
  document.addEventListener('click', function(e){
    if (!dragDismissed) return;
    e.stopPropagation();
    e.preventDefault();
  }, true);
})();


// ── STATS ─────────────────────────────────────────────────────
// The local log already holds ~120 days; until now only today and this
// week were ever shown. Single series (minutes), so one accent hue rather
// than a categorical palette. which also means it re-tints per theme
// instead of fighting four of them.
window.Stats = (function(){
  const K_TAB = 'sf_stats_tab';
  let range = 'week';   // week | month | all
  let tab = 'study';    // study | board
  let boardPage = 1;

  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'})[c]; }); }

  function readTab(){
    try {
      const v = localStorage.getItem(K_TAB);
      if (v === 'board' || v === 'study') return v;
    } catch(e){}
    return 'study';
  }

  function clampBoardPage(){
    if (window.Study && Study.boardPageCount){
      const max = Study.boardPageCount();
      if (boardPage > max) boardPage = max;
      if (boardPage < 1) boardPage = 1;
    }
  }

  function setTab(next){
    const prev = tab;
    tab = (next === 'board') ? 'board' : 'study';
    try { localStorage.setItem(K_TAB, tab); } catch(e){}
    updateTabsUI();
    if (typeof blurPillTabFocus === 'function') blurPillTabFocus();
    if (prev === tab) return;
    if (tab === 'board'){
      boardPage = 1;
      if (window.Study && Study.loadBoard) Study.loadBoard();
      else renderContent();
    } else {
      renderContent();
    }
  }

  function setBoardPage(p){
    boardPage = Math.max(1, p);
    clampBoardPage();
    renderContent();
  }

  function openLeaderboard(){
    if (tab !== 'board') setTab('board');
    else renderContent();
    if (typeof showView === 'function') showView('stats');
  }

  function onShow(){
    updateTabsUI();
    if (tab === 'board' && window.Study && Study.loadBoard) Study.loadBoard();
    else renderContent();
  }

  function updateTabsUI(){
    const tabs = document.querySelector('.stats-tabs');
    if (!tabs) return;
    tabs.querySelectorAll('.stats-tab').forEach(function(btn){
      const key = btn.getAttribute('data-stats-tab');
      const active = (key === 'board') ? tab === 'board' : tab === 'study';
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    updateTabIndicator(tabs);
  }

  function locale(){ return window.I18N && I18N.current() === 'fr' ? 'fr-FR' : 'en-GB'; }
  function fmt(m){ return window.Study ? Study.fmt(m) : m + 'm'; }
  function entries(){ return window.Study ? Study.entries() : []; }

  function dayKey(d){
    return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  }

  // minutes per calendar day, oldest first
  function daily(days){
    const byDay = {};
    entries().forEach(function(e){
      if (!e || !e.t) return;
      byDay[dayKey(new Date(e.t))] = (byDay[dayKey(new Date(e.t))] || 0) + e.m;
    });
    const out = [];
    for (let i = days - 1; i >= 0; i--){
      const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - i);
      out.push({ date: d, key: dayKey(d), minutes: byDay[dayKey(d)] || 0 });
    }
    return out;
  }

  // Consecutive days with any logged time, counting back from today. Today
  // not being started yet must not break a run, so an empty today is
  // skipped rather than ending it.
  function streak(){
    const has = {};
    entries().forEach(function(e){ if (e && e.t) has[dayKey(new Date(e.t))] = 1; });
    const d = new Date(); d.setHours(0,0,0,0);
    if (!has[dayKey(d)]) d.setDate(d.getDate() - 1);
    let n = 0;
    while (has[dayKey(d)]){ n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  function rangeStart(){
    const d = new Date(); d.setHours(0,0,0,0);
    if (range === 'week')  { d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }
    if (range === 'month') { d.setDate(1); return d.getTime(); }
    return 0;
  }

  function setRange(r){ range = r; render(); }

  function statTiles(){
    const week = window.Study ? Study.sumSince((function(){
      const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - ((d.getDay()+6)%7)); return d.getTime();
    })()) : 0;

    const last14 = daily(14);
    const active = last14.filter(function(x){ return x.minutes > 0; });
    const avg = active.length ? Math.round(active.reduce(function(a,x){ return a + x.minutes; }, 0) / active.length) : 0;
    const best = last14.reduce(function(a,x){ return x.minutes > a ? x.minutes : a; }, 0);

    return '<div class="st-tiles">' +
      tile(fmt(week), t('stats.thisWeek')) +
      tile(fmt(avg),  t('stats.avgDay')) +
      tile(streak() + '', t('stats.streak'), true) +
      tile(fmt(best), t('stats.best')) +
    '</div>';
  }
  function tile(value, label, isCount){
    return '<div class="st-tile"><span class="st-value">' + esc(value) +
           (isCount ? '<span class="st-unit">' + esc(t('stats.days')) + '</span>' : '') +
           '</span><span class="st-label">' + esc(label) + '</span></div>';
  }

  // Bars: thin marks, rounded data-end at the top, flat on the baseline,
  // 2px gap between them. Weekends and today are marked in the axis, not by
  // recolouring the bar. colour stays magnitude-only.
  function dailyChart(){
    const data = daily(14);
    const max = Math.max.apply(null, data.map(function(x){ return x.minutes; }).concat([1]));
    const todayKey = dayKey(new Date());

    const bars = data.map(function(x){
      const pct = x.minutes ? Math.max(3, Math.round(x.minutes / max * 100)) : 0;
      const label = x.date.toLocaleDateString(locale(), { weekday:'long', day:'numeric', month:'long' });
      return '<div class="st-col' + (x.key === todayKey ? ' is-today' : '') + '" tabindex="0" ' +
               'role="img" aria-label="' + esc(label + ': ' + fmt(x.minutes)) + '">' +
               '<div class="st-bar-track">' +
                 (x.minutes ? '<div class="st-bar" style="height:' + pct + '%"></div>'
                            : '<div class="st-bar is-empty"></div>') +
               '</div>' +
               '<span class="st-tick">' + esc(x.date.toLocaleDateString(locale(), { weekday:'narrow' })) + '</span>' +
               '<span class="st-tip">' + esc(label) + '<b>' + esc(fmt(x.minutes)) + '</b></span>' +
             '</div>';
    }).join('');

    return '<div class="st-section"><div class="st-section-head">' +
             '<h3 class="st-title">' + esc(t('stats.last14')) + '</h3>' +
             '<span class="st-max">' + esc(t('stats.peak', { time: fmt(max) })) + '</span>' +
           '</div><div class="st-chart">' + bars + '</div></div>';
  }

  function subjectChart(){ return ''; }

  function renderContent(){
    const host = document.getElementById('statsBody');
    if (!host) return;
    clampBoardPage();
    if (tab === 'study'){
      host.innerHTML = statTiles() + dailyChart();
    } else if (window.Study && Study.renderLeaderboardPage){
      host.innerHTML = Study.renderLeaderboardPage(boardPage);
    } else {
      host.innerHTML = '';
    }
  }

  function render(){
    updateTabsUI();
    renderContent();
  }

  function init(){
    tab = readTab();
    updateTabsUI();
    renderContent();
    if (tab === 'board' && window.Study && Study.loadBoard) Study.loadBoard();
    if (window.I18N) I18N.onChange(function(){ updateTabsUI(); renderContent(); });
  }

  return { init:init, render:render, renderContent:renderContent, onShow:onShow, setRange:setRange,
           setTab:setTab, setBoardPage:setBoardPage, openLeaderboard:openLeaderboard,
           streak:streak, daily:daily };
})();


// ── BOOTSTRAP ─────────────────────────────────────────────────
// Everything modular is started here, and this block MUST stay last in the
// file: each module is a `window.X = (function(){...})()` assignment, which
// only exists once execution reaches it. Calling init() on a module defined
// below this point throws and silently kills the rest of the startup.
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
Stats.init();

// Anything the modules rendered during init still needs translating.
I18N.apply();

(function(){
  const saved = localStorage.getItem('sf_view');
  showView(saved === 'planner' || saved === 'stats' ? saved : 'focus');
  requestAnimationFrame(updateAllTabIndicators);
})();
window.addEventListener('resize', function(){
  clearTimeout(window._tabIndTO);
  window._tabIndTO = setTimeout(updateAllTabIndicators, 100);
});
if (window.I18N) I18N.onChange(function(){
  updateClock();
  requestAnimationFrame(updateAllTabIndicators);
});
