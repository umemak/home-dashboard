-- メモテーブル
CREATE TABLE IF NOT EXISTS memos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  color TEXT DEFAULT 'yellow',
  pinned INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- タスク/TODOテーブル
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  done INTEGER DEFAULT 0,
  due_date TEXT,
  priority TEXT DEFAULT 'normal',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- カレンダーイベントテーブル
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT,
  color TEXT DEFAULT 'blue',
  repeat_type TEXT DEFAULT 'none',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 設定テーブル
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- デフォルト設定
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('city', 'Tokyo'),
  ('family_name', 'おうち'),
  ('theme', 'light'),
  ('weather_api_key', '');
