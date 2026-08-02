"use strict";
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};
function getSessionToken() {
  try {
    return localStorage.getItem("session_token") || "";
  } catch (e) {
    return "";
  }
}
function api(method, path, body) {
  return __async(this, null, function* () {
    const token = getSessionToken();
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = "Bearer " + token;
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    try {
      const res = yield fetch(path, opts);
      if (res.status === 401 || res.status === 403) {
        yield new Promise(function(r) {
          setTimeout(r, 1500);
        });
        const res2 = yield fetch(path, opts);
        if (res2.status === 401 || res2.status === 403) {
          try {
            localStorage.removeItem("session_token");
          } catch (e) {
          }
          window.location.href = "/login";
          return null;
        }
        if (!res2.ok) throw new Error(yield res2.text());
        return res2.json();
      }
      if (!res.ok) throw new Error(yield res.text());
      return res.json();
    } catch (e) {
      console.warn("api error:", path, e);
      return null;
    }
  });
}
const WEEKDAYS_JA = ["\u65E5", "\u6708", "\u706B", "\u6C34", "\u6728", "\u91D1", "\u571F"];
const MONTHS_JA = ["1\u6708", "2\u6708", "3\u6708", "4\u6708", "5\u6708", "6\u6708", "7\u6708", "8\u6708", "9\u6708", "10\u6708", "11\u6708", "12\u6708"];
function toDateStr(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function formatDateJa(s) {
  if (!s) return "";
  const p = s.split("-");
  return p[1] + "/" + p[2];
}
function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\n/g, "<br>");
}
document.addEventListener("DOMContentLoaded", function() {
  if (!document.getElementById("clock")) return;
  var state = {
    memos: [],
    tasks: [],
    events: [],
    settings: {},
    calYear: 0,
    calMonth: 0,
    selectedColor: "yellow",
    selectedEventColor: "blue",
    selectedPriority: "normal",
    editMemoId: null,
    selectedCalDate: null
  };
  function $(id) {
    return document.getElementById(id);
  }
  function on(el, ev, fn) {
    if (el) el.addEventListener(ev, fn);
  }
  function updateClock() {
    var now = /* @__PURE__ */ new Date();
    var h = String(now.getHours()).padStart(2, "0");
    var mi = String(now.getMinutes()).padStart(2, "0");
    $("clock").textContent = h + ":" + mi;
    var wd = WEEKDAYS_JA[now.getDay()];
    var mo = MONTHS_JA[now.getMonth()];
    $("date-display").textContent = now.getFullYear() + "\u5E74 " + mo + now.getDate() + "\u65E5\uFF08" + wd + "\uFF09";
  }
  setInterval(updateClock, 1e3);
  updateClock();
  var WEATHER_ICONS = {
    Clear: "fa-sun",
    Clouds: "fa-cloud",
    Rain: "fa-cloud-rain",
    Drizzle: "fa-cloud-drizzle",
    Snow: "fa-snowflake",
    Thunderstorm: "fa-bolt",
    Mist: "fa-smog",
    Fog: "fa-smog",
    Haze: "fa-smog"
  };
  var WEEKDAYS_SHORT = ["\u65E5", "\u6708", "\u706B", "\u6C34", "\u6728", "\u91D1", "\u571F"];
  function weatherIcon(main) {
    return WEATHER_ICONS[main] || "fa-cloud";
  }
  function loadWeather() {
    return __async(this, null, function* () {
      if (!state.settings.weather_api_key) return;
      try {
        let buildHourlyItems = function(container, hourlyData, todayDate2) {
          container.innerHTML = "";
          if (!hourlyData || !hourlyData.length) return;
          var prevDate = "";
          hourlyData.forEach(function(h) {
            if (h.date === todayDate2 && h.hour < nowJSTH) return;
            var ic = weatherIcon(h.weather);
            if (h.date !== prevDate) {
              var sep = document.createElement("div");
              sep.className = "hl-sep";
              sep.textContent = h.date === todayDate2 ? "\u4ECA\u65E5" : "\u660E\u65E5";
              container.appendChild(sep);
              prevDate = h.date;
            }
            var el = document.createElement("div");
            el.className = "hl-item";
            el.innerHTML = '<div class="hl-hour">' + String(h.hour).padStart(2, "0") + '\u6642</div><i class="fas ' + ic + ' hl-icon"></i><div class="hl-temp">' + h.temp + "\xB0</div>" + (h.pop > 0 ? '<div class="hl-pop">' + h.pop + "%</div>" : '<div class="hl-pop hl-pop-zero">-</div>');
            container.appendChild(el);
          });
        }, buildForecastItems = function(container, forecastData) {
          container.innerHTML = "";
          forecastData.forEach(function(day, i) {
            var date = /* @__PURE__ */ new Date(day.date + "T00:00:00");
            var wd = WEEKDAYS_SHORT[date.getDay()];
            var label = i === 0 ? "\u4ECA\u65E5" : i === 1 ? "\u660E\u65E5" : date.getMonth() + 1 + "/" + date.getDate() + "(" + wd + ")";
            var ic = weatherIcon(day.weather);
            var popHtml = day.pop > 0 ? '<span class="fc-pop">' + day.pop + "%</span>" : '<span class="fc-pop fc-pop-zero">-</span>';
            var el = document.createElement("div");
            el.className = "fc-day" + (i === 0 ? " fc-today" : "");
            el.innerHTML = '<div class="fc-label">' + label + '</div><i class="fas ' + ic + ' fc-icon"></i>' + popHtml + '<div class="fc-temps"><span class="fc-max">' + day.temp_max + '</span><span class="fc-min">' + day.temp_min + "</span></div>";
            container.appendChild(el);
          });
        };
        var res = yield api("GET", "/api/weather/forecast");
        if (!res) return;
        var cur = res.current;
        var icon = weatherIcon(cur.weather);
        $("weather-icon").innerHTML = '<i class="fas ' + icon + ' fa-2x"></i>';
        $("weather-temp").textContent = cur.temp + "\xB0C";
        $("weather-minmax").textContent = "\u2191" + cur.temp_max + " \u2193" + cur.temp_min;
        $("weather-desc").textContent = cur.description;
        var nowDate = /* @__PURE__ */ new Date();
        var nowJSTH = (nowDate.getUTCHours() + 9) % 24;
        var todayDate = res.forecast.length ? res.forecast[0].date : "";
        buildForecastItems($("weather-forecast"), res.forecast);
        buildHourlyItems($("weather-hourly"), res.hourly, todayDate);
        buildForecastItems($("weather-detail-forecast"), res.forecast);
        buildHourlyItems($("weather-detail-hourly"), res.hourly, todayDate);
      } catch (e) {
      }
    });
  }
  (function() {
    var panel = $("weather-detail-panel");
    var toggleIcon = $("weather-toggle-icon");
    var weatherToday = $("weather-today");
    if (!panel || !weatherToday) return;
    function togglePanel(e) {
      e.preventDefault();
      e.stopPropagation();
      var isOpen = !panel.classList.contains("hidden");
      panel.classList.toggle("hidden", isOpen);
      if (toggleIcon) toggleIcon.classList.toggle("open", !isOpen);
    }
    weatherToday.addEventListener("touchstart", togglePanel, { passive: false });
    weatherToday.addEventListener("click", function(e) {
      e.stopPropagation();
    });
    document.addEventListener("touchstart", function(e) {
      if (!panel.classList.contains("hidden") && !weatherToday.contains(e.target) && !panel.contains(e.target)) {
        panel.classList.add("hidden");
        if (toggleIcon) toggleIcon.classList.remove("open");
      }
    }, { passive: true });
    document.addEventListener("click", function(e) {
      if (!panel.classList.contains("hidden") && !weatherToday.contains(e.target) && !panel.contains(e.target)) {
        panel.classList.add("hidden");
        if (toggleIcon) toggleIcon.classList.remove("open");
      }
    });
  })();
  function loadSettings() {
    return __async(this, null, function* () {
      try {
        var data = yield api("GET", "/api/settings");
        if (!data) return;
        state.settings = data;
        $("family-name").textContent = data.family_name || "\u304A\u3046\u3061\u30C0\u30C3\u30B7\u30E5\u30DC\u30FC\u30C9";
      } catch (e) {
      }
    });
  }
  function renderCalendar() {
    var y = state.calYear, m = state.calMonth;
    $("cal-title").textContent = y + "\u5E74" + MONTHS_JA[m];
    var grid = $("calendar-grid");
    grid.innerHTML = "";
    WEEKDAYS_JA.forEach(function(wd, i2) {
      var el2 = document.createElement("div");
      el2.className = "cal-day-header";
      el2.textContent = wd;
      if (i2 === 0) el2.style.color = "#ff7675";
      if (i2 === 6) el2.style.color = "#74b9ff";
      grid.appendChild(el2);
    });
    var today = toDateStr(/* @__PURE__ */ new Date());
    var firstDay = new Date(y, m, 1).getDay();
    var daysInMonth = new Date(y, m + 1, 0).getDate();
    var daysInPrev = new Date(y, m, 0).getDate();
    var eventMap = {};
    var rangeMap = {};
    state.events.forEach(function(ev) {
      if (!ev.end_date) {
        if (!eventMap[ev.date]) eventMap[ev.date] = [];
        eventMap[ev.date].push(ev);
      } else {
        var cur = /* @__PURE__ */ new Date(ev.date + "T00:00:00");
        var end = /* @__PURE__ */ new Date(ev.end_date + "T00:00:00");
        while (cur <= end) {
          var ds2 = toDateStr(cur);
          if (!rangeMap[ds2]) rangeMap[ds2] = [];
          var pos = ds2 === ev.date && ds2 === ev.end_date ? "single" : ds2 === ev.date ? "start" : ds2 === ev.end_date ? "end" : "mid";
          rangeMap[ds2].push({ ev, pos });
          cur.setDate(cur.getDate() + 1);
        }
        if (!eventMap[ev.date]) eventMap[ev.date] = [];
        eventMap[ev.date].push(ev);
      }
    });
    for (var i = 0; i < firstDay; i++) {
      var el = document.createElement("div");
      el.className = "cal-day other-month";
      el.textContent = daysInPrev - firstDay + i + 1;
      grid.appendChild(el);
    }
    for (var d = 1; d <= daysInMonth; d++) {
      var ds = y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
      var dow = new Date(y, m, d).getDay();
      var el = document.createElement("div");
      var cls = "cal-day";
      if (ds === today) cls += " today";
      if (dow === 0) cls += " sunday";
      if (dow === 6) cls += " saturday";
      el.className = cls;
      el.textContent = d;
      var singleEvs = (eventMap[ds] || []).filter(function(ev) {
        return !ev.end_date;
      });
      if (singleEvs.length) {
        var row = document.createElement("div");
        row.className = "cal-dot-row";
        singleEvs.slice(0, 3).forEach(function(ev) {
          var dot = document.createElement("div");
          dot.className = "cal-dot " + (ev.color || "blue");
          row.appendChild(dot);
        });
        el.appendChild(row);
      }
      if (rangeMap[ds]) {
        rangeMap[ds].slice(0, 2).forEach(function(item, idx) {
          var bar = document.createElement("div");
          bar.className = "range-bar " + (item.ev.color || "blue");
          if (item.pos === "start") bar.style.cssText += "border-radius:3px 0 0 3px;left:4px;";
          else if (item.pos === "end") bar.style.cssText += "border-radius:0 3px 3px 0;right:4px;";
          else if (item.pos === "mid") bar.style.cssText += "border-radius:0;";
          bar.style.bottom = 4 + idx * 5 + "px";
          el.appendChild(bar);
        });
      }
      (function(dateStr) {
        el.addEventListener("click", function() {
          state.selectedCalDate = dateStr;
          $("event-date").value = dateStr;
          $("event-end-date").value = "";
          openModal("event-modal");
        });
      })(ds);
      grid.appendChild(el);
    }
    var total = firstDay + daysInMonth;
    var rem = total % 7 === 0 ? 0 : 7 - total % 7;
    for (var d = 1; d <= rem; d++) {
      var el = document.createElement("div");
      el.className = "cal-day other-month";
      el.textContent = d;
      grid.appendChild(el);
    }
    renderEventList(eventMap);
  }
  function renderEventList(eventMap) {
    var list = $("event-list");
    list.innerHTML = "";
    var y = state.calYear, m = state.calMonth;
    var monthStr = y + "-" + String(m + 1).padStart(2, "0");
    var items = [];
    Object.keys(eventMap).forEach(function(date) {
      if (date.startsWith(monthStr)) {
        eventMap[date].forEach(function(ev) {
          items.push(ev);
        });
      }
    });
    items.sort(function(a, b) {
      return a.date + (a.time || "") < b.date + (b.time || "") ? -1 : 1;
    });
    if (!items.length) {
      list.innerHTML = '<div class="empty-state"><i class="fas fa-calendar"></i>\u4E88\u5B9A\u306A\u3057</div>';
      return;
    }
    items.forEach(function(ev) {
      var el = document.createElement("div");
      el.className = "event-item " + (ev.color || "blue");
      var dateBadge = ev.end_date ? formatDateJa(ev.date) + "\u301C" + formatDateJa(ev.end_date) : formatDateJa(ev.date);
      el.innerHTML = '<span class="event-date-badge">' + dateBadge + '</span><span class="event-title">' + escHtml(ev.title) + "</span>" + (ev.time ? '<span class="event-time">' + ev.time + "</span>" : "") + '<button class="event-del-btn" title="\u524A\u9664"><i class="fas fa-times"></i></button>';
      el.querySelector(".event-del-btn").addEventListener("click", function(e) {
        return __async(this, null, function* () {
          e.stopPropagation();
          if (confirm("\u300C" + ev.title + "\u300D\u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F")) {
            yield api("DELETE", "/api/calendar/" + ev.id);
            yield loadEvents();
          }
        });
      });
      list.appendChild(el);
    });
  }
  function loadEvents() {
    return __async(this, null, function* () {
      try {
        var data = yield api("GET", "/api/calendar");
        if (data) {
          state.events = data;
          renderCalendar();
          renderAgenda();
        }
      } catch (e) {
      }
    });
  }
  function renderMemos() {
    var list = $("memo-list");
    list.innerHTML = "";
    if (!state.memos.length) {
      list.innerHTML = '<div class="empty-state"><i class="fas fa-sticky-note"></i>\u30E1\u30E2\u306A\u3057</div>';
      return;
    }
    state.memos.forEach(function(memo) {
      var el = document.createElement("div");
      el.className = "memo-card " + (memo.color || "yellow") + (memo.pinned ? " pinned" : "");
      el.innerHTML = '<div class="memo-text">' + escHtml(memo.content) + '</div><div class="memo-actions"><button class="memo-btn pin-btn"><i class="fas fa-thumbtack" style="opacity:' + (memo.pinned ? 1 : 0.4) + '"></i></button><button class="memo-btn edit-btn"><i class="fas fa-edit"></i></button><button class="memo-btn del-btn"><i class="fas fa-trash"></i></button></div>';
      el.querySelector(".pin-btn").addEventListener("click", function(e) {
        return __async(this, null, function* () {
          e.stopPropagation();
          yield api("PUT", "/api/memos/" + memo.id, { pinned: !memo.pinned });
          yield loadMemos();
        });
      });
      el.querySelector(".edit-btn").addEventListener("click", function(e) {
        e.stopPropagation();
        state.editMemoId = memo.id;
        $("memo-content").value = memo.content;
        state.selectedColor = memo.color || "yellow";
        highlightColor("color-btn", state.selectedColor);
        openModal("memo-modal");
      });
      el.querySelector(".del-btn").addEventListener("click", function(e) {
        return __async(this, null, function* () {
          e.stopPropagation();
          if (confirm("\u3053\u306E\u30E1\u30E2\u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F")) {
            yield api("DELETE", "/api/memos/" + memo.id);
            yield loadMemos();
          }
        });
      });
      list.appendChild(el);
    });
  }
  function loadMemos() {
    return __async(this, null, function* () {
      try {
        var data = yield api("GET", "/api/memos");
        if (data) {
          state.memos = data;
          renderMemos();
          renderAgenda();
        }
      } catch (e) {
      }
    });
  }
  function renderTasks() {
    var list = $("task-list");
    list.innerHTML = "";
    if (!state.tasks.length) {
      list.innerHTML = '<div class="empty-state"><i class="fas fa-check-circle"></i>\u30BF\u30B9\u30AF\u306A\u3057</div>';
      return;
    }
    var today = toDateStr(/* @__PURE__ */ new Date());
    state.tasks.forEach(function(task) {
      var el = document.createElement("div");
      el.className = "task-item" + (task.done ? " done" : "");
      var isOverdue = task.due_date && task.due_date < today && !task.done;
      el.innerHTML = '<div class="task-check"></div><div class="task-info"><div class="task-title">' + escHtml(task.title) + "</div>" + (task.due_date ? '<div class="task-due' + (isOverdue ? " overdue" : "") + '">' + (isOverdue ? "\u26A0 " : "") + formatDateJa(task.due_date) + "\u307E\u3067</div>" : "") + '</div><div class="task-priority ' + (task.priority || "normal") + '"></div><button class="task-del-btn"><i class="fas fa-times"></i></button>';
      el.querySelector(".task-check").addEventListener("click", function() {
        return __async(this, null, function* () {
          yield api("PUT", "/api/tasks/" + task.id, { done: !task.done });
          yield loadTasks();
        });
      });
      el.querySelector(".task-del-btn").addEventListener("click", function(e) {
        return __async(this, null, function* () {
          e.stopPropagation();
          yield api("DELETE", "/api/tasks/" + task.id);
          yield loadTasks();
        });
      });
      list.appendChild(el);
    });
  }
  function loadTasks() {
    return __async(this, null, function* () {
      try {
        var data = yield api("GET", "/api/tasks");
        if (data) {
          state.tasks = data;
          renderTasks();
          renderAgenda();
        }
      } catch (e) {
      }
    });
  }
  function renderAgenda() {
    var todayStr = toDateStr(/* @__PURE__ */ new Date());
    var todayObj = /* @__PURE__ */ new Date();
    var daysJa = ["\u65E5", "\u6708", "\u706B", "\u6C34", "\u6728", "\u91D1", "\u571F"];
    var dateBadgeEl = $("agenda-today-date");
    if (dateBadgeEl) {
      dateBadgeEl.textContent = todayObj.getMonth() + 1 + "\u6708" + todayObj.getDate() + "\u65E5(" + daysJa[todayObj.getDay()] + ")";
    }
    var evListEl = $("agenda-events-list");
    if (evListEl) {
      evListEl.innerHTML = "";
      var todayEvents = state.events.filter(function(ev) {
        var start = ev.date;
        var end = ev.end_date || ev.date;
        return todayStr >= start && todayStr <= end;
      });
      if (!todayEvents.length) {
        evListEl.innerHTML = '<div class="empty-state mini"><i class="fas fa-calendar-check"></i> \u672C\u65E5\u306E\u4E88\u5B9A\u306F\u3042\u308A\u307E\u305B\u3093</div>';
      } else {
        todayEvents.forEach(function(ev) {
          var el = document.createElement("div");
          el.className = "agenda-event-item " + (ev.color || "blue");
          el.innerHTML = (ev.time ? '<span class="agenda-time-badge">' + escHtml(ev.time) + "</span>" : '<span class="agenda-time-badge all-day">\u7D42\u65E5</span>') + '<span class="agenda-event-title">' + escHtml(ev.title) + '</span><button class="agenda-item-del" title="\u524A\u9664"><i class="fas fa-times"></i></button>';
          el.querySelector(".agenda-item-del").addEventListener("click", function(e) {
            return __async(this, null, function* () {
              e.stopPropagation();
              if (confirm("\u300C" + ev.title + "\u300D\u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F")) {
                yield api("DELETE", "/api/calendar/" + ev.id);
                yield loadEvents();
              }
            });
          });
          evListEl.appendChild(el);
        });
      }
    }
    var taskListEl = $("agenda-tasks-list");
    var taskCountEl = $("agenda-task-count");
    if (taskListEl) {
      taskListEl.innerHTML = "";
      var uncompletedTasks = state.tasks.filter(function(t) {
        return !t.done;
      });
      if (taskCountEl) {
        taskCountEl.textContent = uncompletedTasks.length ? uncompletedTasks.length + "\u4EF6" : "0\u4EF6";
      }
      if (!uncompletedTasks.length) {
        taskListEl.innerHTML = '<div class="empty-state mini"><i class="fas fa-check-circle"></i> \u672A\u5B8C\u4E86\u306E\u30BF\u30B9\u30AF\u306F\u3042\u308A\u307E\u305B\u3093</div>';
      } else {
        uncompletedTasks.forEach(function(task) {
          var isOverdue = task.due_date && task.due_date < todayStr;
          var el = document.createElement("div");
          el.className = "agenda-task-item";
          el.innerHTML = '<div class="task-check" title="\u5B8C\u4E86\u306B\u3059\u308B"></div><div class="agenda-task-info"><span class="agenda-task-title">' + escHtml(task.title) + "</span>" + (task.due_date ? '<span class="task-due' + (isOverdue ? " overdue" : "") + '">' + (isOverdue ? "\u26A0 " : "") + formatDateJa(task.due_date) + "</span>" : "") + '</div><span class="task-priority ' + (task.priority || "normal") + '"></span>';
          el.querySelector(".task-check").addEventListener("click", function() {
            return __async(this, null, function* () {
              yield api("PUT", "/api/tasks/" + task.id, { done: true });
              yield loadTasks();
            });
          });
          taskListEl.appendChild(el);
        });
      }
    }
    var memoListEl = $("agenda-memos-list");
    if (memoListEl) {
      memoListEl.innerHTML = "";
      if (!state.memos.length) {
        memoListEl.innerHTML = '<div class="empty-state mini"><i class="fas fa-sticky-note"></i> \u30E1\u30E2\u306F\u3042\u308A\u307E\u305B\u3093</div>';
      } else {
        var sortedMemos = state.memos.slice().sort(function(a, b) {
          return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
        }).slice(0, 4);
        sortedMemos.forEach(function(memo) {
          var el = document.createElement("div");
          el.className = "agenda-memo-card " + (memo.color || "yellow") + (memo.pinned ? " pinned" : "");
          el.innerHTML = '<div class="agenda-memo-text">' + escHtml(memo.content) + "</div>" + (memo.pinned ? '<i class="fas fa-thumbtack agenda-pin-icon"></i>' : "");
          el.addEventListener("click", function() {
            state.editMemoId = memo.id;
            $("memo-content").value = memo.content;
            state.selectedColor = memo.color || "yellow";
            highlightColor("color-btn", state.selectedColor);
            openModal("memo-modal");
          });
          memoListEl.appendChild(el);
        });
      }
    }
  }
  function openModal(id) {
    document.querySelectorAll(".modal").forEach(function(m) {
      m.classList.add("hidden");
    });
    var el = $(id);
    if (el) el.classList.remove("hidden");
  }
  function closeAllModals() {
    document.querySelectorAll(".modal").forEach(function(m) {
      m.classList.add("hidden");
    });
  }
  function highlightColor(cls, value) {
    document.querySelectorAll("." + cls).forEach(function(b) {
      b.classList.remove("selected");
    });
    document.querySelectorAll("." + cls + '[data-color="' + value + '"]').forEach(function(b) {
      b.classList.add("selected");
    });
  }
  function highlightPriority(value) {
    document.querySelectorAll(".prio-btn").forEach(function(b) {
      b.classList.toggle("active", b.dataset.priority === value);
    });
  }
  on($("memo-add-btn"), "click", function() {
    state.editMemoId = null;
    $("memo-content").value = "";
    state.selectedColor = "yellow";
    highlightColor("color-btn", "yellow");
    openModal("memo-modal");
    setTimeout(function() {
      $("memo-content").focus();
    }, 100);
  });
  document.querySelectorAll("#memo-modal .color-btn").forEach(function(btn) {
    on(btn, "click", function() {
      state.selectedColor = btn.dataset.color;
      highlightColor("color-btn", state.selectedColor);
    });
  });
  on($("memo-cancel"), "click", closeAllModals);
  on($("memo-save"), "click", function() {
    return __async(this, null, function* () {
      var content = $("memo-content").value.trim();
      if (!content) {
        alert("\u5185\u5BB9\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044");
        return;
      }
      if (state.editMemoId) {
        yield api("PUT", "/api/memos/" + state.editMemoId, { content, color: state.selectedColor });
      } else {
        yield api("POST", "/api/memos", { content, color: state.selectedColor });
      }
      closeAllModals();
      yield loadMemos();
    });
  });
  on($("task-add-btn"), "click", function() {
    $("task-title").value = "";
    $("task-due").value = "";
    state.selectedPriority = "normal";
    highlightPriority("normal");
    openModal("task-modal");
    setTimeout(function() {
      $("task-title").focus();
    }, 100);
  });
  document.querySelectorAll(".prio-btn").forEach(function(btn) {
    on(btn, "click", function() {
      state.selectedPriority = btn.dataset.priority;
      highlightPriority(state.selectedPriority);
    });
  });
  on($("task-cancel"), "click", closeAllModals);
  on($("task-save"), "click", function() {
    return __async(this, null, function* () {
      var title = $("task-title").value.trim();
      if (!title) {
        alert("\u30BF\u30B9\u30AF\u540D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044");
        return;
      }
      yield api("POST", "/api/tasks", { title, due_date: $("task-due").value || null, priority: state.selectedPriority });
      closeAllModals();
      yield loadTasks();
    });
  });
  on($("cal-add-btn"), "click", function() {
    $("event-title").value = "";
    $("event-date").value = state.selectedCalDate || toDateStr(/* @__PURE__ */ new Date());
    $("event-end-date").value = "";
    $("event-time").value = "";
    state.selectedEventColor = "blue";
    document.querySelectorAll("#event-modal .color-btn").forEach(function(b) {
      b.classList.remove("selected");
    });
    openModal("event-modal");
    setTimeout(function() {
      $("event-title").focus();
    }, 100);
  });
  on($("event-date"), "change", function() {
    var endEl = $("event-end-date");
    endEl.min = $("event-date").value;
    if (endEl.value && endEl.value <= $("event-date").value) endEl.value = "";
  });
  document.querySelectorAll("#event-modal .color-btn").forEach(function(btn) {
    on(btn, "click", function() {
      state.selectedEventColor = btn.dataset.color;
      document.querySelectorAll("#event-modal .color-btn").forEach(function(b) {
        b.classList.remove("selected");
      });
      btn.classList.add("selected");
    });
  });
  on($("event-cancel"), "click", closeAllModals);
  on($("event-save"), "click", function() {
    return __async(this, null, function* () {
      var title = $("event-title").value.trim();
      var date = $("event-date").value;
      var endDate = $("event-end-date").value || null;
      if (!title || !date) {
        alert("\u30BF\u30A4\u30C8\u30EB\u3068\u958B\u59CB\u65E5\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044");
        return;
      }
      if (endDate && endDate <= date) {
        alert("\u7D42\u4E86\u65E5\u306F\u958B\u59CB\u65E5\u3088\u308A\u5F8C\u306B\u3057\u3066\u304F\u3060\u3055\u3044");
        return;
      }
      yield api("POST", "/api/calendar", {
        title,
        date,
        end_date: endDate,
        time: $("event-time").value || null,
        color: state.selectedEventColor
      });
      closeAllModals();
      yield loadEvents();
    });
  });
  on($("cal-prev"), "click", function() {
    state.calMonth--;
    if (state.calMonth < 0) {
      state.calMonth = 11;
      state.calYear--;
    }
    renderCalendar();
  });
  on($("cal-next"), "click", function() {
    state.calMonth++;
    if (state.calMonth > 11) {
      state.calMonth = 0;
      state.calYear++;
    }
    renderCalendar();
  });
  var WIDGET_PANELS = [
    "agenda-section",
    "calendar-section",
    "memo-section",
    "task-section",
    "sensor-section",
    "youtube-section"
  ];
  function getWidgetVisibility() {
    var vis = {};
    try {
      var saved = localStorage.getItem("widget_visibility");
      if (saved) vis = JSON.parse(saved);
    } catch (e) {
    }
    return vis;
  }
  function applyWidgetVisibility() {
    var vis = getWidgetVisibility();
    WIDGET_PANELS.forEach(function(panelId) {
      var isVisible = vis[panelId] !== false;
      var panel = $(panelId);
      if (panel) {
        panel.classList.toggle("widget-hidden", !isVisible);
      }
      var tabBtn = document.querySelector('.tab-btn[data-tab="' + panelId + '"]');
      if (tabBtn) {
        tabBtn.style.display = isVisible ? "" : "none";
      }
    });
  }
  function saveWidgetVisibilityFromModal() {
    var vis = {};
    WIDGET_PANELS.forEach(function(panelId) {
      var chk = $("set-vis-" + panelId);
      if (chk) {
        vis[panelId] = chk.checked;
      }
    });
    try {
      localStorage.setItem("widget_visibility", JSON.stringify(vis));
    } catch (e) {
    }
    applyWidgetVisibility();
  }
  on($("settings-btn"), "click", function() {
    $("set-family").value = state.settings.family_name || "";
    $("set-weather-key").value = state.settings.weather_api_key || "";
    $("set-city").value = state.settings.city || "Tokyo";
    if ($("set-youtube-key")) $("set-youtube-key").value = state.settings.youtube_api_key || "";
    if ($("update-msg")) $("update-msg").textContent = "";
    if ($("check-update-btn")) $("check-update-btn").disabled = false;
    var vis = getWidgetVisibility();
    WIDGET_PANELS.forEach(function(panelId) {
      var chk = $("set-vis-" + panelId);
      if (chk) {
        chk.checked = vis[panelId] !== false;
      }
    });
    openModal("settings-modal");
  });
  on($("settings-cancel"), "click", closeAllModals);
  on($("settings-save"), "click", function() {
    return __async(this, null, function* () {
      saveWidgetVisibilityFromModal();
      yield api("PUT", "/api/settings", {
        family_name: $("set-family").value || "\u304A\u3046\u3061\u30C0\u30C3\u30B7\u30E5\u30DC\u30FC\u30C9",
        weather_api_key: $("set-weather-key").value,
        city: $("set-city").value || "Tokyo",
        youtube_api_key: $("set-youtube-key") ? $("set-youtube-key").value : ""
      });
      closeAllModals();
      yield loadSettings();
      yield loadWeather();
    });
  });
  window.performAppUpdate = function(e) {
    return __async(this, null, function* () {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      var msgEl = $("update-msg");
      var btn = $("check-update-btn");
      if (msgEl) msgEl.textContent = "\u66F4\u65B0\u3092\u78BA\u8A8D\u4E2D...";
      if (btn) btn.disabled = true;
      try {
        if ("caches" in window) {
          var keys = yield caches.keys();
          yield Promise.all(keys.map(function(k) {
            return caches.delete(k);
          }));
        }
        if ("serviceWorker" in navigator) {
          var registrations = yield navigator.serviceWorker.getRegistrations();
          for (var reg of registrations) {
            yield reg.unregister();
          }
        }
        if (msgEl) msgEl.textContent = "\u6700\u65B0\u7248\u3092\u518D\u8AAD\u307F\u8FBC\u307F\u3057\u307E\u3059...";
        setTimeout(function() {
          var currentUrl = new URL(window.location.href);
          currentUrl.searchParams.set("_v", Date.now());
          window.location.href = currentUrl.toString();
        }, 300);
      } catch (err) {
        console.error("Update error:", err);
        if (msgEl) msgEl.textContent = "\u30A8\u30E9\u30FC\u304C\u767A\u751F\u3057\u305F\u305F\u3081\u5F37\u5236\u30EA\u30ED\u30FC\u30C9\u3057\u307E\u3059...";
        setTimeout(function() {
          window.location.reload(true);
        }, 500);
      }
    });
  };
  var updateBtn = $("check-update-btn");
  if (updateBtn) {
    updateBtn.addEventListener("click", window.performAppUpdate);
    updateBtn.addEventListener("touchend", window.performAppUpdate);
  }
  document.querySelectorAll(".modal").forEach(function(modal) {
    on(modal, "click", function(e) {
      if (e.target === modal) closeAllModals();
    });
  });
  on($("refresh-btn"), "click", function() {
    return __async(this, null, function* () {
      yield Promise.all([loadMemos(), loadTasks(), loadEvents(), loadWeather(), loadYoutubeVideos(), loadSensorData()]);
      $("last-update").textContent = "\u6700\u7D42\u66F4\u65B0: " + (/* @__PURE__ */ new Date()).toLocaleTimeString("ja-JP");
    });
  });
  on($("logout-btn"), "click", function() {
    return __async(this, null, function* () {
      if (!confirm("\u30ED\u30B0\u30A2\u30A6\u30C8\u3057\u307E\u3059\u304B\uFF1F")) return;
      var token = getSessionToken();
      yield fetch("/auth/logout", {
        method: "POST",
        headers: token ? { "Authorization": "Bearer " + token } : {}
      });
      try {
        localStorage.removeItem("session_token");
      } catch (e) {
      }
      window.location.href = "/login";
    });
  });
  var draggedPanel = null;
  function savePanelOrder() {
    var mainContent = $("main-content");
    if (!mainContent) return;
    var order = Array.from(mainContent.children).map(function(panel) {
      return panel.id;
    });
    try {
      localStorage.setItem("panel_order", JSON.stringify(order));
    } catch (e) {
    }
  }
  function restorePanelOrder() {
    var mainContent = $("main-content");
    if (!mainContent) return;
    var saved = null;
    try {
      saved = JSON.parse(localStorage.getItem("panel_order"));
    } catch (e) {
    }
    if (!saved || !Array.isArray(saved)) return;
    saved.forEach(function(id) {
      var panel = $(id);
      if (panel && panel.parentElement === mainContent) {
        mainContent.appendChild(panel);
      }
    });
  }
  function initDragAndDrop() {
    var panels = document.querySelectorAll(".panel");
    var mainContent = $("main-content");
    if (!mainContent) return;
    restorePanelOrder();
    var currentPanels = document.querySelectorAll(".panel");
    currentPanels.forEach(function(panel) {
      panel.addEventListener("dragstart", function(e) {
        if (panel.classList.contains("maximized")) {
          e.preventDefault();
          return;
        }
        draggedPanel = panel;
        panel.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", panel.id);
      });
      panel.addEventListener("dragend", function() {
        panel.classList.remove("dragging");
        document.querySelectorAll(".panel").forEach(function(p) {
          p.classList.remove("drag-over");
        });
        draggedPanel = null;
        savePanelOrder();
      });
      panel.addEventListener("dragover", function(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        var targetPanel = e.target.closest(".panel");
        if (draggedPanel && targetPanel && draggedPanel !== targetPanel) {
          targetPanel.classList.add("drag-over");
        }
      });
      panel.addEventListener("dragleave", function(e) {
        var targetPanel = e.target.closest(".panel");
        if (targetPanel) {
          targetPanel.classList.remove("drag-over");
        }
      });
      panel.addEventListener("drop", function(e) {
        e.preventDefault();
        var targetPanel = e.target.closest(".panel");
        if (targetPanel) targetPanel.classList.remove("drag-over");
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
  document.querySelectorAll(".panel-max-btn").forEach(function(btn) {
    btn.addEventListener("click", function(e) {
      e.stopPropagation();
      var panel = btn.closest(".panel");
      if (!panel) return;
      var isMax = panel.classList.toggle("maximized");
      var icon = btn.querySelector("i");
      if (icon) {
        icon.className = isMax ? "fas fa-compress" : "fas fa-expand";
      }
      btn.title = isMax ? "\u5143\u306B\u623B\u3059" : "\u6700\u5927\u5316";
      if (panel.id === "sensor-section") {
        setTimeout(function() {
          drawSensorChart();
        }, 250);
      }
    });
  });
  state.youtubeVideos = [];
  state.currentYoutubeId = null;
  var ytPlayer = null;
  var ytProgressInterval = null;
  function getPlaybackPositionMap() {
    try {
      return JSON.parse(localStorage.getItem("yt_playback_positions") || "{}");
    } catch (e) {
      return {};
    }
  }
  function savePlaybackPosition(ytId, seconds) {
    if (!ytId || typeof seconds !== "number" || isNaN(seconds)) return;
    var map = getPlaybackPositionMap();
    if (ytPlayer && ytPlayer.getDuration) {
      var dur = ytPlayer.getDuration();
      if (dur > 0 && dur - seconds < 5) {
        delete map[ytId];
        try {
          localStorage.setItem("yt_playback_positions", JSON.stringify(map));
        } catch (e) {
        }
        return;
      }
    }
    if (seconds < 2) {
      delete map[ytId];
    } else {
      map[ytId] = Math.floor(seconds);
    }
    try {
      localStorage.setItem("yt_playback_positions", JSON.stringify(map));
    } catch (e) {
    }
  }
  function getSavedPosition(ytId) {
    var map = getPlaybackPositionMap();
    return map[ytId] || 0;
  }
  function startPositionTracker() {
    if (ytProgressInterval) clearInterval(ytProgressInterval);
    ytProgressInterval = setInterval(function() {
      if (ytPlayer && ytPlayer.getCurrentTime && state.currentYoutubeId) {
        try {
          var stateNum = ytPlayer.getPlayerState();
          if (stateNum === 1 || stateNum === 2) {
            var curr = ytPlayer.getCurrentTime();
            savePlaybackPosition(state.currentYoutubeId, curr);
          }
        } catch (e) {
        }
      }
    }, 2e3);
  }
  function initYoutubePlayer(ytId, startSeconds, autoPlay) {
    if (startSeconds === void 0) startSeconds = getSavedPosition(ytId);
    if (autoPlay === void 0) autoPlay = true;
    state.currentYoutubeId = ytId;
    if (!window.YT || !window.YT.Player) {
      setTimeout(function() {
        initYoutubePlayer(ytId, startSeconds, autoPlay);
      }, 200);
      return;
    }
    if (ytPlayer && typeof ytPlayer.loadVideoById === "function") {
      try {
        if (autoPlay) {
          ytPlayer.loadVideoById({ videoId: ytId, startSeconds });
        } else {
          ytPlayer.cueVideoById({ videoId: ytId, startSeconds });
        }
        renderYoutubePlaylist();
        startPositionTracker();
        return;
      } catch (e) {
      }
    }
    var playerContainer = $("yt-player-container");
    if (playerContainer) {
      playerContainer.innerHTML = '<div id="yt-player"></div>';
    }
    try {
      ytPlayer = new YT.Player("yt-player", {
        videoId: ytId,
        playerVars: {
          autoplay: autoPlay ? 1 : 0,
          start: Math.floor(startSeconds),
          rel: 0,
          enablejsapi: 1
        },
        events: {
          onReady: function(event) {
            startPositionTracker();
          },
          onStateChange: function(event) {
            if (event.data === 1 || event.data === 2) {
              if (ytPlayer && ytPlayer.getCurrentTime && state.currentYoutubeId) {
                savePlaybackPosition(state.currentYoutubeId, ytPlayer.getCurrentTime());
              }
            } else if (event.data === 0) {
              savePlaybackPosition(state.currentYoutubeId, 0);
            }
          }
        }
      });
    } catch (e) {
      console.warn("YT.Player init failed", e);
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
    return __async(this, null, function* () {
      var data = yield api("GET", "/api/youtube");
      state.youtubeVideos = data || [];
      if (state.youtubeVideos.length) {
        var exists = state.youtubeVideos.some(function(v) {
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
    });
  }
  function playYoutubeVideo(ytId, autoPlay, startSeconds) {
    if (autoPlay === void 0) autoPlay = true;
    if (startSeconds === void 0) startSeconds = getSavedPosition(ytId);
    initYoutubePlayer(ytId, startSeconds, autoPlay);
  }
  function renderYoutubePlaylist() {
    var playlistEl = $("yt-playlist");
    if (!playlistEl) return;
    playlistEl.innerHTML = "";
    if (!state.youtubeVideos.length) {
      playlistEl.innerHTML = '<div class="empty-state"><i class="fab fa-youtube"></i>\u767B\u9332\u3055\u308C\u305F\u52D5\u753B\u306F\u3042\u308A\u307E\u305B\u3093</div>';
      return;
    }
    var savedPositions = getPlaybackPositionMap();
    state.youtubeVideos.forEach(function(v) {
      var item = document.createElement("div");
      var isActive = v.youtube_id === state.currentYoutubeId;
      item.className = "yt-item" + (isActive ? " active" : "");
      var thumbUrl = "https://img.youtube.com/vi/" + encodeURIComponent(v.youtube_id) + "/default.jpg";
      var pos = savedPositions[v.youtube_id] || 0;
      var posStr = "";
      if (pos > 0) {
        var m = Math.floor(pos / 60);
        var s = Math.floor(pos % 60);
        posStr = " (" + m + ":" + (s < 10 ? "0" : "") + s + "\u304B\u3089)";
      }
      item.innerHTML = '<img class="yt-thumb" src="' + thumbUrl + '" alt="thumb"><div class="yt-info"><div class="yt-title">' + escHtml(v.title) + '</div><div class="yt-sub">ID: ' + escHtml(v.youtube_id) + posStr + '</div></div><button class="yt-del-btn" title="\u524A\u9664"><i class="fas fa-trash"></i></button>';
      item.addEventListener("click", function(e) {
        if (e.target.closest(".yt-del-btn")) {
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
    return __async(this, null, function* () {
      var searchInput = $("yt-search-input");
      var resultsEl = $("yt-search-results");
      if (!searchInput || !resultsEl) return;
      var query = searchInput.value.trim();
      if (!query) return;
      var ytId = extractYoutubeId(query);
      if (ytId) {
        var res = yield api("POST", "/api/youtube", { title: "", youtube_id: ytId });
        if (res && res.id) {
          searchInput.value = "";
          resultsEl.innerHTML = "";
          resultsEl.classList.add("hidden");
          $("youtube-modal").classList.add("hidden");
          yield loadYoutubeVideos();
          playYoutubeVideo(ytId);
        } else {
          alert("\u52D5\u753B\u306E\u8FFD\u52A0\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002");
        }
        return;
      }
      resultsEl.classList.remove("hidden");
      resultsEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-secondary);"><i class="fas fa-spinner fa-spin"></i> \u691C\u7D22\u4E2D...</div>';
      var results = yield api("GET", "/api/youtube/search?q=" + encodeURIComponent(query));
      if (!results || !results.length) {
        resultsEl.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-secondary);">\u8A72\u5F53\u3059\u308B\u52D5\u753B\u304C\u898B\u3064\u304B\u308A\u307E\u305B\u3093\u3067\u3057\u305F</div>';
        return;
      }
      resultsEl.innerHTML = "";
      results.forEach(function(item) {
        var card = document.createElement("div");
        card.className = "yt-result-card";
        var isAdded = state.youtubeVideos.some(function(v) {
          return v.youtube_id === item.id;
        });
        card.innerHTML = '<img class="yt-result-thumb" src="' + escHtml(item.thumbnail) + '" alt="thumb"><div class="yt-result-info"><div class="yt-result-title">' + escHtml(item.title) + '</div><div class="yt-result-channel"><i class="fas fa-user-circle"></i> ' + escHtml(item.channel || "YouTube") + '</div></div><button class="btn btn-primary yt-result-add-btn' + (isAdded ? " added" : "") + '"' + (isAdded ? " disabled" : "") + ">" + (isAdded ? '<i class="fas fa-check"></i> \u8FFD\u52A0\u6E08\u307F' : '<i class="fas fa-plus"></i> \u8FFD\u52A0') + "</button>";
        var addBtn = card.querySelector(".yt-result-add-btn");
        addBtn.addEventListener("click", function(e) {
          return __async(this, null, function* () {
            e.stopPropagation();
            if (addBtn.disabled) return;
            addBtn.disabled = true;
            addBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            var res2 = yield api("POST", "/api/youtube", { title: item.title, youtube_id: item.id });
            if (res2 && res2.id) {
              addBtn.className = "btn btn-primary yt-result-add-btn added";
              addBtn.innerHTML = '<i class="fas fa-check"></i> \u8FFD\u52A0\u6E08\u307F';
              yield loadYoutubeVideos();
            } else {
              addBtn.disabled = false;
              addBtn.innerHTML = '<i class="fas fa-plus"></i> \u8FFD\u52A0';
              alert("\u8FFD\u52A0\u306B\u5931\u6557\u3057\u307E\u3057\u305F\u3002");
            }
          });
        });
        resultsEl.appendChild(card);
      });
    });
  }
  function deleteYoutubeVideo(id) {
    return __async(this, null, function* () {
      if (!confirm("\u3053\u306E\u52D5\u753B\u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F")) return;
      yield api("DELETE", "/api/youtube/" + id);
      yield loadYoutubeVideos();
    });
  }
  on($("yt-restart-btn"), "click", function() {
    if (state.currentYoutubeId) {
      savePlaybackPosition(state.currentYoutubeId, 0);
      playYoutubeVideo(state.currentYoutubeId, true, 0);
    }
  });
  on($("yt-refresh-btn"), "click", function() {
    return __async(this, null, function* () {
      var btn = $("yt-refresh-btn");
      var icon = btn ? btn.querySelector("i") : null;
      if (icon) icon.classList.add("fa-spin");
      yield loadYoutubeVideos();
      if (icon) setTimeout(function() {
        icon.classList.remove("fa-spin");
      }, 500);
    });
  });
  on($("yt-add-btn"), "click", function() {
    $("youtube-modal").classList.remove("hidden");
    var input = $("yt-search-input");
    if (input) {
      input.value = "";
      input.focus();
    }
    var resultsEl = $("yt-search-results");
    if (resultsEl) {
      resultsEl.innerHTML = "";
      resultsEl.classList.add("hidden");
    }
  });
  on($("yt-cancel"), "click", function() {
    $("youtube-modal").classList.add("hidden");
  });
  on($("yt-search-btn"), "click", performYoutubeSearch);
  on($("yt-search-input"), "keydown", function(e) {
    if (e.keyCode === 13 || e.key === "Enter") {
      performYoutubeSearch();
    }
  });
  function initTabs() {
    var tabs = document.querySelectorAll(".tab-btn");
    if (!tabs.length) return;
    function switchTab(targetId) {
      tabs.forEach(function(btn) {
        btn.classList.toggle("active", btn.dataset.tab === targetId);
      });
      document.querySelectorAll(".panel").forEach(function(panel) {
        panel.classList.toggle("tab-active", panel.id === targetId);
      });
      if (targetId === "sensor-section") {
        if (!state.sensorLoaded) {
          loadSensorData();
        } else if (sensorChart) {
          setTimeout(function() {
            sensorChart.resize();
          }, 50);
        }
      }
    }
    tabs.forEach(function(btn) {
      var lastTouchTime = 0;
      btn.addEventListener("touchend", function(e) {
        lastTouchTime = Date.now();
        switchTab(btn.dataset.tab);
      }, { passive: true });
      btn.addEventListener("click", function(e) {
        if (Date.now() - lastTouchTime < 400) return;
        switchTab(btn.dataset.tab);
      });
    });
    on($("agenda-add-event-btn"), "click", function() {
      if ($("cal-add-btn")) $("cal-add-btn").click();
    });
    on($("agenda-add-task-btn"), "click", function() {
      if ($("task-add-btn")) $("task-add-btn").click();
    });
    on($("agenda-add-memo-btn"), "click", function() {
      if ($("memo-add-btn")) $("memo-add-btn").click();
    });
    switchTab("agenda-section");
  }
  initTabs();
  var SENSOR_PROXY = "/api/sensor-proxy";
  var sensorChart = null;
  var sensorState = {
    hours: 24,
    activeDevice: null,
    activeMetrics: ["temperature", "humidity", "co2"],
    data: []
  };
  var METRIC_CONFIG = {
    temperature: { label: "\u6E29\u5EA6", color: "#ff7675", borderColor: "#ff4757", icon: "fa-thermometer-half", position: "left" },
    humidity: { label: "\u6E7F\u5EA6", color: "#74b9ff", borderColor: "#0984e3", icon: "fa-tint", position: "right" },
    co2: { label: "CO\u2082", color: "#55efc4", borderColor: "#00b894", icon: "fa-wind", position: "right" }
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
    var cards = $("sensor-cards");
    if (!cards) return;
    cards.innerHTML = "";
    var devices = Object.keys(latest);
    if (!devices.length) {
      cards.innerHTML = '<div class="empty-state">\u30C7\u30FC\u30BF\u306A\u3057</div>';
      return;
    }
    devices.forEach(function(name) {
      var d = latest[name];
      var ts = d.timestamp ? new Date(d.timestamp.endsWith("Z") ? d.timestamp : d.timestamp + "Z") : null;
      var age = ts ? Math.round((Date.now() - ts.getTime()) / 6e4) : null;
      var ageStr = age !== null ? age < 60 ? age + "m\u524D" : Math.round(age / 60) + "h\u524D" : "";
      var card = document.createElement("div");
      card.className = "sensor-card" + (sensorState.activeDevice === name ? " active" : "");
      card.dataset.device = name;
      var metrics = "";
      if (d.temperature !== null && d.temperature !== void 0)
        metrics += '<span class="sc-metric temp">' + d.temperature.toFixed(1) + "\xB0C</span>";
      if (d.humidity !== null && d.humidity !== void 0)
        metrics += '<span class="sc-metric hum">' + d.humidity + "%</span>";
      if (d.co2 !== null && d.co2 !== void 0)
        metrics += '<span class="sc-metric co2">' + d.co2 + "ppm</span>";
      if (d.battery !== null && d.battery !== void 0) {
        metrics += '<span class="sc-metric bat">' + d.battery + "%</span>";
      }
      card.innerHTML = '<div class="sc-inline"><span class="sc-name">' + escHtml(name) + '</span><div class="sc-metrics">' + metrics + "</div>" + (ageStr ? '<span class="sc-age">' + ageStr + "</span>" : "") + "</div>";
      card.addEventListener("click", function() {
        sensorState.activeDevice = name;
        document.querySelectorAll(".sensor-card").forEach(function(c) {
          c.classList.remove("active");
        });
        card.classList.add("active");
        renderSensorChartTabs();
        drawSensorChart();
      });
      cards.appendChild(card);
    });
  }
  function renderSensorChartTabs() {
    var tabEl = $("sensor-chart-tabs");
    if (!tabEl) return;
    tabEl.innerHTML = "";
    var device = sensorState.activeDevice;
    var rows = device ? sensorState.data.filter(function(r) {
      return r.device_name === device;
    }) : [];
    var availableMetrics = [];
    if (rows.some(function(r) {
      return r.temperature !== null && r.temperature !== void 0;
    })) availableMetrics.push("temperature");
    if (rows.some(function(r) {
      return r.humidity !== null && r.humidity !== void 0;
    })) availableMetrics.push("humidity");
    if (rows.some(function(r) {
      return r.co2 !== null && r.co2 !== void 0;
    })) availableMetrics.push("co2");
    if (!availableMetrics.length) availableMetrics = ["temperature"];
    if (!sensorState.activeMetrics || !sensorState.activeMetrics.length) {
      sensorState.activeMetrics = availableMetrics.slice();
    } else {
      sensorState.activeMetrics = sensorState.activeMetrics.filter(function(m) {
        return availableMetrics.includes(m);
      });
      if (!sensorState.activeMetrics.length) sensorState.activeMetrics = [availableMetrics[0]];
    }
    availableMetrics.forEach(function(m) {
      var btn = document.createElement("button");
      var isActive = sensorState.activeMetrics.includes(m);
      btn.className = "sensor-metric-btn" + (isActive ? " active" : "");
      btn.dataset.metric = m;
      var cfg = METRIC_CONFIG[m];
      btn.innerText = cfg.label;
      btn.addEventListener("click", function() {
        var idx = sensorState.activeMetrics.indexOf(m);
        if (idx >= 0) {
          if (sensorState.activeMetrics.length > 1) {
            sensorState.activeMetrics.splice(idx, 1);
            btn.classList.remove("active");
          }
        } else {
          sensorState.activeMetrics.push(m);
          btn.classList.add("active");
        }
        drawSensorChart();
      });
      tabEl.appendChild(btn);
    });
  }
  function drawSensorChart() {
    var canvas = $("sensor-chart");
    if (!canvas) return;
    var device = sensorState.activeDevice;
    var activeMetrics = sensorState.activeMetrics || ["temperature"];
    var rows = device ? sensorState.data.filter(function(r) {
      return r.device_name === device;
    }) : sensorState.data;
    rows = rows.slice().sort(function(a, b) {
      return a.timestamp < b.timestamp ? -1 : 1;
    });
    var buckets = {};
    rows.forEach(function(r) {
      var ts = r.timestamp.endsWith("Z") ? r.timestamp : r.timestamp + "Z";
      var d = new Date(ts);
      d.setSeconds(0, 0);
      d.setMinutes(Math.floor(d.getMinutes() / 5) * 5);
      var key = d.toISOString();
      if (!buckets[key]) {
        buckets[key] = { ts: d, temperature: [], humidity: [], co2: [] };
      }
      if (r.temperature !== null && r.temperature !== void 0) buckets[key].temperature.push(r.temperature);
      if (r.humidity !== null && r.humidity !== void 0) buckets[key].humidity.push(r.humidity);
      if (r.co2 !== null && r.co2 !== void 0) buckets[key].co2.push(r.co2);
    });
    var sorted = Object.values(buckets).sort(function(a, b) {
      return a.ts - b.ts;
    });
    var labels = sorted.map(function(b) {
      return b.ts.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" });
    });
    var xAxes = [{
      ticks: { fontColor: "#a7a9be", fontSize: 10, maxTicksLimit: 10, maxRotation: 0 },
      gridLines: { color: "#2a2a4a" }
    }];
    var yAxes = [];
    var firstYAxis = true;
    activeMetrics.forEach(function(m) {
      var cfg = METRIC_CONFIG[m];
      if (!cfg) return;
      var values = sorted.map(function(b) {
        var arr = b[m];
        if (!arr || !arr.length) return null;
        var sum = arr.reduce(function(a, c) {
          return a + c;
        }, 0);
        return Math.round(sum / arr.length * 10) / 10;
      });
      if (values.some(function(v) {
        return v !== null;
      })) {
        var yAxisId = "y_" + m;
        datasets.push({
          label: cfg.label,
          data: values,
          borderColor: cfg.borderColor,
          backgroundColor: cfg.color + "15",
          borderWidth: 2,
          pointRadius: values.length > 100 ? 0 : 2,
          pointHoverRadius: 4,
          lineTension: 0.3,
          fill: false,
          yAxisID: yAxisId
        });
        yAxes.push({
          id: yAxisId,
          type: "linear",
          display: true,
          position: cfg.position || "left",
          ticks: { fontColor: cfg.borderColor, fontSize: 10 },
          gridLines: {
            color: firstYAxis ? "#2a2a4a" : "transparent",
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
      canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    if (typeof Chart === "undefined") {
      return;
    }
    sensorChart = new Chart(canvas, {
      type: "line",
      data: {
        labels,
        datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 400 },
        tooltips: {
          mode: "index",
          intersect: false,
          backgroundColor: "#1a1a2e",
          titleFontColor: "#a7a9be",
          bodyFontColor: "#fffffe",
          borderColor: "#2a2a4a",
          borderWidth: 1
        },
        legend: {
          display: datasets.length > 1,
          labels: { fontColor: "#a7a9be", fontSize: 11, boxWidth: 12 }
        },
        scales: {
          xAxes,
          yAxes
        }
      }
    });
  }
  function loadSensorData() {
    return __async(this, null, function* () {
      var cards = $("sensor-cards");
      if (cards) cards.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i>\u8AAD\u307F\u8FBC\u307F\u4E2D...</div>';
      try {
        var path = SENSOR_PROXY + "?hours=" + sensorState.hours + "&limit=5000";
        var json = yield api("GET", path);
        if (!json) return;
        if (json.error && !json.data) {
          if (cards) cards.innerHTML = '<div class="empty-state"><i class="fas fa-key"></i>' + escHtml(json.error) + "</div>";
          return;
        }
        sensorState.data = json.data || [];
        state.sensorLoaded = true;
        renderSensorCards(sensorState.data);
        if (!sensorState.activeDevice && sensorState.data.length) {
          var devices = Object.keys(groupByDevice(sensorState.data));
          if (devices.length) {
            sensorState.activeDevice = devices[0];
            var firstCard = document.querySelector(".sensor-card");
            if (firstCard) firstCard.classList.add("active");
          }
        }
        renderSensorChartTabs();
        drawSensorChart();
      } catch (e) {
        console.warn("sensor load error:", e);
        if (cards) cards.innerHTML = '<div class="empty-state"><i class="fas fa-exclamation-triangle"></i>\u53D6\u5F97\u5931\u6557: ' + e.message + "</div>";
      }
    });
  }
  document.querySelectorAll(".sensor-range-btn").forEach(function(btn) {
    on(btn, "click", function() {
      sensorState.hours = parseInt(btn.dataset.hours, 10);
      sensorState.activeDevice = null;
      sensorState.data = [];
      state.sensorLoaded = false;
      document.querySelectorAll(".sensor-range-btn").forEach(function(b) {
        b.classList.remove("active");
      });
      btn.classList.add("active");
      loadSensorData();
    });
  });
  on($("sensor-refresh-btn"), "click", function() {
    sensorState.data = [];
    state.sensorLoaded = false;
    loadSensorData();
  });
  function requestWakeLock() {
    return __async(this, null, function* () {
      if ("wakeLock" in navigator) {
        try {
          yield navigator.wakeLock.request("screen");
        } catch (e) {
        }
      }
    });
  }
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(function() {
    });
  }
  function init() {
    return __async(this, null, function* () {
      var token = getSessionToken();
      if (!token) {
        window.location.href = "/login";
        return;
      }
      var authOk = false;
      for (var attempt = 0; attempt < 3; attempt++) {
        try {
          var res = yield fetch("/auth/me", { headers: { "Authorization": "Bearer " + token } });
          if (res.ok) {
            var me = yield res.json();
            if (me.authenticated) {
              authOk = true;
              var emailEl = $("user-email");
              if (emailEl && me.email) emailEl.textContent = me.email;
              break;
            } else {
              try {
                localStorage.removeItem("session_token");
              } catch (e) {
              }
              window.location.href = "/login";
              return;
            }
          }
        } catch (e) {
        }
        if (attempt < 2) yield new Promise(function(r) {
          setTimeout(r, 1e3 * (attempt + 1));
        });
      }
      var now = /* @__PURE__ */ new Date();
      state.calYear = now.getFullYear();
      state.calMonth = now.getMonth();
      yield loadSettings();
      applyWidgetVisibility();
      yield Promise.all([loadMemos(), loadTasks(), loadEvents(), loadYoutubeVideos(), loadSensorData()]);
      yield loadWeather();
      setInterval(loadWeather, 30 * 60 * 1e3);
      setInterval(function() {
        return __async(this, null, function* () {
          yield Promise.all([loadMemos(), loadTasks(), loadEvents(), loadYoutubeVideos(), loadSensorData()]);
          $("last-update").textContent = "\u6700\u7D42\u66F4\u65B0: " + (/* @__PURE__ */ new Date()).toLocaleTimeString("ja-JP");
        });
      }, 5 * 60 * 1e3);
      $("last-update").textContent = "\u6700\u7D42\u66F4\u65B0: " + now.toLocaleTimeString("ja-JP");
      requestWakeLock();
      document.addEventListener("visibilitychange", function() {
        if (document.visibilityState === "visible") requestWakeLock();
      });
      highlightColor("color-btn", "yellow");
      highlightPriority("normal");
    });
  }
  init();
});
