ALTER TABLE tracks ADD COLUMN deleting BIT(1) NOT NULL DEFAULT b'0';
CREATE INDEX ix_tracks_active_recent ON tracks (deleting, created_at DESC, id DESC);
