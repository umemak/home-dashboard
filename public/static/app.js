/* ========================================
   おうちダッシュボード - フロントエンド
   ======================================== */
'use strict';

// ─ セッショントークン ─────────────────────────────
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
  if (res.status === 401 || res.status === 403) {
    try { localStorage.removeItem('session_token'); } catch(e) {}
    window.location.href = '/login';
    return null;
  }
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ─ 日付ユーティリティ ─────────────────────────────
const WEEKDAYS_JA = ['日','月','火','水','木','金','土'];
const MONTHS_JA = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

function toDateStr(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth()+1).padStart(2,'0') + '-' +
    String(d.getDate()).padStart(2,'0');
}
function formatDateJa(s) {
  if (!s) return '';
  const p = s.split('-');
  return p[1] + '/' + p[2];
}
function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    .replace(/\n/g,'<br>');
}

// ─ メイン（DOMContentLoaded後にのみ実行）────────────
document.addEventListener('DOMContentLoaded', function() {

  // ログインページなら何もしない
  if (!document.getElementById('clock')) return;

  // ─ 状態管理 ───────────────────────────────────
  var state = {
    memos: [], tasks: [], events: [], settings: {},
    calYear: 0, calMonth: 0,
    selectedColor: 'yellow', selectedEventColor: 'blue',
    selectedPriority: 'normal', editMemoId: null, selectedCalDate: null,
  };

  function $(id) { return document.getElementById(id); }
  function on(el, ev, fn) { if (el) el.addEventListener(ev, fn); }

  // ─ 時計 ──────────────────────────────────────
  function updateClock() {
    var now = new Date();
    var h = String(now.getHours()).padStart(2,'0');
    var mi = String(now.getMinutes()).padStart(2,'0');
    $('clock').textContent = h + ':' + mi;
    var wd = WEEKDAYS_JA[now.getDay()];
    var mo = MONTHS_JA[now.getMonth()];
    $('date-display').textContent = now.getFullYear() + '年 ' + mo + now.getDate() + '日（' + wd + '）';
  }
  setInterval(updateClock, 1000);
  updateClock();

  // ─ 天気 ──────────────────────────────────────
  var WEATHER_ICONS = {
    Clear:'fa-sun', Clouds:'fa-cloud', Rain:'fa-cloud-rain',
    Drizzle:'fa-cloud-drizzle', Snow:'fa-snowflake',
    Thunderstorm:'fa-bolt', Mist:'fa-smog', Fog:'fa-smog', Haze:'fa-smog',
  };
  async function loadWeather() {
    var key = state.settings.weather_api_key;
    var city = state.settings.city || 'Tokyo';
    if (!key) return;
    try {
      var res = await fetch('https://api.openweathermap.org/data/2.5/weather?q=' +
        encodeURIComponent(city) + '&appid=' + key + '&units=metric&lang=ja');
      if (!res.ok) return;
      var d = await res.json();
      var temp = Math.round(d.main.temp);
      var desc = d.weather[0].description;
      var icon = WEATHER_ICONS[d.weather[0].main] || 'fa-cloud';
      $('weather-temp').textContent = temp + '°C';
      $('weather-desc').textContent = desc;
      $('weather-icon').innerHTML = '<i class="fas ' + icon + ' fa-2x"></i>';
    } catch(e) {}
  }

  // ─ 設定 ──────────────────────────────────────
  async function loadSettings() {
    try {
      var data = await api('GET', '/api/settings');
      if (!data) return;
      state.settings = data;
      $('family-name').textContent = data.family_name || 'おうちダッシュボード';
    } catch(e) {}
  }

  // ─ カレンダー ─────────────────────────────────
  function renderCalendar() {
    var y = state.calYear, m = state.calMonth;
    $('cal-title').textContent = y + '年' + MONTHS_JA[m];
    var grid = $('calendar-grid');
    grid.innerHTML = '';
    WEEKDAYS_JA.forEach(function(wd, i) {
      var el = document.createElement('div');
      el.className = 'cal-day-header';
      el.textContent = wd;
      if (i===0) el.style.color = '#ff7675';
      if (i===6) el.style.color = '#74b9ff';
      grid.appendChild(el);
    });
    var today = toDateStr(new Date());
    var firstDay = new Date(y, m, 1).getDay();
    var daysInMonth = new Date(y, m+1, 0).getDate();
    var daysInPrev  = new Date(y, m, 0).getDate();

    var eventMap = {};
    state.events.forEach(function(ev) {
      if (!eventMap[ev.date]) eventMap[ev.date] = [];
      eventMap[ev.date].push(ev);
    });

    for (var i=0; i<firstDay; i++) {
      var el = document.createElement('div');
      el.className = 'cal-day other-month';
      el.textContent = daysInPrev - firstDay + i + 1;
      grid.appendChild(el);
    }
    for (var d=1; d<=daysInMonth; d++) {
      var ds = y + '-' + String(m+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
      var dow = new Date(y,m,d).getDay();
      var el = document.createElement('div');
      var cls = 'cal-day';
      if (ds===today) cls += ' today';
      if (dow===0) cls += ' sunday';
      if (dow===6) cls += ' saturday';
      el.className = cls;
      el.textContent = d;
      if (eventMap[ds] && eventMap[ds].length) {
        var row = document.createElement('div');
        row.className = 'cal-dot-row';
        eventMap[ds].slice(0,3).forEach(function(ev) {
          var dot = document.createElement('div');
          dot.className = 'cal-dot ' + (ev.color||'blue');
          row.appendChild(dot);
        });
        el.appendChild(row);
      }
      (function(dateStr) {
        el.addEventListener('click', function() {
          state.selectedCalDate = dateStr;
          $('event-date').value = dateStr;
          openModal('event-modal');
        });
      })(ds);
      grid.appendChild(el);
    }
    var total = firstDay + daysInMonth;
    var rem = total%7===0 ? 0 : 7-(total%7);
    for (var d=1; d<=rem; d++) {
      var el = document.createElement('div');
      el.className = 'cal-day other-month';
      el.textContent = d;
      grid.appendChild(el);
    }
    renderEventList(eventMap);
  }

  function renderEventList(eventMap) {
    var list = $('event-list');
    list.innerHTML = '';
    var y = state.calYear, m = state.calMonth;
    var monthStr = y + '-' + String(m+1).padStart(2,'0');
    var items = [];
    Object.keys(eventMap).forEach(function(date) {
      if (date.startsWith(monthStr)) {
        eventMap[date].forEach(function(ev) { items.push(Object.assign({}, ev, {date: date})); });
      }
    });
    items.sort(function(a,b){ return (a.date+a.time) < (b.date+b.time) ? -1 : 1; });
    if (!items.length) {
      list.innerHTML = '<div class="empty-state"><i class="fas fa-calendar"></i>予定なし</div>';
      return;
    }
    items.forEach(function(ev) {
      var el = document.createElement('div');
      el.className = 'event-item ' + (ev.color||'blue');
      el.innerHTML = '<span class="event-date-badge">' + formatDateJa(ev.date) + '</span>' +
        '<span class="event-title">' + escHtml(ev.title) + '</span>' +
        (ev.time ? '<span class="event-time">'+ev.time+'</span>' : '') +
        '<button class="event-del-btn" title="削除"><i class="fas fa-times"></i></button>';
      el.querySelector('.event-del-btn').addEventListener('click', async function(e) {
        e.stopPropagation();
        if (confirm('「' + ev.title + '」を削除しますか？')) {
          await api('DELETE', '/api/events/' + ev.id);
          await loadEvents();
        }
      });
      list.appendChild(el);
    });
  }

  async function loadEvents() {
    try {
      var data = await api('GET', '/api/events');
      if (data) { state.events = data; renderCalendar(); }
    } catch(e) {}
  }

  // ─ メモ ──────────────────────────────────────
  function renderMemos() {
    var list = $('memo-list');
    list.innerHTML = '';
    if (!state.memos.length) {
      list.innerHTML = '<div class="empty-state"><i class="fas fa-sticky-note"></i>メモなし</div>';
      return;
    }
    state.memos.forEach(function(memo) {
      var el = document.createElement('div');
      el.className = 'memo-card ' + (memo.color||'yellow') + (memo.pinned ? ' pinned' : '');
      el.innerHTML = '<div class="memo-text">' + escHtml(memo.content) + '</div>' +
        '<div class="memo-actions">' +
        '<button class="memo-btn pin-btn"><i class="fas fa-thumbtack" style="opacity:' + (memo.pinned?1:.4) + '"></i></button>' +
        '<button class="memo-btn edit-btn"><i class="fas fa-edit"></i></button>' +
        '<button class="memo-btn del-btn"><i class="fas fa-trash"></i></button>' +
        '</div>';
      el.querySelector('.pin-btn').addEventListener('click', async function(e) {
        e.stopPropagation();
        await api('PUT', '/api/memos/'+memo.id, {pinned: !memo.pinned});
        await loadMemos();
      });
      el.querySelector('.edit-btn').addEventListener('click', function(e) {
        e.stopPropagation();
        state.editMemoId = memo.id;
        $('memo-content').value = memo.content;
        state.selectedColor = memo.color || 'yellow';
        highlightColor('color-btn', state.selectedColor);
        openModal('memo-modal');
      });
      el.querySelector('.del-btn').addEventListener('click', async function(e) {
        e.stopPropagation();
        if (confirm('このメモを削除しますか？')) {
          await api('DELETE', '/api/memos/'+memo.id);
          await loadMemos();
        }
      });
      list.appendChild(el);
    });
  }

  async function loadMemos() {
    try {
      var data = await api('GET', '/api/memos');
      if (data) { state.memos = data; renderMemos(); }
    } catch(e) {}
  }

  // ─ タスク ─────────────────────────────────────
  function renderTasks() {
    var list = $('task-list');
    list.innerHTML = '';
    if (!state.tasks.length) {
      list.innerHTML = '<div class="empty-state"><i class="fas fa-check-circle"></i>タスクなし</div>';
      return;
    }
    var today = toDateStr(new Date());
    state.tasks.forEach(function(task) {
      var el = document.createElement('div');
      el.className = 'task-item' + (task.done ? ' done' : '');
      var isOverdue = task.due_date && task.due_date < today && !task.done;
      el.innerHTML =
        '<div class="task-check"></div>' +
        '<div class="task-info">' +
          '<div class="task-title">' + escHtml(task.title) + '</div>' +
          (task.due_date ? '<div class="task-due' + (isOverdue?' overdue':'') + '">' + (isOverdue?'⚠ ':'') + formatDateJa(task.due_date) + 'まで</div>' : '') +
        '</div>' +
        '<div class="task-priority ' + (task.priority||'normal') + '"></div>' +
        '<button class="task-del-btn"><i class="fas fa-times"></i></button>';
      el.querySelector('.task-check').addEventListener('click', async function() {
        await api('PUT', '/api/tasks/'+task.id, {done: !task.done});
        await loadTasks();
      });
      el.querySelector('.task-del-btn').addEventListener('click', async function(e) {
        e.stopPropagation();
        await api('DELETE', '/api/tasks/'+task.id);
        await loadTasks();
      });
      list.appendChild(el);
    });
  }

  async function loadTasks() {
    try {
      var data = await api('GET', '/api/tasks');
      if (data) { state.tasks = data; renderTasks(); }
    } catch(e) {}
  }

  // ─ モーダル ───────────────────────────────────
  function openModal(id) {
    document.querySelectorAll('.modal').forEach(function(m){ m.classList.add('hidden'); });
    var el = $(id);
    if (el) el.classList.remove('hidden');
  }
  function closeAllModals() {
    document.querySelectorAll('.modal').forEach(function(m){ m.classList.add('hidden'); });
  }
  function highlightColor(cls, value) {
    document.querySelectorAll('.'+cls).forEach(function(b){ b.classList.remove('selected'); });
    document.querySelectorAll('.'+cls+'[data-color="'+value+'"]').forEach(function(b){ b.classList.add('selected'); });
  }
  function highlightPriority(value) {
    document.querySelectorAll('.prio-btn').forEach(function(b){
      b.classList.toggle('active', b.dataset.priority===value);
    });
  }

  // ─ モーダルイベント ───────────────────────────

  // メモ
  on($('memo-add-btn'), 'click', function() {
    state.editMemoId = null;
    $('memo-content').value = '';
    state.selectedColor = 'yellow';
    highlightColor('color-btn', 'yellow');
    openModal('memo-modal');
    setTimeout(function(){ $('memo-content').focus(); }, 100);
  });
  document.querySelectorAll('#memo-modal .color-btn').forEach(function(btn) {
    on(btn, 'click', function() {
      state.selectedColor = btn.dataset.color;
      highlightColor('color-btn', state.selectedColor);
    });
  });
  on($('memo-cancel'), 'click', closeAllModals);
  on($('memo-save'), 'click', async function() {
    var content = $('memo-content').value.trim();
    if (!content) { alert('内容を入力してください'); return; }
    if (state.editMemoId) {
      await api('PUT', '/api/memos/'+state.editMemoId, {content, color: state.selectedColor});
    } else {
      await api('POST', '/api/memos', {content, color: state.selectedColor});
    }
    closeAllModals();
    await loadMemos();
  });

  // タスク
  on($('task-add-btn'), 'click', function() {
    $('task-title').value = '';
    $('task-due').value = '';
    state.selectedPriority = 'normal';
    highlightPriority('normal');
    openModal('task-modal');
    setTimeout(function(){ $('task-title').focus(); }, 100);
  });
  document.querySelectorAll('.prio-btn').forEach(function(btn) {
    on(btn, 'click', function() {
      state.selectedPriority = btn.dataset.priority;
      highlightPriority(state.selectedPriority);
    });
  });
  on($('task-cancel'), 'click', closeAllModals);
  on($('task-save'), 'click', async function() {
    var title = $('task-title').value.trim();
    if (!title) { alert('タスク名を入力してください'); return; }
    await api('POST', '/api/tasks', {title, due_date: $('task-due').value||null, priority: state.selectedPriority});
    closeAllModals();
    await loadTasks();
  });

  // イベント
  on($('cal-add-btn'), 'click', function() {
    $('event-title').value = '';
    $('event-date').value = state.selectedCalDate || toDateStr(new Date());
    $('event-time').value = '';
    state.selectedEventColor = 'blue';
    document.querySelectorAll('#event-modal .color-btn').forEach(function(b){ b.classList.remove('selected'); });
    openModal('event-modal');
    setTimeout(function(){ $('event-title').focus(); }, 100);
  });
  document.querySelectorAll('#event-modal .color-btn').forEach(function(btn) {
    on(btn, 'click', function() {
      state.selectedEventColor = btn.dataset.color;
      document.querySelectorAll('#event-modal .color-btn').forEach(function(b){ b.classList.remove('selected'); });
      btn.classList.add('selected');
    });
  });
  on($('event-cancel'), 'click', closeAllModals);
  on($('event-save'), 'click', async function() {
    var title = $('event-title').value.trim();
    var date  = $('event-date').value;
    if (!title || !date) { alert('タイトルと日付を入力してください'); return; }
    await api('POST', '/api/events', {title, date, time: $('event-time').value||null, color: state.selectedEventColor});
    closeAllModals();
    await loadEvents();
  });

  // カレンダーナビ
  on($('cal-prev'), 'click', function() {
    state.calMonth--;
    if (state.calMonth<0){ state.calMonth=11; state.calYear--; }
    renderCalendar();
  });
  on($('cal-next'), 'click', function() {
    state.calMonth++;
    if (state.calMonth>11){ state.calMonth=0; state.calYear++; }
    renderCalendar();
  });

  // 設定
  on($('settings-btn'), 'click', function() {
    $('set-family').value = state.settings.family_name || '';
    $('set-weather-key').value = state.settings.weather_api_key || '';
    $('set-city').value = state.settings.city || 'Tokyo';
    openModal('settings-modal');
  });
  on($('settings-cancel'), 'click', closeAllModals);
  on($('settings-save'), 'click', async function() {
    await api('PUT', '/api/settings', {
      family_name: $('set-family').value || 'おうちダッシュボード',
      weather_api_key: $('set-weather-key').value,
      city: $('set-city').value || 'Tokyo',
    });
    closeAllModals();
    await loadSettings();
    await loadWeather();
  });

  // モーダル外クリック
  document.querySelectorAll('.modal').forEach(function(modal) {
    on(modal, 'click', function(e) { if (e.target===modal) closeAllModals(); });
  });

  // 更新ボタン
  on($('refresh-btn'), 'click', async function() {
    await Promise.all([loadMemos(), loadTasks(), loadEvents(), loadWeather()]);
    $('last-update').textContent = '最終更新: ' + new Date().toLocaleTimeString('ja-JP');
  });

  // ログアウト
  on($('logout-btn'), 'click', async function() {
    if (!confirm('ログアウトしますか？')) return;
    var token = getSessionToken();
    await fetch('/auth/logout', {
      method: 'POST',
      headers: token ? {'Authorization': 'Bearer '+token} : {}
    });
    try { localStorage.removeItem('session_token'); } catch(e) {}
    window.location.href = '/login';
  });

  // ─ Wake Lock ──────────────────────────────────
  async function requestWakeLock() {
    if ('wakeLock' in navigator) {
      try { await navigator.wakeLock.request('screen'); } catch(e) {}
    }
  }

  // ─ Service Worker ─────────────────────────────
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(function(){});
  }

  // ─ 初期化処理 ─────────────────────────────────
  async function init() {
    // トークン確認
    var token = getSessionToken();
    if (!token) {
      window.location.href = '/login';
      return;
    }

    // 認証確認 & メール表示
    try {
      var res = await fetch('/auth/me', {headers: {'Authorization': 'Bearer '+token}});
      var me = await res.json();
      if (!me.authenticated) {
        try { localStorage.removeItem('session_token'); } catch(e) {}
        window.location.href = '/login';
        return;
      }
      var emailEl = $('user-email');
      if (emailEl && me.email) emailEl.textContent = me.email;
    } catch(e) {
      // ネットワークエラーはそのまま続行
    }

    var now = new Date();
    state.calYear  = now.getFullYear();
    state.calMonth = now.getMonth();

    await loadSettings();
    await Promise.all([loadMemos(), loadTasks(), loadEvents()]);
    await loadWeather();

    setInterval(loadWeather, 30*60*1000);
    setInterval(async function() {
      await Promise.all([loadMemos(), loadTasks(), loadEvents()]);
      $('last-update').textContent = '最終更新: ' + new Date().toLocaleTimeString('ja-JP');
    }, 5*60*1000);

    $('last-update').textContent = '最終更新: ' + now.toLocaleTimeString('ja-JP');

    requestWakeLock();
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState==='visible') requestWakeLock();
    });

    highlightColor('color-btn', 'yellow');
    highlightPriority('normal');
  }

  init();
});
