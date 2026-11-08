package com.nightsignal.track;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class Mp3ValidatorTest {
    @TempDir Path root;
    private final Mp3Validator validator = new Mp3Validator();

    @Test void acceptsGeneratedMpegLayerThreeFramesWithOrWithoutId3() throws Exception {
        byte[] mp3 = getClass().getResourceAsStream("/test-tone.mp3").readAllBytes();
        Path plain = root.resolve("tone.mp3");
        Files.write(plain, mp3);
        assertDoesNotThrow(() -> validator.validate(plain));
        byte[] tagged = new byte[10 + mp3.length];
        byte[] header = { 'I', 'D', '3', 3, 0, 0, 0, 0, 0, 0 };
        System.arraycopy(header, 0, tagged, 0, header.length);
        System.arraycopy(mp3, 0, tagged, 10, mp3.length);
        Path withTag = root.resolve("tagged.mp3");
        Files.write(withTag, tagged);
        assertDoesNotThrow(() -> validator.validate(withTag));
    }

    @Test void rejectsTextBareId3AndLengthBeyondFile() throws Exception {
        Path text = root.resolve("fake.mp3");
        Files.writeString(text, "This is a text file masquerading as MP3. ".repeat(20));
        assertEquals("UNSUPPORTED_AUDIO", assertThrows(ApiException.class, () -> validator.validate(text)).code);
        Path bare = root.resolve("id3.mp3");
        Files.write(bare, new byte[] { 'I', 'D', '3' });
        assertThrows(ApiException.class, () -> validator.validate(bare));
        byte[] badTag = new byte[256];
        byte[] header = { 'I', 'D', '3', 4, 0, 0, 0x7f, 0x7f, 0x7f, 0x7f };
        System.arraycopy(header, 0, badTag, 0, 10);
        Path oversizedTag = root.resolve("invalid-length.mp3");
        Files.write(oversizedTag, badTag);
        assertThrows(ApiException.class, () -> validator.validate(oversizedTag));
    }

    @Test void doesNotTreatAnMp4ContainerAsAlreadyEncodedMp3() throws Exception {
        // ISO BMFF ftyp box with an iso5 brand, matching the reported mislabeled file.
        byte[] mp4 = { 0, 0, 0, 24, 'f', 't', 'y', 'p', 'i', 's', 'o', '5',
                       0, 0, 2, 0, 'i', 's', 'o', '5', 'm', 'p', '4', '1' };
        Path mislabeled = root.resolve("download.mp3");
        Files.write(mislabeled, mp4);
        ApiException error = assertThrows(ApiException.class, () -> validator.validate(mislabeled));
        assertEquals("UNSUPPORTED_AUDIO", error.code);
        assertEquals(415, error.status.value());
    }
}
