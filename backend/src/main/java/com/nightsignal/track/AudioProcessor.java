package com.nightsignal.track;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;
import org.slf4j.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

@Component
public class AudioProcessor {
    private static final Logger log = LoggerFactory.getLogger(AudioProcessor.class);
    // Only local binary audio/container formats; playlists and network protocols are excluded.
    private static final String FORMATS = "aac,mp3,mov,mp4,m4a,3gp,3g2,mj2,matroska,webm,wav,flac,ogg,asf,aiff";
    private final Mp3Validator validator;
    private final String ffmpeg;
    private final String ffprobe;
    private final long timeoutSeconds;
    private final long maxOutputBytes;

    public record Tags(String title, String artist, String album, Double durationSeconds, int artworkStream) {
        static final Tags EMPTY = new Tags("", "", "", null, -1);
    }

    public Tags readTags(Path source, Runnable checkSpace) {
        checkSpace.run();
        List<String> command = new ArrayList<>(List.of(ffprobe, "-v", "error"));
        addInput(command, source);
        command.addAll(List.of("-show_entries", "format=duration:format_tags=title,artist,album:stream=index,codec_type,duration:stream_disposition=attached_pic:stream_tags=title,artist,album", "-of", "json"));
        try {
            Result result = run(command, source.getParent(), null, checkSpace);
            if (result.exitCode() != 0) return Tags.EMPTY;
            JsonNode json = JsonMapper.builder().build().readTree(result.output());
            JsonNode format = json.path("format").path("tags");
            JsonNode audio = null;
            int artwork = -1;
            for (JsonNode stream : json.path("streams")) {
                if (audio == null && "audio".equals(stream.path("codec_type").asString())) audio = stream;
                if (artwork < 0 && stream.path("disposition").path("attached_pic").asInt(0) == 1)
                    artwork = stream.path("index").asInt(-1);
            }
            JsonNode streamTags = audio == null ? json.path("missing") : audio.path("tags");
            Double duration = seconds(audio == null ? null : audio.path("duration"));
            if (duration == null) duration = seconds(json.path("format").path("duration"));
            return new Tags(tag(format, streamTags, "title"), tag(format, streamTags, "artist"),
                    tag(format, streamTags, "album"), duration, artwork);
        } catch (ApiException e) {
            if (e.code.equals("INSUFFICIENT_STORAGE") || e.code.equals("STORAGE_UNAVAILABLE")
                    || e.code.equals("AUDIO_PROCESSING_INTERRUPTED")) throw e;
            log.debug("Audio tags unavailable: {}", e.code);
        } catch (Exception e) { log.debug("Could not read optional audio tags", e); }
        return Tags.EMPTY;
    }

    private static Double seconds(JsonNode value) {
        try {
            double duration = Double.parseDouble(value == null ? "" : value.asString());
            return Double.isFinite(duration) && duration > 0 ? duration : null;
        } catch (NumberFormatException e) { return null; }
    }

    public byte[] readArtwork(Path source, Tags tags, Runnable checkSpace) {
        if (tags.artworkStream() < 0) return null;
        Path image = null;
        try {
            image = Files.createTempFile(source.getParent(), ".cover-", ".png");
            List<String> command = new ArrayList<>(List.of(ffmpeg, "-hide_banner", "-nostdin", "-y", "-v", "error", "-max_alloc", "67108864"));
            addInput(command, source);
            command.addAll(List.of("-map", "0:" + tags.artworkStream(), "-frames:v", "1", "-an", "-vf",
                    "scale=512:512:force_original_aspect_ratio=decrease", "-c:v", "png", "-f", "image2", image.toString()));
            Result result = run(command, source.getParent(), image, checkSpace);
            if (result.exitCode() != 0 || Files.size(image) > ArtworkImages.MAX_BYTES) return null;
            return ArtworkImages.normalize(Files.readAllBytes(image));
        } catch (ApiException e) {
            if (e.code.equals("INSUFFICIENT_STORAGE") || e.code.equals("STORAGE_UNAVAILABLE")
                    || e.code.equals("AUDIO_PROCESSING_INTERRUPTED")) throw e;
            log.debug("Embedded artwork unavailable: {}", e.code);
        } catch (IOException e) { log.debug("Could not read optional embedded artwork", e); }
        finally {
            if (image != null) try { Files.deleteIfExists(image); }
            catch (IOException e) { log.warn("Could not remove artwork temporary file {}", image, e); }
        }
        return null;
    }

    private static String tag(JsonNode format, JsonNode stream, String name) {
        String value = tagValue(format, name);
        return value.isEmpty() ? tagValue(stream, name) : value;
    }

    private static String tagValue(JsonNode tags, String name) {
        String value = "";
        for (var property : tags.properties()) {
            if (property.getKey().equalsIgnoreCase(name) && property.getValue().isString()) {
                value = property.getValue().asString();
                break;
            }
        }
        value = value.replaceAll("\\p{Cc}", "").replaceAll("(?U)^\\s+|\\s+$", "");
        return value.codePointCount(0, value.length()) > 255 ? value.substring(0, value.offsetByCodePoints(0, 255)) : value;
    }

