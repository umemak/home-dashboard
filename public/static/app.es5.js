/* ========================================
   おうちダッシュボード - フロントエンド
   ======================================== */
'use strict';

// String.prototype.padStart polyfill (iOS 9/12 Safari用)
if (!String.prototype.padStart) {
  String.prototype.padStart = function padStart(targetLength, padString) {
    targetLength = targetLength >> 0;
    padString = String(typeof padString !== 'undefined' ? padString : ' ');
    if (this.length >= targetLength) return String(this);
    targetLength = targetLength - this.length;
    if (targetLength > padString.length) {
      padString += padString.repeat(targetLength / padString.length);
    }
    return padString.slice(0, targetLength) + String(this);
  };
}

// String.prototype.endsWith polyfill
if (!String.prototype.endsWith) {
  String.prototype.endsWith = function (search, this_len) {
    if (this_len === undefined || this_len > this.length) {
      this_len = this.length;
    }
    return this.substring(this_len - search.length, this_len) === search;
  };
}

// Object.values polyfill
if (!Object.values) {
  Object.values = function (obj) {
    return Object.keys(obj).map(function (key) {
      return obj[key];
    });
  };
}

// Object.assign polyfill
if (typeof Object.assign !== 'function') {
  Object.assign = function (target) {
    if (target == null) throw new TypeError('Cannot convert undefined or null to object');
    var to = Object(target);
    for (var index = 1; index < arguments.length; index++) {
      var nextSource = arguments[index];
      if (nextSource != null) {
        for (var nextKey in nextSource) {
          if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
            to[nextKey] = nextSource[nextKey];
          }
        }
      }
    }
    return to;
  };
}

// ─ セッショントークン ─────────────────────────────
function getSessionToken() {
  try {
    return localStorage.getItem('session_token') || '';
  } catch (e) {
    return '';
  }
}

// ─ API ───────────────────────────────────────────
function api(method, path, body) {
  var token, headers, opts, res, res2;
  return regeneratorRuntime.async(function api$(context$1$0) {
    while (1) switch (context$1$0.prev = context$1$0.next) {
      case 0:
        token = getSessionToken();
        headers = { 'Content-Type': 'application/json' };

        if (token) headers['Authorization'] = 'Bearer ' + token;
        opts = { method: method, headers: headers };

        if (body) opts.body = JSON.stringify(body);
        context$1$0.prev = 5;
        context$1$0.next = 8;
        return regeneratorRuntime.awrap(fetch(path, opts));

      case 8:
        res = context$1$0.sent;

        if (!(res.status === 401 || res.status === 403)) {
          context$1$0.next = 26;
          break;
        }

        context$1$0.next = 12;
        return regeneratorRuntime.awrap(new Promise(function (r) {
          setTimeout(r, 1500);
        }));

      case 12:
        context$1$0.next = 14;
        return regeneratorRuntime.awrap(fetch(path, opts));

      case 14:
        res2 = context$1$0.sent;

        if (!(res2.status === 401 || res2.status === 403)) {
          context$1$0.next = 19;
          break;
        }

        try {
          localStorage.removeItem('session_token');
        } catch (e) {}
        window.location.href = '/login';
        return context$1$0.abrupt('return', null);

      case 19:
        if (res2.ok) {
          context$1$0.next = 25;
          break;
        }

        context$1$0.t0 = Error;
        context$1$0.next = 23;
        return regeneratorRuntime.awrap(res2.text());

      case 23:
        context$1$0.t1 = context$1$0.sent;
        throw new context$1$0.t0(context$1$0.t1);

      case 25:
        return context$1$0.abrupt('return', res2.json());

      case 26:
        if (res.ok) {
          context$1$0.next = 32;
          break;
        }

        context$1$0.t2 = Error;
        context$1$0.next = 30;
        return regeneratorRuntime.awrap(res.text());

      case 30:
        context$1$0.t3 = context$1$0.sent;
        throw new context$1$0.t2(context$1$0.t3);

      case 32:
        return context$1$0.abrupt('return', res.json());

      case 35:
        context$1$0.prev = 35;
        context$1$0.t4 = context$1$0['catch'](5);

        // ネットワークエラーはnullを返す（ログアウトしない）
        console.warn('api error:', path, context$1$0.t4);
        return context$1$0.abrupt('return', null);

      case 39:
      case 'end':
        return context$1$0.stop();
    }
  }, null, this, [[5, 35]]);
}

// ─ 日付ユーティリティ ─────────────────────────────
var WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];
var MONTHS_JA = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

function toDateStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function formatDateJa(s) {
  if (!s) return '';
  var p = s.split('-');
  return p[1] + '/' + p[2];
}
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '<br>');
}

