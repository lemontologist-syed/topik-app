'use strict';
/* TOPIK Daily Five: 5 Korean words a day, one at a time, with games, practice and level exams.
   Everything runs in the browser. Progress lives in localStorage (export a backup from the Me tab). */

const STORE_KEY = 'topik5-v1';
const DAYS_PER_LEVEL = 60;
const PER_DAY = 5;
const EXAM_QUESTIONS = 40;
const PASS_RATE = 0.8;
const RECAP_TIME = '22:30';
const LEVELS = [
  { n: 1, name: 'Level 1', topik: 'TOPIK 1 · starter words', file: 'data/level1.json' },
  { n: 2, name: 'Level 2', topik: 'TOPIK 2 · daily life', file: 'data/level2.json' },
  { n: 3, name: 'Level 3', topik: 'TOPIK 3 · school, work, feelings', file: 'data/level3.json' },
  { n: 4, name: 'Level 4', topik: 'TOPIK 4 · society and opinions', file: 'data/level4.json' },
  { n: 5, name: 'Level 5', topik: 'TOPIK 5 · abstract and academic', file: 'data/level5.json' },
  { n: 6, name: 'Level 6', topik: 'TOPIK 6 · formal and professional', file: 'data/level6.json' },
];
const BACKUP_EVERY_DAYS = 30;
const GAME_TYPES = ['match', 'fill', 'builder', 'listen', 'form'];
const QTYPE_NAMES = {
  match: 'Match', fill: 'Fill the blank', builder: 'Sentence builder', listen: 'Listen and choose',
  form: 'Right form', meaning: 'What does it mean?', reverse: 'Which Korean word?',
};

/* ---------- state ---------- */
let S = null;
const WORDS = {};          // level number -> array of word objects
let view = { name: 'today' };
let session = null;
let lastUnlocked = -1;

