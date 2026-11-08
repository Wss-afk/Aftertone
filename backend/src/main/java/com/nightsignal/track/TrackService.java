package com.nightsignal.track;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.*;
import org.springframework.web.multipart.MultipartFile;

@Service
public class TrackService {
    private static final Logger log = LoggerFactory.getLogger(TrackService.class);
    private final TrackRepository repository;
    private final TrackStorage storage;
    private final TrackArtworkRepository artwork;
    private final TransactionTemplate transaction;
    private final Object uploadLock = new Object();

    public TrackService(TrackRepository repository, TrackStorage storage, PlatformTransactionManager manager, TrackArtworkRepository artwork) {
        this.repository = repository;
        this.storage = storage;
        this.artwork = artwork;
        transaction = new TransactionTemplate(manager);
    }

    public List<TrackResponse> list() {
        return repository.findAllByDeletingFalseOrderByCreatedAtDescIdDesc().stream().map(TrackResponse::from).toList();
    }

    public Track find(long id) {
        return repository.findById(id).filter(track -> !track.isDeleting()).orElseThrow(() ->
                new ApiException(HttpStatus.NOT_FOUND, "TRACK_NOT_FOUND", "没有找到这首歌。"));
    }

    public TrackResponse rename(long id, String title) {
        return rename(id, title, null);
    }

