package com.nightsignal.track;

import static org.junit.jupiter.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.mockito.Mockito.*;
import java.nio.file.*;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockMultipartFile;

class AudioProcessorTest {
    @TempDir Path root;
    static String ffmpeg;
    static String ffprobe;

    @BeforeAll static void tools() throws Exception {
        ffmpeg = System.getenv("APP_FFMPEG_PATH");
        ffprobe = System.getenv("APP_FFPROBE_PATH");
        assumeTrue(ffmpeg != null && ffprobe != null, "Set APP_FFMPEG_PATH and APP_FFPROBE_PATH to run audio conversion integration tests.");
        assertTrue(Files.isRegularFile(Path.of(ffmpeg)), "Configured FFmpeg must exist");
        assertTrue(Files.isRegularFile(Path.of(ffprobe)), "Configured FFprobe must exist");
    }

    AudioProcessor processor(long maxBytes) { return new AudioProcessor(new Mp3Validator(), ffmpeg, ffprobe, 10, maxBytes); }

    byte[] fixture(String name) throws Exception {
        try (var stream = getClass().getResourceAsStream("/" + name)) { return stream.readAllBytes(); }
    }

    @ParameterizedTest
    @ValueSource(strings = {"m4a", "aac", "wav", "flac", "ogg", "opus", "webm", "wma", "aiff"})
    void convertsCommonAudioAndProducesDecodableMp3(String extension) throws Exception {
        byte[] original = fixture("test-tone." + extension);
        Path source = root.resolve("upload.tmp");
        Files.write(source, original); // Detection must work without an extension.
        Path output = root.resolve("converted.mp3");
        assertEquals(output, processor(104857600).prepare(source, output, () -> { }));
        assertArrayEquals(original, Files.readAllBytes(source));
        new Mp3Validator().validate(output);
        Process decoded = new ProcessBuilder(ffmpeg, "-v", "error", "-i", output.toString(), "-f", "null", "-")
                .redirectOutput(ProcessBuilder.Redirect.DISCARD).redirectError(ProcessBuilder.Redirect.DISCARD).start();
        try {
            assertTrue(decoded.waitFor(10, TimeUnit.SECONDS), "Converted MP3 must decode promptly");
            assertEquals(0, decoded.exitValue(), "Converted MP3 must decode without errors");
        } finally { if (decoded.isAlive()) decoded.destroyForcibly(); }
    }

    @Test void keepsValidMp3BytesWithoutCallingExternalTools() throws Exception {
        Path source = root.resolve("upload.tmp");
        byte[] bytes = fixture("test-tone.mp3");
        Files.write(source, bytes);
        AudioProcessor noTools = new AudioProcessor(new Mp3Validator(), "missing-ffmpeg", "missing-ffprobe", 1, 104857600);
        assertEquals(source, noTools.prepare(source, root.resolve("unused.mp3"), () -> { }));
        assertArrayEquals(bytes, Files.readAllBytes(source));
        assertFalse(Files.exists(root.resolve("unused.mp3")));
    }

    @ParameterizedTest @ValueSource(strings = {"mp3", "flac", "m4a"})
    void readsTitleAndArtistBeforeConversionStripsSourceTags(String extension) throws Exception {
        Path input = root.resolve("input." + extension);
        Files.write(input, fixture("test-tone." + extension));
        Path tagged = root.resolve("tagged." + extension);
        Process tagger = new ProcessBuilder(ffmpeg, "-v", "error", "-y", "-i", input.toString(), "-c:a", "copy",
                "-metadata", "title=标签歌名 🎵", "-metadata", "artist=标签歌手", "-metadata", "album=标签专辑", tagged.toString())
                .redirectOutput(ProcessBuilder.Redirect.DISCARD).redirectError(ProcessBuilder.Redirect.DISCARD).start();
        try {
            assertTrue(tagger.waitFor(10, TimeUnit.SECONDS));
            assertEquals(0, tagger.exitValue());
        } finally { if (tagger.isAlive()) tagger.destroyForcibly(); }
        TrackStorage storage = new TrackStorage(root.resolve("music").toString(), processor(104857600), mock(StorageCapacity.class));
        try {
            byte[] bytes = Files.readAllBytes(tagged);
            var stored = storage.store(new MockMultipartFile("file", "文件名不可推断歌手.mp3", "audio/mpeg", bytes));
            assertEquals("标签歌名 🎵", stored.tags().title());
            assertEquals("标签歌手", stored.tags().artist());
            assertEquals("标签专辑", stored.tags().album());
            assertNotNull(stored.durationSeconds());
            assertTrue(stored.durationSeconds() > 0);
            if (extension.equals("mp3")) assertArrayEquals(bytes, Files.readAllBytes(storage.read(stored.key())));
        } finally { storage.close(); }
    }

