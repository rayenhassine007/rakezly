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
document.addEventListener('click', (e) => {
  if (settingsPanelOpen &&
      !e.target.closest('#settingsSlidePanel') &&
      !e.target.closest('.btn-settings-fixed')) {
    settingsPanelOpen = false;
    document.getElementById('settingsSlidePanel').classList.remove('open');
    document.getElementById('settingsFixedBtn').classList.remove('active');
  }
});

// ── RESET STATS ───────────────────────────────────────────────
function resetStats() {
  completedPomodoros = 0; totalFocusMins = 0; streak = 0;
  localStorage.setItem('sf_streak', '0');
  updateStats();
  showToast('// session stats reset');
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
  await Promise.all(['cyber', 'lofi', 'greens', 'cherry-blues'].map(t => loadBgForTheme(t)));
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
    cyber: '// cyber bg',
    lofi: '✿ lofi bg',
    greens: '⬡ greens bg',
    'cherry-blues': '✦ cherry blues bg'
  };
  if (badge) badge.textContent = (names[theme] || '// theme bg') + ' — assigned to this theme';
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
    document.getElementById('uploadText').textContent = 'click to upload video, image, or html';
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

// Close panel when clicking outside
document.addEventListener('click', (e) => {
  if (bgPanelOpen &&
      !e.target.closest('#bgPanel') &&
      !e.target.closest('.btn-bg-toggle')) {
    bgPanelOpen = false;
    document.getElementById('bgPanel').classList.remove('open');
    document.querySelector('.btn-bg-toggle').classList.remove('active');
  }
  // close theme panel when clicking outside
  const themePanel = document.getElementById('themePanel');
  if (themePanel.classList.contains('open') &&
      !e.target.closest('#themePanel') &&
      !e.target.closest('.btn-theme-fixed')) {
    themePanel.classList.remove('open');
    document.getElementById('themeFixedBtn').classList.remove('active');
  }
});


function themeLabel(theme) {
  return ({
    cyber: '// cyber',
    lofi: '✿ lofi',
    greens: '⬡ greens',
    'cherry-blues': '✦ cherry blues'
  })[theme] || '// theme';
}

async function loadMedia(event) {
  const file = event.target.files[0];
  if (!file) return;
  // saveBgForTheme also clears the old URL cache for this theme
  await saveBgForTheme(currentTheme, file);
  // applyBgFromRecord will create and cache a fresh URL
  applyBgFromRecord(_bgCache[currentTheme], currentTheme);
  showToast('// bg saved for ' + themeLabel(currentTheme));
}

function setDim(v) {
  document.getElementById('bgOverlay').style.background = `rgba(13,10,20,${v/100})`;
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
  showToast('// bg cleared for ' + themeLabel(currentTheme));
}

