package com.nightsignal.track;

import com.mpatric.mp3agic.*;
import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.channels.SeekableByteChannel;
import java.nio.file.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
public class Mp3Validator {
    public void validate(Path path) throws IOException {
        long size = Files.size(path);
        if (size < 10) throw invalid();
        long audioOffset = 0;
        // Tags are not trusted evidence of audio. Validate their length and skip them.
        try (InputStream input = Files.newInputStream(path)) {
            byte[] header = input.readNBytes(10);
            if (header[0] == 'I' && header[1] == 'D' && header[2] == '3') {
                if (header[3] < 2 || header[3] > 4) throw invalid();
                long tagSize = 0;
                for (int i = 6; i < 10; i++) {
                    if ((header[i] & 0x80) != 0) throw invalid();
                    tagSize = (tagSize << 7) | header[i];
                }
                long footer = header[3] == 4 && (header[5] & 0x10) != 0 ? 10 : 0;
                if (10 + tagSize + footer >= size) throw invalid();
                audioOffset = 10 + tagSize + footer;
            }
        }
        // Reuse the library's MPEG parser. Require two complete adjacent Layer III
        // frames, including consistent version/sample rate; do not parse ID3 metadata.
        try (SeekableByteChannel channel = Files.newByteChannel(path)) {
            MpegFrame previous = null;
            long offset = audioOffset;
            for (int i = 0; i < 2; i++) {
                if (offset + 4 > size) throw invalid();
                channel.position(offset);
                ByteBuffer bytes = ByteBuffer.allocate(4);
                while (bytes.hasRemaining() && channel.read(bytes) != -1) { }
                if (bytes.hasRemaining()) throw invalid();
                byte[] header = bytes.array();
                MpegFrame frame = new MpegFrame(header[0], header[1], header[2], header[3]);
                if (!"III".equals(frame.getLayer()) || frame.getLengthInBytes() < 4
                        || offset + frame.getLengthInBytes() > size) throw invalid();
                if (previous != null && (previous.getSampleRate() != frame.getSampleRate()
                        || !previous.getVersion().equals(frame.getVersion()))) throw invalid();
                previous = frame;
                offset += frame.getLengthInBytes();
            }
        } catch (InvalidDataException | IllegalArgumentException e) {
            throw invalid();
        }
    }

    private ApiException invalid() {
        return new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "UNSUPPORTED_AUDIO", "文件不是可识别的 MP3 音频。");
    }
}
