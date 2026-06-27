/* ========================================
   おうちダッシュボード - フロントエンド
   ======================================== */

'use strict';

// ─ 状態管理 ──────────────────────────────────────
const state = {
  memos: [],
  tasks: [],
  events: [],
  settings: {},
  calYear: 0,
  calMonth: 0,
  selectedColor: 'yellow',
  selectedEventColor: 'blue',
  selectedPriority: 'normal',
  editMemoId: null,
  selectedCalDate: null,
  weatherTimer: null,
};

// ─ DOM取得ヘルパー ─────────────────────────────────
const $ = id => document.getElementById(id);
const on = (el, ev, fn) => el.addEventListener(ev, fn);

// ─ 日付ユーティリティ ─────────────────────────────
const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];
const MONTHS_JA = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function formatDateJa(dateStr) {
  if (!dateStr) return '';
  const [y,m,d] = dateStr.split('-');
  return `${m}/${d}`;
}

// ─ 時計 ──────────────────────────────────────────
function updateClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2,'0');
  const mi = String(now.getMinutes()).padStart(2,'0');
  $('clock').textContent = `${h}:${mi}`;

  const wd = WEEKDAYS_JA[now.getDay()];
  const y = now.getFullYear();
  const mo = MONTHS_JA[now.getMonth()];
  const d = now.getDate();
  $('date-display').textContent = `${y}年 ${mo}${d}日（${wd}）`;
}
setInterval(updateClock, 1000);
updateClock();

// ─ セッショントークン取得 ──────────────────────────
function getSessionToken() {
  try { return localStorage.getItem('session_token') || ''; } catch(e) { return ''; }
}