function setGlassOpac(v) {
  const alpha = (v / 100).toFixed(2);

  const baseColor = currentTheme === 'cherry-blues' ? '9, 18, 42' :
                    currentTheme === 'greens'       ? '5, 20, 8' :
                    currentTheme === 'lofi'         ? '30, 15, 35' :
                    currentTheme === 'edo-gold'     ? '18, 11, 2' :
                    currentTheme === 'moonlight'    ? '8, 8, 8' :
                                                       '20, 10, 35';

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
                      currentTheme === 'lofi'         ? '249, 168, 212' :
                      currentTheme === 'edo-gold'     ? '232, 197, 106' :
                      currentTheme === 'moonlight'    ? '220, 220, 220' :
                                                         '192, 132, 252';

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
let completedPomodoros=0, totalFocusMins=0;
let streak = parseInt(localStorage.getItem('sf_streak')||'0');

// ── SESSION PERSISTENCE ───────────────────────────────────────
// How long before a closed session expires and resets (ms). Default: 1 hour.
const SESSION_EXPIRY_MS = 31 * 60 * 1000;

function saveTimerState() {
  localStorage.setItem('sf_ts', JSON.stringify({
    mode, totalSecs, remainSecs,
    running,
    cycleIndex,
    completedPomodoros,
    totalFocusMins,
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
    completedPomodoros = s.completedPomodoros || 0;
    totalFocusMins     = s.totalFocusMins || 0;
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
  showToast('// settings applied'); toggleSettings();
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
  btn.textContent='Start';
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
function startTimer(){
  running=true;
  const btn=document.getElementById('startBtn');
  btn.textContent='Pause'; btn.classList.add('running');
  document.getElementById('timerDisplay').classList.remove('blink');
  saveTimerState(); // capture running=true + savedAt timestamp immediately
  ticker=setInterval(()=>{remainSecs--;updateDisplay();updateBar();saveTimerState();if(remainSecs<=0){clearInterval(ticker);onDone();}},1000);
  if(window.Room)Room.onLocalChange();
}
function pauseTimer(){
  running=false; clearInterval(ticker);
  const btn=document.getElementById('startBtn');
  btn.textContent='Resume'; btn.classList.remove('running');
  document.getElementById('timerDisplay').classList.add('blink');
  saveTimerState();
  if(window.Room)Room.onLocalChange();
}
function stopTimer(){
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
    completedPomodoros++;
    // count partial minutes (at least 1 if any time passed)
    const minsPassed = Math.max(0, Math.floor((totalSecs - remainSecs) / 60));
    totalFocusMins += minsPassed;
    streak++; localStorage.setItem('sf_streak', streak);
    updateStats();
  }
  advance();
  if(window.Room)Room.onLocalChange();
}
function onDone(){
  stopTimer();
  if(mode==='work'){
    completedPomodoros++; totalFocusMins+=MODES.work;
    streak++; localStorage.setItem('sf_streak',streak);
    showToast('// pomodoro complete — take a break');
    tryNotify('Pomodoro complete!','Time for a break.');
    playAlarm();
  }else{
    showToast('// break over — back to focus');
    tryNotify('Break over!','Back to work.');
    playAlarm();
  }
  updateStats();
  if(mode==='work' && autoStartBreak) setTimeout(()=>{ advance(); setTimeout(startTimer,400); }, 600);
  else if(mode!=='work' && autoStartWork) setTimeout(()=>{ advance(); setTimeout(startTimer,400); }, 600);
  else advance();
}
function advance(){
  cycleIndex++;
  if(cycleIndex>=seq.length){cycleIndex=0;showToast('// full round complete — restarting');}
  const next=seq[cycleIndex]; setTab(next.type); initTimer(next.type); renderCycles();
  saveTimerState();
}
function setTab(m){m=m==='brk'?'break':m==='lng'?'long':m;document.querySelectorAll('.mode-tab').forEach((t,i)=>t.classList.toggle('active',['work','break','long'][i]===m));}
function switchMode(m){stopTimer();setTab(m);initTimer(m);renderCycles();saveTimerState();if(window.Room)Room.onLocalChange();}
function updateStats(){
  document.getElementById('s1').textContent=completedPomodoros;
  document.getElementById('s2').textContent=totalFocusMins+'m';
  document.getElementById('s3').textContent=streak;
}

// ── LAST.FM ───────────────────────────────────────────────────
const LFM_API = 'https://ws.audioscrobbler.com/2.0/';
// Public API key — read-only, safe to embed for now-playing lookups
const LFM_KEY = ''; // user must provide their own free key
let lfmUser = null, lfmPoll = null, lfmUserKey = null;
let lfmCurrentTrackKey = null, lfmTrackStartTime = null, lfmTrackDuration = null, lfmProgressTicker = null;

function handleLFM() {
  if (lfmUser) {
    lfmUser = null; lfmUserKey = null;
    clearInterval(lfmPoll);
    clearInterval(lfmProgressTicker); lfmProgressTicker = null;
    lfmCurrentTrackKey = null; lfmTrackStartTime = null; lfmTrackDuration = null;
    localStorage.removeItem('sf_lfm_user');
    localStorage.removeItem('sf_lfm_key');
    document.getElementById('lfmDot').className = 'lfm-dot';
    document.getElementById('lfmBtn').textContent = 'Connect';
    document.getElementById('lfmBtn').className = 'btn-lfm';
    document.getElementById('lfmNowPlaying').classList.remove('vis');
    document.getElementById('lfmIdle').style.display = '';
    document.getElementById('lfmIdle').textContent = '// enter your Last.fm username to see what\'s playing';
    return;
  }
  const apiKey = prompt(
    'Last.fm API Key (free):\n\n' +
    '1. Go to https://www.last.fm/api/account/create\n' +
    '2. Create an app (any name), copy the API key\n' +
    '3. Paste it here:'
  );
  if (!apiKey || apiKey.trim().length < 10) { showToast('// invalid api key'); return; }
  const user = prompt('Your Last.fm username:');
  if (!user || !user.trim()) { showToast('// no username entered'); return; }
  lfmUserKey = apiKey.trim();
  lfmUser = user.trim();
  localStorage.setItem('sf_lfm_user', lfmUser);
  localStorage.setItem('sf_lfm_key', lfmUserKey);
  onLFMOn();
}

function onLFMOn() {
  document.getElementById('lfmDot').className = 'lfm-dot on';
  document.getElementById('lfmBtn').textContent = 'Disconnect';
  document.getElementById('lfmBtn').className = 'btn-lfm dc';
  showToast('// last.fm connected as @' + lfmUser);
  fetchLFM();
  lfmPoll = setInterval(fetchLFM, 10000);
}

function fmtSecs(s) {
  s = Math.max(0, Math.floor(s));
  return Math.floor(s / 60) + ':' + (s % 60).toString().padStart(2, '0');
}

async function fetchLFM() {
  if (!lfmUser || !lfmUserKey) return;
  try {
    const url = `${LFM_API}?method=user.getrecenttracks&user=${encodeURIComponent(lfmUser)}&api_key=${lfmUserKey}&format=json&limit=1`;
    const r = await fetch(url);
    if (!r.ok) { showToast('// last.fm fetch error'); return; }
    const d = await r.json();
    if (d.error) { showToast('// last.fm: ' + d.message); return; }
    const tracks = d.recenttracks?.track;
    if (!tracks || tracks.length === 0) {
      document.getElementById('lfmNowPlaying').classList.remove('vis');
      document.getElementById('lfmIdle').style.display = '';
      document.getElementById('lfmIdle').textContent = '// nothing scrobbled recently';
      return;
    }
    const track = Array.isArray(tracks) ? tracks[0] : tracks;
    const isNow = track['@attr']?.nowplaying === 'true';
    document.getElementById('lfmNowPlaying').classList.add('vis');
    document.getElementById('lfmIdle').style.display = 'none';
    document.getElementById('lfmTrackName').textContent = track.name || '—';
    document.getElementById('lfmTrackArtist').textContent = track.artist?.['#text'] || track.artist || '—';
    document.getElementById('lfmSourceBadge').textContent = isNow ? '▶ now playing' : '◷ last played';
    // Album art — try to get largest image
    const imgs = track.image;
    const art = imgs ? (imgs[2]?.['#text'] || imgs[1]?.['#text'] || imgs[0]?.['#text'] || '') : '';
    if (art) { document.getElementById('lfmAlbumArt').src = art; }
    // Progress bar — use elapsed time vs track duration
    const fill = document.getElementById('lfmTrackFill');
    const trackKey = (track.name || '') + '|' + (track.artist?.['#text'] || '');

    if (!isNow) {
      // Not currently playing — static full bar
      clearInterval(lfmProgressTicker); lfmProgressTicker = null;
      fill.style.animation = 'none';
      fill.style.transition = 'none';
      fill.style.width = '100%';
      document.getElementById('lfmElapsed').textContent = '';
      document.getElementById('lfmDuration').textContent = '';
    } else {
      // New song detected — fetch its duration and reset
      if (trackKey !== lfmCurrentTrackKey) {
        lfmCurrentTrackKey = trackKey;
        lfmTrackStartTime = Date.now();
        lfmTrackDuration = null;
        clearInterval(lfmProgressTicker); lfmProgressTicker = null;
        document.getElementById('lfmElapsed').textContent = '0:00';
        document.getElementById('lfmDuration').textContent = '—';

        // Fetch real duration via track.getInfo
        const artist = encodeURIComponent(track.artist?.['#text'] || track.artist || '');
        const tname  = encodeURIComponent(track.name || '');
        fetch(`${LFM_API}?method=track.getInfo&artist=${artist}&track=${tname}&api_key=${lfmUserKey}&format=json`)
          .then(r => r.json())
          .then(info => {
            const dur = parseInt(info?.track?.duration);
            if (dur > 0) {
              lfmTrackDuration = dur / 1000;
              document.getElementById('lfmDuration').textContent = fmtSecs(lfmTrackDuration);
            }
          })
          .catch(() => {});
      }

      // Animate bar every second based on elapsed time
      const tickBar = () => {
        const elapsed = (Date.now() - lfmTrackStartTime) / 1000;
        document.getElementById('lfmElapsed').textContent = fmtSecs(elapsed);
        if (lfmTrackDuration && lfmTrackDuration > 0) {
          const pct = Math.min(elapsed / lfmTrackDuration * 100, 100);
          fill.style.animation = 'none';
          fill.style.transition = 'width 1s linear';
          fill.style.width = pct + '%';
          if (pct >= 100) { clearInterval(lfmProgressTicker); lfmProgressTicker = null; }
        } else {
          // Duration not yet loaded — show pulsing partial bar
          fill.style.transition = 'none';
          fill.style.width = '60%';
          fill.style.animation = 'lfmPulse 1.5s ease-in-out infinite alternate';
        }
      };

      if (!lfmProgressTicker) {
        tickBar(); // run immediately
        lfmProgressTicker = setInterval(tickBar, 1000);
      }
    }
  } catch(e) { console.warn('lfm error', e); }
}

// ── MUSIC TABS ────────────────────────────────────────────────
function switchMusicTab(tab) {
  document.getElementById('panelSpotify').style.display = tab === 'spotify' ? '' : 'none';
  document.getElementById('panelLastfm').style.display  = tab === 'lastfm'  ? '' : 'none';
  document.getElementById('tabSpotify').classList.toggle('active', tab === 'spotify');
  document.getElementById('tabLastfm').classList.toggle('active',  tab === 'lastfm');
}

// ── API SETTINGS (hidden, unlock by clicking "// Spotify" 5×) ─
const SP_DEFAULTS = {
  npUrl:    'https://api.spotify.com/v1/me/player/currently-playing',
  tokenUrl: 'https://accounts.spotify.com/api/token',
  authUrl:  'https://accounts.spotify.com/authorize',
  scopes:   'user-read-currently-playing user-read-playback-state'
};
function getApiCfg(key) {
  return localStorage.getItem('sf_api_' + key) || SP_DEFAULTS[key];
}
let spBtnClicks = 0, spBtnTO = null;
function spTabClick() {
  spBtnClicks++;
  clearTimeout(spBtnTO);
  spBtnTO = setTimeout(() => { spBtnClicks = 0; }, 2000);
  if (spBtnClicks >= 5) {
    spBtnClicks = 0;
    const panel = document.getElementById('apiSettingsPanel');
    const isOpen = panel.classList.contains('open');
    if (!isOpen) document.getElementById('apiClientId').value = localStorage.getItem('sf_cid') || '';
    panel.classList.toggle('open', !isOpen);
    showToast(isOpen ? '// hidden' : '// client id ⚙');
  }
}
let lfmTabClicks = 0, lfmTabTO = null;
function lfmTabClick() {
  lfmTabClicks++;
  clearTimeout(lfmTabTO);
  lfmTabTO = setTimeout(() => { lfmTabClicks = 0; }, 2000);
  if (lfmTabClicks >= 5) {
    lfmTabClicks = 0;
    const panel = document.getElementById('lfmApiPanel');
    const isOpen = panel.classList.contains('open');
    if (!isOpen) {
      document.getElementById('lfmApiKey').value  = localStorage.getItem('sf_lfm_key') || '';
      document.getElementById('lfmApiUser').value = localStorage.getItem('sf_lfm_user') || '';
    }
    panel.classList.toggle('open', !isOpen);
    showToast(isOpen ? '// hidden' : '// last.fm settings ⚙');
  }
}
function saveLfmSettings() {
  const key  = document.getElementById('lfmApiKey').value.trim();
  const user = document.getElementById('lfmApiUser').value.trim();
  if (!key)  { showToast('// api key cannot be empty'); return; }
  if (!user) { showToast('// username cannot be empty'); return; }
  localStorage.setItem('sf_lfm_key', key);
  localStorage.setItem('sf_lfm_user', user);
  lfmUserKey = key;
  lfmUser = user;
  document.getElementById('lfmApiPanel').classList.remove('open');
  showToast('// last.fm settings saved ✓');
  onLFMOn();
}
function saveApiSettings() {
  const cid = document.getElementById('apiClientId').value.trim();
  if (!cid) { showToast('// client id cannot be empty'); return; }
  localStorage.setItem('sf_cid', cid);
  document.getElementById('apiSettingsPanel').classList.remove('open');
  showToast('// client id saved ✓');
}

// ── SPOTIFY ──────────────────────────────────────────────────
const REDIR='https://rakezly.vercel.app';
let spToken=null,spRefresh=null,spPoll=null;
let spCurrentTrackKey=null, spTrackStartTime=null, spTrackDuration=null, spProgressTicker=null, spIsPlaying=false;
function gv(n=128){const c='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';const a=new Uint8Array(n);crypto.getRandomValues(a);return[...a].map(b=>c[b%c.length]).join('');}
async function gc(v){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v));return btoa(String.fromCharCode(...new Uint8Array(d))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');}
async function handleSP(){
  if(spToken){
    // Disconnect: clear token but keep refresh token and client id so reconnect is seamless
    spToken=null; clearInterval(spPoll); spPoll=null; clearInterval(spProgressTicker); spProgressTicker=null;
    spCurrentTrackKey=null; spTrackStartTime=null; spTrackDuration=null; spIsPlaying=false;
    document.getElementById('spDot').className='spotify-dot';
    document.getElementById('spBtn').textContent='Connect';
    document.getElementById('spBtn').className='btn-sp';
    document.getElementById('nowPlaying').classList.remove('vis');
    document.getElementById('spIdle').style.display='';
    document.getElementById('trackFill').style.width='0%';
    document.getElementById('tPos').textContent='0:00';
    document.getElementById('tDur').textContent='0:00';
    localStorage.removeItem('sf_sp');
    return;
  }
  // If we already have a refresh token saved, silently get a new access token — no redirect, no page reset
  const savedRefresh = spRefresh || localStorage.getItem('sf_spr');
  const savedCid = localStorage.getItem('sf_cid');
  if(savedRefresh && savedCid){
    showToast('// reconnecting spotify...');
    const ok = await refSP();
    if(spToken){ onSpOn(); return; }
    // Refresh failed — fall through to full OAuth below
  }
  const cid=prompt('Spotify Client ID\n\n1. developer.spotify.com/dashboard\n2. Create app\n3. Add Redirect URI:\n'+REDIR+'\n4. Paste Client ID:');
  if(!cid||cid.trim().length<10){showToast('// invalid client id');return;}
  const c=cid.trim();sessionStorage.setItem('sf_cid',c);localStorage.setItem('sf_cid',c);
  const v=gv();sessionStorage.setItem('sf_v',v);
  const p=new URLSearchParams({response_type:'code',client_id:c,scope:getApiCfg('scopes'),redirect_uri:REDIR,code_challenge_method:'S256',code_challenge:await gc(v)});
  window.location.href=getApiCfg('authUrl')+'?'+p;
}
async function exToken(code){
  const v=sessionStorage.getItem('sf_v'),c=sessionStorage.getItem('sf_cid');if(!v||!c)return;
  const r=await fetch(getApiCfg('tokenUrl'),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:REDIR,client_id:c,code_verifier:v})});
  const d=await r.json();
  if(d.access_token){spToken=d.access_token;localStorage.setItem('sf_sp',d.access_token);if(d.refresh_token){spRefresh=d.refresh_token;localStorage.setItem('sf_spr',d.refresh_token);localStorage.setItem('sf_cid',c);}onSpOn();window.history.replaceState({},'',REDIR);}
  else showToast('// spotify auth failed: '+(d.error||'unknown'));
}
function onSpOn(){
  document.getElementById('spDot').className='spotify-dot on';
  document.getElementById('spBtn').textContent='Disconnect';
  document.getElementById('spBtn').className='btn-sp dc';
  document.getElementById('lfmIdle').style.display='none';
  document.getElementById('spIdle').style.display='';
  showToast('// spotify connected');fetchNP();spPoll=setInterval(fetchNP,5000);
}
function stopSpotifyProgress(reset=false){
  clearInterval(spProgressTicker); spProgressTicker=null;
  if(reset){
    spCurrentTrackKey=null; spTrackStartTime=null; spTrackDuration=null; spIsPlaying=false;
    document.getElementById('trackFill').style.transition='none';
    document.getElementById('trackFill').style.width='0%';
    document.getElementById('tPos').textContent='0:00';
    document.getElementById('tDur').textContent='0:00';
  }
}
function renderSpotifyProgress(pos, dur, animate=true){
  const safeDur = dur || 1;
  const elapsed = Math.max(0, Math.min(pos || 0, safeDur));
  const pct = Math.min(elapsed / safeDur * 100, 100);
  const fill = document.getElementById('trackFill');
  fill.style.animation = 'none';
  fill.style.transition = animate ? 'width 1s linear' : 'none';
  fill.style.width = pct + '%';
  document.getElementById('tPos').textContent = ms2t(elapsed);
  document.getElementById('tDur').textContent = ms2t(safeDur);
}
function tickSpotifyProgress(){
  if(!spIsPlaying || !spTrackStartTime || !spTrackDuration) return;
  const elapsed = Math.min(Date.now() - spTrackStartTime, spTrackDuration);
  renderSpotifyProgress(elapsed, spTrackDuration, true);
  if(elapsed >= spTrackDuration) stopSpotifyProgress(false);
}
async function fetchNP(){
  if(!spToken)return;
  try{
    const r=await fetch(getApiCfg('npUrl'),{headers:{Authorization:'Bearer '+spToken}});
    if(r.status===204){
      stopSpotifyProgress(true);
      document.getElementById('nowPlaying').classList.remove('vis');
      document.getElementById('spIdle').style.display='';
      document.getElementById('spIdle').textContent='// nothing playing right now';
      return;
    }
    if(r.status===401){const ok=await refSP();if(ok)fetchNP();return;}if(!r.ok)return;
    const d=await r.json();if(!d?.item)return;
    document.getElementById('nowPlaying').classList.add('vis');
    document.getElementById('spIdle').style.display='none';
    document.getElementById('trackName').textContent=d.item.name;
    document.getElementById('trackArtist').textContent=d.item.artists.map(a=>a.name).join(', ');
    const art=d.item.album?.images?.[1]?.url||d.item.album?.images?.[0]?.url;
    if(art)document.getElementById('albumArt').src=art;

    const pos=d.progress_ms||0, dur=d.item.duration_ms||1;
    const trackKey = (d.item.id || d.item.uri || d.item.name) + '|' + dur;

    // Spotify sends is_playing=false when the song is paused.
    // In that case, freeze the bar at Spotify's current progress instead of local-ticking.
    if(!d.is_playing){
      spCurrentTrackKey = trackKey;
      spTrackDuration = dur;
      spTrackStartTime = null;
      spIsPlaying = false;
      stopSpotifyProgress(false);
      renderSpotifyProgress(pos, dur, false);
      return;
    }

    // Store the song start time, then animate locally every second like Last.fm.
    if(trackKey !== spCurrentTrackKey || !spIsPlaying || !spTrackStartTime){
      spCurrentTrackKey = trackKey;
      spTrackDuration = dur;
      spTrackStartTime = Date.now() - pos;
      spIsPlaying = true;
      stopSpotifyProgress(false);
      spIsPlaying = true;
      tickSpotifyProgress();
      spProgressTicker = setInterval(tickSpotifyProgress, 1000);
    }else{
      // Re-sync silently on each poll without making the bar jump.
      const expected = Date.now() - spTrackStartTime;
      if(Math.abs(expected - pos) > 2500) spTrackStartTime = Date.now() - pos;
      spIsPlaying = true;
      if(!spProgressTicker) spProgressTicker = setInterval(tickSpotifyProgress, 1000);
      tickSpotifyProgress();
    }
  }catch(e){console.warn(e);}
}
async function refSP(){const rt=spRefresh||localStorage.getItem('sf_spr'),c=localStorage.getItem('sf_cid');if(!rt||!c)return false;try{const r=await fetch(getApiCfg('tokenUrl'),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:rt,client_id:c})});const d=await r.json();if(d.access_token){spToken=d.access_token;localStorage.setItem('sf_sp',d.access_token);if(d.refresh_token){spRefresh=d.refresh_token;localStorage.setItem('sf_spr',d.refresh_token);}return true;}}catch(e){}return false;}
function ms2t(ms){const s=Math.floor(ms/1000);const m=Math.floor(s/60);return m+':'+(s%60).toString().padStart(2,'0');}

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
  if (!embedUrl) { showToast('// unsupported link'); return; }
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
  showToast('// player loaded');
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
  showToast('// player cleared');
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
  if (src === 'youtube') { ytSkipBackward(); showToast('// −10s'); }
  else if (src === 'soundcloud') scPrev();
}
function ctrlNext() {
  const src = getActiveSrc();
  if (src === 'youtube') { ytSkipForward(); showToast('// +10s'); }
  else if (src === 'soundcloud') scNext();
}
function ctrlLeft() {
  const src = getActiveSrc();
  if (src === 'youtube') { ytPrevVideo(); showToast('// prev video'); }
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
  showToast(scShuffleOn ? '// shuffle on' : '// shuffle off');
}
function scToggleRepeat() {
  scRepeatOn = !scRepeatOn;
  document.getElementById('ctrlRepeat').classList.toggle('active', scRepeatOn);
  showToast(scRepeatOn ? '// repeat on' : '// repeat off');
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
  const today=new Date().toDateString(),ld=localStorage.getItem('sf_sd');
  if(ld!==today){localStorage.setItem('sf_sd',today);if(ld!==new Date(Date.now()-86400000).toDateString()){streak=0;localStorage.setItem('sf_streak','0');}}
  // Hide video element initially
  document.getElementById('bgVideo').style.display='none';
  // Preload both theme bgs into memory cache, then apply current theme
  preloadAllBgs().then(() => applyTheme(currentTheme));
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
    btn.textContent = 'Start';
    if (remainSecs <= 0) { clearTimerState(); initTimer(mode); }
    renderCycles();
    updateStats();
    showToast('// session restored ✓');
  } else {
    updateStats(); renderCycles(); initTimer('work');
  }
  // Restore Last.fm
  const lfmU=localStorage.getItem('sf_lfm_user'),lfmK=localStorage.getItem('sf_lfm_key');
  if(lfmU&&lfmK){lfmUser=lfmU;lfmUserKey=lfmK;onLFMOn();}
  // Restore Spotify
  const spCode=new URLSearchParams(window.location.search).get('code');
  if(spCode)exToken(spCode);
  const spSaved=localStorage.getItem('sf_sp');if(spSaved){spToken=spSaved;onSpOn();}
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
  cyber:   'https://res.cloudinary.com/dsmqfgweb/video/upload/v1779360397/cyber_lcuwfu.mp4',
  lofi:    'https://res.cloudinary.com/dsmqfgweb/video/upload/v1779389584/Video_Project_oqt9aw.mp4',
  greens:  'https://res.cloudinary.com/dsmqfgweb/video/upload/v1779365046/river_mmya3j.mp4',
  'cherry-blues': 'https://res.cloudinary.com/dsmqfgweb/video/upload/v1779371239/blues_2_onb2j0.mp4',
  'edo-gold': 'https://res.cloudinary.com/dsmqfgweb/video/upload/v1779476639/sunrays-in-the-japanese-living-room.1920x1080_ikc5ue.mp4',
  moonlight: 'https://res.cloudinary.com/dsmqfgweb/video/upload/v1779706166/1768922296_radpl7.mp4'
};

