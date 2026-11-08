package com.nightsignal.track;

import java.io.IOException;
import java.nio.file.*;
import java.nio.file.attribute.BasicFileAttributes;
import org.slf4j.*;
import org.springframework.beans.factory.annotation.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.util.unit.DataSize;

@Component
public class StorageCapacity {
    private static final Logger log = LoggerFactory.getLogger(StorageCapacity.class);
    private final Path root;
    private final FileStore fileStore;
    private final long reserveBytes;
    private final long requiredUploadFreeBytes;

    @Autowired
    public StorageCapacity(@Value("${app.music-dir}") String directory,
            @Value("${app.storage.minimum-free-space:5GB}") String minimumFreeSpace,
            @Value("${spring.servlet.multipart.max-file-size:25MB}") String maxUploadSize,
            @Value("${app.audio.max-output-bytes:104857600}") long maxOutputBytes) throws IOException {
        Path configured = Path.of(directory).toAbsolutePath().normalize();
        Files.createDirectories(configured);
        root = configured.toRealPath();
        fileStore = Files.getFileStore(root);
        reserveBytes = DataSize.parse(minimumFreeSpace).toBytes();
        if (reserveBytes < 0 || maxOutputBytes <= 0) throw new IllegalArgumentException("Invalid storage capacity limits");
        long workBytes = Math.addExact(DataSize.parse(maxUploadSize).toBytes(), Math.addExact(maxOutputBytes, 8L * 1024 * 1024));
        requiredUploadFreeBytes = Math.addExact(reserveBytes, workBytes);
    }

    StorageCapacity(Path root, long reserveBytes, long workBytes, FileStore fileStore) {
        this.root = root;
        this.reserveBytes = reserveBytes;
        this.requiredUploadFreeBytes = Math.addExact(reserveBytes, workBytes);
        this.fileStore = fileStore;
    }

    public Snapshot snapshot() {
        try {
            long usable = usableBytes();
            long total = fileStore.getTotalSpace();
            if (total <= 0) throw new IOException("Unknown disk size");
            long musicBytes = 0;
            try (var files = Files.newDirectoryStream(root, "*.mp3")) {
                for (Path file : files) {
                    if (!TrackStorage.isStorageKey(file.getFileName().toString())) continue;
                    try {
                        var attributes = Files.readAttributes(file, BasicFileAttributes.class, LinkOption.NOFOLLOW_LINKS);
                        if (attributes.isRegularFile()) musicBytes += attributes.size();
                    } catch (NoSuchFileException ignored) { /* A single-track deletion can finish during this read. */ }
                }
            }
            return new Snapshot(musicBytes, total, usable, reserveBytes, requiredUploadFreeBytes,
                    usable >= requiredUploadFreeBytes, root.getRoot().toString());
        } catch (IOException e) { throw unavailable(e); }
    }

    public void requireUploadSpace() { requireSpace(requiredUploadFreeBytes); }

    public void requireWriteSpace(long bytes) {
        requireSpace(Math.addExact(reserveBytes, Math.max(0, bytes)));
    }

    public void requireWorkingSpace() { requireWriteSpace(4L * 1024 * 1024); }

    private void requireSpace(long required) {
        try {
            if (usableBytes() < required) {
                throw new ApiException(HttpStatus.INSUFFICIENT_STORAGE, "INSUFFICIENT_STORAGE",
                        "磁盘剩余空间不足，上传已暂停。请释放空间或更换曲库目录后重试。");
            }
        } catch (IOException e) { throw unavailable(e); }
    }

    private long usableBytes() throws IOException {
        long usable = fileStore.getUsableSpace();
        if (usable < 0) throw new IOException("Unknown usable disk space");
        return usable;
    }

    private ApiException unavailable(IOException cause) {
        log.warn("Could not read capacity for music directory {}", root, cause);
        return new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "STORAGE_UNAVAILABLE", "暂时无法读取磁盘容量，请稍后重试。");
    }

    public record Snapshot(long libraryBytes, long diskTotalBytes, long diskUsableBytes,
            long reserveBytes, long requiredUploadFreeBytes, boolean uploadAllowed, String volumeRoot) { }
}
