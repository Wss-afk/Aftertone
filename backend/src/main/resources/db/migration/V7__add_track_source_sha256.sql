ALTER TABLE tracks
    ADD COLUMN source_sha256 VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL,
    ADD INDEX ix_tracks_source_sha256 (source_sha256, size_bytes);
