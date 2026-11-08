package com.nightsignal.track;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;

class TrackStorageTest {
    @TempDir Path root;

    private AudioProcessor mp3Processor() {
        return new AudioProcessor(new Mp3Validator(), "unavailable-ffmpeg", "unavailable-ffprobe", 5, 104857600);
    }

    @Test void sameNamesUseDistinctKeysAndCanBeReadAfterReopening() throws Exception {
        byte[] bytes = getClass().getResourceAsStream("/test-tone.mp3").readAllBytes();
        String first;
        String second;
        TrackStorage storage = new TrackStorage(root.toString(), mp3Processor(), mock(StorageCapacity.class));
        try {
            TrackStorage.StoredAudio firstStored = storage.store(new MockMultipartFile("file", "夜航.mp3", "text/plain", bytes));
            first = firstStored.key();
            assertEquals(bytes.length, firstStored.sizeBytes());
            second = storage.store(new MockMultipartFile("file", "夜航.mp3", "audio/mpeg", bytes)).key();
            assertNotEquals(first, second);
            assertArrayEquals(bytes, Files.readAllBytes(storage.read(first)));
            assertThrows(IllegalArgumentException.class, () -> storage.read("../outside.mp3"));
            storage.removeAfterRollback(second);
            assertFalse(Files.exists(root.resolve(second)));
        } finally { storage.close(); }
        TrackStorage reopened = new TrackStorage(root.toString(), mp3Processor(), mock(StorageCapacity.class));
        try { assertArrayEquals(bytes, Files.readAllBytes(reopened.read(first))); }
        finally { reopened.close(); }
    }

    @Test void rejectedUploadLeavesNoTemporaryOrAudioFile() throws Exception {
        TrackStorage storage = new TrackStorage(root.toString(), mp3Processor(), mock(StorageCapacity.class));
        try {
            assertThrows(ApiException.class, () -> storage.store(new MockMultipartFile("file", "bad.mp3", "audio/mpeg", "ID3".getBytes())));
            try (var files = Files.list(root)) {
                assertEquals(0, files.filter(file -> !file.getFileName().toString().equals(".night-signal.lock")).count());
            }
        } finally { storage.close(); }
    }

    @Test void deletesOnlyRequestedFileAndToleratesAlreadyMissingFile() throws Exception {
        byte[] bytes = getClass().getResourceAsStream("/test-tone.mp3").readAllBytes();
        TrackStorage storage = new TrackStorage(root.toString(), mp3Processor(), mock(StorageCapacity.class));
        try {
            String first = storage.store(new MockMultipartFile("file", "first.mp3", "audio/mpeg", bytes)).key();
            String second = storage.store(new MockMultipartFile("file", "second.mp3", "audio/mpeg", bytes)).key();
            storage.deleteTrackFile(first);
            assertFalse(Files.exists(root.resolve(first)));
            assertArrayEquals(bytes, Files.readAllBytes(storage.read(second)));
            assertDoesNotThrow(() -> storage.deleteTrackFile(first));
            assertThrows(ApiException.class, () -> storage.deleteTrackFile("../outside.mp3"));
            assertArrayEquals(bytes, Files.readAllBytes(storage.read(second)));
        } finally { storage.close(); }
    }
}