    @Test void mislabeledM4aUsesActualStoredSizeAndSurvivesReopening() throws Exception {
        byte[] bytes = fixture("test-tone.m4a");
        TrackStorage.StoredAudio stored;
        TrackStorage storage = new TrackStorage(root.toString(), processor(104857600), mock(StorageCapacity.class));
        try {
            stored = storage.store(new MockMultipartFile("file", "真实音频.mp3", "audio/mpeg", bytes));
            assertEquals(Files.size(storage.read(stored.key())), stored.sizeBytes());
            assertFalse(java.util.Arrays.equals(bytes, Files.readAllBytes(storage.read(stored.key()))));
            new Mp3Validator().validate(storage.read(stored.key()));
        } finally { storage.close(); }
        TrackStorage reopened = new TrackStorage(root.toString(), processor(104857600), mock(StorageCapacity.class));
        try { new Mp3Validator().validate(reopened.read(stored.key())); }
        finally { reopened.close(); }
    }

    @ParameterizedTest @ValueSource(strings = {"mp3", "flac"})
    void extractsAttachedCoverBeforeAudioConversion(String extension) throws Exception {
        Path audio = root.resolve("input." + extension);
        Files.write(audio, fixture("test-tone." + extension));
        Path cover = root.resolve("cover.png");
        Files.write(cover, ArtworkImagesTest.png(800, 400));
        Path tagged = root.resolve("covered." + extension);
        Process embed = new ProcessBuilder(ffmpeg, "-v", "error", "-y", "-i", audio.toString(), "-i", cover.toString(),
                "-map", "0:a:0", "-map", "1:v:0", "-c:a", "copy", "-c:v", "png", "-disposition:v:0", "attached_pic",
                "-metadata", "album=内嵌封面专辑", tagged.toString()).redirectError(ProcessBuilder.Redirect.DISCARD).start();
        try {
            assertTrue(embed.waitFor(10, TimeUnit.SECONDS));
            assertEquals(0, embed.exitValue());
        } finally { if (embed.isAlive()) embed.destroyForcibly(); }
        var storage = new TrackStorage(root.resolve("music").toString(), processor(104857600), mock(StorageCapacity.class));
        try {
            var stored = storage.store(new MockMultipartFile("file", "covered." + extension, "application/octet-stream", Files.readAllBytes(tagged)));
            assertEquals("内嵌封面专辑", stored.tags().album());
            assertNotNull(stored.artwork());
            var image = javax.imageio.ImageIO.read(new java.io.ByteArrayInputStream(stored.artwork()));
            assertEquals(512, image.getWidth());
            assertEquals(256, image.getHeight());
            assertNotNull(stored.durationSeconds());
            if (extension.equals("mp3")) assertArrayEquals(Files.readAllBytes(tagged), Files.readAllBytes(storage.read(stored.key())));
        } finally { storage.close(); }
    }

    @Test void invalidInputLeavesNoUploadConversionOrDiagnosticFiles() throws Exception {
        TrackStorage storage = new TrackStorage(root.toString(), processor(104857600), mock(StorageCapacity.class));
        try {
            ApiException error = assertThrows(ApiException.class, () -> storage.store(
                    new MockMultipartFile("file", "fake.mp3", "audio/mpeg", "ID3".getBytes())));
            assertEquals("UNSUPPORTED_AUDIO", error.code);
            assertEquals(415, error.status.value());
            assertOnlyLockRemains();
        } finally { storage.close(); }
    }

    @Test void convertedSizeLimitRejectsAndCleansBothTemporaryFiles() throws Exception {
        byte[] bytes = fixture("test-tone.m4a");
        TrackStorage storage = new TrackStorage(root.toString(), processor(128), mock(StorageCapacity.class));
        try {
            ApiException error = assertThrows(ApiException.class, () -> storage.store(
                    new MockMultipartFile("file", "tone.m4a", "audio/mp4", bytes)));
            assertEquals("PROCESSED_AUDIO_TOO_LARGE", error.code);
            assertEquals(413, error.status.value());
            assertOnlyLockRemains();
        } finally { storage.close(); }
    }

    void assertOnlyLockRemains() throws Exception {
        try (var files = Files.list(root)) {
            assertEquals(java.util.List.of(".night-signal.lock"), files.map(path -> path.getFileName().toString()).toList());
        }
    }

    @Test void capacityDropDuringProcessingStopsAndCleansTemporaryFiles() throws Exception {
        StorageCapacity capacity = mock(StorageCapacity.class);
        doNothing().doThrow(new ApiException(org.springframework.http.HttpStatus.INSUFFICIENT_STORAGE,
                "INSUFFICIENT_STORAGE", "Insufficient disk space")).when(capacity).requireWorkingSpace();
        byte[] bytes = fixture("test-tone.m4a");
        TrackStorage storage = new TrackStorage(root.toString(), processor(104857600), capacity);
        try {
            ApiException error = assertThrows(ApiException.class, () -> storage.store(
                    new MockMultipartFile("file", "tone.m4a", "audio/mp4", bytes)));
            assertEquals(507, error.status.value());
            assertEquals("INSUFFICIENT_STORAGE", error.code);
            assertOnlyLockRemains();
        } finally { storage.close(); }
    }
}
