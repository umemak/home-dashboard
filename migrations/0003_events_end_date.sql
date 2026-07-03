-- events テーブルに end_date カラムを追加（期間予定対応）
ALTER TABLE events ADD COLUMN end_date TEXT;
