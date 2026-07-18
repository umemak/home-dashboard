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
  try {
    const res = await fetch(path, opts);
    if (res.status === 401 || res.status === 403) {
      // 401/403 はリトライしてから諦める
      await new Promise(function(r){ setTimeout(r, 1500); });
      const res2 = await fetch(path, opts);
      if (res2.status === 401 || res2.status === 403) {
        try { localStorage.removeItem('session_token'); } catch(e) {}
        window.location.href = '/login';
        return null;
      }
      if (!res2.ok) throw new Error(await res2.text());
      return res2.json();
    }
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  } catch(e) {
    // ネットワークエラーはnullを返す（ログアウトしない）
    console.warn('api error:', path, e);
    return null;
  }
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
  var WEEKDAYS_SHORT = ['日','月','火','水','木','金','土'];

  function weatherIcon(main) {
    return WEATHER_ICONS[main] || 'fa-cloud';
  }

  async function loadWeather() {
    if (!state.settings.weather_api_key) return;
    try {
      var res = await api('GET', '/api/weather/forecast');
      if (!res) return;

      // 今日の天気
      var cur = res.current;
      var icon = weatherIcon(cur.weather);
      $('weather-icon').innerHTML = '<i class="fas ' + icon + ' fa-2x"></i>';
      $('weather-temp').textContent = cur.temp + '°C';
      $('weather-minmax').textContent = '↑' + cur.temp_max + ' ↓' + cur.temp_min;
      $('weather-desc').textContent = cur.description;


      // 3時間ごと予報（今日・明日）
      var nowDate = new Date();
      var nowJSTH = (nowDate.getUTCHours() + 9) % 24;

      function buildHourlyItems(container, hourlyData, todayDate) {
        container.innerHTML = '';
        if (!hourlyData || !hourlyData.length) return;
        var prevDate = '';
        hourlyData.forEach(function(h) {
          if (h.date === todayDate && h.hour < nowJSTH) return;
          var ic = weatherIcon(h.weather);
          if (h.date !== prevDate) {
            var sep = document.createElement('div');
            sep.className = 'hl-sep';
            sep.textContent = h.date === todayDate ? '今日' : '明日';
            container.appendChild(sep);
            prevDate = h.date;
          }
          var el = document.createElement('div');
          el.className = 'hl-item';
          el.innerHTML =
            '<div class="hl-hour">' + String(h.hour).padStart(2,'0') + '時</div>' +
            '<i class="fas ' + ic + ' hl-icon"></i>' +
            '<div class="hl-temp">' + h.temp + '°</div>' +
            (h.pop > 0 ? '<div class="hl-pop">' + h.pop + '%</div>' : '<div class="hl-pop"></div>');
          container.appendChild(el);
        });
      }

      function buildForecastItems(container, forecastData) {
        container.innerHTML = '';
        forecastData.forEach(function(day, i) {
          var date = new Date(day.date + 'T00:00:00');
          var wd = WEEKDAYS_SHORT[date.getDay()];
          var label = i === 0 ? '今日' : (i === 1 ? '明日' : (date.getMonth()+1) + '/' + date.getDate() + '(' + wd + ')');
          var ic = weatherIcon(day.weather);
          var popHtml = day.pop > 0 ? '<span class="fc-pop">' + day.pop + '%</span>' : '';
          var el = document.createElement('div');
          el.className = 'fc-day' + (i === 0 ? ' fc-today' : '');
          el.innerHTML =
            '<div class="fc-label">' + label + '</div>' +
            '<i class="fas ' + ic + ' fc-icon"></i>' +
            popHtml +
            '<div class="fc-temps"><span class="fc-max">' + day.temp_max + '</span><span class="fc-min">' + day.temp_min + '</span></div>';
          container.appendChild(el);
        });
      }

      var todayDate = res.forecast.length ? res.forecast[0].date : '';

      // ヘッダー内（PC/iPad用）
      buildForecastItems($('weather-forecast'), res.forecast);
      buildHourlyItems($('weather-hourly'), res.hourly, todayDate);

      // スマホ詳細パネル用
      buildForecastItems($('weather-detail-forecast'), res.forecast);
      buildHourlyItems($('weather-detail-hourly'), res.hourly, todayDate);

    } catch(e) {}
  }

  // ─ 天気トグル（スマホ用）────────────────────────
  (function() {
    var panel = $('weather-detail-panel');
    var toggleIcon = $('weather-toggle-icon');
    var weatherToday = $('weather-today');
    if (!panel || !weatherToday) return;

    function togglePanel(e) {
      e.preventDefault();
      e.stopPropagation();
      var isOpen = !panel.classList.contains('hidden');
      panel.classList.toggle('hidden', isOpen);
      if (toggleIcon) toggleIcon.classList.toggle('open', !isOpen);
    }

    // touchstart + click 両方登録（iOS Safari対応）
    weatherToday.addEventListener('touchstart', togglePanel, { passive: false });
    weatherToday.addEventListener('click', function(e) {
      // touchstart で処理済みの場合は無視
      e.stopPropagation();
    });

    // パネル外タップで閉じる
    document.addEventListener('touchstart', function(e) {
      if (!panel.classList.contains('hidden') &&
          !weatherToday.contains(e.target) &&
          !panel.contains(e.target)) {
        panel.classList.add('hidden');
        if (toggleIcon) toggleIcon.classList.remove('open');
      }
    }, { passive: true });
    document.addEventListener('click', function(e) {
      if (!panel.classList.contains('hidden') &&
          !weatherToday.contains(e.target) &&
          !panel.contains(e.target)) {
        panel.classList.add('hidden');
        if (toggleIcon) toggleIcon.classList.remove('open');
      }
    });
  })();

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
    var firstDay   = new Date(y, m, 1).getDay();
    var daysInMonth= new Date(y, m+1, 0).getDate();
    var daysInPrev = new Date(y, m, 0).getDate();

    // 単日イベントマップ（開始日キー）
    var eventMap = {};
    // 期間バーマップ（各日付 -> [{ev, pos}]）
    var rangeMap = {};

    state.events.forEach(function(ev) {
      if (!ev.end_date) {
        // 単日
        if (!eventMap[ev.date]) eventMap[ev.date] = [];
        eventMap[ev.date].push(ev);
      } else {
        // 期間: 開始日〜終了日の各日に登録
        var cur = new Date(ev.date + 'T00:00:00');
        var end = new Date(ev.end_date + 'T00:00:00');
        while (cur <= end) {
          var ds2 = toDateStr(cur);
          if (!rangeMap[ds2]) rangeMap[ds2] = [];
          var pos = (ds2 === ev.date && ds2 === ev.end_date) ? 'single'
                  : (ds2 === ev.date)     ? 'start'
                  : (ds2 === ev.end_date) ? 'end' : 'mid';
          rangeMap[ds2].push({ ev: ev, pos: pos });
          cur.setDate(cur.getDate() + 1);
        }
        // イベントリスト用: 開始日に登録
        if (!eventMap[ev.date]) eventMap[ev.date] = [];
        eventMap[ev.date].push(ev);
      }
    });

    // 前月末尾
    for (var i=0; i<firstDay; i++) {
      var el = document.createElement('div');
      el.className = 'cal-day other-month';
      el.textContent = daysInPrev - firstDay + i + 1;
      grid.appendChild(el);
    }
    // 当月
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

      // 単日イベントの点（最大3個）
      var singleEvs = (eventMap[ds]||[]).filter(function(ev){ return !ev.end_date; });
      if (singleEvs.length) {
        var row = document.createElement('div');
        row.className = 'cal-dot-row';
        singleEvs.slice(0,3).forEach(function(ev) {
          var dot = document.createElement('div');
          dot.className = 'cal-dot ' + (ev.color||'blue');
          row.appendChild(dot);
        });
        el.appendChild(row);
      }

      // 期間イベントのバー（最大2本）
      if (rangeMap[ds]) {
        rangeMap[ds].slice(0,2).forEach(function(item, idx) {
          var bar = document.createElement('div');
          bar.className = 'range-bar ' + (item.ev.color||'blue');
          // 位置で角丸を調整
          if (item.pos==='start')  bar.style.cssText += 'border-radius:3px 0 0 3px;left:4px;';
          else if (item.pos==='end') bar.style.cssText += 'border-radius:0 3px 3px 0;right:4px;';
          else if (item.pos==='mid') bar.style.cssText += 'border-radius:0;';
          // 2本目は少し上にずらす
          bar.style.bottom = (4 + idx * 5) + 'px';
          el.appendChild(bar);
        });
      }

      (function(dateStr) {
        el.addEventListener('click', function() {
          state.selectedCalDate = dateStr;
          $('event-date').value = dateStr;
          $('event-end-date').value = '';
          openModal('event-modal');
        });
      })(ds);
      grid.appendChild(el);
    }
    // 翌月先頭
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
        eventMap[date].forEach(function(ev) { items.push(ev); });
      }
    });
    items.sort(function(a,b){ return (a.date+(a.time||'')) < (b.date+(b.time||'')) ? -1 : 1; });
    if (!items.length) {
      list.innerHTML = '<div class="empty-state"><i class="fas fa-calendar"></i>予定なし</div>';
      return;
    }
    items.forEach(function(ev) {
      var el = document.createElement('div');
      el.className = 'event-item ' + (ev.color||'blue');
      // 期間表示: 終了日があれば「6/1〜6/3」形式
      var dateBadge = ev.end_date
        ? formatDateJa(ev.date) + '〜' + formatDateJa(ev.end_date)
        : formatDateJa(ev.date);
      el.innerHTML =
        '<span class="event-date-badge">' + dateBadge + '</span>' +
        '<span class="event-title">' + escHtml(ev.title) + '</span>' +
        (ev.time ? '<span class="event-time">'+ev.time+'</span>' : '') +
        '<button class="event-del-btn" title="削除"><i class="fas fa-times"></i></button>';
      el.querySelector('.event-del-btn').addEventListener('click', async function(e) {
        e.stopPropagation();
        if (confirm('「' + ev.title + '」を削除しますか？')) {
          await api('DELETE', '/api/calendar/' + ev.id);
          await loadEvents();
        }
      });
      list.appendChild(el);
    });
  }

  async function loadEvents() {
    try {
      var data = await api('GET', '/api/calendar');
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
    $('event-end-date').value = '';
    $('event-time').value = '';
    state.selectedEventColor = 'blue';
    document.querySelectorAll('#event-modal .color-btn').forEach(function(b){ b.classList.remove('selected'); });
    openModal('event-modal');
    setTimeout(function(){ $('event-title').focus(); }, 100);
  });
  // 開始日が変わったら終了日の min を更新
  on($('event-date'), 'change', function() {
    var endEl = $('event-end-date');
    endEl.min = $('event-date').value;
    if (endEl.value && endEl.value <= $('event-date').value) endEl.value = '';
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
    var title   = $('event-title').value.trim();
    var date    = $('event-date').value;
    var endDate = $('event-end-date').value || null;
    if (!title || !date) { alert('タイトルと開始日を入力してください'); return; }
    if (endDate && endDate <= date) { alert('終了日は開始日より後にしてください'); return; }
    await api('POST', '/api/calendar', {
      title, date, end_date: endDate,
      time: $('event-time').value || null,
      color: state.selectedEventColor
    });
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

  // ─ タブ切り替え（スマホ・タブレット用）──────────
  function initTabs() {
    var tabs = document.querySelectorAll('.tab-btn');
    if (!tabs.length) return;

    function switchTab(targetId) {
      // タブボタン
      tabs.forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.tab === targetId);
      });
      // パネル
      document.querySelectorAll('.panel').forEach(function(panel) {
        panel.classList.toggle('tab-active', panel.id === targetId);
      });
      // センサータブに切り替わったらデータ取得
      if (targetId === 'sensor-section' && !state.sensorLoaded) {
        loadSensorData();
      }
    }

    tabs.forEach(function(btn) {
      on(btn, 'click', function() { switchTab(btn.dataset.tab); });
    });

    // 初期表示: カレンダー
    switchTab('calendar-section');
  }
  initTabs();

  // ─ センサー ───────────────────────────────────
  var SENSOR_PROXY = '/api/sensor-proxy';
  var sensorChart = null;
  var sensorState = {
    hours: 24,
    activeDevice: null,
    activeMetric: 'temperature',
    data: [],
  };

  var METRIC_CONFIG = {
    temperature: { label: '温度 (°C)',   color: '#ff7675', borderColor: '#ff4757', icon: 'fa-thermometer-half' },
    humidity:    { label: '湿度 (%)',     color: '#74b9ff', borderColor: '#0984e3', icon: 'fa-tint' },
    co2:         { label: 'CO₂ (ppm)',   color: '#55efc4', borderColor: '#00b894', icon: 'fa-wind' },
  };

  function groupByDevice(rows) {
    var map = {};
    rows.forEach(function(r) {
      if (!map[r.device_name]) map[r.device_name] = [];
      map[r.device_name].push(r);
    });
    return map;
  }

  function latestByDevice(rows) {
    var map = {};
    rows.forEach(function(r) {
      if (!map[r.device_name] || r.timestamp > map[r.device_name].timestamp) {
        map[r.device_name] = r;
      }
    });
    return map;
  }

  function renderSensorCards(rows) {
    var latest = latestByDevice(rows);
    var cards = $('sensor-cards');
    if (!cards) return;
    cards.innerHTML = '';
    var devices = Object.keys(latest);
    if (!devices.length) {
      cards.innerHTML = '<div class="empty-state"><i class="fas fa-satellite-dish"></i>センサーデータなし</div>';
      return;
    }
    devices.forEach(function(name) {
      var d = latest[name];
      var ts = d.timestamp ? new Date(d.timestamp.endsWith('Z') ? d.timestamp : d.timestamp + 'Z') : null;
      var age = ts ? Math.round((Date.now() - ts.getTime()) / 60000) : null;
      var ageStr = age !== null ? (age < 60 ? age + '分前' : Math.round(age/60) + '時間前') : '';
      var card = document.createElement('div');
      card.className = 'sensor-card' + (sensorState.activeDevice === name ? ' active' : '');
      card.dataset.device = name;

      var metrics = '';
      if (d.temperature !== null && d.temperature !== undefined)
        metrics += '<span class="sc-metric temp"><i class="fas fa-thermometer-half"></i>' + d.temperature.toFixed(1) + '°C</span>';
      if (d.humidity !== null && d.humidity !== undefined)
        metrics += '<span class="sc-metric hum"><i class="fas fa-tint"></i>' + d.humidity + '%</span>';
      if (d.co2 !== null && d.co2 !== undefined)
        metrics += '<span class="sc-metric co2"><i class="fas fa-wind"></i>' + d.co2 + 'ppm</span>';
      if (d.battery !== null && d.battery !== undefined) {
        var batIcon = d.battery > 50 ? 'fa-battery-full' : d.battery > 20 ? 'fa-battery-half' : 'fa-battery-quarter';
        metrics += '<span class="sc-metric bat"><i class="fas ' + batIcon + '"></i>' + d.battery + '%</span>';
      }

      card.innerHTML =
        '<div class="sc-header">' +
          '<span class="sc-name">' + escHtml(name) + '</span>' +
          '<span class="sc-age">' + ageStr + '</span>' +
        '</div>' +
        '<div class="sc-metrics">' + metrics + '</div>';

      card.addEventListener('click', function() {
        sensorState.activeDevice = name;
        document.querySelectorAll('.sensor-card').forEach(function(c){ c.classList.remove('active'); });
        card.classList.add('active');
        renderSensorChartTabs();
        drawSensorChart();
      });
      cards.appendChild(card);
    });
  }

  function renderSensorChartTabs() {
    var tabEl = $('sensor-chart-tabs');
    if (!tabEl) return;
    tabEl.innerHTML = '';
    var device = sensorState.activeDevice;
    var rows = device ? sensorState.data.filter(function(r){ return r.device_name === device; }) : [];
    // 利用可能なメトリクスを判定
    var metrics = [];
    if (rows.some(function(r){ return r.temperature !== null && r.temperature !== undefined; })) metrics.push('temperature');
    if (rows.some(function(r){ return r.humidity !== null && r.humidity !== undefined; })) metrics.push('humidity');
    if (rows.some(function(r){ return r.co2 !== null && r.co2 !== undefined; })) metrics.push('co2');
    if (!metrics.length) metrics = ['temperature'];
    if (!metrics.includes(sensorState.activeMetric)) sensorState.activeMetric = metrics[0];

    metrics.forEach(function(m) {
      var btn = document.createElement('button');
      btn.className = 'sensor-metric-btn' + (m === sensorState.activeMetric ? ' active' : '');
      btn.dataset.metric = m;
      var cfg = METRIC_CONFIG[m];
      btn.innerHTML = '<i class="fas ' + cfg.icon + '"></i>' + cfg.label;
      btn.addEventListener('click', function() {
        sensorState.activeMetric = m;
        document.querySelectorAll('.sensor-metric-btn').forEach(function(b){ b.classList.remove('active'); });
        btn.classList.add('active');
        drawSensorChart();
      });
      tabEl.appendChild(btn);
    });
  }

  function drawSensorChart() {
    var canvas = $('sensor-chart');
    if (!canvas) return;
    var device = sensorState.activeDevice;
    var metric = sensorState.activeMetric;
    var cfg = METRIC_CONFIG[metric] || METRIC_CONFIG.temperature;

    var rows = (device
      ? sensorState.data.filter(function(r){ return r.device_name === device; })
      : sensorState.data
    ).filter(function(r){ return r[metric] !== null && r[metric] !== undefined; });

    // 時系列昇順
    rows = rows.slice().sort(function(a, b){ return a.timestamp < b.timestamp ? -1 : 1; });

    // 1分バケット平均
    var buckets = {};
    rows.forEach(function(r) {
      var ts = r.timestamp.endsWith('Z') ? r.timestamp : r.timestamp + 'Z';
      var d = new Date(ts);
      // 5分バケット
      d.setSeconds(0, 0);
      d.setMinutes(Math.floor(d.getMinutes() / 5) * 5);
      var key = d.toISOString();
      if (!buckets[key]) buckets[key] = { sum: 0, count: 0, ts: d };
      buckets[key].sum += r[metric];
      buckets[key].count++;
    });
    var sorted = Object.values(buckets).sort(function(a, b){ return a.ts - b.ts; });
    var labels = sorted.map(function(b){
      return b.ts.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    });
    var values = sorted.map(function(b){ return Math.round(b.sum / b.count * 10) / 10; });

    if (sensorChart) {
      sensorChart.destroy();
      sensorChart = null;
    }

    if (!values.length) {
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    sensorChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: cfg.label,
          data: values,
          borderColor: cfg.borderColor,
          backgroundColor: cfg.color + '22',
          borderWidth: 2,
          pointRadius: values.length > 100 ? 0 : 2,
          pointHoverRadius: 4,
          tension: 0.3,
          fill: true,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1a1a2e',
            titleColor: '#a7a9be',
            bodyColor: '#fffffe',
            borderColor: '#2a2a4a',
            borderWidth: 1,
          }
        },
        scales: {
          x: {
            ticks: {
              color: '#a7a9be',
              font: { size: 10 },
              maxTicksLimit: 10,
              maxRotation: 0,
            },
            grid: { color: '#2a2a4a' },
          },
          y: {
            ticks: { color: '#a7a9be', font: { size: 10 } },
            grid: { color: '#2a2a4a' },
          }
        }
      }
    });
  }

  async function loadSensorData() {
    var cards = $('sensor-cards');
    if (cards) cards.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i>読み込み中...</div>';
    try {
      var path = SENSOR_PROXY + '?hours=' + sensorState.hours + '&limit=5000';
      var json = await api('GET', path);
      // api() が null を返す場合はセッション切れ（すでにリダイレクト済み）
      if (!json) return;
      // upstream 認証エラーなどのエラーメッセージを表示
      if (json.error && !json.data) {
        if (cards) cards.innerHTML = '<div class="empty-state"><i class="fas fa-key"></i>' + escHtml(json.error) + '</div>';
        return;
      }
      sensorState.data = json.data || [];
      state.sensorLoaded = true;

      renderSensorCards(sensorState.data);

      // 最初のデバイスを自動選択
      if (!sensorState.activeDevice && sensorState.data.length) {
        var devices = Object.keys(groupByDevice(sensorState.data));
        if (devices.length) {
          sensorState.activeDevice = devices[0];
          var firstCard = document.querySelector('.sensor-card');
          if (firstCard) firstCard.classList.add('active');
        }
      }
      renderSensorChartTabs();
      drawSensorChart();
    } catch(e) {
      console.warn('sensor load error:', e);
      if (cards) cards.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i>取得失敗: ' + e.message + '</div>';
    }
  }

  // 時間範囲ボタン
  document.querySelectorAll('.sensor-range-btn').forEach(function(btn) {
    on(btn, 'click', function() {
      sensorState.hours = parseInt(btn.dataset.hours, 10);
      sensorState.activeDevice = null;
      sensorState.data = [];
      state.sensorLoaded = false;
      document.querySelectorAll('.sensor-range-btn').forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
      loadSensorData();
    });
  });

  // センサー更新ボタン
  on($('sensor-refresh-btn'), 'click', function() {
    sensorState.data = [];
    state.sensorLoaded = false;
    loadSensorData();
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

    // 認証確認 & メール表示（失敗してもリダイレクトしない、リトライあり）
    var authOk = false;
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        var res = await fetch('/auth/me', {headers: {'Authorization': 'Bearer '+token}});
        if (res.ok) {
          var me = await res.json();
          if (me.authenticated) {
            authOk = true;
            var emailEl = $('user-email');
            if (emailEl && me.email) emailEl.textContent = me.email;
            break;
          } else {
            // サーバーが明示的に「未認証」と返した場合のみログアウト
            try { localStorage.removeItem('session_token'); } catch(e) {}
            window.location.href = '/login';
            return;
          }
        }
        // 5xx等はリトライ
      } catch(e) { /* ネットワークエラーはリトライ */ }
      if (attempt < 2) await new Promise(function(r){ setTimeout(r, 1000 * (attempt + 1)); });
    }
    // 3回失敗してもトークンがある限りそのまま続行（オフライン等）

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
