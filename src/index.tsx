import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'

type Bindings = {
  DB: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('/static/*', serveStatic({ root: './public' }))
app.use('/icons/*', serveStatic({ root: './public' }))
app.use('/api/*', cors())

// ── API: メモ ──────────────────────────────────────────────

app.get('/api/memos', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM memos ORDER BY pinned DESC, updated_at DESC'
  ).all()
  return c.json(results)
})

app.post('/api/memos', async (c) => {
  const { content, color = 'yellow' } = await c.req.json()
  if (!content?.trim()) return c.json({ error: '内容が必要です' }, 400)
  const r = await c.env.DB.prepare(
    'INSERT INTO memos (content, color) VALUES (?, ?) RETURNING *'
  ).bind(content.trim(), color).first()
  return c.json(r, 201)
})

app.put('/api/memos/:id', async (c) => {
  const id = c.req.param('id')
  const { content, color, pinned } = await c.req.json()
  await c.env.DB.prepare(
    `UPDATE memos SET
       content = COALESCE(?, content),
       color   = COALESCE(?, color),
       pinned  = COALESCE(?, pinned),
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).bind(
    content ?? null,
    color ?? null,
    pinned !== undefined ? (pinned ? 1 : 0) : null,
    id
  ).run()
  return c.json({ ok: true })
})

app.delete('/api/memos/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM memos WHERE id = ?')
    .bind(c.req.param('id')).run()
  return c.json({ ok: true })
})

// ── API: タスク ────────────────────────────────────────────

app.get('/api/tasks', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM tasks ORDER BY done ASC, priority DESC, created_at ASC'
  ).all()
  return c.json(results)
})

app.post('/api/tasks', async (c) => {
  const { title, due_date, priority = 'normal' } = await c.req.json()
  if (!title?.trim()) return c.json({ error: 'タイトルが必要です' }, 400)
  const r = await c.env.DB.prepare(
    'INSERT INTO tasks (title, due_date, priority) VALUES (?, ?, ?) RETURNING *'
  ).bind(title.trim(), due_date ?? null, priority).first()
  return c.json(r, 201)
})

app.put('/api/tasks/:id', async (c) => {
  const id = c.req.param('id')
  const { title, done, due_date, priority } = await c.req.json()
  await c.env.DB.prepare(
    `UPDATE tasks SET
       title     = COALESCE(?, title),
       done      = COALESCE(?, done),
       due_date  = COALESCE(?, due_date),
       priority  = COALESCE(?, priority),
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).bind(
    title ?? null,
    done !== undefined ? (done ? 1 : 0) : null,
    due_date ?? null,
    priority ?? null,
    id
  ).run()
  return c.json({ ok: true })
})

app.delete('/api/tasks/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM tasks WHERE id = ?')
    .bind(c.req.param('id')).run()
  return c.json({ ok: true })
})

// ── API: カレンダーイベント ──────────────────────────────────

app.get('/api/events', async (c) => {
  const month = c.req.query('month') // YYYY-MM
  let query = 'SELECT * FROM events'
  const params: string[] = []
  if (month) {
    query += " WHERE date LIKE ? OR repeat_type != 'none'"
    params.push(`${month}%`)
  }
  query += ' ORDER BY date ASC, time ASC'
  const { results } = await c.env.DB.prepare(query).bind(...params).all()
  return c.json(results)
})

app.post('/api/events', async (c) => {
  const { title, date, time, color = 'blue', repeat_type = 'none' } = await c.req.json()
  if (!title?.trim() || !date) return c.json({ error: '必須項目が不足しています' }, 400)
  const r = await c.env.DB.prepare(
    'INSERT INTO events (title, date, time, color, repeat_type) VALUES (?, ?, ?, ?, ?) RETURNING *'
  ).bind(title.trim(), date, time ?? null, color, repeat_type).first()
  return c.json(r, 201)
})

app.delete('/api/events/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM events WHERE id = ?')
    .bind(c.req.param('id')).run()
  return c.json({ ok: true })
})

// ── API: 設定 ──────────────────────────────────────────────

