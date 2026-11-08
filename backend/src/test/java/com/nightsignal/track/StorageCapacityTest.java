package com.nightsignal.track;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import java.io.IOException;
import java.nio.file.*;
import java.util.UUID;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;

class StorageCapacityTest {
    @TempDir Path root;
    static final long GB = 1024L * 1024 * 1024;
    static final long WORK = 133L * 1024 * 1024;
    FileStore disk;
    StorageCapacity capacity;

    @BeforeEach void setup() throws Exception {
        disk = mock(FileStore.class);
        when(disk.getUsableSpace()).thenReturn(20 * GB);
        when(disk.getTotalSpace()).thenReturn(100 * GB);
        capacity = new StorageCapacity(root, 5 * GB, WORK, disk);
    }

    @Test void reportsActualAudioBytesAndIgnoresTemporaryFiles() throws Exception {
        Files.write(root.resolve(UUID.randomUUID() + ".mp3"), new byte[1024]);
        Files.write(root.resolve(UUID.randomUUID() + ".mp3"), new byte[2048]);
        Files.write(root.resolve(".converted-test.mp3"), new byte[4096]);
        Files.write(root.resolve(".upload-test.tmp"), new byte[4096]);
        var report = capacity.snapshot();
        assertEquals(3072, report.libraryBytes());
        assertEquals(20 * GB, report.diskUsableBytes());
        assertEquals(100 * GB, report.diskTotalBytes());
        assertEquals(5 * GB, report.reserveBytes());
        assertTrue(report.uploadAllowed());
    }

    @Test void rejectsBelowThresholdAndAllowsExactBoundary() throws Exception {
        when(disk.getUsableSpace()).thenReturn(5 * GB + WORK - 1);
        ApiException error = assertThrows(ApiException.class, capacity::requireUploadSpace);
        assertEquals(507, error.status.value());
        assertEquals("INSUFFICIENT_STORAGE", error.code);
        assertFalse(capacity.snapshot().uploadAllowed());
        when(disk.getUsableSpace()).thenReturn(5 * GB + WORK);
        assertDoesNotThrow(capacity::requireUploadSpace);
        assertTrue(capacity.snapshot().uploadAllowed());
    }

    @Test void checksReserveBeforeEachWrite() throws Exception {
        when(disk.getUsableSpace()).thenReturn(5 * GB + 100);
        assertDoesNotThrow(() -> capacity.requireWriteSpace(100));
        assertThrows(ApiException.class, () -> capacity.requireWriteSpace(101));
    }

    @Test void unavailableCapacityIsNotReportedAsZeroOrAllowed() throws Exception {
        when(disk.getUsableSpace()).thenThrow(new IOException("Disk unavailable"));
        ApiException error = assertThrows(ApiException.class, capacity::snapshot);
        assertEquals(503, error.status.value());
        assertEquals("STORAGE_UNAVAILABLE", error.code);
        assertThrows(ApiException.class, capacity::requireUploadSpace);
    }

    @Test void lowSpaceRejectsBeforeWritingAnyUploadAndKeepsExistingAudio() throws Exception {
        byte[] original = new byte[] { 1, 2, 3 };
        Path existing = root.resolve(UUID.randomUUID() + ".mp3");
        Files.write(existing, original);
        when(disk.getUsableSpace()).thenReturn(GB);
        AudioProcessor processor = mock(AudioProcessor.class);
        TrackStorage storage = new TrackStorage(root.toString(), processor, capacity);
        try {
            assertEquals(507, assertThrows(ApiException.class, () -> storage.store(
                    new MockMultipartFile("file", "tone.mp3", "audio/mpeg", original))).status.value());
            verifyNoInteractions(processor);
            assertArrayEquals(original, Files.readAllBytes(existing));
            try (var files = Files.list(root)) { assertEquals(2, files.count()); }
        } finally { storage.close(); }
    }

    @Test void spaceDroppingDuringCopyCleansOnlyThisTemporaryUpload() throws Exception {
        when(disk.getUsableSpace()).thenReturn(20 * GB, 5 * GB - 1);
        AudioProcessor processor = mock(AudioProcessor.class);
        TrackStorage storage = new TrackStorage(root.toString(), processor, capacity);
        try {
            assertEquals(507, assertThrows(ApiException.class, () -> storage.store(
                    new MockMultipartFile("file", "tone.mp3", "audio/mpeg", new byte[1024]))).status.value());
            verifyNoInteractions(processor);
            try (var files = Files.list(root)) { assertEquals(1, files.count()); }
        } finally { storage.close(); }
    }
}
