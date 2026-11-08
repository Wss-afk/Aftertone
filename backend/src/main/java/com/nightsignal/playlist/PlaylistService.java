package com.nightsignal.playlist;

import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import com.nightsignal.track.ApiException;
import com.nightsignal.track.TrackRepository;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PlaylistService {
    private final JdbcTemplate jdbc;
    private final TrackRepository tracks;

    public PlaylistService(JdbcTemplate jdbc, TrackRepository tracks) {
        this.jdbc = jdbc;
        this.tracks = tracks;
    }

    public record Entry(long trackId, long position) {}
    public record Playlist(long id, String name, List<Entry> entries) {}

    public List<Playlist> list() { return read(null); }

    @Transactional
    public Playlist create(String name) {
        String normalized = normalize(name);
        var key = new GeneratedKeyHolder();
        try {
            jdbc.update(connection -> {
                var statement = connection.prepareStatement("INSERT INTO playlists (name) VALUES (?)", Statement.RETURN_GENERATED_KEYS);
                statement.setString(1, normalized);
                return statement;
            }, key);
        } catch (DuplicateKeyException error) { throw duplicateName(); }
        return new Playlist(key.getKey().longValue(), normalized, List.of());
    }

    @Transactional
    public Playlist rename(long id, String name) {
        String normalized = normalize(name);
        lockPlaylist(id);
        try { jdbc.update("UPDATE playlists SET name = ? WHERE id = ?", normalized, id); }
        catch (DuplicateKeyException error) { throw duplicateName(); }
        return read(id).getFirst();
    }

    public void delete(long id) {
        jdbc.update("DELETE FROM playlists WHERE id = ?", id);
    }

    @Transactional
    public Playlist addTrack(long id, long trackId) {
        lockPlaylist(id);
        tracks.findLockedById(trackId).filter(track -> !track.isDeleting()).orElseThrow(() ->
                new ApiException(HttpStatus.NOT_FOUND, "TRACK_NOT_FOUND", "没有找到这首歌。"));
        jdbc.update("""
                INSERT INTO playlist_tracks (playlist_id, track_id) VALUES (?, ?)
                ON DUPLICATE KEY UPDATE track_id = track_id
                """, id, trackId);
        return read(id).getFirst();
    }

    @Transactional
    public Playlist removeTrack(long id, long trackId) {
        lockPlaylist(id);
        jdbc.update("DELETE FROM playlist_tracks WHERE playlist_id = ? AND track_id = ?", id, trackId);
        return read(id).getFirst();
    }

    private void lockPlaylist(long id) {
        if (jdbc.queryForList("SELECT id FROM playlists WHERE id = ? FOR UPDATE", Long.class, id).isEmpty())
            throw new ApiException(HttpStatus.NOT_FOUND, "PLAYLIST_NOT_FOUND", "没有找到这个歌单，请刷新后重试。");
    }

    private List<Playlist> read(Long id) {
        String sql = """
                SELECT p.id, p.name, t.id AS track_id, pt.id AS position
                FROM playlists p
                LEFT JOIN playlist_tracks pt ON pt.playlist_id = p.id
                LEFT JOIN tracks t ON t.id = pt.track_id AND t.deleting = 0
                """;
        if (id != null) sql += "WHERE p.id = ?\n";
        return jdbc.query(sql + "ORDER BY p.id, pt.id", rs -> {
            var result = new LinkedHashMap<Long, Playlist>();
            while (rs.next()) {
                long playlistId = rs.getLong("id");
                Playlist playlist = result.get(playlistId);
                if (playlist == null) {
                    playlist = new Playlist(playlistId, rs.getString("name"), new ArrayList<>());
                    result.put(playlistId, playlist);
                }
                long trackId = rs.getLong("track_id");
                if (!rs.wasNull()) playlist.entries().add(new Entry(trackId, rs.getLong("position")));
            }
            return List.copyOf(result.values());
        }, id == null ? new Object[0] : new Object[] { id });
    }

    private static String normalize(String name) {
        String normalized = name == null ? "" : name.replaceAll("(?U)^\\s+|\\s+$", "");
        if (normalized.isEmpty() || normalized.codePointCount(0, normalized.length()) > 80
                || normalized.codePoints().anyMatch(Character::isISOControl))
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PLAYLIST_NAME", "请输入 1–80 个字符的歌单名称，名称不能包含控制字符。");
        return normalized;
    }

    private static ApiException duplicateName() {
        return new ApiException(HttpStatus.CONFLICT, "PLAYLIST_NAME_EXISTS", "这个歌单名称已存在，请换一个名称。");
    }
}
