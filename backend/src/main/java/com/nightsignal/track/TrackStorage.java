package com.nightsignal.track;

import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.nio.channels.*;
import java.nio.file.*;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

@Component
public class TrackStorage {
    private static final Logger log = LoggerFactory.getLogger(TrackStorage.class);
    private static final Pattern KEY = Pattern.compile("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.mp3");
    private final Path root;
    private final AudioProcessor processor;
    private final StorageCapacity capacity;
    private final FileChannel lockChannel;
    private final FileLock directoryLock;

    public TrackStorage(@Value("${app.music-dir}") String directory, AudioProcessor processor, StorageCapacity capacity) throws IOException {
        Path configured = Path.of(directory).toAbsolutePath().normalize();
        Files.createDirectories(configured);
        root = configured.toRealPath();
        this.processor = processor;
        this.capacity = capacity;
        lockChannel = FileChannel.open(root.resolve(".night-signal.lock"), StandardOpenOption.CREATE, StandardOpenOption.WRITE);
        directoryLock = lockChannel.tryLock();
        if (directoryLock == null) {
            lockChannel.close();
            throw new IOException("Music directory is already in use by another instance");
        }
        log.info("Music directory: {}", root);
    }

    public synchronized StoredAudio store(MultipartFile file) {
        Path temporary = null;
        Path converted = null;
        try {
            capacity.requireUploadSpace();
            temporary = Files.createTempFile(root, ".upload-", ".tmp");
            try (var input = file.getInputStream(); var output = Files.newOutputStream(temporary)) {
                byte[] buffer = new byte[64 * 1024];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    capacity.requireWriteSpace(count);
                    output.write(buffer, 0, count);
                }
            }
            converted = Files.createTempFile(root, ".converted-", ".mp3");
            Path prepared = processor.prepare(temporary, converted, capacity::requireWorkingSpace);
            AudioProcessor.Tags tags = processor.readTags(temporary, capacity::requireWorkingSpace);
            Double duration = prepared.equals(temporary) ? tags.durationSeconds() :
                    processor.readTags(prepared, capacity::requireWorkingSpace).durationSeconds();
            byte[] artwork = processor.readArtwork(temporary, tags, capacity::requireWorkingSpace);
            long sizeBytes = Files.size(prepared);
            capacity.requireWorkingSpace();
            String key = UUID.randomUUID() + ".mp3";
            Path target = pathForKey(key);
            if (Files.exists(target, LinkOption.NOFOLLOW_LINKS)) throw new IOException("Storage key collision");
            Files.move(prepared, target, StandardCopyOption.ATOMIC_MOVE);
            return new StoredAudio(key, sizeBytes, tags, duration, artwork);
        } catch (IOException e) {
            capacity.requireWorkingSpace();
            log.error("Unable to store upload", e);
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "UPLOAD_FAILED", "音频保存失败，请重试。");
        } finally {
            if (temporary != null) deleteExact(temporary);
            if (converted != null) deleteExact(converted);
        }
    }

    public record StoredAudio(String key, long sizeBytes, AudioProcessor.Tags tags, Double durationSeconds, byte[] artwork) { }

    public StoredAudio inspect(String key) {
        Path source = read(key);
        AudioProcessor.Tags tags = processor.readTags(source, capacity::requireWorkingSpace);
        return new StoredAudio(key, 0, tags, tags.durationSeconds(), processor.readArtwork(source, tags, capacity::requireWorkingSpace));
    }

    public Path read(String key) {
        Path path = pathForKey(key);
        try {
            if (Files.isSymbolicLink(path) || !Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS)
                    || !path.toRealPath().getParent().equals(root)) throw new IOException("Unsafe or missing audio path");
            return path;
        } catch (IOException e) {
            throw new ApiException(HttpStatus.NOT_FOUND, "AUDIO_NOT_FOUND", "歌曲记录存在，但音频文件不可用。");
        }
    }

    public void removeAfterRollback(String key) { deleteExact(pathForKey(key)); }

    // Called for exactly one explicitly requested track. Never scan or delete a directory.
    public void deleteTrackFile(String key) {
        try {
            Path file = checkedDeletionPath(key);
            Files.deleteIfExists(file);
        } catch (IOException | IllegalArgumentException e) {
            log.warn("Could not delete requested audio file, storageKey={}", key, e);
            throw new ApiException(HttpStatus.CONFLICT, "DELETE_FAILED", "音频文件暂时无法删除，请停止播放后重试。");
        }
    }

    public boolean existsForDeletionRecovery(String key) {
        try { return Files.exists(checkedDeletionPath(key), LinkOption.NOFOLLOW_LINKS); }
        catch (IOException | IllegalArgumentException e) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "DELETE_FAILED", "无法确认音频文件状态，请稍后重试。");
        }
    }

    private Path checkedDeletionPath(String key) throws IOException {
        Path file = pathForKey(key);
        if (Files.notExists(file, LinkOption.NOFOLLOW_LINKS)) return file;
        if (Files.isSymbolicLink(file) || !Files.isRegularFile(file, LinkOption.NOFOLLOW_LINKS)
                || !file.toRealPath().getParent().equals(root)) throw new IOException("Unsafe audio deletion path");
        return file;
    }

    private Path pathForKey(String key) {
        if (!KEY.matcher(key).matches()) throw new IllegalArgumentException("Invalid storage key");
        Path path = root.resolve(key).normalize();
        if (!path.getParent().equals(root)) throw new IllegalArgumentException("Invalid storage path");
        return path;
    }

    static boolean isStorageKey(String key) { return KEY.matcher(key).matches(); }

    private void deleteExact(Path file) {
        try { Files.deleteIfExists(file); }
        catch (IOException e) { log.warn("Could not remove individual file {}", file, e); }
    }

    @PreDestroy
    void close() throws IOException { directoryLock.release(); lockChannel.close(); }
}