// ─ メイン（DOMContentLoaded後にのみ実行）────────────
document.addEventListener('DOMContentLoaded', function () {

  // ログインページなら何もしない
  if (!document.getElementById('clock')) return;

  // ─ 状態管理 ───────────────────────────────────
  var state = {
    memos: [], tasks: [], events: [], settings: {},
    calYear: 0, calMonth: 0,
    selectedColor: 'yellow', selectedEventColor: 'blue',
    selectedPriority: 'normal', editMemoId: null, selectedCalDate: null
  };

  function $(id) {
    return document.getElementById(id);
  }
  function on(el, ev, fn) {
    if (!el) return;
    el.addEventListener(ev, fn);
    if (ev === 'click') {
      var touched = false;
      el.addEventListener('touchstart', function () {
        touched = false;
      }, { passive: true });
      el.addEventListener('touchmove', function () {
        touched = true;
      }, { passive: true });
      el.addEventListener('touchend', function (e) {
        if (!touched) {
          e.preventDefault();
          fn(e);
        }
      });
    }
  }

  // ─ 時計 ──────────────────────────────────────
  function updateClock() {
    var now = new Date();
    var h = String(now.getHours()).padStart(2, '0');
    var mi = String(now.getMinutes()).padStart(2, '0');
    $('clock').textContent = h + ':' + mi;
    var wd = WEEKDAYS_JA[now.getDay()];
    var mo = MONTHS_JA[now.getMonth()];
    $('date-display').textContent = now.getFullYear() + '年 ' + mo + now.getDate() + '日（' + wd + '）';
  }
  setInterval(updateClock, 1000);
  updateClock();

  // ─ 天気 ──────────────────────────────────────
  var WEATHER_ICONS = {
    Clear: 'fa-sun', Clouds: 'fa-cloud', Rain: 'fa-cloud-rain',
    Drizzle: 'fa-cloud-drizzle', Snow: 'fa-snowflake',
    Thunderstorm: 'fa-bolt', Mist: 'fa-smog', Fog: 'fa-smog', Haze: 'fa-smog'
  };
  var WEEKDAYS_SHORT = ['日', '月', '火', '水', '木', '金', '土'];

  function weatherIcon(main) {
    return WEATHER_ICONS[main] || 'fa-cloud';
  }

  function loadWeather() {
    var res, cur, icon, nowDate, nowJSTH, buildHourlyItems, buildForecastItems, todayDate;
    return regeneratorRuntime.async(function loadWeather$(context$2$0) {
      while (1) switch (context$2$0.prev = context$2$0.next) {
        case 0:
          if (state.settings.weather_api_key) {
            context$2$0.next = 2;
            break;
          }

          return context$2$0.abrupt('return');

        case 2:
          context$2$0.prev = 2;
          context$2$0.next = 5;
          return regeneratorRuntime.awrap(api('GET', '/api/weather/forecast'));

        case 5:
          res = context$2$0.sent;

          if (res) {
            context$2$0.next = 8;
            break;
          }

          return context$2$0.abrupt('return');

        case 8:
          cur = res.current;
          icon = weatherIcon(cur.weather);

          $('weather-icon').innerHTML = '<i class="fas ' + icon + ' fa-2x"></i>';
          $('weather-temp').textContent = cur.temp + '°C';
          $('weather-minmax').textContent = '↑' + cur.temp_max + ' ↓' + cur.temp_min;
          $('weather-desc').textContent = cur.description;

          // 3時間ごと予報（今日・明日）
          nowDate = new Date();
          nowJSTH = (nowDate.getUTCHours() + 9) % 24;

          buildHourlyItems = function buildHourlyItems(container, hourlyData, todayDate) {
            container.innerHTML = '';
            if (!hourlyData || !hourlyData.length) return;
            var prevDate = '';
            hourlyData.forEach(function (h) {
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
              el.innerHTML = '<div class="hl-hour">' + String(h.hour).padStart(2, '0') + '時</div>' + '<i class="fas ' + ic + ' hl-icon"></i>' + '<div class="hl-temp">' + h.temp + '°</div>' + (h.pop > 0 ? '<div class="hl-pop">' + h.pop + '%</div>' : '<div class="hl-pop hl-pop-zero">-</div>');
              container.appendChild(el);
            });
          };

          buildForecastItems = function buildForecastItems(container, forecastData) {
            container.innerHTML = '';
            forecastData.forEach(function (day, i) {
              var date = new Date(day.date + 'T00:00:00');
              var wd = WEEKDAYS_SHORT[date.getDay()];
              var label = i === 0 ? '今日' : i === 1 ? '明日' : date.getMonth() + 1 + '/' + date.getDate() + '(' + wd + ')';
              var ic = weatherIcon(day.weather);
              var popHtml = day.pop > 0 ? '<span class="fc-pop">' + day.pop + '%</span>' : '<span class="fc-pop fc-pop-zero">-</span>';
              var el = document.createElement('div');
              el.className = 'fc-day' + (i === 0 ? ' fc-today' : '');
              el.innerHTML = '<div class="fc-label">' + label + '</div>' + '<i class="fas ' + ic + ' fc-icon"></i>' + popHtml + '<div class="fc-temps"><span class="fc-max">' + day.temp_max + '</span><span class="fc-min">' + day.temp_min + '</span></div>';
              container.appendChild(el);
            });
          };

          todayDate = res.forecast.length ? res.forecast[0].date : '';

          // ヘッダー内（PC/iPad用）
          buildForecastItems($('weather-forecast'), res.forecast);
          buildHourlyItems($('weather-hourly'), res.hourly, todayDate);

          // スマホ詳細パネル用
          buildForecastItems($('weather-detail-forecast'), res.forecast);
          buildHourlyItems($('weather-detail-hourly'), res.hourly, todayDate);

          context$2$0.next = 27;
          break;

        case 25:
          context$2$0.prev = 25;
          context$2$0.t0 = context$2$0['catch'](2);

        case 27:
        case 'end':
          return context$2$0.stop();
      }
    }, null, this, [[2, 25]]);
  }

  // ─ 天気トグル（スマホ用）────────────────────────
  (function () {
    var panel = $('weather-detail-panel');
    var toggleIcon = $('weather-toggle-icon');
    var weatherToday = $('weather-today');
    if (!panel || !weatherToday) return;

    function togglePanel(e) {
      e.preventDefault();
      e.stopPropagation();
      var isOpen = !panel.classList.contains('hidden');
      if (isOpen) {
        panel.classList.add('hidden');
      } else {
        panel.classList.remove('hidden');
      }
      if (toggleIcon) {
        if (!isOpen) {
          toggleIcon.classList.add('open');
        } else {
          toggleIcon.classList.remove('open');
        }
      }
    }

    // touchstart + click 両方登録（iOS Safari対応）
    weatherToday.addEventListener('touchstart', togglePanel, { passive: false });
    weatherToday.addEventListener('click', function (e) {
      // touchstart で処理済みの場合は無視
      e.stopPropagation();
    });

    // パネル外タップで閉じる
    document.addEventListener('touchstart', function (e) {
      if (!panel.classList.contains('hidden') && !weatherToday.contains(e.target) && !panel.contains(e.target)) {
        panel.classList.add('hidden');
        if (toggleIcon) toggleIcon.classList.remove('open');
      }
    }, { passive: true });
    document.addEventListener('click', function (e) {
      if (!panel.classList.contains('hidden') && !weatherToday.contains(e.target) && !panel.contains(e.target)) {
        panel.classList.add('hidden');
        if (toggleIcon) toggleIcon.classList.remove('open');
      }
    });
  })();

  // ─ 設定 ──────────────────────────────────────
  function loadSettings() {
    var data;
    return regeneratorRuntime.async(function loadSettings$(context$2$0) {
      while (1) switch (context$2$0.prev = context$2$0.next) {
        case 0:
          context$2$0.prev = 0;
          context$2$0.next = 3;
          return regeneratorRuntime.awrap(api('GET', '/api/settings'));

        case 3:
          data = context$2$0.sent;

          if (data) {
            context$2$0.next = 6;
            break;
          }

          return context$2$0.abrupt('return');

        case 6:
          state.settings = data;
          $('family-name').textContent = data.family_name || 'おうちダッシュボード';
          context$2$0.next = 12;
          break;

        case 10:
          context$2$0.prev = 10;
          context$2$0.t0 = context$2$0['catch'](0);

        case 12:
        case 'end':
          return context$2$0.stop();
      }
    }, null, this, [[0, 10]]);
  }

  // ─ カレンダー ─────────────────────────────────
  function renderCalendar() {
    var y = state.calYear,
        m = state.calMonth;
    $('cal-title').textContent = y + '年' + MONTHS_JA[m];
    var grid = $('calendar-grid');
    grid.innerHTML = '';
    WEEKDAYS_JA.forEach(function (wd, i) {
      var el = document.createElement('div');
      el.className = 'cal-day-header';
      el.textContent = wd;
      if (i === 0) el.style.color = '#ff7675';
      if (i === 6) el.style.color = '#74b9ff';
      grid.appendChild(el);
    });
    var today = toDateStr(new Date());
    var firstDay = new Date(y, m, 1).getDay();
    var daysInMonth = new Date(y, m + 1, 0).getDate();
    var daysInPrev = new Date(y, m, 0).getDate();

    // 単日イベントマップ（開始日キー）
    var eventMap = {};
    // 期間バーマップ（各日付 -> [{ev, pos}]）
    var rangeMap = {};

    state.events.forEach(function (ev) {
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
          var pos = ds2 === ev.date && ds2 === ev.end_date ? 'single' : ds2 === ev.date ? 'start' : ds2 === ev.end_date ? 'end' : 'mid';
          rangeMap[ds2].push({ ev: ev, pos: pos });
          cur.setDate(cur.getDate() + 1);
        }
        // イベントリスト用: 開始日に登録
        if (!eventMap[ev.date]) eventMap[ev.date] = [];
        eventMap[ev.date].push(ev);
      }
    });

    // 前月末尾
    for (var i = 0; i < firstDay; i++) {
      var el = document.createElement('div');
      el.className = 'cal-day other-month';
      el.textContent = daysInPrev - firstDay + i + 1;
      grid.appendChild(el);
    }
    // 当月
    for (var d = 1; d <= daysInMonth; d++) {
      var ds = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      var dow = new Date(y, m, d).getDay();
      var el = document.createElement('div');
      var cls = 'cal-day';
      if (ds === today) cls += ' today';
      if (dow === 0) cls += ' sunday';
      if (dow === 6) cls += ' saturday';
      el.className = cls;
      el.textContent = d;

      // 単日イベントの点（最大3個）
      var singleEvs = (eventMap[ds] || []).filter(function (ev) {
        return !ev.end_date;
      });
      if (singleEvs.length) {
        var row = document.createElement('div');
        row.className = 'cal-dot-row';
        singleEvs.slice(0, 3).forEach(function (ev) {
          var dot = document.createElement('div');
          dot.className = 'cal-dot ' + (ev.color || 'blue');
          row.appendChild(dot);
        });
        el.appendChild(row);
      }

      // 期間イベントのバー（最大2本）
      if (rangeMap[ds]) {
        rangeMap[ds].slice(0, 2).forEach(function (item, idx) {
          var bar = document.createElement('div');
          bar.className = 'range-bar ' + (item.ev.color || 'blue');
          // 位置で角丸を調整
          if (item.pos === 'start') bar.style.cssText += 'border-radius:3px 0 0 3px;left:4px;';else if (item.pos === 'end') bar.style.cssText += 'border-radius:0 3px 3px 0;right:4px;';else if (item.pos === 'mid') bar.style.cssText += 'border-radius:0;';
          // 2本目は少し上にずらす
          bar.style.bottom = 4 + idx * 5 + 'px';
          el.appendChild(bar);
        });
      }

      (function (dateStr) {
        el.addEventListener('click', function () {
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
    var rem = total % 7 === 0 ? 0 : 7 - total % 7;
    for (var d = 1; d <= rem; d++) {
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
    var y = state.calYear,
        m = state.calMonth;
    var monthStr = y + '-' + String(m + 1).padStart(2, '0');
    var items = [];
    Object.keys(eventMap).forEach(function (date) {
      if (date.startsWith(monthStr)) {
        eventMap[date].forEach(function (ev) {
          items.push(ev);
        });
      }
    });
    items.sort(function (a, b) {
      return a.date + (a.time || '') < b.date + (b.time || '') ? -1 : 1;
    });
    if (!items.length) {
      list.innerHTML = '<div class="empty-state"><i class="fas fa-calendar"></i>予定なし</div>';
      return;
    }
    items.forEach(function (ev) {
      var el = document.createElement('div');
      el.className = 'event-item ' + (ev.color || 'blue');
      // 期間表示: 終了日があれば「6/1〜6/3」形式
      var dateBadge = ev.end_date ? formatDateJa(ev.date) + '〜' + formatDateJa(ev.end_date) : formatDateJa(ev.date);
      el.innerHTML = '<span class="event-date-badge">' + dateBadge + '</span>' + '<span class="event-title">' + escHtml(ev.title) + '</span>' + (ev.time ? '<span class="event-time">' + ev.time + '</span>' : '') + '<button class="event-del-btn" title="削除"><i class="fas fa-times"></i></button>';
      el.querySelector('.event-del-btn').addEventListener('click', function callee$3$0(e) {
        return regeneratorRuntime.async(function callee$3$0$(context$4$0) {
          while (1) switch (context$4$0.prev = context$4$0.next) {
            case 0:
              e.stopPropagation();

              if (!confirm('「' + ev.title + '」を削除しますか？')) {
                context$4$0.next = 6;
                break;
              }

              context$4$0.next = 4;
              return regeneratorRuntime.awrap(api('DELETE', '/api/calendar/' + ev.id));

            case 4:
              context$4$0.next = 6;
              return regeneratorRuntime.awrap(loadEvents());

            case 6:
            case 'end':
              return context$4$0.stop();
          }
        }, null, this);
      });
      list.appendChild(el);
    });
  }

  function loadEvents() {
    var data;
    return regeneratorRuntime.async(function loadEvents$(context$2$0) {
      while (1) switch (context$2$0.prev = context$2$0.next) {
        case 0:
          context$2$0.prev = 0;
          context$2$0.next = 3;
          return regeneratorRuntime.awrap(api('GET', '/api/calendar'));

        case 3:
          data = context$2$0.sent;

          if (data) {
            state.events = data;renderCalendar();renderAgenda();
          }
          context$2$0.next = 9;
          break;

        case 7:
          context$2$0.prev = 7;
          context$2$0.t0 = context$2$0['catch'](0);

        case 9:
        case 'end':
          return context$2$0.stop();
      }
    }, null, this, [[0, 7]]);
  }

  // ─ メモ ──────────────────────────────────────
  function renderMemos() {
    var list = $('memo-list');
    list.innerHTML = '';
    if (!state.memos.length) {
      list.innerHTML = '<div class="empty-state"><i class="fas fa-sticky-note"></i>メモなし</div>';
      return;
    }
    state.memos.forEach(function (memo) {
      var el = document.createElement('div');
      el.className = 'memo-card ' + (memo.color || 'yellow') + (memo.pinned ? ' pinned' : '');
      el.innerHTML = '<div class="memo-text">' + escHtml(memo.content) + '</div>' + '<div class="memo-actions">' + '<button class="memo-btn pin-btn"><i class="fas fa-thumbtack" style="opacity:' + (memo.pinned ? 1 : .4) + '"></i></button>' + '<button class="memo-btn edit-btn"><i class="fas fa-edit"></i></button>' + '<button class="memo-btn del-btn"><i class="fas fa-trash"></i></button>' + '</div>';
      el.querySelector('.pin-btn').addEventListener('click', function callee$3$0(e) {
        return regeneratorRuntime.async(function callee$3$0$(context$4$0) {
          while (1) switch (context$4$0.prev = context$4$0.next) {
            case 0:
              e.stopPropagation();
              context$4$0.next = 3;
              return regeneratorRuntime.awrap(api('PUT', '/api/memos/' + memo.id, { pinned: !memo.pinned }));

            case 3:
              context$4$0.next = 5;
              return regeneratorRuntime.awrap(loadMemos());

            case 5:
            case 'end':
              return context$4$0.stop();
          }
        }, null, this);
      });
      el.querySelector('.edit-btn').addEventListener('click', function (e) {
        e.stopPropagation();
        state.editMemoId = memo.id;
        $('memo-content').value = memo.content;
        state.selectedColor = memo.color || 'yellow';
        highlightColor('color-btn', state.selectedColor);
        openModal('memo-modal');
      });
      el.querySelector('.del-btn').addEventListener('click', function callee$3$0(e) {
        return regeneratorRuntime.async(function callee$3$0$(context$4$0) {
          while (1) switch (context$4$0.prev = context$4$0.next) {
            case 0:
              e.stopPropagation();

              if (!confirm('このメモを削除しますか？')) {
                context$4$0.next = 6;
                break;
              }

              context$4$0.next = 4;
              return regeneratorRuntime.awrap(api('DELETE', '/api/memos/' + memo.id));

            case 4:
              context$4$0.next = 6;
              return regeneratorRuntime.awrap(loadMemos());

            case 6:
            case 'end':
              return context$4$0.stop();
          }
        }, null, this);
      });
      list.appendChild(el);
    });
  }

  function loadMemos() {
    var data;
    return regeneratorRuntime.async(function loadMemos$(context$2$0) {
      while (1) switch (context$2$0.prev = context$2$0.next) {
        case 0:
          context$2$0.prev = 0;
          context$2$0.next = 3;
          return regeneratorRuntime.awrap(api('GET', '/api/memos'));

        case 3:
          data = context$2$0.sent;

          if (data) {
            state.memos = data;renderMemos();renderAgenda();
          }
          context$2$0.next = 9;
          break;

        case 7:
          context$2$0.prev = 7;
          context$2$0.t0 = context$2$0['catch'](0);

        case 9:
        case 'end':
          return context$2$0.stop();
      }
    }, null, this, [[0, 7]]);
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
    state.tasks.forEach(function (task) {
      var el = document.createElement('div');
      el.className = 'task-item' + (task.done ? ' done' : '');
      var isOverdue = task.due_date && task.due_date < today && !task.done;
      el.innerHTML = '<div class="task-check"></div>' + '<div class="task-info">' + '<div class="task-title">' + escHtml(task.title) + '</div>' + (task.due_date ? '<div class="task-due' + (isOverdue ? ' overdue' : '') + '">' + (isOverdue ? '⚠ ' : '') + formatDateJa(task.due_date) + 'まで</div>' : '') + '</div>' + '<div class="task-priority ' + (task.priority || 'normal') + '"></div>' + '<button class="task-del-btn"><i class="fas fa-times"></i></button>';
      el.querySelector('.task-check').addEventListener('click', function callee$3$0() {
        return regeneratorRuntime.async(function callee$3$0$(context$4$0) {
          while (1) switch (context$4$0.prev = context$4$0.next) {
            case 0:
              context$4$0.next = 2;
              return regeneratorRuntime.awrap(api('PUT', '/api/tasks/' + task.id, { done: !task.done }));

            case 2:
              context$4$0.next = 4;
              return regeneratorRuntime.awrap(loadTasks());

            case 4:
            case 'end':
              return context$4$0.stop();
          }
        }, null, this);
      });
      el.querySelector('.task-del-btn').addEventListener('click', function callee$3$0(e) {
        return regeneratorRuntime.async(function callee$3$0$(context$4$0) {
          while (1) switch (context$4$0.prev = context$4$0.next) {
            case 0:
              e.stopPropagation();
              context$4$0.next = 3;
              return regeneratorRuntime.awrap(api('DELETE', '/api/tasks/' + task.id));

            case 3:
              context$4$0.next = 5;
              return regeneratorRuntime.awrap(loadTasks());

            case 5:
            case 'end':
              return context$4$0.stop();
          }
        }, null, this);
      });
      list.appendChild(el);
    });
  }

  function loadTasks() {
    var data;
    return regeneratorRuntime.async(function loadTasks$(context$2$0) {
      while (1) switch (context$2$0.prev = context$2$0.next) {
        case 0:
          context$2$0.prev = 0;
          context$2$0.next = 3;
          return regeneratorRuntime.awrap(api('GET', '/api/tasks'));

        case 3:
          data = context$2$0.sent;

          if (data) {
            state.tasks = data;renderTasks();renderAgenda();
          }
          context$2$0.next = 9;
          break;

        case 7:
          context$2$0.prev = 7;
          context$2$0.t0 = context$2$0['catch'](0);

        case 9:
        case 'end':
          return context$2$0.stop();
      }
    }, null, this, [[0, 7]]);
  }

  // ─ デイリーアジェンダ ────────────────────────────
  function renderAgenda() {
    var todayStr = toDateStr(new Date());
    var todayObj = new Date();
    var daysJa = ['日', '月', '火', '水', '木', '金', '土'];

    // 日付バッジ
    var dateBadgeEl = $('agenda-today-date');
    if (dateBadgeEl) {
      dateBadgeEl.textContent = todayObj.getMonth() + 1 + '月' + todayObj.getDate() + '日(' + daysJa[todayObj.getDay()] + ')';
    }

    // 1. 本日の予定
    var evListEl = $('agenda-events-list');
    if (evListEl) {
      evListEl.innerHTML = '';
      var todayEvents = state.events.filter(function (ev) {
        var start = ev.date;
        var end = ev.end_date || ev.date;
        return todayStr >= start && todayStr <= end;
      });
      if (!todayEvents.length) {
        evListEl.innerHTML = '<div class="empty-state mini"><i class="fas fa-calendar-check"></i> 本日の予定はありません</div>';
      } else {
        todayEvents.forEach(function (ev) {
          var el = document.createElement('div');
          el.className = 'agenda-event-item ' + (ev.color || 'blue');
          el.innerHTML = (ev.time ? '<span class="agenda-time-badge">' + escHtml(ev.time) + '</span>' : '<span class="agenda-time-badge all-day">終日</span>') + '<span class="agenda-event-title">' + escHtml(ev.title) + '</span>' + '<button class="agenda-item-del" title="削除"><i class="fas fa-times"></i></button>';
          el.querySelector('.agenda-item-del').addEventListener('click', function callee$3$0(e) {
            return regeneratorRuntime.async(function callee$3$0$(context$4$0) {
              while (1) switch (context$4$0.prev = context$4$0.next) {
                case 0:
                  e.stopPropagation();

                  if (!confirm('「' + ev.title + '」を削除しますか？')) {
                    context$4$0.next = 6;
                    break;
                  }

                  context$4$0.next = 4;
                  return regeneratorRuntime.awrap(api('DELETE', '/api/calendar/' + ev.id));

                case 4:
                  context$4$0.next = 6;
                  return regeneratorRuntime.awrap(loadEvents());

                case 6:
                case 'end':
                  return context$4$0.stop();
              }
            }, null, this);
          });
          evListEl.appendChild(el);
        });
      }
    }

    // 2. 未完了タスク
    var taskListEl = $('agenda-tasks-list');
    var taskCountEl = $('agenda-task-count');
    if (taskListEl) {
      taskListEl.innerHTML = '';
      var uncompletedTasks = state.tasks.filter(function (t) {
        return !t.done;
      });
      if (taskCountEl) {
        taskCountEl.textContent = uncompletedTasks.length ? uncompletedTasks.length + '件' : '0件';
      }
      if (!uncompletedTasks.length) {
        taskListEl.innerHTML = '<div class="empty-state mini"><i class="fas fa-check-circle"></i> 未完了のタスクはありません</div>';
      } else {
        uncompletedTasks.forEach(function (task) {
          var isOverdue = task.due_date && task.due_date < todayStr;
          var el = document.createElement('div');
          el.className = 'agenda-task-item';
          el.innerHTML = '<div class="task-check" title="完了にする"></div>' + '<div class="agenda-task-info">' + '<span class="agenda-task-title">' + escHtml(task.title) + '</span>' + (task.due_date ? '<span class="task-due' + (isOverdue ? ' overdue' : '') + '">' + (isOverdue ? '⚠ ' : '') + formatDateJa(task.due_date) + '</span>' : '') + '</div>' + '<span class="task-priority ' + (task.priority || 'normal') + '"></span>';
          el.querySelector('.task-check').addEventListener('click', function callee$3$0() {
            return regeneratorRuntime.async(function callee$3$0$(context$4$0) {
              while (1) switch (context$4$0.prev = context$4$0.next) {
                case 0:
                  context$4$0.next = 2;
                  return regeneratorRuntime.awrap(api('PUT', '/api/tasks/' + task.id, { done: true }));

                case 2:
                  context$4$0.next = 4;
                  return regeneratorRuntime.awrap(loadTasks());

                case 4:
                case 'end':
                  return context$4$0.stop();
              }
            }, null, this);
          });
          taskListEl.appendChild(el);
        });
      }
    }

    // 3. メモ
    var memoListEl = $('agenda-memos-list');
    if (memoListEl) {
      memoListEl.innerHTML = '';
      if (!state.memos.length) {
        memoListEl.innerHTML = '<div class="empty-state mini"><i class="fas fa-sticky-note"></i> メモはありません</div>';
      } else {
        var sortedMemos = state.memos.slice().sort(function (a, b) {
          return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
        }).slice(0, 4);
        sortedMemos.forEach(function (memo) {
          var el = document.createElement('div');
          el.className = 'agenda-memo-card ' + (memo.color || 'yellow') + (memo.pinned ? ' pinned' : '');
          el.innerHTML = '<div class="agenda-memo-text">' + escHtml(memo.content) + '</div>' + (memo.pinned ? '<i class="fas fa-thumbtack agenda-pin-icon"></i>' : '');
          el.addEventListener('click', function () {
            state.editMemoId = memo.id;
            $('memo-content').value = memo.content;
            state.selectedColor = memo.color || 'yellow';
            highlightColor('color-btn', state.selectedColor);
            openModal('memo-modal');
          });
          memoListEl.appendChild(el);
        });
      }
    }
  }

  // ─ モーダル ───────────────────────────────────
  function openModal(id) {
    document.querySelectorAll('.modal').forEach(function (m) {
      m.classList.add('hidden');
    });
    var el = $(id);
    if (el) el.classList.remove('hidden');
  }
  function closeAllModals() {
    document.querySelectorAll('.modal').forEach(function (m) {
      m.classList.add('hidden');
    });
  }
  function highlightColor(cls, value) {
    document.querySelectorAll('.' + cls).forEach(function (b) {
      b.classList.remove('selected');
    });
    document.querySelectorAll('.' + cls + '[data-color="' + value + '"]').forEach(function (b) {
      b.classList.add('selected');
    });
  }
  function highlightPriority(value) {
    document.querySelectorAll('.prio-btn').forEach(function (b) {
      if (b.dataset.priority === value) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });
  }

  // ─ モーダルイベント ───────────────────────────

  // メモ
  on($('memo-add-btn'), 'click', function () {
    state.editMemoId = null;
    $('memo-content').value = '';
    state.selectedColor = 'yellow';
    highlightColor('color-btn', 'yellow');
    openModal('memo-modal');
    setTimeout(function () {
      $('memo-content').focus();
    }, 100);
  });
  document.querySelectorAll('#memo-modal .color-btn').forEach(function (btn) {
    on(btn, 'click', function () {
      state.selectedColor = btn.dataset.color;
      highlightColor('color-btn', state.selectedColor);
    });
  });
  on($('memo-cancel'), 'click', closeAllModals);
  on($('memo-save'), 'click', function callee$1$0() {
    var content;
    return regeneratorRuntime.async(function callee$1$0$(context$2$0) {
      while (1) switch (context$2$0.prev = context$2$0.next) {
        case 0:
          content = $('memo-content').value.trim();

          if (content) {
            context$2$0.next = 4;
            break;
          }

          alert('内容を入力してください');return context$2$0.abrupt('return');

        case 4:
          if (!state.editMemoId) {
            context$2$0.next = 9;
            break;
          }

          context$2$0.next = 7;
          return regeneratorRuntime.awrap(api('PUT', '/api/memos/' + state.editMemoId, { content: content, color: state.selectedColor }));

        case 7:
          context$2$0.next = 11;
          break;

        case 9:
          context$2$0.next = 11;
          return regeneratorRuntime.awrap(api('POST', '/api/memos', { content: content, color: state.selectedColor }));

        case 11:
          closeAllModals();
          context$2$0.next = 14;
          return regeneratorRuntime.awrap(loadMemos());

        case 14:
        case 'end':
          return context$2$0.stop();
      }
    }, null, this);
  });

  // タスク
  on($('task-add-btn'), 'click', function () {
    $('task-title').value = '';
    $('task-due').value = '';
    state.selectedPriority = 'normal';
    highlightPriority('normal');
    openModal('task-modal');
    setTimeout(function () {
      $('task-title').focus();
    }, 100);
  });
  document.querySelectorAll('.prio-btn').forEach(function (btn) {
    on(btn, 'click', function () {
      state.selectedPriority = btn.dataset.priority;
      highlightPriority(state.selectedPriority);
    });
  });
  on($('task-cancel'), 'click', closeAllModals);
  on($('task-save'), 'click', function callee$1$0() {
    var title;
    return regeneratorRuntime.async(function callee$1$0$(context$2$0) {
      while (1) switch (context$2$0.prev = context$2$0.next) {
        case 0:
          title = $('task-title').value.trim();

          if (title) {
            context$2$0.next = 4;
            break;
          }

          alert('タスク名を入力してください');return context$2$0.abrupt('return');

        case 4:
          context$2$0.next = 6;
          return regeneratorRuntime.awrap(api('POST', '/api/tasks', { title: title, due_date: $('task-due').value || null, priority: state.selectedPriority }));

        case 6:
          closeAllModals();
          context$2$0.next = 9;
          return regeneratorRuntime.awrap(loadTasks());

        case 9:
        case 'end':
          return context$2$0.stop();
      }
    }, null, this);
  });

  // イベント
  on($('cal-add-btn'), 'click', function () {
    $('event-title').value = '';
    $('event-date').value = state.selectedCalDate || toDateStr(new Date());
    $('event-end-date').value = '';
    $('event-time').value = '';
    state.selectedEventColor = 'blue';
    document.querySelectorAll('#event-modal .color-btn').forEach(function (b) {
      b.classList.remove('selected');
    });
    openModal('event-modal');
    setTimeout(function () {
      $('event-title').focus();
    }, 100);
  });
  // 開始日が変わったら終了日の min を更新
  on($('event-date'), 'change', function () {
    var endEl = $('event-end-date');
    endEl.min = $('event-date').value;
    if (endEl.value && endEl.value <= $('event-date').value) endEl.value = '';
  });
  document.querySelectorAll('#event-modal .color-btn').forEach(function (btn) {
    on(btn, 'click', function () {
      state.selectedEventColor = btn.dataset.color;
      document.querySelectorAll('#event-modal .color-btn').forEach(function (b) {
        b.classList.remove('selected');
      });
      btn.classList.add('selected');
    });
  });
  on($('event-cancel'), 'click', closeAllModals);
  on($('event-save'), 'click', function callee$1$0() {
    var title, date, endDate;
    return regeneratorRuntime.async(function callee$1$0$(context$2$0) {
      while (1) switch (context$2$0.prev = context$2$0.next) {
        case 0:
          title = $('event-title').value.trim();
          date = $('event-date').value;
          endDate = $('event-end-date').value || null;

          if (!(!title || !date)) {
            context$2$0.next = 6;
            break;
          }

          alert('タイトルと開始日を入力してください');return context$2$0.abrupt('return');

        case 6:
          if (!(endDate && endDate <= date)) {
            context$2$0.next = 9;
            break;
          }

          alert('終了日は開始日より後にしてください');return context$2$0.abrupt('return');

        case 9:
          context$2$0.next = 11;
          return regeneratorRuntime.awrap(api('POST', '/api/calendar', {
            title: title, date: date, end_date: endDate,
            time: $('event-time').value || null,
            color: state.selectedEventColor
          }));

        case 11:
          closeAllModals();
          context$2$0.next = 14;
          return regeneratorRuntime.awrap(loadEvents());

        case 14:
        case 'end':
          return context$2$0.stop();
      }
    }, null, this);
  });

  // カレンダーナビ
  on($('cal-prev'), 'click', function () {
    state.calMonth--;
    if (state.calMonth < 0) {
      state.calMonth = 11;state.calYear--;
    }
    renderCalendar();
  });
  on($('cal-next'), 'click', function () {
    state.calMonth++;
    if (state.calMonth > 11) {
      state.calMonth = 0;state.calYear++;
    }
    renderCalendar();
  });

  // ─ ウィジェット表示・非表示管理 ──────────────
  var WIDGET_PANELS = ['agenda-section', 'calendar-section', 'memo-section', 'task-section', 'sensor-section', 'youtube-section'];

  function getWidgetVisibility() {
    var vis = {};
    try {
      var saved = localStorage.getItem('widget_visibility');
      if (saved) vis = JSON.parse(saved);
    } catch (e) {}
    return vis;
  }

  function applyWidgetVisibility() {
    var vis = getWidgetVisibility();
    WIDGET_PANELS.forEach(function (panelId) {
      var isVisible = vis[panelId] !== false;
      var panel = $(panelId);
      if (panel) {
        if (!isVisible) {
          panel.classList.add('widget-hidden');
        } else {
          panel.classList.remove('widget-hidden');
        }
      }
      var tabBtn = document.querySelector('.tab-btn[data-tab="' + panelId + '"]');
      if (tabBtn) {
        tabBtn.style.display = isVisible ? '' : 'none';
      }
    });
  }

  function saveWidgetVisibilityFromModal() {
    var vis = {};
    WIDGET_PANELS.forEach(function (panelId) {
      var chk = $('set-vis-' + panelId);
      if (chk) {
        vis[panelId] = chk.checked;
      }
    });
    try {
      localStorage.setItem('widget_visibility', JSON.stringify(vis));
    } catch (e) {}
    applyWidgetVisibility();
  }

  // 設定
  function openSettingsModal() {
    try {
      $('set-family').value = state.settings.family_name || '';
      $('set-weather-key').value = state.settings.weather_api_key || '';
      $('set-city').value = state.settings.city || 'Tokyo';
      if ($('set-youtube-key')) $('set-youtube-key').value = state.settings.youtube_api_key || '';
      if ($('update-msg')) $('update-msg').textContent = '';
      if ($('check-update-btn')) $('check-update-btn').disabled = false;

      // ウィジェット表示チェックボックスの状態反映
      var vis = getWidgetVisibility();
      WIDGET_PANELS.forEach(function (panelId) {
        var chk = $('set-vis-' + panelId);
        if (chk) {
          chk.checked = vis[panelId] !== false;
        }
      });

      openModal('settings-modal');
    } catch (e) {
      // フォールバック: エラーが起きても設定モーダルだけは開く
      openModal('settings-modal');
    }
  }
  window.openSettingsModal = openSettingsModal;
  on($('settings-btn'), 'click', openSettingsModal);
  on($('settings-cancel'), 'click', closeAllModals);
  on($('settings-save'), 'click', function callee$1$0() {
    return regeneratorRuntime.async(function callee$1$0$(context$2$0) {
      while (1) switch (context$2$0.prev = context$2$0.next) {
        case 0:
          saveWidgetVisibilityFromModal();
          context$2$0.next = 3;
          return regeneratorRuntime.awrap(api('PUT', '/api/settings', {
            family_name: $('set-family').value || 'おうちダッシュボード',
            weather_api_key: $('set-weather-key').value,
            city: $('set-city').value || 'Tokyo',
            youtube_api_key: $('set-youtube-key') ? $('set-youtube-key').value : ''
          }));

        case 3:
          closeAllModals();
          context$2$0.next = 6;
          return regeneratorRuntime.awrap(loadSettings());

        case 6:
          context$2$0.next = 8;
          return regeneratorRuntime.awrap(loadWeather());

        case 8:
        case 'end':
          return context$2$0.stop();
      }
    }, null, this);
  });

  // 設定画面の更新チェックボタン
  window.performAppUpdate = function callee$1$0(e) {
    var msgEl, btn, keys, registrations, _iteratorNormalCompletion, _didIteratorError, _iteratorError, _iterator, _step, reg;

    return regeneratorRuntime.async(function callee$1$0$(context$2$0) {
      while (1) switch (context$2$0.prev = context$2$0.next) {
        case 0:
          if (e) {
            e.preventDefault();e.stopPropagation();
          }
          msgEl = $('update-msg');
          btn = $('check-update-btn');

          if (msgEl) msgEl.textContent = '更新を確認中...';
          if (btn) btn.disabled = true;

          context$2$0.prev = 5;

          if (!('caches' in window)) {
            context$2$0.next = 12;
            break;
          }

          context$2$0.next = 9;
          return regeneratorRuntime.awrap(caches.keys());

        case 9:
          keys = context$2$0.sent;
          context$2$0.next = 12;
          return regeneratorRuntime.awrap(Promise.all(keys.map(function (k) {
            return caches['delete'](k);
          })));

        case 12:
          if (!('serviceWorker' in navigator)) {
            context$2$0.next = 42;
            break;
          }

          context$2$0.next = 15;
          return regeneratorRuntime.awrap(navigator.serviceWorker.getRegistrations());

        case 15:
          registrations = context$2$0.sent;
          _iteratorNormalCompletion = true;
          _didIteratorError = false;
          _iteratorError = undefined;
          context$2$0.prev = 19;
          _iterator = registrations[Symbol.iterator]();

        case 21:
          if (_iteratorNormalCompletion = (_step = _iterator.next()).done) {
            context$2$0.next = 28;
            break;
          }

          reg = _step.value;
          context$2$0.next = 25;
          return regeneratorRuntime.awrap(reg.unregister());

        case 25:
          _iteratorNormalCompletion = true;
          context$2$0.next = 21;
          break;

        case 28:
          context$2$0.next = 34;
          break;

        case 30:
          context$2$0.prev = 30;
          context$2$0.t0 = context$2$0['catch'](19);
          _didIteratorError = true;
          _iteratorError = context$2$0.t0;

        case 34:
          context$2$0.prev = 34;
          context$2$0.prev = 35;

          if (!_iteratorNormalCompletion && _iterator['return']) {
            _iterator['return']();
          }

        case 37:
          context$2$0.prev = 37;

          if (!_didIteratorError) {
            context$2$0.next = 40;
            break;
          }

          throw _iteratorError;

        case 40:
          return context$2$0.finish(37);

        case 41:
          return context$2$0.finish(34);

        case 42:
          if (msgEl) msgEl.textContent = '最新版を再読み込みします...';
          setTimeout(function () {
            // キャッシュ回避のためタイムスタンプを付与してリロード
            var currentUrl = new URL(window.location.href);
            currentUrl.searchParams.set('_v', Date.now());
            window.location.href = currentUrl.toString();
          }, 300);
          context$2$0.next = 51;
          break;

        case 46:
          context$2$0.prev = 46;
          context$2$0.t1 = context$2$0['catch'](5);

          console.error('Update error:', context$2$0.t1);
          if (msgEl) msgEl.textContent = 'エラーが発生したため強制リロードします...';
          setTimeout(function () {
            window.location.reload(true);
          }, 500);

        case 51:
        case 'end':
          return context$2$0.stop();
      }
    }, null, this, [[5, 46], [19, 30, 34, 42], [35,, 37, 41]]);
  };

  var updateBtn = $('check-update-btn');
  if (updateBtn) {
    updateBtn.addEventListener('click', window.performAppUpdate);
    updateBtn.addEventListener('touchend', window.performAppUpdate);
  }

  // モーダル外クリック
  document.querySelectorAll('.modal').forEach(function (modal) {
    on(modal, 'click', function (e) {
      if (e.target === modal) closeAllModals();
    });
  });

  // 更新ボタン
  on($('refresh-btn'), 'click', function callee$1$0() {
    return regeneratorRuntime.async(function callee$1$0$(context$2$0) {
      while (1) switch (context$2$0.prev = context$2$0.next) {
        case 0:
          context$2$0.next = 2;
          return regeneratorRuntime.awrap(Promise.all([loadMemos(), loadTasks(), loadEvents(), loadWeather(), loadYoutubeVideos(), loadSensorData()]));

        case 2:
          $('last-update').textContent = '最終更新: ' + new Date().toLocaleTimeString('ja-JP');

        case 3:
        case 'end':
          return context$2$0.stop();
      }
    }, null, this);
  });

  // ログアウト
  on($('logout-btn'), 'click', function callee$1$0() {
    var token;
    return regeneratorRuntime.async(function callee$1$0$(context$2$0) {
      while (1) switch (context$2$0.prev = context$2$0.next) {
        case 0:
          if (confirm('ログアウトしますか？')) {
            context$2$0.next = 2;
            break;
          }

          return context$2$0.abrupt('return');

        case 2:
          token = getSessionToken();
          context$2$0.next = 5;
          return regeneratorRuntime.awrap(fetch('/auth/logout', {
            method: 'POST',
            headers: token ? { 'Authorization': 'Bearer ' + token } : {}
          }));

        case 5:
          try {
            localStorage.removeItem('session_token');
          } catch (e) {}
          window.location.href = '/login';

        case 7:
        case 'end':
          return context$2$0.stop();
      }
    }, null, this);
  });

  // ─ パネル並べ替え (Drag & Drop) ───────────────────
  var draggedPanel = null;

  function savePanelOrder() {
    var mainContent = $('main-content');
    if (!mainContent) return;
    var order = Array.from(mainContent.children).map(function (panel) {
      return panel.id;
    });
    try {
      localStorage.setItem('panel_order', JSON.stringify(order));
    } catch (e) {}
  }

  function restorePanelOrder() {
    var mainContent = $('main-content');
    if (!mainContent) return;
    var saved = null;
    try {
      saved = JSON.parse(localStorage.getItem('panel_order'));
    } catch (e) {}
    if (!saved || !Array.isArray(saved)) return;

    saved.forEach(function (id) {
      var panel = $(id);
      if (panel && panel.parentElement === mainContent) {
        mainContent.appendChild(panel);
      }
    });
  }

  function initDragAndDrop() {
    var panels = document.querySelectorAll('.panel');
    var mainContent = $('main-content');
    if (!mainContent) return;

    restorePanelOrder();

    // 最新のパネル一覧
    var currentPanels = document.querySelectorAll('.panel');

    currentPanels.forEach(function (panel) {
      panel.addEventListener('dragstart', function (e) {
        if (panel.classList.contains('maximized')) {
          e.preventDefault();
          return;
        }
        draggedPanel = panel;
        panel.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', panel.id);
      });

      panel.addEventListener('dragend', function () {
        panel.classList.remove('dragging');
        document.querySelectorAll('.panel').forEach(function (p) {
          p.classList.remove('drag-over');
        });
        draggedPanel = null;
        savePanelOrder();
      });

      panel.addEventListener('dragover', function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        var targetPanel = e.target.closest('.panel');
        if (draggedPanel && targetPanel && draggedPanel !== targetPanel) {
          targetPanel.classList.add('drag-over');
        }
      });

      panel.addEventListener('dragleave', function (e) {
        var targetPanel = e.target.closest('.panel');
        if (targetPanel) {
          targetPanel.classList.remove('drag-over');
        }
      });

      panel.addEventListener('drop', function (e) {
        e.preventDefault();
        var targetPanel = e.target.closest('.panel');
        if (targetPanel) targetPanel.classList.remove('drag-over');

        if (!draggedPanel || !targetPanel || draggedPanel === targetPanel) return;

        var children = Array.from(mainContent.children);
        var draggedIdx = children.indexOf(draggedPanel);
        var targetIdx = children.indexOf(targetPanel);

        if (draggedIdx < targetIdx) {
          mainContent.insertBefore(draggedPanel, targetPanel.nextSibling);
        } else {
          mainContent.insertBefore(draggedPanel, targetPanel);
        }
        savePanelOrder();
      });
    });
  }

  initDragAndDrop();

  // ─ パネル最大化トグル ─────────────────────────────
  document.querySelectorAll('.panel-max-btn').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var panel = btn.closest('.panel');
      if (!panel) return;
      var isMax = !panel.classList.contains('maximized');
      if (isMax) {
        panel.classList.add('maximized');
      } else {
        panel.classList.remove('maximized');
      }
      var icon = btn.querySelector('i');
      if (icon) {
        icon.className = isMax ? 'fas fa-compress' : 'fas fa-expand';
      }
      btn.title = isMax ? '元に戻す' : '最大化';
      // センサーパネル最大化時はグラフ再描画
      if (panel.id === 'sensor-section') {
        setTimeout(function () {
          drawSensorChart();
        }, 250);
      }
    });
  });

  // ─ YouTube ───────────────────────────────────
  state.youtubeVideos = [];
  state.currentYoutubeId = null;
  var ytPlayer = null;
  var ytProgressInterval = null;

  function getPlaybackPositionMap() {
    try {
      return JSON.parse(localStorage.getItem('yt_playback_positions') || '{}');
    } catch (e) {
      return {};
    }
  }

  function savePlaybackPosition(ytId, seconds) {
    if (!ytId || typeof seconds !== 'number' || isNaN(seconds)) return;
    var map = getPlaybackPositionMap();
    // 終了間近（残り5秒以内）または開始5秒未満はクリア/0扱い
    if (ytPlayer && ytPlayer.getDuration) {
      var dur = ytPlayer.getDuration();
      if (dur > 0 && dur - seconds < 5) {
        delete map[ytId];
        try {
          localStorage.setItem('yt_playback_positions', JSON.stringify(map));
        } catch (e) {}
        return;
      }
    }
    if (seconds < 2) {
      delete map[ytId];
    } else {
      map[ytId] = Math.floor(seconds);
    }
    try {
      localStorage.setItem('yt_playback_positions', JSON.stringify(map));
    } catch (e) {}
  }

  function getSavedPosition(ytId) {
    var map = getPlaybackPositionMap();
    return map[ytId] || 0;
  }

  function startPositionTracker() {
    if (ytProgressInterval) clearInterval(ytProgressInterval);
    ytProgressInterval = setInterval(function () {
      if (ytPlayer && ytPlayer.getCurrentTime && state.currentYoutubeId) {
        try {
          var stateNum = ytPlayer.getPlayerState();
          // YT.PlayerState.PLAYING (1) または PAUSED (2)
          if (stateNum === 1 || stateNum === 2) {
            var curr = ytPlayer.getCurrentTime();
            savePlaybackPosition(state.currentYoutubeId, curr);
          }
        } catch (e) {}
      }
    }, 2000);
  }

  function initYoutubePlayer(ytId, startSeconds, autoPlay) {
    if (startSeconds === undefined) startSeconds = getSavedPosition(ytId);
    if (autoPlay === undefined) autoPlay = true;
    state.currentYoutubeId = ytId;

    if (!window.YT || !window.YT.Player) {
      // APIがまだロードされていない場合は再試行
      setTimeout(function () {
        initYoutubePlayer(ytId, startSeconds, autoPlay);
      }, 200);
      return;
    }

    if (ytPlayer && typeof ytPlayer.loadVideoById === 'function') {
      try {
        if (autoPlay) {
          ytPlayer.loadVideoById({ videoId: ytId, startSeconds: startSeconds });
        } else {
          ytPlayer.cueVideoById({ videoId: ytId, startSeconds: startSeconds });
        }
        renderYoutubePlaylist();
        startPositionTracker();
        return;
      } catch (e) {
        // エラー時は再作成にフォールバック
      }
    }

    var playerContainer = $('yt-player-container');
    if (playerContainer) {
      playerContainer.innerHTML = '<div id="yt-player"></div>';
    }

    try {
      ytPlayer = new YT.Player('yt-player', {
        videoId: ytId,
        playerVars: {
          autoplay: autoPlay ? 1 : 0,
          start: Math.floor(startSeconds),
          rel: 0,
          enablejsapi: 1
        },
        events: {
          onReady: function onReady(event) {
            startPositionTracker();
          },
          onStateChange: function onStateChange(event) {
            if (event.data === 1 || event.data === 2) {
              // PLAYING / PAUSED
              if (ytPlayer && ytPlayer.getCurrentTime && state.currentYoutubeId) {
                savePlaybackPosition(state.currentYoutubeId, ytPlayer.getCurrentTime());
              }
            } else if (event.data === 0) {
              // ENDED
              savePlaybackPosition(state.currentYoutubeId, 0);
            }
          }
        }
      });
    } catch (e) {
      console.warn('YT.Player init failed', e);
    }
    renderYoutubePlaylist();
  }

  function extractYoutubeId(input) {
    if (!input) return null;
    var str = input.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(str)) return str;
    var match = str.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    return match ? match[1] : null;
  }

  function loadYoutubeVideos() {
    var data, exists;
    return regeneratorRuntime.async(function loadYoutubeVideos$(context$2$0) {
      while (1) switch (context$2$0.prev = context$2$0.next) {
        case 0:
          context$2$0.next = 2;
          return regeneratorRuntime.awrap(api('GET', '/api/youtube'));

        case 2:
          data = context$2$0.sent;

          state.youtubeVideos = data || [];
          if (state.youtubeVideos.length) {
            exists = state.youtubeVideos.some(function (v) {
              return v.youtube_id === state.currentYoutubeId;
            });

            if (!exists) {
              state.currentYoutubeId = null;
            }
          } else {
            state.currentYoutubeId = null;
          }
          renderYoutubePlaylist();
          if (state.youtubeVideos.length && !state.currentYoutubeId) {
            playYoutubeVideo(state.youtubeVideos[0].youtube_id, false);
          }

        case 7:
        case 'end':
          return context$2$0.stop();
      }
    }, null, this);
  }

  function playYoutubeVideo(ytId, autoPlay, startSeconds) {
    if (autoPlay === undefined) autoPlay = true;
    if (startSeconds === undefined) startSeconds = getSavedPosition(ytId);
    initYoutubePlayer(ytId, startSeconds, autoPlay);
  }

  function renderYoutubePlaylist() {
    var playlistEl = $('yt-playlist');
    if (!playlistEl) return;
    playlistEl.innerHTML = '';
    if (!state.youtubeVideos.length) {
      playlistEl.innerHTML = '<div class="empty-state"><i class="fab fa-youtube"></i>登録された動画はありません</div>';
      return;
    }
    var savedPositions = getPlaybackPositionMap();
    state.youtubeVideos.forEach(function (v) {
      var item = document.createElement('div');
      var isActive = v.youtube_id === state.currentYoutubeId;
      item.className = 'yt-item' + (isActive ? ' active' : '');

      var thumbUrl = 'https://img.youtube.com/vi/' + encodeURIComponent(v.youtube_id) + '/default.jpg';
      var pos = savedPositions[v.youtube_id] || 0;
      var posStr = '';
      if (pos > 0) {
        var m = Math.floor(pos / 60);
        var s = Math.floor(pos % 60);
        posStr = ' (' + m + ':' + (s < 10 ? '0' : '') + s + 'から)';
      }

      item.innerHTML = '<img class="yt-thumb" src="' + thumbUrl + '" alt="thumb">' + '<div class="yt-info">' + '<div class="yt-title">' + escHtml(v.title) + '</div>' + '<div class="yt-sub">ID: ' + escHtml(v.youtube_id) + posStr + '</div>' + '</div>' + '<button class="yt-del-btn" title="削除"><i class="fas fa-trash"></i></button>';

      item.addEventListener('click', function (e) {
        if (e.target.closest('.yt-del-btn')) {
          e.stopPropagation();
          deleteYoutubeVideo(v.id);
          return;
        }
        playYoutubeVideo(v.youtube_id, true);
      });

      playlistEl.appendChild(item);
    });
  }

  function performYoutubeSearch() {
    var searchInput, resultsEl, query, ytId, res, results;
    return regeneratorRuntime.async(function performYoutubeSearch$(context$2$0) {
      while (1) switch (context$2$0.prev = context$2$0.next) {
        case 0:
          searchInput = $('yt-search-input');
          resultsEl = $('yt-search-results');

          if (!(!searchInput || !resultsEl)) {
            context$2$0.next = 4;
            break;
          }

          return context$2$0.abrupt('return');

        case 4:
          query = searchInput.value.trim();

          if (query) {
            context$2$0.next = 7;
            break;
          }

          return context$2$0.abrupt('return');

        case 7:
          ytId = extractYoutubeId(query);

          if (!ytId) {
            context$2$0.next = 24;
            break;
          }

          context$2$0.next = 11;
          return regeneratorRuntime.awrap(api('POST', '/api/youtube', { title: '', youtube_id: ytId }));

        case 11:
          res = context$2$0.sent;

          if (!(res && res.id)) {
            context$2$0.next = 22;
            break;
          }

          searchInput.value = '';
          resultsEl.innerHTML = '';
          resultsEl.classList.add('hidden');
          $('youtube-modal').classList.add('hidden');
          context$2$0.next = 19;
          return regeneratorRuntime.awrap(loadYoutubeVideos());

        case 19:
          playYoutubeVideo(ytId);
          context$2$0.next = 23;
          break;

        case 22:
          alert('動画の追加に失敗しました。');

        case 23:
          return context$2$0.abrupt('return');

        case 24:

          resultsEl.classList.remove('hidden');
          resultsEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-secondary);"><i class="fas fa-spinner fa-spin"></i> 検索中...</div>';

          context$2$0.next = 28;
          return regeneratorRuntime.awrap(api('GET', '/api/youtube/search?q=' + encodeURIComponent(query)));

        case 28:
          results = context$2$0.sent;

          if (!(!results || !results.length)) {
            context$2$0.next = 32;
            break;
          }

          resultsEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-secondary);">該当する動画が見つかりませんでした</div>';
          return context$2$0.abrupt('return');

        case 32:

          resultsEl.innerHTML = '';
          results.forEach(function (item) {
            var card = document.createElement('div');
            card.className = 'yt-result-card';

            var isAdded = state.youtubeVideos.some(function (v) {
              return v.youtube_id === item.id;
            });

            var thumbUrl = item.thumbnail || ('https://img.youtube.com/vi/' + encodeURIComponent(item.id) + '/mqdefault.jpg');

            card.innerHTML = '<img class="yt-result-thumb" src="' + thumbUrl.replace(/"/g, '&quot;') + '" alt="thumb">' + '<div class="yt-result-info">' + '<div class="yt-result-title">' + escHtml(item.title) + '</div>' + '<div class="yt-result-channel"><i class="fas fa-user-circle"></i> ' + escHtml(item.channel || 'YouTube') + '</div>' + '</div>' + '<button class="btn btn-primary yt-result-add-btn' + (isAdded ? ' added' : '') + '"' + (isAdded ? ' disabled' : '') + '>' + (isAdded ? '<i class="fas fa-check"></i> 追加済み' : '<i class="fas fa-plus"></i> 追加') + '</button>';

            var addBtn = card.querySelector('.yt-result-add-btn');
            on(addBtn, 'click', function callee$3$0(e) {
              var res;
              return regeneratorRuntime.async(function callee$3$0$(context$4$0) {
                while (1) switch (context$4$0.prev = context$4$0.next) {
                  case 0:
                    if (!addBtn.disabled) {
                      context$4$0.next = 3;
                      break;
                    }

                    return context$4$0.abrupt('return');

                  case 3:
                    addBtn.disabled = true;
                    addBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                    context$4$0.next = 7;
                    return regeneratorRuntime.awrap(api('POST', '/api/youtube', { title: item.title, youtube_id: item.id }));

                  case 7:
                    res = context$4$0.sent;

                    if (!(res && res.id)) {
                      context$4$0.next = 15;
                      break;
                    }

                    addBtn.className = 'btn btn-primary yt-result-add-btn added';
                    addBtn.innerHTML = '<i class="fas fa-check"></i> 追加済み';
                    context$4$0.next = 13;
                    return regeneratorRuntime.awrap(loadYoutubeVideos());

                  case 13:
                    context$4$0.next = 18;
                    break;

                  case 15:
                    addBtn.disabled = false;
                    addBtn.innerHTML = '<i class="fas fa-plus"></i> 追加';
                    alert('追加に失敗しました。');

                  case 18:
                  case 'end':
                    return context$4$0.stop();
                }
              }, null, this);
            });

            resultsEl.appendChild(card);
          });

        case 34:
        case 'end':
          return context$2$0.stop();
      }
    }, null, this);
  }

  function deleteYoutubeVideo(id) {
    return regeneratorRuntime.async(function deleteYoutubeVideo$(context$2$0) {
      while (1) switch (context$2$0.prev = context$2$0.next) {
        case 0:
          if (confirm('この動画を削除しますか？')) {
            context$2$0.next = 2;
            break;
          }

          return context$2$0.abrupt('return');

        case 2:
          context$2$0.next = 4;
          return regeneratorRuntime.awrap(api('DELETE', '/api/youtube/' + id));

        case 4:
          context$2$0.next = 6;
          return regeneratorRuntime.awrap(loadYoutubeVideos());

        case 6:
        case 'end':
          return context$2$0.stop();
      }
    }, null, this);
  }

  // YouTube モーダル・ボタンのイベント登録
  on($('yt-restart-btn'), 'click', function () {
    if (state.currentYoutubeId) {
      savePlaybackPosition(state.currentYoutubeId, 0);
      playYoutubeVideo(state.currentYoutubeId, true, 0);
    }
  });
  on($('yt-refresh-btn'), 'click', function callee$1$0() {
    var btn, icon;
    return regeneratorRuntime.async(function callee$1$0$(context$2$0) {
      while (1) switch (context$2$0.prev = context$2$0.next) {
        case 0:
          btn = $('yt-refresh-btn');
          icon = btn ? btn.querySelector('i') : null;

          if (icon) icon.classList.add('fa-spin');
          context$2$0.next = 5;
          return regeneratorRuntime.awrap(loadYoutubeVideos());

        case 5:
          if (icon) setTimeout(function () {
            icon.classList.remove('fa-spin');
          }, 500);

        case 6:
        case 'end':
          return context$2$0.stop();
      }
    }, null, this);
  });
  on($('yt-add-btn'), 'click', function () {
    $('youtube-modal').classList.remove('hidden');
    var input = $('yt-search-input');
    if (input) {
      input.value = '';
      input.focus();
    }
    var resultsEl = $('yt-search-results');
    if (resultsEl) {
      resultsEl.innerHTML = '';
      resultsEl.classList.add('hidden');
    }
  });
  on($('yt-cancel'), 'click', function () {
    $('youtube-modal').classList.add('hidden');
  });
  on($('yt-search-btn'), 'click', performYoutubeSearch);
  on($('yt-search-input'), 'keydown', function (e) {
    if (e.keyCode === 13 || e.key === 'Enter') {
      performYoutubeSearch();
    }
  });

  // ─ タブ切り替え（スマホ・タブレット用）──────────
  function initTabs() {
    var tabs = document.querySelectorAll('.tab-btn');
    if (!tabs.length) return;

    function switchTab(targetId) {
      // タブボタン
      tabs.forEach(function (btn) {
        if (btn.dataset.tab === targetId) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
      // パネル
      document.querySelectorAll('.panel').forEach(function (panel) {
        if (panel.id === targetId) {
          panel.classList.add('tab-active');
        } else {
          panel.classList.remove('tab-active');
        }
      });
      // センサータブに切り替わったらデータ取得 / リサイズ
      if (targetId === 'sensor-section') {
        if (!state.sensorLoaded) {
          loadSensorData();
        } else if (sensorChart) {
          setTimeout(function () {
            sensorChart.resize();
          }, 50);
        }
      }
    }

    tabs.forEach(function (btn) {
      var lastTouchTime = 0;
      btn.addEventListener('touchend', function (e) {
        lastTouchTime = Date.now();
        switchTab(btn.dataset.tab);
      }, { passive: true });
      btn.addEventListener('click', function (e) {
        if (Date.now() - lastTouchTime < 400) return;
        switchTab(btn.dataset.tab);
      });
    });

    // アジェンダ クイック追加ボタン
    on($('agenda-add-event-btn'), 'click', function () {
      if ($('cal-add-btn')) $('cal-add-btn').click();
    });
    on($('agenda-add-task-btn'), 'click', function () {
      if ($('task-add-btn')) $('task-add-btn').click();
    });
    on($('agenda-add-memo-btn'), 'click', function () {
      if ($('memo-add-btn')) $('memo-add-btn').click();
    });

    // 初期表示: デイリーアジェンダ
    switchTab('agenda-section');
  }
  initTabs();

  // ─ センサー ───────────────────────────────────
  var SENSOR_PROXY = '/api/sensor-proxy';
  var sensorChart = null;
  var sensorState = {
    hours: 24,
    activeDevice: null,
    activeMetrics: ['temperature', 'humidity', 'co2'],
    data: []
  };

  var METRIC_CONFIG = {
    temperature: { label: '温度', color: '#ff7675', borderColor: '#ff4757', icon: 'fa-thermometer-half', position: 'left' },
    humidity: { label: '湿度', color: '#74b9ff', borderColor: '#0984e3', icon: 'fa-tint', position: 'right' },
    co2: { label: 'CO₂', color: '#55efc4', borderColor: '#00b894', icon: 'fa-wind', position: 'right' }
  };

  function groupByDevice(rows) {
    var map = {};
    rows.forEach(function (r) {
      if (!map[r.device_name]) map[r.device_name] = [];
      map[r.device_name].push(r);
    });
    return map;
  }

  function latestByDevice(rows) {
    var map = {};
    rows.forEach(function (r) {
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
      cards.innerHTML = '<div class="empty-state">データなし</div>';
      return;
    }
    devices.forEach(function (name) {
      var d = latest[name];
      var ts = d.timestamp ? new Date(d.timestamp.endsWith('Z') ? d.timestamp : d.timestamp + 'Z') : null;
      var age = ts ? Math.round((Date.now() - ts.getTime()) / 60000) : null;
      var ageStr = age !== null ? age < 60 ? age + 'm前' : Math.round(age / 60) + 'h前' : '';
      var card = document.createElement('div');
      card.className = 'sensor-card' + (sensorState.activeDevice === name ? ' active' : '');
      card.dataset.device = name;

      var metrics = '';
      if (d.temperature !== null && d.temperature !== undefined) metrics += '<span class="sc-metric temp">' + d.temperature.toFixed(1) + '°C</span>';
      if (d.humidity !== null && d.humidity !== undefined) metrics += '<span class="sc-metric hum">' + d.humidity + '%</span>';
      if (d.co2 !== null && d.co2 !== undefined) metrics += '<span class="sc-metric co2">' + d.co2 + 'ppm</span>';
      if (d.battery !== null && d.battery !== undefined) {
        metrics += '<span class="sc-metric bat">' + d.battery + '%</span>';
      }

      card.innerHTML = '<div class="sc-inline">' + '<span class="sc-name">' + escHtml(name) + '</span>' + '<div class="sc-metrics">' + metrics + '</div>' + (ageStr ? '<span class="sc-age">' + ageStr + '</span>' : '') + '</div>';

      card.addEventListener('click', function () {
        sensorState.activeDevice = name;
        document.querySelectorAll('.sensor-card').forEach(function (c) {
          c.classList.remove('active');
        });
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
    var rows = device ? sensorState.data.filter(function (r) {
      return r.device_name === device;
    }) : [];
    // 利用可能なメトリクスを判定
    var availableMetrics = [];
    if (rows.some(function (r) {
      return r.temperature !== null && r.temperature !== undefined;
    })) availableMetrics.push('temperature');
    if (rows.some(function (r) {
      return r.humidity !== null && r.humidity !== undefined;
    })) availableMetrics.push('humidity');
    if (rows.some(function (r) {
      return r.co2 !== null && r.co2 !== undefined;
    })) availableMetrics.push('co2');
    if (!availableMetrics.length) availableMetrics = ['temperature'];

    if (!sensorState.activeMetrics || !sensorState.activeMetrics.length) {
      sensorState.activeMetrics = availableMetrics.slice();
    } else {
      sensorState.activeMetrics = sensorState.activeMetrics.filter(function (m) {
        return availableMetrics.includes(m);
      });
      if (!sensorState.activeMetrics.length) sensorState.activeMetrics = [availableMetrics[0]];
    }

    availableMetrics.forEach(function (m) {
      var btn = document.createElement('button');
      var isActive = sensorState.activeMetrics.includes(m);
      btn.className = 'sensor-metric-btn' + (isActive ? ' active' : '');
      btn.dataset.metric = m;
      var cfg = METRIC_CONFIG[m];
      btn.innerText = cfg.label;
      btn.addEventListener('click', function () {
        var idx = sensorState.activeMetrics.indexOf(m);
        if (idx >= 0) {
          if (sensorState.activeMetrics.length > 1) {
            sensorState.activeMetrics.splice(idx, 1);
            btn.classList.remove('active');
          }
        } else {
          sensorState.activeMetrics.push(m);
          btn.classList.add('active');
        }
        drawSensorChart();
      });
      tabEl.appendChild(btn);
    });
  }

  function drawSensorChart() {
    var canvas = $('sensor-chart');
    if (!canvas) return;
    var device = sensorState.activeDevice;
    var activeMetrics = sensorState.activeMetrics || ['temperature'];

    var rows = device ? sensorState.data.filter(function (r) {
      return r.device_name === device;
    }) : sensorState.data;

    // 時系列昇順
    rows = rows.slice().sort(function (a, b) {
      return a.timestamp < b.timestamp ? -1 : 1;
    });

    // 5分バケット平均
    var buckets = {};
    rows.forEach(function (r) {
      var ts = r.timestamp.endsWith('Z') ? r.timestamp : r.timestamp + 'Z';
      var d = new Date(ts);
      d.setSeconds(0, 0);
      d.setMinutes(Math.floor(d.getMinutes() / 5) * 5);
      var key = d.toISOString();
      if (!buckets[key]) {
        buckets[key] = { ts: d, temperature: [], humidity: [], co2: [] };
      }
      if (r.temperature !== null && r.temperature !== undefined) buckets[key].temperature.push(r.temperature);
      if (r.humidity !== null && r.humidity !== undefined) buckets[key].humidity.push(r.humidity);
      if (r.co2 !== null && r.co2 !== undefined) buckets[key].co2.push(r.co2);
    });

    var sorted = Object.values(buckets).sort(function (a, b) {
      return a.ts - b.ts;
    });
    var labels = sorted.map(function (b) {
      return b.ts.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    });

    var datasets = [];
    var xAxes = [{
      ticks: { fontColor: '#a7a9be', fontSize: 10, maxTicksLimit: 10, maxRotation: 0 },
      gridLines: { color: '#2a2a4a' }
    }];
    var yAxes = [];

    var firstYAxis = true;

    activeMetrics.forEach(function (m) {
      var cfg = METRIC_CONFIG[m];
      if (!cfg) return;

      var values = sorted.map(function (b) {
        var arr = b[m];
        if (!arr || !arr.length) return null;
        var sum = arr.reduce(function (a, c) {
          return a + c;
        }, 0);
        return Math.round(sum / arr.length * 10) / 10;
      });

      if (values.some(function (v) {
        return v !== null;
      })) {
        var yAxisId = 'y_' + m;
        datasets.push({
          label: cfg.label,
          data: values,
          borderColor: cfg.borderColor,
          backgroundColor: cfg.color + '15',
          borderWidth: 2,
          pointRadius: values.length > 100 ? 0 : 2,
          pointHoverRadius: 4,
          lineTension: 0.3,
          fill: false,
          yAxisID: yAxisId
        });

        yAxes.push({
          id: yAxisId,
          type: 'linear',
          display: true,
          position: cfg.position || 'left',
          ticks: { fontColor: cfg.borderColor, fontSize: 10 },
          gridLines: {
            color: firstYAxis ? '#2a2a4a' : 'transparent',
            drawOnChartArea: firstYAxis
          }
        });
        firstYAxis = false;
      }
    });

    if (sensorChart) {
      sensorChart.destroy();
      sensorChart = null;
    }

    if (!datasets.length) {
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
      return;
    }

    if (typeof Chart === 'undefined') {
      return;
    }

    sensorChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        tooltips: {
          mode: 'index',
          intersect: false,
          backgroundColor: '#1a1a2e',
          titleFontColor: '#a7a9be',
          bodyFontColor: '#fffffe',
          borderColor: '#2a2a4a',
          borderWidth: 1
        },
        legend: {
          display: datasets.length > 1,
          labels: { fontColor: '#a7a9be', fontSize: 11, boxWidth: 12 }
        },
        scales: {
          xAxes: xAxes,
          yAxes: yAxes
        }
      }
    });
  }

  function loadSensorData() {
    var cards, path, json, devices, firstCard;
    return regeneratorRuntime.async(function loadSensorData$(context$2$0) {
      while (1) switch (context$2$0.prev = context$2$0.next) {
        case 0:
          cards = $('sensor-cards');

          if (cards) cards.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i>読み込み中...</div>';
          context$2$0.prev = 2;
          path = SENSOR_PROXY + '?hours=' + sensorState.hours + '&limit=5000';
          context$2$0.next = 6;
          return regeneratorRuntime.awrap(api('GET', path));

        case 6:
          json = context$2$0.sent;

          if (json) {
            context$2$0.next = 9;
            break;
          }

          return context$2$0.abrupt('return');

        case 9:
          if (!(json.error && !json.data)) {
            context$2$0.next = 12;
            break;
          }

          if (cards) cards.innerHTML = '<div class="empty-state"><i class="fas fa-key"></i>' + escHtml(json.error) + '</div>';
          return context$2$0.abrupt('return');

        case 12:
          sensorState.data = json.data || [];
          state.sensorLoaded = true;

          renderSensorCards(sensorState.data);

          // 最初のデバイスを自動選択
          if (!sensorState.activeDevice && sensorState.data.length) {
            devices = Object.keys(groupByDevice(sensorState.data));

            if (devices.length) {
              sensorState.activeDevice = devices[0];
              firstCard = document.querySelector('.sensor-card');

              if (firstCard) firstCard.classList.add('active');
            }
          }
          renderSensorChartTabs();
          drawSensorChart();
          context$2$0.next = 24;
          break;

        case 20:
          context$2$0.prev = 20;
          context$2$0.t0 = context$2$0['catch'](2);

          console.warn('sensor load error:', context$2$0.t0);
          if (cards) cards.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i>取得失敗: ' + context$2$0.t0.message + '</div>';

        case 24:
        case 'end':
          return context$2$0.stop();
      }
    }, null, this, [[2, 20]]);
  }

  // 時間範囲ボタン
  document.querySelectorAll('.sensor-range-btn').forEach(function (btn) {
    on(btn, 'click', function () {
      sensorState.hours = parseInt(btn.dataset.hours, 10);
      sensorState.activeDevice = null;
      sensorState.data = [];
      state.sensorLoaded = false;
      document.querySelectorAll('.sensor-range-btn').forEach(function (b) {
        b.classList.remove('active');
      });
      btn.classList.add('active');
      loadSensorData();
    });
  });

  // センサー更新ボタン
  on($('sensor-refresh-btn'), 'click', function () {
    sensorState.data = [];
    state.sensorLoaded = false;
    loadSensorData();
  });

  // ─ Wake Lock ──────────────────────────────────
  function requestWakeLock() {
    return regeneratorRuntime.async(function requestWakeLock$(context$2$0) {
      while (1) switch (context$2$0.prev = context$2$0.next) {
        case 0:
          if (!('wakeLock' in navigator)) {
            context$2$0.next = 8;
            break;
          }

          context$2$0.prev = 1;
          context$2$0.next = 4;
          return regeneratorRuntime.awrap(navigator.wakeLock.request('screen'));

        case 4:
          context$2$0.next = 8;
          break;

        case 6:
          context$2$0.prev = 6;
          context$2$0.t0 = context$2$0['catch'](1);

        case 8:
        case 'end':
          return context$2$0.stop();
      }
    }, null, this, [[1, 6]]);
  }

  // ─ Service Worker ─────────────────────────────
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')['catch'](function () {});
  }

  // ─ 初期化処理 ─────────────────────────────────
  function init() {
    var token, authOk, attempt, res, me, emailEl, now;
    return regeneratorRuntime.async(function init$(context$2$0) {
      while (1) switch (context$2$0.prev = context$2$0.next) {
        case 0:
          token = getSessionToken();

          if (token) {
            context$2$0.next = 4;
            break;
          }

          window.location.href = '/login';
          return context$2$0.abrupt('return');

        case 4:
          authOk = false;
          attempt = 0;

        case 6:
          if (!(attempt < 3)) {
            context$2$0.next = 35;
            break;
          }

          context$2$0.prev = 7;
          context$2$0.next = 10;
          return regeneratorRuntime.awrap(fetch('/auth/me', { headers: { 'Authorization': 'Bearer ' + token } }));

        case 10:
          res = context$2$0.sent;

          if (!res.ok) {
            context$2$0.next = 25;
            break;
          }

          context$2$0.next = 14;
          return regeneratorRuntime.awrap(res.json());

        case 14:
          me = context$2$0.sent;

          if (!me.authenticated) {
            context$2$0.next = 22;
            break;
          }

          authOk = true;
          emailEl = $('user-email');

          if (emailEl && me.email) emailEl.textContent = me.email;
          return context$2$0.abrupt('break', 35);

        case 22:
          // サーバーが明示的に「未認証」と返した場合のみログアウト
          try {
            localStorage.removeItem('session_token');
          } catch (e) {}
          window.location.href = '/login';
          return context$2$0.abrupt('return');

        case 25:
          context$2$0.next = 29;
          break;

        case 27:
          context$2$0.prev = 27;
          context$2$0.t0 = context$2$0['catch'](7);

        case 29:
          if (!(attempt < 2)) {
            context$2$0.next = 32;
            break;
          }

          context$2$0.next = 32;
          return regeneratorRuntime.awrap(new Promise(function (r) {
            setTimeout(r, 1000 * (attempt + 1));
          }));

        case 32:
          attempt++;
          context$2$0.next = 6;
          break;

        case 35:
          now = new Date();

          state.calYear = now.getFullYear();
          state.calMonth = now.getMonth();

          context$2$0.next = 40;
          return regeneratorRuntime.awrap(loadSettings());

        case 40:
          applyWidgetVisibility();
          context$2$0.next = 43;
          return regeneratorRuntime.awrap(Promise.all([loadMemos(), loadTasks(), loadEvents(), loadYoutubeVideos(), loadSensorData()]));

        case 43:
          context$2$0.next = 45;
          return regeneratorRuntime.awrap(loadWeather());

        case 45:

          setInterval(loadWeather, 30 * 60 * 1000);
          setInterval(function callee$2$0() {
            return regeneratorRuntime.async(function callee$2$0$(context$3$0) {
              while (1) switch (context$3$0.prev = context$3$0.next) {
                case 0:
                  context$3$0.next = 2;
                  return regeneratorRuntime.awrap(Promise.all([loadMemos(), loadTasks(), loadEvents(), loadYoutubeVideos(), loadSensorData()]));

                case 2:
                  $('last-update').textContent = '最終更新: ' + new Date().toLocaleTimeString('ja-JP');

                case 3:
                case 'end':
                  return context$3$0.stop();
              }
            }, null, this);
          }, 5 * 60 * 1000);

          $('last-update').textContent = '最終更新: ' + now.toLocaleTimeString('ja-JP');

          requestWakeLock();
          document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'visible') requestWakeLock();
          });

          highlightColor('color-btn', 'yellow');
          highlightPriority('normal');

        case 52:
        case 'end':
          return context$2$0.stop();
      }
    }, null, this, [[7, 27]]);
  }

  init();
});

// 401/403 はリトライしてから諦める

// 今日の天気

// 1. 全Cacheを削除

// 2. ServiceWorker解除

// api() が null を返す場合はセッション切れ（すでにリダイレクト済み）

// upstream 認証エラーなどのエラーメッセージを表示

// トークン確認

// 認証確認 & メール表示（失敗してもリダイレクトしない、リトライあり）

// 5xx等はリトライ
/* ネットワークエラーはリトライ */
// 3回失敗してもトークンがある限りそのまま続行（オフライン等）
