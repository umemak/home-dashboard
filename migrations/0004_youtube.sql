-- youtube_videos テーブル
CREATE TABLE IF NOT EXISTS youtube_videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  youtube_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- デフォルト動画の登録
INSERT OR IGNORE INTO youtube_videos (id, title, youtube_id) VALUES
  (1, 'Lofi Hip Hop Radio', 'jfKfPfyJRdk'),
  (2, 'Relaxing Jazz Music', 'Dx5qFacd33E');