// ─ API ───────────────────────────────────────────
async function api(method, path, body) {
  const token = getSessionToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(path, opts);
  // 401/403なら再ログイン
  if (res.status === 401 || res.status === 403) {
    try { localStorage.removeItem('session_token'); } catch(e) {}
    window.location.href = '/login';
    return;
  }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ─ 天気 ──────────────────────────────────────────
const WEATHER_ICONS = {
  Clear: 'fa-sun', Clouds: 'fa-cloud',
  Rain: 'fa-cloud-rain', Drizzle: 'fa-cloud-drizzle',
  Snow: 'fa-snowflake', Thunderstorm: 'fa-bolt',
  Mist: 'fa-smog', Fog: 'fa-smog', Haze: 'fa-smog',
};

async function loadWeather() {
  const { settings } = state;
  const apiKey = settings.weather_api_key;
  const city   = settings.city || 'Tokyo';
  if (!apiKey) return;

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${apiKey}&units=metric&lang=ja`;
    const r = await fetch(url);
    if (!r.ok) return;
    const d = await r.json();
    const temp = Math.round(d.main.temp);
    const desc = d.weather[0].description;
    const main = d.weather[0].main;
    const icon = WEATHER_ICONS[main] || 'fa-cloud';

    $('weather-temp').textContent = `${temp}°C`;
    $('weather-desc').textContent = desc;
    $('weather-icon').innerHTML = `<i class="fas ${icon} fa-2x"></i>`;
  } catch(e) {
    console.warn('天気取得失敗:', e);
  }
}

// ─ 設定読み込み ───────────────────────────────────
async function loadSettings() {
  try {
    state.settings = await api('GET', '/api/settings');
    $('family-name').textContent = state.settings.family_name || 'おうちダッシュボード';
  } catch(e) { console.error(e); }
}

// ─ カレンダー ─────────────────────────────────────
function renderCalendar() {
  const { calYear: y, calMonth: m, events } = state;
  $('cal-title').textContent = `${y}年${MONTHS_JA[m]}`;

  const grid = $('calendar-grid');
  grid.innerHTML = '';

  // 曜日ヘッダー
  WEEKDAYS_JA.forEach((wd, i) => {
    const el = document.createElement('div');
    el.className = 'cal-day-header';
    el.textContent = wd;
    if (i === 0) el.style.color = '#ff7675';
    if (i === 6) el.style.color = '#74b9ff';
    grid.appendChild(el);
  });

  const today = toDateStr(new Date());
  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m+1, 0).getDate();
  const daysInPrev  = new Date(y, m, 0).getDate();

  // イベント日セット
  const eventMap = {};
  events.forEach(ev => {
    const d = ev.date;
    if (!eventMap[d]) eventMap[d] = [];
    eventMap[d].push(ev);
    // 繰り返しイベント展開
    if (ev.repeat_type === 'weekly') {
      for (let w = 1; w <= 5; w++) {
        const nd = new Date(d);
        nd.setDate(nd.getDate() + 7*w);
        const ns = toDateStr(nd);
        if (!eventMap[ns]) eventMap[ns] = [];
        eventMap[ns].push({...ev, date: ns});
      }
    } else if (ev.repeat_type === 'monthly') {
      for (let mo2 = 1; mo2 <= 12; mo2++) {
        const nd = new Date(d);
        nd.setMonth(nd.getMonth() + mo2);
        const ns = toDateStr(nd);
        if (!eventMap[ns]) eventMap[ns] = [];
        eventMap[ns].push({...ev, date: ns});
      }
    }
  });

  // 前月の余白
  for (let i = 0; i < firstDay; i++) {
    const day = daysInPrev - firstDay + i + 1;
    const el = document.createElement('div');
    el.className = 'cal-day other-month';
    el.textContent = day;
    grid.appendChild(el);
  }

  // 当月
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const el = document.createElement('div');
    const dow = new Date(y, m, d).getDay();
    let cls = 'cal-day';
    if (dateStr === today) cls += ' today';
    if (dow === 0) cls += ' sunday';
    if (dow === 6) cls += ' saturday';
    el.className = cls;
    el.textContent = d;

    if (eventMap[dateStr]?.length) {
      const row = document.createElement('div');
      row.className = 'cal-dot-row';
      eventMap[dateStr].slice(0, 3).forEach(ev => {
        const dot = document.createElement('div');
        dot.className = `cal-dot ${ev.color || 'blue'}`;
        row.appendChild(dot);
      });
      el.appendChild(row);
    }

    on(el, 'click', () => {
      state.selectedCalDate = dateStr;
      $('event-date').value = dateStr;
      openModal('event-modal');
    });
    grid.appendChild(el);
  }

  // 次月の余白
  const total = firstDay + daysInMonth;
  const remaining = total % 7 === 0 ? 0 : 7 - (total % 7);
  for (let d = 1; d <= remaining; d++) {
    const el = document.createElement('div');
    el.className = 'cal-day other-month';
    el.textContent = d;
    grid.appendChild(el);
  }

  renderEventList(eventMap);
}

function renderEventList(eventMap) {
  const list = $('event-list');
  list.innerHTML = '';
  const { calYear: y, calMonth: m } = state;

  // 当月のイベントをまとめて日付順
  const monthStr = `${y}-${String(m+1).padStart(2,'0')}`;
  const items = [];
  Object.entries(eventMap).forEach(([date, evs]) => {
    if (date.startsWith(monthStr)) {
      evs.forEach(ev => items.push({...ev, date}));
    }
  });
  items.sort((a,b) => (a.date+a.time) < (b.date+b.time) ? -1 : 1);

  if (!items.length) {
    list.innerHTML = '<div class="empty-state"><i class="fas fa-calendar"></i>予定なし</div>';
    return;
  }

  items.forEach(ev => {
    const el = document.createElement('div');
    el.className = `event-item ${ev.color || 'blue'}`;
    el.innerHTML = `
      <span class="event-date-badge">${formatDateJa(ev.date)}</span>
      <span class="event-title">${escHtml(ev.title)}</span>
      ${ev.time ? `<span class="event-time">${ev.time}</span>` : ''}
      <button class="event-del-btn" title="削除"><i class="fas fa-times"></i></button>
    `;
    el.querySelector('.event-del-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm(`「${ev.title}」を削除しますか？`)) {
        await api('DELETE', `/api/events/${ev.id}`);
        await loadEvents();
      }
    });
    list.appendChild(el);
  });
}

async function loadEvents() {
  try {
    state.events = await api('GET', '/api/events');
    renderCalendar();
  } catch(e) { console.error(e); }
}

// ─ メモ ──────────────────────────────────────────
function renderMemos() {
  const list = $('memo-list');
  list.innerHTML = '';

  if (!state.memos.length) {
    list.innerHTML = '<div class="empty-state"><i class="fas fa-sticky-note"></i>メモなし</div>';
    return;
  }

  state.memos.forEach(memo => {
    const el = document.createElement('div');
    el.className = `memo-card ${memo.color || 'yellow'}${memo.pinned ? ' pinned' : ''}`;
    el.innerHTML = `
      <div class="memo-text">${escHtml(memo.content)}</div>
      <div class="memo-actions">
        <button class="memo-btn pin-btn" title="${memo.pinned ? '固定解除' : '固定'}">
          <i class="fas ${memo.pinned ? 'fa-thumbtack' : 'fa-thumbtack'}" style="opacity:${memo.pinned?1:.4}"></i>
        </button>
        <button class="memo-btn edit-btn"><i class="fas fa-edit"></i></button>
        <button class="memo-btn del-btn"><i class="fas fa-trash"></i></button>
      </div>
    `;
    el.querySelector('.pin-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      await api('PUT', `/api/memos/${memo.id}`, { pinned: !memo.pinned });
      await loadMemos();
    });
    el.querySelector('.edit-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      state.editMemoId = memo.id;
      $('memo-content').value = memo.content;
      state.selectedColor = memo.color || 'yellow';
      highlightColor('color-btn', state.selectedColor);
      openModal('memo-modal');
    });
    el.querySelector('.del-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (confirm('このメモを削除しますか？')) {
        await api('DELETE', `/api/memos/${memo.id}`);
        await loadMemos();
      }
    });
    list.appendChild(el);
  });
}

async function loadMemos() {
  try {
    state.memos = await api('GET', '/api/memos');
    renderMemos();
  } catch(e) { console.error(e); }
}

// ─ タスク ─────────────────────────────────────────
function renderTasks() {
  const list = $('task-list');
  list.innerHTML = '';

  if (!state.tasks.length) {
    list.innerHTML = '<div class="empty-state"><i class="fas fa-check-circle"></i>タスクなし</div>';
    return;
  }

  const today = toDateStr(new Date());

  state.tasks.forEach(task => {
    const el = document.createElement('div');
    el.className = `task-item${task.done ? ' done' : ''}`;

    const isOverdue = task.due_date && task.due_date < today && !task.done;
    el.innerHTML = `
      <div class="task-check"></div>
      <div class="task-info">
        <div class="task-title">${escHtml(task.title)}</div>
        ${task.due_date ? `<div class="task-due${isOverdue?' overdue':''}">${isOverdue?'⚠ ':''}${formatDateJa(task.due_date)}まで</div>` : ''}
      </div>
      <div class="task-priority ${task.priority || 'normal'}"></div>
      <button class="task-del-btn"><i class="fas fa-times"></i></button>
    `;

    el.querySelector('.task-check').addEventListener('click', async () => {
      await api('PUT', `/api/tasks/${task.id}`, { done: !task.done });
      await loadTasks();
    });
    el.querySelector('.task-del-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      await api('DELETE', `/api/tasks/${task.id}`);
      await loadTasks();
    });
    list.appendChild(el);
  });
}

async function loadTasks() {
  try {
    state.tasks = await api('GET', '/api/tasks');
    renderTasks();
  } catch(e) { console.error(e); }
}

// ─ モーダル ───────────────────────────────────────
function openModal(id) {
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  $(id).classList.remove('hidden');
}

function closeAllModals() {
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
}

function highlightColor(cls, value) {
  document.querySelectorAll(`.${cls}`).forEach(b => b.classList.remove('selected'));
  document.querySelectorAll(`.${cls}[data-color="${value}"]`).forEach(b => b.classList.add('selected'));
}

function highlightPriority(value) {
  document.querySelectorAll('.prio-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.priority === value);
  });
}

// ─ モーダルイベント設定 ──────────────────────────

// メモ
on($('memo-add-btn'), 'click', () => {
  state.editMemoId = null;
  $('memo-content').value = '';
  state.selectedColor = 'yellow';
  highlightColor('color-btn', 'yellow');
  openModal('memo-modal');
  setTimeout(() => $('memo-content').focus(), 100);
});

document.querySelectorAll('#memo-modal .color-btn').forEach(btn => {
  on(btn, 'click', () => {
    state.selectedColor = btn.dataset.color;
    highlightColor('color-btn', state.selectedColor);
  });
});

on($('memo-cancel'), 'click', closeAllModals);
on($('memo-save'), 'click', async () => {
  const content = $('memo-content').value.trim();
  if (!content) { alert('内容を入力してください'); return; }
  if (state.editMemoId) {
    await api('PUT', `/api/memos/${state.editMemoId}`, { content, color: state.selectedColor });
  } else {
    await api('POST', '/api/memos', { content, color: state.selectedColor });
  }
  closeAllModals();
  await loadMemos();
});

// タスク
on($('task-add-btn'), 'click', () => {
  $('task-title').value = '';
  $('task-due').value = '';
  state.selectedPriority = 'normal';
  highlightPriority('normal');
  openModal('task-modal');
  setTimeout(() => $('task-title').focus(), 100);
});

document.querySelectorAll('.prio-btn').forEach(btn => {
  on(btn, 'click', () => {
    state.selectedPriority = btn.dataset.priority;
    highlightPriority(state.selectedPriority);
  });
});

on($('task-cancel'), 'click', closeAllModals);
on($('task-save'), 'click', async () => {
  const title = $('task-title').value.trim();
  if (!title) { alert('タスク名を入力してください'); return; }
  await api('POST', '/api/tasks', {
    title,
    due_date: $('task-due').value || null,
    priority: state.selectedPriority,
  });
  closeAllModals();
  await loadTasks();
});

// イベント
on($('cal-add-btn'), 'click', () => {
  $('event-title').value = '';
  $('event-date').value = state.selectedCalDate || toDateStr(new Date());
  $('event-time').value = '';
  state.selectedEventColor = 'blue';
  highlightColor('color-btn', 'blue');
  openModal('event-modal');
  setTimeout(() => $('event-title').focus(), 100);
});

document.querySelectorAll('#event-modal .color-btn').forEach(btn => {
  on(btn, 'click', () => {
    state.selectedEventColor = btn.dataset.color;
    // event-modal内のcolor-btnだけを対象に
    document.querySelectorAll('#event-modal .color-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  });
});

on($('event-cancel'), 'click', closeAllModals);
on($('event-save'), 'click', async () => {
  const title = $('event-title').value.trim();
  const date  = $('event-date').value;
  if (!title || !date) { alert('タイトルと日付を入力してください'); return; }
  await api('POST', '/api/events', {
    title, date,
    time: $('event-time').value || null,
    color: state.selectedEventColor,
  });
  closeAllModals();
  await loadEvents();
});

// カレンダーナビ
on($('cal-prev'), 'click', () => {
  state.calMonth--;
  if (state.calMonth < 0) { state.calMonth = 11; state.calYear--; }
  renderCalendar();
});
on($('cal-next'), 'click', () => {
  state.calMonth++;
  if (state.calMonth > 11) { state.calMonth = 0; state.calYear++; }
  renderCalendar();
});

// 設定
on($('settings-btn'), 'click', () => {
  $('set-family').value    = state.settings.family_name || '';
  $('set-weather-key').value = state.settings.weather_api_key || '';
  $('set-city').value      = state.settings.city || 'Tokyo';
  openModal('settings-modal');
  setTimeout(() => $('set-family').focus(), 100);
});
on($('settings-cancel'), 'click', closeAllModals);
on($('settings-save'), 'click', async () => {
  await api('PUT', '/api/settings', {
    family_name: $('set-family').value || 'おうちダッシュボード',
    weather_api_key: $('set-weather-key').value,
    city: $('set-city').value || 'Tokyo',
  });
  closeAllModals();
  await loadSettings();
  await loadWeather();
});

// モーダル外クリックで閉じる
document.querySelectorAll('.modal').forEach(modal => {
  on(modal, 'click', (e) => {
    if (e.target === modal) closeAllModals();
  });
});

// 更新ボタン
on($('refresh-btn'), 'click', async () => {
  await Promise.all([loadMemos(), loadTasks(), loadEvents(), loadWeather()]);
  $('last-update').textContent = `最終更新: ${new Date().toLocaleTimeString('ja-JP')}`;
});

// ログアウトボタン
on($('logout-btn'), 'click', async () => {
  if (!confirm('ログアウトしますか？')) return;
  const token = getSessionToken();
  await fetch('/auth/logout', {
    method: 'POST',
    headers: token ? { 'Authorization': 'Bearer ' + token } : {}
  });
  try { localStorage.removeItem('session_token'); } catch(e) {}
  window.location.href = '/login';
});

// ─ スクリーンウェイクロック (PWAキオスク用) ──────────
async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      await navigator.wakeLock.request('screen');
    } catch(e) { /* iOS非対応の場合無視 */ }
  }
}

// ─ Service Worker登録 ────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(e => console.warn('SW登録失敗:', e));
}

// ─ エスケープ ─────────────────────────────────────
function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/\n/g,'<br>');
}

// ─ 初期化 ────────────────────────────────────────
async function init() {
  // トークン確認 → なければログインへ
  const token = getSessionToken();
  if (!token) {
    window.location.href = '/login';
    return;
  }
  // サーバー側でもトークン確認
  try {
    const me = await fetch('/auth/me', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await me.json();
    if (!data.authenticated) {
      try { localStorage.removeItem('session_token'); } catch(e) {}
      window.location.href = '/login';
      return;
    }
  } catch(e) { /* ネットワークエラーは無視して続行 */ }

  const now = new Date();
  state.calYear  = now.getFullYear();
  state.calMonth = now.getMonth();

  await loadSettings();
  await Promise.all([loadMemos(), loadTasks(), loadEvents()]);
  await loadWeather();

  // 天気を30分ごと更新
  setInterval(loadWeather, 30 * 60 * 1000);

  $('last-update').textContent = `最終更新: ${now.toLocaleTimeString('ja-JP')}`;

  // 画面スリープ防止
  requestWakeLock();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestWakeLock();
  });

  // メモ色のデフォルト選択
  highlightColor('color-btn', 'yellow');
  highlightPriority('normal');

  // 5分ごとにデータ更新（自動リフレッシュ）
  setInterval(async () => {
    await Promise.all([loadMemos(), loadTasks(), loadEvents()]);
    $('last-update').textContent = `最終更新: ${new Date().toLocaleTimeString('ja-JP')}`;
  }, 5 * 60 * 1000);
}

document.addEventListener('DOMContentLoaded', init);
