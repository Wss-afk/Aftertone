CREATE TABLE playlists (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(80) NOT NULL,
    CONSTRAINT uk_playlists_name UNIQUE (name)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE playlist_tracks (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    playlist_id BIGINT NOT NULL,
    track_id BIGINT NOT NULL,
    CONSTRAINT uk_playlist_track UNIQUE (playlist_id, track_id),
    INDEX ix_playlist_order (playlist_id, id),
    CONSTRAINT fk_playlist_tracks_playlist FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    CONSTRAINT fk_playlist_tracks_track FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
);