    public AudioProcessor(Mp3Validator validator,
            @Value("${app.audio.ffmpeg-path:ffmpeg}") String ffmpeg,
            @Value("${app.audio.ffprobe-path:ffprobe}") String ffprobe,
            @Value("${app.audio.timeout-seconds:120}") long timeoutSeconds,
            @Value("${app.audio.max-output-bytes:104857600}") long maxOutputBytes) {
        this.validator = validator;
        this.ffmpeg = ffmpeg;
        this.ffprobe = ffprobe;
        if (timeoutSeconds <= 0 || maxOutputBytes <= 0) throw new IllegalArgumentException("Invalid audio processing limits");
        this.timeoutSeconds = timeoutSeconds;
        this.maxOutputBytes = maxOutputBytes;
    }

    public Path prepare(Path source, Path converted, Runnable checkSpace) throws IOException {
        checkSpace.run();
        try {
            validator.validate(source);
            return source; // Preserve valid MP3 bytes; avoid unnecessary lossy re-encoding.
        } catch (ApiException e) {
            if (e.status != HttpStatus.UNSUPPORTED_MEDIA_TYPE) throw e;
        }

        List<String> probe = new ArrayList<>(List.of(ffprobe, "-v", "error"));
        addInput(probe, source);
        probe.addAll(List.of("-select_streams", "a:0", "-show_entries", "stream=codec_name",
                "-of", "default=noprint_wrappers=1:nokey=1"));
        Result inspected = run(probe, source.getParent(), null, checkSpace);
        if (inspected.exitCode() != 0 || !inspected.output().strip().matches("[a-zA-Z0-9_]+")) throw unsupported();

        List<String> encode = new ArrayList<>(List.of(ffmpeg, "-hide_banner", "-nostdin", "-y", "-v", "error", "-xerror"));
        addInput(encode, source);
        encode.addAll(List.of("-map", "0:a:0", "-vn", "-map_metadata", "-1", "-map_chapters", "-1",
                "-c:a", "libmp3lame", "-q:a", "2", "-id3v2_version", "3", "-f", "mp3", converted.toString()));
        Result encoded = run(encode, source.getParent(), converted, checkSpace);
        if (encoded.exitCode() != 0) {
            log.warn("Audio conversion failed: {}", encoded.output());
            throw unsupported();
        }
        try { validator.validate(converted); }
        catch (ApiException e) { throw unsupported(); }
        return converted;
    }

    private void addInput(List<String> command, Path source) {
        command.addAll(List.of("-protocol_whitelist", "file,pipe", "-format_whitelist", FORMATS, "-i", source.toString()));
    }

    private Result run(List<String> command, Path directory, Path output, Runnable checkSpace) throws IOException {
        checkSpace.run();
        Path diagnostic = Files.createTempFile(directory, ".audio-process-", ".log");
        Process process = null;
        try {
            try {
                process = new ProcessBuilder(command).redirectErrorStream(true).redirectOutput(diagnostic.toFile()).start();
            } catch (IOException e) {
                log.error("Cannot launch configured audio tool {}", command.getFirst(), e);
                throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "AUDIO_PROCESSING_UNAVAILABLE", "音频处理服务暂不可用，请稍后重试。");
            }
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(timeoutSeconds);
            while (!process.waitFor(200, TimeUnit.MILLISECONDS)) {
                checkSpace.run();
                checkLimits(output, diagnostic);
                if (System.nanoTime() >= deadline) {
                    throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "AUDIO_PROCESSING_TIMEOUT", "音频处理超时，请重试或换一份文件。");
                }
            }
            checkSpace.run();
            checkLimits(output, diagnostic);
            try (var stream = Files.newInputStream(diagnostic)) {
                return new Result(process.exitValue(), new String(stream.readNBytes(8192), StandardCharsets.UTF_8));
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "AUDIO_PROCESSING_INTERRUPTED", "音频处理已中断，请重试。");
        } finally {
            if (process != null && process.isAlive()) {
                process.destroyForcibly();
                try { process.waitFor(5, TimeUnit.SECONDS); }
                catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            }
            try { Files.deleteIfExists(diagnostic); }
            catch (IOException e) { log.warn("Could not remove audio diagnostic {}", diagnostic, e); }
        }
    }

    private void checkLimits(Path output, Path diagnostic) throws IOException {
        if (output != null && Files.exists(output) && Files.size(output) > maxOutputBytes) {
            throw new ApiException(HttpStatus.CONTENT_TOO_LARGE, "PROCESSED_AUDIO_TOO_LARGE", "处理后的音频过大，请选择较短的音频。");
        }
        if (Files.size(diagnostic) > 1024 * 1024) throw unsupported();
    }

    private ApiException unsupported() {
        return new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "UNSUPPORTED_AUDIO", "无法读取这份音频，请检查文件是否完整，或换一份音频文件。");
    }

    private record Result(int exitCode, String output) { }
}
