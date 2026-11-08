CREATE TABLE tracks (
    id BIGINT NOT NULL AUTO_INCREMENT,
    title VARCHAR(255) NOT NULL,
    storage_key VARCHAR(40) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(64) NOT NULL,
    size_bytes BIGINT NOT NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_tracks_storage_key UNIQUE (storage_key),
    INDEX ix_tracks_recent (created_at DESC, id DESC)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