app.get('/api/settings', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM settings').all()
  const obj: Record<string, string> = {}
  for (const r of results as { key: string; value: string }[]) {
    obj[r.key] = r.value
  }
  return c.json(obj)
})

app.put('/api/settings', async (c) => {
  const body = await c.req.json() as Record<string, string>
  const stmt = c.env.DB.prepare(
    'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP'
  )
  for (const [k, v] of Object.entries(body)) {
    await stmt.bind(k, String(v)).run()
  }
  return c.json({ ok: true })
})

// ── PWAファイル ───────────────────────────────────────────

app.get('/manifest.json', (c) => {
  return c.json({
    name: 'おうちダッシュボード',
    short_name: 'おうち',
    description: '家庭内情報端末',
    start_url: '/',
    display: 'standalone',
    orientation: 'landscape',
    background_color: '#1a1a2e',
    theme_color: '#16213e',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/icon-apple.png', sizes: '180x180', type: 'image/png', purpose: 'apple-touch-icon' }
    ]
  }, 200, { 'Content-Type': 'application/manifest+json' })
})

app.get('/sw.js', (c) => {
  const sw = `
const CACHE = 'ouchi-v1';
const STATIC = ['/', '/static/style.css', '/static/app.js'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(e.request));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
`
  return new Response(sw, {
    headers: { 'Content-Type': 'application/javascript; charset=utf-8' }
  })
})

// ── メインHTML ────────────────────────────────────────────

