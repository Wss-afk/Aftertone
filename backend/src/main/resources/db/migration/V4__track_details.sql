ALTER TABLE tracks
    ADD COLUMN album VARCHAR(255) NOT NULL DEFAULT '',
    ADD COLUMN duration_seconds DOUBLE NULL,
    ADD COLUMN cover_version VARCHAR(36) NULL,
    ADD COLUMN details_scanned BIT(1) NOT NULL DEFAULT 0;

CREATE TABLE track_artwork (
    track_id BIGINT NOT NULL PRIMARY KEY,
    image_data LONGBLOB NOT NULL,
    CONSTRAINT fk_artwork_track FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
);