function todayStr(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function parseDay(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
function daysBetween(a, b) { return Math.round((parseDay(b) - parseDay(a)) / 86400000); }
function addDays(s, n) { const d = parseDay(s); d.setDate(d.getDate() + n); return todayStr(d); }
function toMin(hhmm) { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0); }
function fmtMin(min) { return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`; }
function niceDate(s) { return parseDay(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }); }

function defaultState() {
  return {
    level: 1, levelStart: todayStr(), passed: [], graduated: false,
    settings: { start: '09:00', end: '23:00', roman: true },
    w: {}, exams: [], streak: { last: null, count: 0 },
    created: todayStr(), lastBackup: null, review: null,
  };
}
function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    S = raw ? Object.assign(defaultState(), JSON.parse(raw)) : defaultState();
  } catch (e) { S = defaultState(); }
  S.settings = Object.assign(defaultState().settings, S.settings || {});
}
function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* storage blocked */ } }

async function loadLevel(n) {
  if (WORDS[n]) return WORDS[n];
  const L = LEVELS.find(l => l.n === n);
  if (!L || !L.file) return (WORDS[n] = []);
  try {
    const res = await fetch(L.file, { cache: 'no-cache' });
    const data = await res.json();
    data.sort((a, b) => a.day - b.day || a.slot - b.slot);
    data.forEach(w => { w.level = n; });
    WORDS[n] = data;
  } catch (e) { WORDS[n] = []; }
  return WORDS[n];
}
function levelWords(n = S.level) { return WORDS[n] || []; }
function byId(id) {
  for (const n in WORDS) { const w = WORDS[n].find(x => x.id === id); if (w) return w; }
  return null;
}
function hasData(n) { const L = LEVELS.find(l => l.n === n); return !!(L && L.file); }
function defaultLevel() { for (let n = S.level; n >= 1; n--) if (hasData(n)) return n; return 1; }

/* ---------- schedule ---------- */
function slotTimes() {
  let s = toMin(S.settings.start), e = toMin(S.settings.end);
  if (!(e > s)) { s = 9 * 60; e = 23 * 60; }
  const step = (e - s) / PER_DAY;
  return Array.from({ length: PER_DAY }, (_, i) => Math.round(s + i * step));
}
function schedule(now = new Date()) {
  const words = levelWords();
  const total = words.length;
  const dayIdx = Math.max(0, daysBetween(S.levelStart, todayStr(now)));
  const mins = now.getHours() * 60 + now.getMinutes();
  const times = slotTimes();
  const inDelivery = dayIdx < DAYS_PER_LEVEL;
  const arrivedToday = inDelivery ? times.filter(t => mins >= t).length : PER_DAY;
  const unlocked = inDelivery ? Math.min(total, dayIdx * PER_DAY + arrivedToday) : total;
  const nextIdx = inDelivery ? times.findIndex(t => mins < t) : -1;
  return {
    total, dayIdx, day: Math.min(dayIdx + 1, DAYS_PER_LEVEL), times, mins, inDelivery, arrivedToday, unlocked, nextIdx,
    examOpen: !inDelivery, examDate: addDays(S.levelStart, DAYS_PER_LEVEL),
  };
}
function unlockedWords(n = S.level) {
  if (S.graduated || n < S.level) return levelWords(n);
  return levelWords(n).slice(0, schedule().unlocked);
}
function allWords() { return LEVELS.flatMap(l => levelWords(l.n)); }

/* After Level 6: 5 review words a day forever, weakest and longest-unseen first. */
function reviewToday() {
  const t = todayStr();
  if (!S.review || S.review.date !== t) {
    const words = allWords();
    const score = w => {
      const s = S.w[w.id];
      if (!s) return [2, ''];                      // never practiced
      return [isWeak(w.id) ? 0 : 1, s.t || ''];    // weak first, then oldest practice date
    };
    const ranked = shuffle(words).sort((a, b) => {
      const A = score(a), B = score(b);
      return A[0] - B[0] || (A[1] < B[1] ? -1 : A[1] > B[1] ? 1 : 0);
    });
    S.review = { date: t, ids: ranked.slice(0, PER_DAY).map(w => w.id) };
    save();
  }
  return S.review.ids.map(byId).filter(Boolean);
}

/* ---------- word stats ---------- */
function ws(id) { return S.w[id] || (S.w[id] = { seen: false, right: 0, wrong: 0, g: {}, last: null }); }
function stars(id) { const s = S.w[id]; return s ? GAME_TYPES.filter(t => s.g[t]).length : 0; }
function isWeak(id) { const s = S.w[id]; return !!(s && s.wrong > 0 && (s.last === 0 || s.wrong >= s.right)); }
function record(word, type, ok) {
  const s = ws(word.id);
  if (ok) { s.right++; s.g[type] = true; } else { s.wrong++; }
  s.last = ok ? 1 : 0;
  s.t = todayStr();
  markActive();
  save();
}
function markActive() {
  const t = todayStr();
  if (S.streak.last === t) return;
  S.streak.count = S.streak.last === addDays(t, -1) ? S.streak.count + 1 : 1;
  S.streak.last = t;
}
function mastery(n) {
  // Measured over the words received so far, so the number moves from day 1.
  const words = n === S.level ? unlockedWords(n) : levelWords(n);
  if (!words.length) return 0;
  return Math.round(100 * words.reduce((a, w) => a + stars(w.id), 0) / (words.length * GAME_TYPES.length));
}

/* ---------- helpers ---------- */
const $ = sel => document.querySelector(sel);
const main = () => $('#main');
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function sample(a, n) { return shuffle(a).slice(0, n); }
function starsHtml(id) {
  const k = stars(id);
  return `<span class="stars" title="${k} of 5 games correct">${'★'.repeat(k)}<span class="off">${'★'.repeat(5 - k)}</span></span>`;
}
function roman(r) { return S.settings.roman && r ? `<div class="roman">${esc(r)}</div>` : ''; }
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { t.hidden = true; }, 2600);
}
function untilText(min, nowMin) {
  const d = min - nowMin; const h = Math.floor(d / 60), m = d % 60;
  return h ? `${h} h ${m} m` : `${m} m`;
}

/* speech (Korean voice built into iOS/Safari) */
let koVoice = null;
function pickVoice() {
  if (!('speechSynthesis' in window)) return;
  const vs = speechSynthesis.getVoices().filter(v => /^ko/i.test(v.lang));
  koVoice = vs.find(v => /yuna|siri|premium|enhanced/i.test(v.name)) || vs[0] || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function say(text, rate = 0.85) {
  if (!('speechSynthesis' in window)) { toast('Speech is not available on this device'); return; }
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR'; u.rate = rate;
  if (koVoice) u.voice = koVoice;
  speechSynthesis.speak(u);
}

/* ---------- navigation ---------- */
function go(name, params = {}, push = true) {
  if (push && view.name !== name) view.prev = { ...view };
  view = { ...params, name, prev: push ? view.prev : view.prev };
  if (params.tab) setTab(params.tab);
  render();
  window.scrollTo(0, 0);
}
function setTab(tab) {
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
}
function setHeader(title, back) {
  $('#title').textContent = title;
  $('#backBtn').hidden = !back;
  $('#streak').textContent = S.streak.count && S.streak.last && daysBetween(S.streak.last, todayStr()) <= 1 ? `🔥 ${S.streak.count}` : '';
}

function render() {
  const fn = { today: renderToday, word: renderWord, words: renderWords, practice: renderPractice, exam: renderExam, me: renderMe, game: renderGame, done: renderDone }[view.name] || renderToday;
  fn();
}

/* ---------- Today ---------- */
function backupDue() {
  const since = S.lastBackup || S.created || todayStr();
  return daysBetween(since, todayStr()) >= (S.lastBackup ? BACKUP_EVERY_DAYS : 14);
}
function backupCard() {
  if (!backupDue()) return '';
  return `<div class="card"><h2>Time to save a backup</h2>
    <p class="small muted">Your progress lives only on this phone. A backup file lets you restore it on a new phone.
    ${S.lastBackup ? `Last backup: ${niceDate(S.lastBackup)}.` : 'You have not saved one yet.'}</p>
    <div class="btns"><button class="btn ghost" data-action="export">Save backup now</button></div></div>`;
}
function slotsHtml(words, times, arrived) {
  let h = '';
  for (let i = 0; i < PER_DAY; i++) {
    const w = words[i];
    if (!w) continue;
    if (i < arrived) {
      const s = S.w[w.id];
      h += `<button class="slot" data-action="word" data-id="${w.id}">
        <span class="num">${i + 1}</span>
        <span class="w"><b>${esc(w.ko)}</b>${!s || !s.seen ? '<span class="badge">NEW</span>' : ''}<div class="en">${esc(w.en)}${S.graduated ? ` · Level ${w.level}` : ''}</div></span>
        ${starsHtml(w.id)}</button>`;
    } else {
      h += `<div class="slot locked"><span class="num">${i + 1}</span>
        <span class="w">Word ${i + 1}<div class="en">arrives at ${fmtMin(times[i])}</div></span><span>🔒</span></div>`;
    }
  }
  return h;
}
function recapCard(arrivedCount, mins) {
  const open = arrivedCount === PER_DAY;
  return `<div class="card"><h2>Today's recap</h2>
    <p class="small muted">A quick round of games mixing all 5 of today's words. ${open ? (mins >= toMin(RECAP_TIME) ? 'Good time for it now.' : `Best played around ${RECAP_TIME}.`) : 'Opens when the 5th word arrives.'}</p>
    <div class="btns"><button class="btn" data-action="recap" ${open ? '' : 'disabled'}>Play the recap</button></div></div>
    ${arrivedCount && !open ? `<div class="btns"><button class="btn ghost" data-action="mixed-today">Play games for the words so far</button></div>` : ''}`;
}
function renderReviewToday() {
  const words = reviewToday();
  const times = slotTimes();
  const now = new Date(); const mins = now.getHours() * 60 + now.getMinutes();
  const arrived = times.filter(t => mins >= t).length;
  const nextIdx = times.findIndex(t => mins < t);
  main().innerHTML = `
    <div class="card"><div class="label">Review mode · all 6 levels passed 🎓</div>
      <h2>5 words to keep sharp</h2>
      <p class="small muted" style="margin:0">Each day brings back 5 of your ${allWords().length} words, weakest and longest-unseen first.
      ${nextIdx >= 0 ? `Next word at <b>${fmtMin(times[nextIdx])}</b>.` : 'All 5 are here today.'}</p></div>
    ${backupCard()}
    ${slotsHtml(words, times, arrived)}
    ${recapCard(arrived, mins)}`;
}
function renderToday() {
  setHeader('Today', false);
  if (S.graduated) return renderReviewToday();
  const L = LEVELS.find(l => l.n === S.level);
  const words = levelWords();
  if (!words.length) {
    // Level content not added yet: keep the level start at today so delivery begins the day it is added.
    if (S.levelStart !== todayStr()) { S.levelStart = todayStr(); save(); }
    main().innerHTML = `
      <div class="card center"><h2>${esc(L ? L.name : 'Next level')} is unlocked 🎉</h2>
      <p class="muted">The words for this level have not been added to the app yet. Your daily words will start the day they are added.
      Meanwhile, keep practicing earlier levels.</p>
      <div class="btns"><button class="btn" data-action="tab" data-tab="practice">Practice earlier levels</button></div></div>`;
    return;
  }
  const sc = schedule();
  lastUnlocked = sc.unlocked;
  let h = `
    <div class="card">
      <div class="row spread"><div><div class="label">${esc(L.name)} · ${esc(L.topik)}</div>
      <h2>${sc.inDelivery ? `Day ${sc.day} of ${DAYS_PER_LEVEL}` : 'All words delivered'}</h2></div>
      <div class="muted small">${sc.unlocked}/${sc.total} words</div></div>
      <div class="bar"><i style="width:${(100 * sc.unlocked / sc.total).toFixed(1)}%"></i></div>
      <p class="small muted" style="margin:8px 0 0">${sc.inDelivery
        ? (sc.nextIdx >= 0 ? `Next word at <b>${fmtMin(sc.times[sc.nextIdx])}</b> (in ${untilText(sc.times[sc.nextIdx], sc.mins)})` : 'All 5 words are here today. New words start tomorrow at ' + esc(S.settings.start) + '.')
        : `Your ${esc(L.name)} exam is open.`}</p>
    </div>`;

  h += backupCard();
  if (sc.inDelivery) {
    h += slotsHtml(words.slice(sc.dayIdx * PER_DAY, sc.dayIdx * PER_DAY + PER_DAY), sc.times, sc.arrivedToday);
    h += recapCard(sc.arrivedToday, sc.mins);
    const earlierUnseen = words.slice(0, sc.dayIdx * PER_DAY).filter(w => !(S.w[w.id] && S.w[w.id].seen));
    if (earlierUnseen.length) {
      h += `<div class="card"><h2>Catch up</h2><p class="small muted">${earlierUnseen.length} word${earlierUnseen.length > 1 ? 's' : ''} from earlier days you haven't opened yet.</p>
        <div class="btns"><button class="btn ghost" data-action="tab" data-tab="words" data-filter="unseen">Open them</button></div></div>`;
    }
  } else {
    h += `<div class="card"><h2>Time for the exam</h2>
      <p class="small muted">You've received all ${sc.total} words of ${esc(L.name)}. Pass the exam (80% or more) to unlock the next level. New words pause until then.</p>
      <div class="btns"><button class="btn" data-action="tab" data-tab="exam">Go to the exam</button>
      <button class="btn ghost" data-action="practice-weak" data-level="${S.level}">Practice weak words first</button></div></div>`;
  }
  main().innerHTML = h;
}

/* ---------- Word detail ---------- */
function renderWord() {
  const w = byId(view.id);
  if (!w) return go('today', { tab: 'today' }, false);
  const s = ws(w.id);
  if (!s.seen) { s.seen = true; save(); }
  setHeader(w.ko, true);
  const ex = w.example;
  const toks = ex.tokens.map((t, i) => `<button class="tok ${i === ex.target ? 'target' : ''}" data-action="tok" data-i="${i}">${esc(t.t)}</button>`).join('');
  main().innerHTML = `
    <div class="card hero">
      <div class="big ko">${esc(w.ko)}</div>
      ${roman(w.roman)}
      <div class="en">${esc(w.en)}</div>
      <div class="muted small" style="margin:6px 0 12px">${esc(w.pos)} · Day ${w.day}</div>
      <button class="say" data-action="say" data-text="${esc(w.ko)}">🔊 Listen</button>
    </div>
    <div class="card">
      <div class="label">Korean meaning</div>
      <div class="ko" style="font-size:18px">${esc(w.ko_meaning)}</div>
      <div class="muted small" style="margin-top:4px">${esc(w.ko_meaning_en)}</div>
    </div>
    <div class="card">
      <div class="row spread"><div class="label">Example · tap any word</div>
      <button class="say" data-action="say" data-text="${esc(ex.ko)}">🔊</button></div>
      <div class="sentence">${toks}</div>
      ${S.settings.roman ? `<div class="muted small" style="margin-top:8px">${esc(ex.roman)}</div>` : ''}
      <div style="margin-top:8px;font-size:17px">${esc(ex.en)}</div>
      <div class="gloss" id="gloss"><span class="muted small">Tap a word above to see what it means.</span></div>
    </div>
    <div class="card">
      <div class="row spread"><h2 style="margin:0">5 games</h2>${starsHtml(w.id)}</div>
      <p class="small muted">${GAME_TYPES.map(t => `${s.g[t] ? '✓' : '○'} ${QTYPE_NAMES[t]}`).join(' · ')}</p>
      <div class="btns"><button class="btn" data-action="play-word" data-id="${w.id}">Play the 5 games</button></div>
    </div>`;
}
function showGloss(i) {
  const w = byId(view.id); const t = w.example.tokens[i];
  document.querySelectorAll('.tok').forEach((b, k) => b.classList.toggle('sel', k === i));
  $('#gloss').innerHTML = `<div class="row spread"><b>${esc(t.t)}</b><button class="say" data-action="say" data-text="${esc(t.t)}">🔊</button></div>
    ${S.settings.roman ? `<div class="muted small">${esc(t.r)}</div>` : ''}
    <div style="margin-top:4px"><b style="font-size:15px">${esc(t.en)}</b> <span class="muted">· from <span class="ko">${esc(t.base)}</span></span></div>
    ${t.note ? `<div class="small muted" style="margin-top:4px">${esc(t.note)}</div>` : ''}`;
}

/* ---------- Words list ---------- */
function renderWords() {
  setHeader('Words', false);
  const lv = view.level || defaultLevel();
  const filter = view.filter || 'all';
  const q = (view.q || '').trim().toLowerCase();
  let list = unlockedWords(lv);
  if (filter === 'unseen') list = list.filter(w => !(S.w[w.id] && S.w[w.id].seen));
  if (filter === 'weak') list = list.filter(w => isWeak(w.id));
  if (q) list = list.filter(w => w.ko.includes(q) || w.en.toLowerCase().includes(q) || (w.roman || '').toLowerCase().includes(q));
  const levelChips = LEVELS.filter(l => l.n <= S.level).map(l =>
    `<button class="chip ${l.n === lv ? 'on' : ''}" data-action="words-level" data-level="${l.n}" ${hasData(l.n) ? '' : 'disabled'}>${l.name}</button>`).join('');
  const f = (k, label) => `<button class="chip ${filter === k ? 'on' : ''}" data-action="words-filter" data-filter="${k}">${label}</button>`;
  main().innerHTML = `
    <input class="search" id="wordSearch" type="search" placeholder="Search Korean or English" value="${esc(view.q || '')}" autocomplete="off">
    <div class="chips">${levelChips}</div>
    <div class="chips">${f('all', 'All')}${f('unseen', 'Not opened')}${f('weak', 'Weak')}</div>
    <div class="list">${list.length ? list.map(w => `
      <button class="li" data-action="word" data-id="${w.id}">
        <span class="ko">${esc(w.ko)}</span><span class="en">${esc(w.en)}</span>${starsHtml(w.id)}
      </button>`).join('') : `<div class="empty">No words here yet.</div>`}</div>`;
  const inp = $('#wordSearch');
  inp.addEventListener('input', () => {
    view.q = inp.value;
    const pos = inp.selectionStart;
    renderWords();
    const again = $('#wordSearch'); again.focus(); try { again.setSelectionRange(pos, pos); } catch (e) {}
  });
}

/* ---------- Practice ---------- */
function renderPractice() {
  setHeader('Practice', false);
  const lv = view.level || defaultLevel();
  const pool = unlockedWords(lv);
  const weak = pool.filter(w => isWeak(w.id));
  const chips = LEVELS.map(l => {
    const open = l.n <= S.level && hasData(l.n);
    return `<button class="chip ${l.n === lv ? 'on' : ''}" data-action="practice-level" data-level="${l.n}" ${open ? '' : 'disabled'}>${l.name}${open ? '' : ' 🔒'}</button>`;
  }).join('');
  main().innerHTML = `
    <div class="chips">${chips}</div>
    <div class="card">
      <div class="row spread"><h2 style="margin:0">${esc(LEVELS[lv - 1].name)}</h2><span class="muted small">${pool.length} words open</span></div>
      <div class="muted small" style="margin-top:6px">Mastery ${mastery(lv)}%</div>
      <div class="bar"><i style="width:${mastery(lv)}%"></i></div>
    </div>
    <div class="card"><h2>Check your skill</h2>
      <p class="small muted">Mixed games from every word you've received in this level. Play as often as you like.</p>
      <div class="btns">
        <button class="btn" data-action="practice-random" data-level="${lv}" data-n="10" ${pool.length >= 4 ? '' : 'disabled'}>Quick round · 10 questions</button>
        <button class="btn ghost" data-action="practice-random" data-level="${lv}" data-n="20" ${pool.length >= 4 ? '' : 'disabled'}>Mini test · 20 questions</button>
      </div></div>
    <div class="card"><h2>Weak words</h2>
      <p class="small muted">${weak.length ? `${weak.length} word${weak.length > 1 ? 's' : ''} you got wrong recently.` : 'No weak words right now. 👏'}</p>
      <div class="btns"><button class="btn ghost" data-action="practice-weak" data-level="${lv}" ${weak.length ? '' : 'disabled'}>Drill weak words</button></div></div>
    ${pool.length < 4 ? '<p class="small muted center">Games unlock once you have 4 words.</p>' : ''}`;
}

/* ---------- Exam ---------- */
function renderExam() {
  setHeader('Level exam', false);
  if (S.graduated) {
    main().innerHTML = `<div class="card center"><div style="font-size:42px">🎓</div><h2>All 6 levels passed</h2>
      <p class="muted">Retake any level's exam to check yourself. It doesn't change your level.</p></div>
      <div class="card"><div class="btns">${LEVELS.map(l => `<button class="btn ghost" data-action="start-exam" data-level="${l.n}" data-practice="1">${l.name} exam · ${EXAM_QUESTIONS} questions</button>`).join('')}</div></div>`;
    return;
  }
  const L = LEVELS[S.level - 1];
  const words = levelWords();
  if (!words.length) {
    main().innerHTML = `<div class="card center"><h2>${esc(L.name)}</h2><p class="muted">This level's words haven't been added yet.</p></div>`;
    return;
  }
  const sc = schedule();
  const history = S.exams.filter(e => e.level === S.level);
  const failedToday = history.some(e => e.date === todayStr() && !e.passed);
  let body;
  if (!sc.examOpen) {
    const left = daysBetween(todayStr(), sc.examDate);
    body = `<div class="card center"><div style="font-size:42px">🔒</div><h2>${esc(L.name)} exam</h2>
      <p class="muted">Opens on <b>${niceDate(sc.examDate)}</b>, after all ${DAYS_PER_LEVEL} days of words (${left} day${left === 1 ? '' : 's'} to go).</p>
      <p class="small muted">${EXAM_QUESTIONS} questions from all ${sc.total} words. Pass with ${Math.round(PASS_RATE * 100)}% or more to move up a level.</p>
      <div class="btns"><button class="btn ghost" data-action="practice-random" data-level="${S.level}" data-n="20" ${unlockedWords().length >= 4 ? '' : 'disabled'}>Try a 20-question mini test</button></div></div>`;
  } else if (failedToday) {
    body = `<div class="card center"><h2>Retake tomorrow</h2><p class="muted">Review the words you missed today, then try again tomorrow.</p>
      <div class="btns"><button class="btn" data-action="practice-weak" data-level="${S.level}">Drill weak words</button></div></div>`;
  } else {
    body = `<div class="card center"><div style="font-size:42px">✎</div><h2>${esc(L.name)} exam is open</h2>
      <p class="muted">${EXAM_QUESTIONS} questions from all ${sc.total} words. No hints and no tap-to-translate. You need ${Math.ceil(EXAM_QUESTIONS * PASS_RATE)} correct to pass.</p>
      <div class="btns"><button class="btn" data-action="start-exam">Start the exam</button></div></div>`;
  }
  const hist = history.length ? `<div class="card"><h2>Past attempts</h2>${history.slice().reverse().map(e =>
    `<div class="field"><span>${niceDate(e.date)}</span><span class="${e.passed ? 'pass' : 'fail'}">${e.score}/${e.total} · ${e.passed ? 'passed' : 'not yet'}</span></div>`).join('')}</div>` : '';
  main().innerHTML = body + hist;
}

/* ---------- Me (progress + settings) ---------- */
function renderMe() {
  setHeader('Me', false);
  const sc = levelWords().length ? schedule() : null;
  const seen = Object.values(S.w).filter(s => s.seen).length;
  const ladder = LEVELS.map(l => {
    const done = S.passed.includes(l.n), now = l.n === S.level;
    let info = l.topik;
    if (done) info += ` · passed · mastery ${mastery(l.n)}%`;
    else if (now && sc) info += ` · day ${sc.day}/${DAYS_PER_LEVEL} · mastery ${mastery(l.n)}%`;
    else if (now) info += ' · words not added yet';
    else info += ` · months ${2 * l.n - 1}–${2 * l.n}`;
    return `<li><span class="lv ${done ? 'done' : now ? 'now' : ''}">${done ? '✓' : l.n}</span><span class="info"><b>${l.name}</b><div class="small muted">${esc(info)}</div></span></li>`;
  }).join('');
  const times = slotTimes().map(fmtMin).join(' · ');
  main().innerHTML = `
    <div class="card"><h2>Your levels</h2><ul class="ladder">${ladder}</ul></div>
    <div class="card"><h2>Numbers</h2>
      <div class="field"><span>Words opened</span><b>${seen}</b></div>
      <div class="field"><span>Days in a row</span><b>${S.streak.count || 0}</b></div>
      <div class="field"><span>Exams passed</span><b>${S.passed.length}</b></div>
    </div>
    <div class="card"><h2>Settings</h2>
      <div class="field"><span>Day starts</span><input type="time" id="setStart" value="${esc(S.settings.start)}"></div>
      <div class="field"><span>Day ends</span><input type="time" id="setEnd" value="${esc(S.settings.end)}"></div>
      <p class="small muted" style="margin:6px 0">Words arrive at ${times}.</p>
      <div class="field"><span>Show romanization</span><button class="switch ${S.settings.roman ? 'on' : ''}" data-action="toggle-roman" aria-label="Show romanization"></button></div>
      <div class="field"><span>Level ${S.level} started on</span><input type="date" id="setLevelStart" value="${esc(S.levelStart)}" max="${todayStr()}"></div>
      <p class="small muted" style="margin:6px 0">Change the start date only if you want to move your schedule.</p>
    </div>
    <div class="card"><h2>Backup</h2>
      <p class="small muted">Progress is saved on this phone only. Save a backup file now and then (it goes to the Files app).</p>
      <div class="btns two"><button class="btn ghost" data-action="export">Save backup</button>
      <label class="btn plain" for="importFile">Restore</label></div>
      <input type="file" id="importFile" accept="application/json,.json" hidden>
      <div class="btns"><button class="btn plain" data-action="reset">Start over</button></div>
    </div>
    <p class="small muted center">Install: in Safari tap Share → Add to Home Screen.</p>`;
  $('#setStart').addEventListener('change', e => { S.settings.start = e.target.value || '09:00'; save(); renderMe(); });
  $('#setEnd').addEventListener('change', e => { S.settings.end = e.target.value || '23:00'; save(); renderMe(); });
  $('#setLevelStart').addEventListener('change', e => { if (e.target.value) { S.levelStart = e.target.value; save(); toast('Schedule updated'); } });
  $('#importFile').addEventListener('change', importBackup);
}
async function exportBackup() {
  S.lastBackup = todayStr(); save();
  const name = `topik5-backup-${todayStr()}.json`;
  const text = JSON.stringify(S, null, 1);
  // On iPhone the share sheet offers "Save to Files"; elsewhere fall back to a normal download.
  try {
    const file = new File([text], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'TOPIK 5 backup' });
      toast('Backup saved'); render(); return;
    }
  } catch (e) { if (e && e.name === 'AbortError') { return; } }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' })); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Backup saved'); render();
}
function importBackup(e) {
  const file = e.target.files[0]; if (!file) return;
  file.text().then(txt => {
    const data = JSON.parse(txt);
    if (!data || typeof data.level !== 'number' || !data.levelStart) throw new Error('bad file');
    S = Object.assign(defaultState(), data); save(); toast('Backup restored'); go('today', { tab: 'today' }, false);
  }).catch(() => toast('That file is not a TOPIK 5 backup'));
}

/* ---------- questions ---------- */
function distractors(word, pool, n, key) {
  const seen = new Set([word[key]]);
  const out = [];
  // Prefer words already received; if there are too few (first days), borrow the earliest words of the level.
  const early = levelWords(word.level).slice(0, 25);
  for (const w of [...shuffle(pool), ...shuffle(early)]) {
    if (w.id === word.id || seen.has(w[key])) continue;
    seen.add(w[key]); out.push(w);
    if (out.length === n) break;
  }
  return out;
}
function makeQuestion(word, type, pool) {
  const q = { word, type };
  if (type === 'meaning' || type === 'listen') {
    const others = distractors(word, pool, 3, 'en');
    q.options = shuffle([word, ...others]).map(w => ({ text: w.en, ok: w.id === word.id }));
  } else if (type === 'reverse') {
    const others = distractors(word, pool, 3, 'ko');
    q.options = shuffle([word, ...others]).map(w => ({ text: w.ko, ok: w.id === word.id, ko: true }));
  } else if (type === 'fill') {
    q.options = shuffle(word.cloze_options.map((t, i) => ({ text: t, ok: i === 0, ko: true })));
  } else if (type === 'form') {
    q.options = shuffle(word.form.options.map((t, i) => ({ text: t, ok: i === word.form.answer, ko: true })));
  } else if (type === 'match') {
    const others = distractors(word, pool, 3, 'en');
    q.pairs = [word, ...others];
    q.left = shuffle(q.pairs.map(w => w.id));
    q.right = shuffle(q.pairs.map(w => w.id));
    q.done = []; q.mistakes = 0; q.sel = null;
  } else if (type === 'builder') {
    q.tiles = shuffle(word.example.tokens.map((t, i) => ({ i, t: t.t })));
    // avoid showing the tiles already in the right order
    if (q.tiles.length > 1 && q.tiles.every((x, k) => x.i === k)) q.tiles.reverse();
    q.built = [];
  }
  return q;
}
function startSession(title, items, mode, extra = {}) {
  session = { title, items, mode, i: 0, score: 0, answered: false, results: [], ...extra };
  session.q = makeQuestion(items[0].word, items[0].type, session.pool);
  go('game', { tab: view.name === 'game' ? undefined : undefined }, true);
  if (session.q.type === 'listen') setTimeout(() => say(session.q.word.ko), 250);
}
function wordsFromToday() {
  if (S.graduated) {
    const now = new Date(); const mins = now.getHours() * 60 + now.getMinutes();
    return reviewToday().slice(0, slotTimes().filter(t => mins >= t).length);
  }
  const sc = schedule();
  return levelWords().slice(sc.dayIdx * PER_DAY, sc.dayIdx * PER_DAY + sc.arrivedToday);
}
function mixedItems(words, perWord, types) {
  const items = [];
  words.forEach(w => sample(types, perWord).forEach(t => items.push({ word: w, type: t })));
  return shuffle(items);
}

/* ---------- game rendering ---------- */
function renderGame() {
  if (!session) return go('today', { tab: 'today' }, false);
  const s = session, q = s.q, w = q.word, exam = s.mode === 'exam';
  setHeader(s.title, true);
  let h = `<div class="qhead"><span>${QTYPE_NAMES[q.type]}</span><span>${s.i + 1} / ${s.items.length}</span></div>
    <div class="bar"><i style="width:${(100 * s.i / s.items.length).toFixed(1)}%"></i></div>`;

  if (q.type === 'meaning') {
    h += `<div class="prompt"><div class="big">${esc(w.ko)}</div>${exam ? '' : roman(w.roman)}
      <button class="say" data-action="say" data-text="${esc(w.ko)}">🔊</button></div>`;
  } else if (q.type === 'reverse') {
    h += `<div class="prompt"><div class="sent" style="font-family:inherit">${esc(w.en)}</div><div class="hint">Pick the Korean word.</div></div>`;
  } else if (q.type === 'listen') {
    h += `<button class="bigsay" data-action="say" data-text="${esc(w.ko)}" aria-label="Play the word">🔊</button>
      <p class="center hint">Listen, then pick the meaning.${exam ? '' : ` <button class="say" data-action="reveal">Show the word</button>`}</p>
      <p class="center ko" id="reveal" hidden style="font-size:28px;font-weight:800">${esc(w.ko)}</p>`;
  } else if (q.type === 'fill') {
    const ex = w.example;
    const sent = ex.tokens.map((t, i) => i === ex.target ? '<span class="blank">&nbsp;</span>' : esc(t.t)).join(' ');
    h += `<div class="prompt"><div class="sent">${sent}</div><div class="hint">${esc(ex.en)}</div></div>`;
  } else if (q.type === 'form') {
    h += `<div class="prompt"><div class="hint" style="color:var(--ink)">${esc(w.form.q_en)}</div>
      <div class="sent" style="margin-top:8px">${esc(w.form.ko).replace('___', '<span class="blank">&nbsp;</span>')}</div></div>`;
  } else if (q.type === 'match') {
    const L = q.left.map(id => { const x = byId(id); return `<button class="mt ko ${q.done.includes(id) ? 'done' : ''} ${q.sel && q.sel.side === 'L' && q.sel.id === id ? 'sel' : ''}" data-action="match" data-side="L" data-id="${id}" ${q.done.includes(id) ? 'disabled' : ''}>${esc(x.ko)}</button>`; }).join('');
    const R = q.right.map(id => { const x = byId(id); return `<button class="mt ${q.done.includes(id) ? 'done' : ''} ${q.sel && q.sel.side === 'R' && q.sel.id === id ? 'sel' : ''}" data-action="match" data-side="R" data-id="${id}" ${q.done.includes(id) ? 'disabled' : ''}>${esc(x.en)}</button>`; }).join('');
    h += `<p class="center hint">Tap a Korean word, then its meaning.</p><div class="match"><div class="col">${L}</div><div class="col">${R}</div></div>`;
  } else if (q.type === 'builder') {
    const ex = w.example;
    h += `<div class="prompt"><div class="sent" style="font-family:inherit;font-size:20px">${esc(ex.en)}</div><div class="hint">Build the Korean sentence. Tap a block to move it.</div></div>
      <div class="build">${q.built.map((k, pos) => `<button class="tile" data-action="unbuild" data-pos="${pos}">${esc(q.tiles[k].t)}</button>`).join('')}</div>
      <div class="pool">${q.tiles.map((t, k) => `<button class="tile ${q.built.includes(k) ? 'used' : ''}" data-action="build" data-k="${k}">${esc(t.t)}</button>`).join('')}</div>
      <div class="btns"><button class="btn" data-action="check-build" ${q.built.length === q.tiles.length && !s.answered ? '' : 'disabled'}>Check</button></div>`;
  }

  if (q.options) {
    h += `<div class="opts">${q.options.map((o, k) => {
      let cls = 'opt' + (o.ko ? ' ko' : '');
      if (s.answered && !exam) { if (o.ok) cls += ' right'; else if (k === q.picked) cls += ' wrong'; }
      if (s.answered && exam && k === q.picked) cls += ' picked';
      return `<button class="${cls}" data-action="answer" data-k="${k}" ${s.answered ? 'disabled' : ''}>${esc(o.text)}</button>`;
    }).join('')}</div>`;
  }

  if (s.answered && !exam) h += feedbackHtml(q);
  if (s.answered) h += `<div class="btns"><button class="btn" data-action="next">${s.i + 1 < s.items.length ? 'Next' : 'See results'}</button></div>`;
  main().innerHTML = h;
}
function feedbackHtml(q) {
  const w = q.word, ex = w.example;
  let detail = '';
  if (q.type === 'fill' || q.type === 'builder') detail = `<span class="ko">${esc(ex.ko)}</span><br>${esc(ex.en)}`;
  else if (q.type === 'form') detail = `<span class="ko">${esc(w.form.ko.replace('___', w.form.options[w.form.answer]))}</span><br>${esc(w.form.why)}`;
  else detail = `<span class="ko">${esc(w.ko)}</span> = ${esc(w.en)}`;
  return `<div class="feedback ${q.ok ? 'ok' : 'no'}"><b>${q.ok ? 'Correct!' : 'Not quite.'}</b><div class="detail">${detail}</div></div>`;
}
function answer(ok) {
  const s = session;
  if (!s || s.finished || s.answered) return;   // ignore double taps
  const q = s.q;
  q.ok = ok; s.answered = true;
  if (ok) s.score++;
  s.results.push({ id: q.word.id, type: q.type, ok });
  record(q.word, q.type, ok);
  if (s.mode === 'exam') { nextQuestion(); return; }
  renderGame();
}
function nextQuestion() {
  const s = session;
  if (!s || s.finished) return;
  s.i++; s.answered = false;
  if (s.i >= s.items.length) { finishSession(); return; }
  const it = s.items[s.i];
  s.q = makeQuestion(it.word, it.type, s.pool);
  renderGame(); window.scrollTo(0, 0);
  if (s.q.type === 'listen') setTimeout(() => say(s.q.word.ko), 250);
}
async function finishSession() {
  const s = session;
  if (s.finished) return;
  s.finished = true;
  if (s.mode === 'exam') {
    const passed = s.score >= Math.ceil(s.items.length * PASS_RATE);
    s.examPassed = passed;
    if (s.official) {
      S.exams.push({ level: S.level, date: todayStr(), score: s.score, total: s.items.length, passed });
      if (passed) {
        if (!S.passed.includes(S.level)) S.passed.push(S.level);
        if (S.level < LEVELS.length) { S.level++; S.levelStart = todayStr(); await loadLevel(S.level); }
        else { S.graduated = true; S.review = null; }
      }
      save();
    }
  }
  go('done', {}, false);
}
function renderDone() {
  const s = session;
  if (!s) return go('today', { tab: 'today' }, false);
  setHeader(s.title, false);
  const pct = Math.round(100 * s.score / s.items.length);
  const missed = [...new Set(s.results.filter(r => !r.ok).map(r => r.id))].map(byId).filter(Boolean);
  let head;
  if (s.mode === 'exam' && !s.official) {
    head = `<div class="big ${s.examPassed ? 'pass' : 'fail'}">${s.score}/${s.items.length}</div><h2>Level ${s.examLevel} check</h2><p class="muted">${s.examPassed ? 'Still at pass level. 👏' : 'Below the pass mark. The weak-words drill will help.'}</p>`;
  } else if (s.mode === 'exam') {
    head = s.examPassed
      ? `<div class="big pass">${s.score}/${s.items.length}</div><h2>You passed Level ${s.examLevel}! 🎉</h2><p class="muted">${S.graduated ? 'You finished all 6 levels. Review mode starts today: 5 words a day from everything you learned.' : `Level ${S.level} starts today.`}</p>`
      : `<div class="big fail">${s.score}/${s.items.length}</div><h2>Not yet</h2><p class="muted">You need ${Math.ceil(s.items.length * PASS_RATE)}. Drill your weak words and retake tomorrow.</p>`;
  } else {
    head = `<div class="big">${pct}%</div><h2>${s.score} of ${s.items.length} correct</h2><p class="muted">${pct >= 80 ? 'Great work!' : pct >= 50 ? 'Good. Keep going!' : 'Keep practicing. You will get there.'}</p>`;
  }
  main().innerHTML = `<div class="card score">${head}</div>
    ${missed.length ? `<div class="card"><h2>Words to review</h2><div class="list">${missed.map(w => `
      <button class="li" data-action="word" data-id="${w.id}"><span class="ko">${esc(w.ko)}</span><span class="en">${esc(w.en)}</span>${starsHtml(w.id)}</button>`).join('')}</div></div>` : ''}
    <div class="btns"><button class="btn" data-action="tab" data-tab="${s.mode === 'exam' ? 'exam' : s.mode === 'practice' ? 'practice' : 'today'}">Done</button>
    ${s.mode === 'word' ? `<button class="btn ghost" data-action="word" data-id="${s.items[0].word.id}">Back to the word</button>` : ''}</div>`;
}

/* ---------- actions ---------- */
document.addEventListener('click', e => {
  const tabBtn = e.target.closest('.tabs button');
  if (tabBtn) { session = null; go(tabBtn.dataset.tab, { tab: tabBtn.dataset.tab }, false); return; }
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const a = el.dataset.action;
  const d = el.dataset;
  switch (a) {
    case 'back':
      if (view.name === 'game' && session && session.mode === 'exam' && !confirm('Leave the exam? This attempt will not count.')) return;
      if (view.name === 'game') session = null;
      if (view.prev && view.prev.name !== view.name) go(view.prev.name, { ...view.prev }, false); else go('today', { tab: 'today' }, false);
      break;
    case 'tab': session = null; go(d.tab, { tab: d.tab, filter: d.filter }, false); break;
    case 'word': go('word', { id: d.id }); break;
    case 'say': say(d.text); break;
    case 'tok': showGloss(Number(d.i)); break;
    case 'reveal': { const r = $('#reveal'); if (r) r.hidden = false; break; }
    case 'play-word': {
      const w = byId(d.id);
      startSession(`Games · ${w.ko}`, GAME_TYPES.map(t => ({ word: w, type: t })), 'word', { pool: unlockedWords(w.level) });
      break;
    }
    case 'recap': {
      const words = wordsFromToday();
      startSession("Today's recap", mixedItems(words, 2, ['meaning', 'reverse', 'fill', 'listen', 'form', 'builder']), 'recap', { pool: S.graduated ? allWords() : unlockedWords() });
      break;
    }
    case 'mixed-today': {
      const words = wordsFromToday();
      startSession('Games so far', mixedItems(words, 2, ['meaning', 'reverse', 'fill', 'listen', 'form']), 'recap', { pool: S.graduated ? allWords() : unlockedWords() });
      break;
    }
    case 'practice-level': go('practice', { tab: 'practice', level: Number(d.level) }, false); break;
    case 'words-level': go('words', { tab: 'words', level: Number(d.level), filter: view.filter }, false); break;
    case 'words-filter': go('words', { tab: 'words', level: view.level, filter: d.filter, q: view.q }, false); break;
    case 'practice-random': {
      const lv = Number(d.level), n = Number(d.n);
      const pool = unlockedWords(lv);
      const picks = sample(pool, Math.min(n, pool.length));
      while (picks.length < n) picks.push(pool[Math.floor(Math.random() * pool.length)]);
      const types = ['meaning', 'reverse', 'fill', 'listen', 'form', 'builder', 'match'];
      startSession(`${LEVELS[lv - 1].name} · ${n} questions`, picks.map(w => ({ word: w, type: types[Math.floor(Math.random() * types.length)] })), 'practice', { pool });
      break;
    }
    case 'practice-weak': {
      const lv = Number(d.level) || S.level;
      const pool = unlockedWords(lv);
      const weak = pool.filter(w => isWeak(w.id));
      if (!weak.length) { toast('No weak words right now'); return; }
      startSession('Weak words', mixedItems(sample(weak, 10), 2, ['meaning', 'reverse', 'fill', 'listen', 'form']), 'practice', { pool });
      break;
    }
    case 'start-exam': {
      const lv = Number(d.level) || S.level;
      const words = levelWords(lv);
      const picks = sample(words, Math.min(EXAM_QUESTIONS, words.length));
      const types = ['meaning', 'reverse', 'fill', 'listen', 'form', 'builder'];
      startSession(`${LEVELS[lv - 1].name} exam`, shuffle(picks.map((w, i) => ({ word: w, type: types[i % types.length] }))), 'exam',
        { pool: words, examLevel: lv, official: !d.practice });
      break;
    }
    case 'answer': {
      const q = session.q; const k = Number(d.k);
      q.picked = k; answer(q.options[k].ok);
      break;
    }
    case 'next': nextQuestion(); break;
    case 'match': {
      const q = session.q; const pick = { side: d.side, id: d.id };
      if (!q.sel || q.sel.side === pick.side) { q.sel = pick; renderGame(); return; }
      if (q.sel.id === pick.id) {
        q.done.push(pick.id); q.sel = null;
        if (q.done.length === q.pairs.length) { answer(q.mistakes === 0); return; }
        renderGame();
      } else {
        q.mistakes++; q.sel = null; renderGame();
        const b = document.querySelector(`.mt[data-side="${pick.side}"][data-id="${pick.id}"]`);
        if (b) b.classList.add('shake');
      }
      break;
    }
    case 'build': { const q = session.q; const k = Number(d.k); if (!q.built.includes(k)) q.built.push(k); renderGame(); break; }
    case 'unbuild': { const q = session.q; if (!session.answered) { q.built.splice(Number(d.pos), 1); renderGame(); } break; }
    case 'check-build': {
      const q = session.q;
      const got = q.built.map(k => q.tiles[k].t).join(' ');
      const want = q.word.example.tokens.map(t => t.t).join(' ');
      answer(got === want);
      break;
    }
    case 'toggle-roman': S.settings.roman = !S.settings.roman; save(); renderMe(); break;
    case 'export': exportBackup(); break;
    case 'reset':
      if (confirm('Start over? All progress on this phone will be erased.')) { S = defaultState(); save(); go('today', { tab: 'today' }, false); }
      break;
  }
});

/* new words arriving while the app is open */
setInterval(() => {
  if (!levelWords().length) return;
  const sc = schedule();
  if (lastUnlocked >= 0 && sc.unlocked > lastUnlocked) {
    const w = levelWords()[sc.unlocked - 1];
    toast(`New word: ${w.ko} (${w.en})`);
    if (view.name === 'today') renderToday();
  }
  lastUnlocked = sc.unlocked;
}, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && view.name === 'today') renderToday(); });

/* ---------- start ---------- */
(async function init() {
  load();
  for (const l of LEVELS) if (l.n <= S.level && l.file) await loadLevel(l.n);
  if (!allWords().length || (!S.graduated && !levelWords().length && hasData(S.level))) {
    main().innerHTML = '<div class="empty">Could not load the word list. Check the connection and reopen the app.</div>';
    return;
  }
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