let currentTheme = localStorage.getItem('sf_theme') || 'cyber';

async function applyTheme(t) {
  currentTheme = t;
  document.body.classList.toggle('theme-lofi',   t === 'lofi');
  document.body.classList.toggle('theme-greens', t === 'greens');
  document.body.classList.toggle('theme-cherry-blues', t === 'cherry-blues');
  document.body.classList.toggle('theme-edo-gold', t === 'edo-gold');
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
  video.src = url;
  video.load();
  video.play().catch(() => {});
  video.oncanplay = () => video.classList.add('ready');
  document.getElementById('uploadText').textContent = 'click to upload video, image, or html';
  document.getElementById('mediaUpload').value = '';
}

function removeDefaultBg() {
  localStorage.setItem('sf_defbg_removed_' + currentTheme, '1');
  // Also clear any cached/saved bg so it doesn't override the removal
  clearBgForTheme(currentTheme);
  applyBgFromRecord(null, currentTheme);
  showToast('// default bg removed');
  updateRemoveDefaultBtnVisibility();
}

function restoreDefaultBg() {
  localStorage.removeItem('sf_defbg_removed_' + currentTheme);
  applyDefaultThemeBg(currentTheme);
  showToast('// default bg restored');
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
  const msgs = { lofi: '✿ lofi theme', cyber: '// cyber theme', greens: '⬡ greens theme', 'cherry-blues': '✦ cherry blues theme', 'edo-gold': '⛩ edo gold theme', moonlight: '☽ moonlight theme' };
  showToast(msgs[t] || '// theme applied');
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
  cyber: `<svg viewBox="0 0 24 26" xmlns="http://www.w3.org/2000/svg">
    <line x1="12" y1="0" x2="12" y2="4" stroke="#c084fc" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="12" cy="0" r="1.8" fill="#c084fc" opacity="0.9"/>
    <rect x="5" y="4" width="14" height="11" rx="2.5" fill="rgba(192,132,252,0.12)" stroke="#c084fc" stroke-width="1.3"/>
    <rect x="7.5" y="7.5" width="3.5" height="3.5" rx="1" fill="#c084fc" class="robot-eye"/>
    <rect x="13" y="7.5" width="3.5" height="3.5" rx="1" fill="#c084fc" class="robot-eye"/>
    <line x1="9.5" y1="14" x2="9.5" y2="15" stroke="#c084fc" stroke-width="1.5"/>
    <rect x="8" y="15" width="8" height="6" rx="1.5" fill="rgba(192,132,252,0.1)" stroke="#c084fc" stroke-width="1.3"/>
    <line x1="9.5" y1="21" x2="8.5" y2="26" stroke="#c084fc" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="14.5" y1="21" x2="15.5" y2="26" stroke="#c084fc" stroke-width="1.5" stroke-linecap="round"/>
    <line x1="4.5" y1="8" x2="5" y2="11" stroke="#c084fc" stroke-width="1.2" stroke-linecap="round" opacity="0.6"/>
    <line x1="19.5" y1="8" x2="19" y2="11" stroke="#c084fc" stroke-width="1.2" stroke-linecap="round" opacity="0.6"/>
  </svg>`,

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
  </svg>`,
  'edo-gold': `<svg viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg">
    <!-- Stem -->
    <line x1="14" y1="26" x2="14" y2="17" stroke="#c8a84b" stroke-width="1.4" stroke-linecap="round"/>
    <!-- Leaves -->
    <path d="M14 22 Q10 20 9 17 Q12 18 14 22Z" fill="rgba(232,197,106,0.35)" stroke="#e8c56a" stroke-width="0.9"/>
    <path d="M14 20 Q18 18 19 15 Q16 17 14 20Z" fill="rgba(232,197,106,0.25)" stroke="#e8c56a" stroke-width="0.9"/>
    <!-- Petals — 8 around center -->
    <ellipse cx="14" cy="7.2" rx="1.6" ry="3.2" fill="#e8c56a" opacity="0.9" transform="rotate(0 14 13)"/>
    <ellipse cx="14" cy="7.2" rx="1.6" ry="3.2" fill="#e8c56a" opacity="0.85" transform="rotate(45 14 13)"/>
    <ellipse cx="14" cy="7.2" rx="1.6" ry="3.2" fill="#e8c56a" opacity="0.9" transform="rotate(90 14 13)"/>
    <ellipse cx="14" cy="7.2" rx="1.6" ry="3.2" fill="#e8c56a" opacity="0.85" transform="rotate(135 14 13)"/>
    <ellipse cx="14" cy="7.2" rx="1.6" ry="3.2" fill="#e8c56a" opacity="0.9" transform="rotate(180 14 13)"/>
    <ellipse cx="14" cy="7.2" rx="1.6" ry="3.2" fill="#e8c56a" opacity="0.85" transform="rotate(225 14 13)"/>
    <ellipse cx="14" cy="7.2" rx="1.6" ry="3.2" fill="#e8c56a" opacity="0.9" transform="rotate(270 14 13)"/>
    <ellipse cx="14" cy="7.2" rx="1.6" ry="3.2" fill="#e8c56a" opacity="0.85" transform="rotate(315 14 13)"/>
    <!-- Center disk -->
    <circle cx="14" cy="13" r="3.8" fill="rgba(90,50,5,0.85)" stroke="#e8c56a" stroke-width="1.1"/>
    <!-- Seed pattern dots -->
    <circle cx="13" cy="12.2" r="0.5" fill="rgba(232,197,106,0.7)"/>
    <circle cx="15" cy="12.2" r="0.5" fill="rgba(232,197,106,0.7)"/>
    <circle cx="14" cy="13.8" r="0.5" fill="rgba(232,197,106,0.7)"/>
    <circle cx="12.3" cy="13.6" r="0.4" fill="rgba(232,197,106,0.5)"/>
    <circle cx="15.7" cy="13.6" r="0.4" fill="rgba(232,197,106,0.5)"/>
  </svg>`
};

function updateAnimalSVG(theme) {
  const animal = document.getElementById('progressAnimal');
  if (!animal) return;
  const svg = THEME_ANIMALS[theme] || THEME_ANIMALS.cyber;
  animal.innerHTML = svg;
}

// ── LIVE CLOCK ─────────────────────────────────────────
function updateClock() {
  const now = new Date();
  let h = now.getHours();
  const m = now.getMinutes();
  const s = now.getSeconds();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  document.getElementById('clockHours').textContent = String(h).padStart(2, '0');
  document.getElementById('clockMins').textContent  = String(m).padStart(2, '0');
  document.getElementById('clockSecs').textContent  = String(s).padStart(2, '0');
  document.getElementById('clockAmpm').textContent  = ampm;
}
updateClock();
setInterval(updateClock, 1000);

// ── API KEY TOOLTIP ────────────────────────────────────────
(function() {
  const tip  = document.getElementById('apiKeyTooltip');
  let timer  = null;

  function show(el) {
    const r = el.getBoundingClientRect();
    tip.style.left = (r.left + r.width / 2) + 'px';
    tip.style.top  = (r.top - 10) + 'px';           /* sits above the tab */
    tip.classList.add('visible');
  }

  function hide() {
    clearTimeout(timer);
    tip.classList.remove('visible');
  }

  ['tabSpotify', 'tabLastfm'].forEach(function(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('mouseenter', function() {
      timer = setTimeout(function() { show(el); }, 350);
    });
    el.addEventListener('mouseleave', hide);
    el.addEventListener('click', hide);           /* hide immediately on click */
  });
})();

init();

// ── SHARED ROOM (Supabase Realtime) ───────────────────────────
// Real-time synced timer. Every local timer action broadcasts a full
// snapshot; receivers apply it (guarded against re-broadcast loops).
// Fully non-blocking: if Supabase is unavailable, the timer keeps working.
window.Room = (function(){
  const SB_URL = 'https://kucqirnkgrtebmowzwlw.supabase.co';
  const SB_KEY = 'sb_publishable_JR6QoT02BlyKUok-EHjPMw_TH-dBT9P';
  const myId = Math.random().toString(36).slice(2, 10);

  let client = null, channel = null, code = null;
  let applying = false, panelOpen = false, status = 'idle', peers = 1;

  function toast(m){ if (typeof showToast === 'function') showToast(m); }

  function sb(){
    if (!client && window.supabase && window.supabase.createClient) {
      client = window.supabase.createClient(SB_URL, SB_KEY, { realtime: { params: { eventsPerSecond: 10 } } });
    }
    return client;
  }

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
        if (b){ b.textContent = (remainSecs >= totalSecs) ? 'Start' : 'Resume'; b.classList.remove('running'); }
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
    if (!cl){ toast('// realtime indisponible'); return; }
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
        setUrl(c); toast('// salon '+c+' rejoint'); updateUI();
      } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT'){
        status = 'error'; updateUI(); toast('// connexion salon échouée');
      }
    });
  }

  function create(){ join(genCode()); }

  function leave(silent){
    if (channel && client){ try { client.removeChannel(channel); } catch(e){} }
    channel = null; code = null; status = 'idle'; peers = 1; clearUrl();
    if (!silent) toast('// salon quitté');
    updateUI();
  }

  function link(c){ return location.origin + '/?room=' + c; }
  function setUrl(c){ try { history.replaceState(null, '', '?room='+c); } catch(e){} }
  function clearUrl(){ try { history.replaceState(null, '', location.pathname); } catch(e){} }

  function copyLink(){
    const url = link(code);
    if (navigator.clipboard){ navigator.clipboard.writeText(url).then(function(){ toast('// lien copié'); }); }
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
        '<div class="room-code-label">code du salon</div>' +
        '<div class="room-code">'+esc(code)+'</div>' +
        '<div class="room-peers"><span class="room-dot"></span>'+peers+' connecté'+(peers>1?'s':'')+'</div>' +
        '<div class="room-linkrow"><input class="room-link" readonly value="'+esc(link(code))+'"><button class="room-btn" onclick="Room.copyLink()">copier</button></div>' +
        '<div class="room-hint">partage le lien ou le code — tout le monde contrôle le timer</div>' +
        '<button class="room-btn room-btn-leave" onclick="Room.leave()">quitter le salon</button>';
    } else {
      const connecting = (status === 'connecting');
      body.innerHTML =
        '<button class="room-btn room-btn-primary" onclick="Room.create()"'+(connecting?' disabled':'')+'>'+(connecting?'connexion…':'créer un salon')+'</button>' +
        '<div class="room-or">ou rejoindre avec un code</div>' +
        '<div class="room-joinrow"><input class="room-input" id="roomJoinInput" placeholder="ex. GABES7" maxlength="8"><button class="room-btn" onclick="Room.joinFromInput()">rejoindre</button></div>' +
        (status === 'error' ? '<div class="room-err">connexion échouée — réessaie</div>' : '');
    }
  }

  function joinFromInput(){
    const el = document.getElementById('roomJoinInput');
    const v = ((el && el.value) || '').trim().toUpperCase();
    if (v.length >= 4) join(v); else toast('// code trop court');
  }

  function togglePanel(){ panelOpen = !panelOpen; updateUI(); }

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

  return { onLocalChange: onLocalChange, create: create, join: join,
           joinFromInput: joinFromInput, leave: leave, copyLink: copyLink,
           togglePanel: togglePanel };
})();