    public FavoriteTrackResponse setFavorite(long id, Boolean favorite) {
        if (favorite == null) throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_FAVORITE", "请指定是否收藏这首歌。");
        try {
            return transaction.execute(status -> {
                Track track = repository.findLockedById(id).filter(item -> !item.isDeleting()).orElseThrow(() ->
                        new ApiException(HttpStatus.NOT_FOUND, "TRACK_NOT_FOUND", "没有找到这首歌。"));
                track.setFavorite(favorite);
                repository.saveAndFlush(track);
                return new FavoriteTrackResponse(id, track.isFavorite());
            });
        } catch (ApiException e) { throw e; }
        catch (RuntimeException e) {
            log.error("Could not confirm favorite state for track {}", id, e);
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "FAVORITE_SAVE_FAILED", "收藏状态保存失败，请刷新曲库确认后重试。");
        }
    }

    public TrackResponse rename(long id, String title, String artist) {
        return rename(id, title, artist, null);
    }

    public TrackResponse rename(long id, String title, String artist, String album) {
        return updateInformation(id, title, artist, album, null, false);
    }

    public TrackResponse updateInformation(long id, String title, String artist, String album, MultipartFile cover, boolean removeCover) {
        String normalized = title == null ? "" : title.replaceAll("(?U)^\\s+|\\s+$", "");
        if (normalized.isEmpty()) throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_TITLE", "请输入歌名。");
        if (normalized.codePointCount(0, normalized.length()) > 255)
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_TITLE", "歌名最多 255 个字符。");
        if (normalized.codePoints().anyMatch(Character::isISOControl))
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_TITLE", "歌名不能包含换行或控制字符。");
        String normalizedArtist = artist == null ? null : artist.replaceAll("(?U)^\\s+|\\s+$", "");
        if (normalizedArtist != null && (normalizedArtist.codePointCount(0, normalizedArtist.length()) > 255
                || normalizedArtist.codePoints().anyMatch(Character::isISOControl)))
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_ARTIST", "歌手最多 255 个字符，不能包含换行或控制字符。");
        String normalizedAlbum = album == null ? null : album.replaceAll("(?U)^\\s+|\\s+$", "");
        if (normalizedAlbum != null && (normalizedAlbum.codePointCount(0, normalizedAlbum.length()) > 255
                || normalizedAlbum.codePoints().anyMatch(Character::isISOControl)))
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_ALBUM", "专辑最多 255 个字符，不能包含换行或控制字符。");
        if (cover != null && removeCover) throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_COVER_ACTION", "请选择更换封面或移除封面中的一项。");
        byte[] image = cover == null ? null : ArtworkImages.read(cover);
        try {
            return transaction.execute(status -> {
                Track track = repository.findLockedById(id).filter(item -> !item.isDeleting()).orElseThrow(() ->
                        new ApiException(HttpStatus.NOT_FOUND, "TRACK_NOT_FOUND", "没有找到这首歌。"));
                ensureDetails(track);
                track.rename(normalized);
                if (normalizedArtist != null) track.setArtist(normalizedArtist);
                if (normalizedAlbum != null) track.setAlbum(normalizedAlbum);
                if (image != null) saveArtwork(track, image);
                else if (removeCover) {
                    artwork.deleteById(id);
                    track.setCoverVersion(null);
                }
                return TrackResponse.from(repository.saveAndFlush(track));
            });
        } catch (ApiException e) { throw e; }
        catch (RuntimeException e) {
            log.error("Could not confirm rename for track {}", id, e);
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "RENAME_FAILED", "歌曲信息保存失败，请刷新曲库确认后重试。");
        }
    }

    public byte[] cover(long id, String version) {
        Track track = find(id);
        if (track.getCoverVersion() == null || (version != null && !version.equals(track.getCoverVersion())))
            throw new ApiException(HttpStatus.NOT_FOUND, "COVER_NOT_FOUND", "没有找到这首歌的封面。");
        return artwork.findById(id).orElseThrow(() ->
                new ApiException(HttpStatus.NOT_FOUND, "COVER_NOT_FOUND", "没有找到这首歌的封面。")).getImageData();
    }

    private void saveArtwork(Track track, byte[] image) {
        artwork.save(new TrackArtwork(track.getId(), image));
        track.setCoverVersion(UUID.randomUUID().toString());
    }

    private void ensureDetails(Track track) {
        if (track.isDetailsScanned()) return;
        var details = storage.inspect(track.getStorageKey());
        // Legacy titles and artists may already have been edited by the user.
        if (track.getAlbum().isEmpty()) track.setAlbum(details.tags().album());
        if (track.getDurationSeconds() == null) track.setDurationSeconds(details.durationSeconds());
        if (track.getCoverVersion() == null && details.artwork() != null) saveArtwork(track, details.artwork());
        track.setDetailsScanned(true);
    }

    @EventListener(ApplicationReadyEvent.class)
    public void backfillDetails() {
        for (Track candidate : repository.findAllByDeletingFalseAndDetailsScannedFalse()) {
            try {
                transaction.executeWithoutResult(status -> repository.findLockedById(candidate.getId())
                        .filter(track -> !track.isDeleting()).ifPresent(track -> {
                            ensureDetails(track);
                            repository.saveAndFlush(track);
                        }));
            } catch (RuntimeException e) { log.warn("Could not supplement details for track {}", candidate.getId(), e); }
        }
    }

    public synchronized void delete(long id) {
        String key;
        try {
            // Commit an intent first. Do not touch the file if this commit fails or is uncertain.
            key = transaction.execute(status -> {
                Track track = repository.findLockedById(id).orElseThrow(() ->
                        new ApiException(HttpStatus.NOT_FOUND, "TRACK_NOT_FOUND", "没有找到这首歌。"));
                track.setDeleting(true);
                repository.saveAndFlush(track);
                return track.getStorageKey();
            });
        } catch (ApiException e) { throw e; }
        catch (RuntimeException e) {
            log.error("Could not confirm deletion intent for track {}", id, e);
            throw deletionFailed();
        }
        try {
            storage.deleteTrackFile(key);
        } catch (RuntimeException e) {
            try { restoreDeletion(id); }
            catch (RuntimeException restoreError) { log.error("Deletion intent retained for recovery, track={}", id, restoreError); }
            throw e;
        }
        try { finishDeletion(id); }
        catch (RuntimeException e) {
            // Audio is gone and the durable intent hides this row. Retry/startup can finish safely.
            log.warn("Audio removed; deletion record awaits finalization, track={}", id, e);
        }
    }

    private void finishDeletion(long id) {
        transaction.executeWithoutResult(status -> {
            repository.findLockedById(id).filter(Track::isDeleting).ifPresent(repository::delete);
            repository.flush();
        });
    }

    private void restoreDeletion(long id) {
        transaction.executeWithoutResult(status -> repository.findLockedById(id).ifPresent(track -> {
            track.setDeleting(false);
            repository.saveAndFlush(track);
        }));
    }

    @EventListener(ApplicationReadyEvent.class)
    public synchronized void recoverInterruptedDeletions() {
        // Recovery only changes database rows. It never deletes any audio files.
        for (Track track : repository.findAllByDeletingTrue()) {
            try {
                if (storage.existsForDeletionRecovery(track.getStorageKey())) restoreDeletion(track.getId());
                else finishDeletion(track.getId());
            } catch (RuntimeException e) { log.error("Could not recover deletion for track {}", track.getId(), e); }
        }
    }

    private ApiException deletionFailed() {
        return new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "DELETE_FAILED", "删除未完成，请刷新曲库后重试。");
    }

    public TrackResponse upload(MultipartFile file, boolean skipDuplicates) {
        if (file.isEmpty()) throw new ApiException(HttpStatus.BAD_REQUEST, "EMPTY_FILE", "不能上传空文件。");
        String digest;
        try { digest = sha256(file.getInputStream()); }
        catch (IOException e) {
            log.warn("Could not read incoming audio", e);
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "UPLOAD_FAILED", "无法读取上传文件，请重试。");
        }
        synchronized (uploadLock) {
            if (skipDuplicates) requireNewAudio(digest, file.getSize());
            return storeUpload(file, digest);
        }
    }

    private void requireNewAudio(String digest, long size) {
        for (Track candidate : repository.findPossibleDuplicates(digest, size)) {
            boolean matches;
            try {
                var path = storage.read(candidate.getStorageKey());
                // Older records can only be compared against the audio still on disk.
                matches = candidate.getSourceSha256() != null || digest.equals(sha256(Files.newInputStream(path)));
            } catch (IOException | ApiException unavailable) {
                continue;
            }
            if (matches) throw new ApiException(HttpStatus.CONFLICT, "DUPLICATE_TRACK",
                    "相同内容已在曲库中，已跳过「" + candidate.getTitle() + "」。");
        }
    }

    private static String sha256(InputStream source) throws IOException {
        try (source) {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            var input = new DigestInputStream(source, digest);
            input.transferTo(OutputStream.nullOutputStream());
            return HexFormat.of().formatHex(digest.digest());
        } catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }

    private TrackResponse storeUpload(MultipartFile file, String digest) {
        String filename = cleanFilename(file.getOriginalFilename());
        String title = filename.replaceFirst("(?i)\\.(mp3|m4a|aac|wav|flac|ogg|opus|wma|aif|aiff|webm|weba|mp4)$", "").strip();
        if (title.isBlank()) title = "未命名歌曲";
        TrackStorage.StoredAudio stored = storage.store(file);
        if (!stored.tags().title().isEmpty()) title = stored.tags().title();
        String key = stored.key();
        Track track = new Track(title, key, filename, stored.sizeBytes());
        track.setSourceSha256(digest);
        track.setArtist(stored.tags().artist());
        track.setAlbum(stored.tags().album());
        track.setDurationSeconds(stored.durationSeconds());
        AtomicBoolean transactionStarted = new AtomicBoolean(false);
        try {
            Track saved = transaction.execute(status -> {
                transactionStarted.set(true);
                TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                    @Override public void afterCompletion(int completion) {
                        if (completion == STATUS_ROLLED_BACK) storage.removeAfterRollback(key);
                        else if (completion == STATUS_UNKNOWN) log.error("Unknown database commit result; retain storageKey={}", key);
                    }
                });
                Track inserted = repository.saveAndFlush(track);
                if (stored.artwork() != null) {
                    saveArtwork(inserted, stored.artwork());
                    repository.saveAndFlush(inserted);
                }
                return inserted;
            });
            return TrackResponse.from(saved);
        } catch (RuntimeException e) {
            // If begin failed, no insert was possible. Otherwise afterCompletion decides cleanup.
            if (!transactionStarted.get()) storage.removeAfterRollback(key);
            log.error("Upload transaction failed; storageKey={}", key, e);
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "UPLOAD_FAILED", "歌曲记录保存失败，请重试。");
        }
    }

    static String cleanFilename(String input) {
        String name = input == null ? "未命名歌曲.mp3" : input.replace('\\', '/');
        name = name.substring(name.lastIndexOf('/') + 1).replaceAll("\\p{Cntrl}", "").strip();
        if (name.isBlank()) name = "未命名歌曲.mp3";
        int points = name.codePointCount(0, name.length());
        if (points > 240) name = name.substring(0, name.offsetByCodePoints(0, 236)) + ".mp3";
        return name;
    }
}