app.get('/', (c) => {
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="おうち">
<meta name="mobile-web-app-capable" content="yes">
<meta name="theme-color" content="#16213e">
<title>おうちダッシュボード</title>
<link rel="manifest" href="/manifest.json">
<link rel="apple-touch-icon" href="/icons/icon-apple.png">
<link rel="stylesheet" href="/static/style.css">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css">
</head>
<body>
<div id="app">
  <!-- ヘッダー: 時計・日付 -->
  <header id="main-header">
    <div id="clock-section">
      <div id="clock">00:00</div>
      <div id="date-display">読み込み中...</div>
    </div>
    <div id="header-center">
      <span id="family-name">おうちダッシュボード</span>
    </div>
    <div id="weather-section">
      <div id="weather-icon"><i class="fas fa-cloud fa-2x"></i></div>
      <div id="weather-info">
        <span id="weather-temp">--°C</span>
        <span id="weather-desc">--</span>
      </div>
    </div>
  </header>

  <!-- メインコンテンツ -->
  <main id="main-content">
    <!-- 左カラム: カレンダー -->
    <section id="calendar-section" class="panel">
      <div class="panel-header">
        <button id="cal-prev" class="icon-btn"><i class="fas fa-chevron-left"></i></button>
        <h2 id="cal-title">2025年1月</h2>
        <button id="cal-next" class="icon-btn"><i class="fas fa-chevron-right"></i></button>
        <button id="cal-add-btn" class="icon-btn add-btn" title="予定追加"><i class="fas fa-plus"></i></button>
      </div>
      <div id="calendar-grid"></div>
      <div id="event-list"></div>
    </section>

    <!-- 中央カラム: メモ -->
    <section id="memo-section" class="panel">
      <div class="panel-header">
        <h2><i class="fas fa-sticky-note"></i> メモ</h2>
        <button id="memo-add-btn" class="icon-btn add-btn"><i class="fas fa-plus"></i></button>
      </div>
      <div id="memo-list"></div>
    </section>

    <!-- 右カラム: タスク -->
    <section id="task-section" class="panel">
      <div class="panel-header">
        <h2><i class="fas fa-tasks"></i> タスク</h2>
        <button id="task-add-btn" class="icon-btn add-btn"><i class="fas fa-plus"></i></button>
      </div>
      <div id="task-list"></div>
    </section>
  </main>

  <!-- フッター -->
  <footer id="main-footer">
    <button id="settings-btn" class="footer-btn"><i class="fas fa-cog"></i> 設定</button>
    <div id="footer-status">
      <span id="last-update">--</span>
    </div>
    <button id="refresh-btn" class="footer-btn"><i class="fas fa-sync-alt"></i> 更新</button>
  </footer>
</div>

<!-- モーダル: メモ追加/編集 -->
<div id="memo-modal" class="modal hidden">
  <div class="modal-box">
    <h3><i class="fas fa-sticky-note"></i> メモ</h3>
    <textarea id="memo-content" placeholder="メモを入力..." rows="5"></textarea>
    <div class="color-picker">
      <span>色:</span>
      <button class="color-btn" data-color="yellow" style="background:#ffd93d">黄</button>
      <button class="color-btn" data-color="green"  style="background:#6bcb77">緑</button>
      <button class="color-btn" data-color="blue"   style="background:#4d96ff">青</button>
      <button class="color-btn" data-color="pink"   style="background:#ff6b9d">ピンク</button>
      <button class="color-btn" data-color="orange" style="background:#ff9f43">橙</button>
    </div>
    <div class="modal-actions">
      <button id="memo-cancel" class="btn btn-secondary">キャンセル</button>
      <button id="memo-save"   class="btn btn-primary">保存</button>
    </div>
  </div>
</div>

<!-- モーダル: タスク追加 -->
<div id="task-modal" class="modal hidden">
  <div class="modal-box">
    <h3><i class="fas fa-tasks"></i> タスク追加</h3>
    <input id="task-title" type="text" placeholder="タスク名..." class="modal-input">
    <input id="task-due"   type="date" class="modal-input">
    <div class="priority-picker">
      <span>優先度:</span>
      <button class="prio-btn active" data-priority="normal">普通</button>
      <button class="prio-btn" data-priority="high">高</button>
      <button class="prio-btn" data-priority="low">低</button>
    </div>
    <div class="modal-actions">
      <button id="task-cancel" class="btn btn-secondary">キャンセル</button>
      <button id="task-save"   class="btn btn-primary">保存</button>
    </div>
  </div>
</div>

<!-- モーダル: イベント追加 -->
<div id="event-modal" class="modal hidden">
  <div class="modal-box">
    <h3><i class="fas fa-calendar-plus"></i> 予定追加</h3>
    <input id="event-title" type="text"  placeholder="予定タイトル..." class="modal-input">
    <input id="event-date"  type="date"  class="modal-input">
    <input id="event-time"  type="time"  class="modal-input">
    <div class="color-picker">
      <span>色:</span>
      <button class="color-btn" data-color="blue"   style="background:#4d96ff">青</button>
      <button class="color-btn" data-color="green"  style="background:#6bcb77">緑</button>
      <button class="color-btn" data-color="pink"   style="background:#ff6b9d">ピンク</button>
      <button class="color-btn" data-color="orange" style="background:#ff9f43">橙</button>
      <button class="color-btn" data-color="purple" style="background:#a29bfe">紫</button>
    </div>
    <div class="modal-actions">
      <button id="event-cancel" class="btn btn-secondary">キャンセル</button>
      <button id="event-save"   class="btn btn-primary">保存</button>
    </div>
  </div>
</div>

<!-- モーダル: 設定 -->
<div id="settings-modal" class="modal hidden">
  <div class="modal-box settings-box">
    <h3><i class="fas fa-cog"></i> 設定</h3>
    <label>家族名
      <input id="set-family" type="text" class="modal-input" placeholder="おうち">
    </label>
    <label>天気 OpenWeatherMap APIキー
      <input id="set-weather-key" type="text" class="modal-input" placeholder="APIキーを入力...">
    </label>
    <label>都市名 (英語)
      <input id="set-city" type="text" class="modal-input" placeholder="Tokyo">
    </label>
    <p class="settings-note">
      <i class="fas fa-info-circle"></i>
      天気を表示するには <a href="https://openweathermap.org/api" target="_blank">openweathermap.org</a> の無料APIキーが必要です。
    </p>
    <div class="modal-actions">
      <button id="settings-cancel" class="btn btn-secondary">閉じる</button>
      <button id="settings-save"   class="btn btn-primary">保存</button>
    </div>
  </div>
</div>

<script src="/static/app.js"></script>
</body>
</html>`
  return c.html(html)
})

export default app
