package com.nightsignal.track;

import java.awt.*;
import java.awt.image.BufferedImage;
import java.io.*;
import java.util.Locale;
import javax.imageio.ImageIO;
import javax.imageio.stream.MemoryCacheImageInputStream;
import org.springframework.http.HttpStatus;
import org.springframework.web.multipart.MultipartFile;

final class ArtworkImages {
    static final int MAX_BYTES = 5 * 1024 * 1024;
    private ArtworkImages() {}

    static byte[] read(MultipartFile file) {
        if (file.isEmpty()) throw invalid();
        if (file.getSize() > MAX_BYTES) throw tooLarge();
        try (var input = file.getInputStream()) {
            return normalize(input.readNBytes(MAX_BYTES + 1));
        } catch (IOException e) { throw invalid(); }
    }

    static byte[] normalize(byte[] bytes) {
        if (bytes.length > MAX_BYTES) throw tooLarge();
        try (var input = new MemoryCacheImageInputStream(new ByteArrayInputStream(bytes))) {
            var readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) throw invalid();
            var reader = readers.next();
            try {
                String format = reader.getFormatName().toLowerCase(Locale.ROOT);
                if (!format.equals("png") && !format.equals("jpeg")) throw invalid();
                reader.setInput(input, true, true);
                int width = reader.getWidth(0), height = reader.getHeight(0);
                if (width < 1 || height < 1 || width > 8192 || height > 8192 || (long) width * height > 16_000_000)
                    throw new ApiException(HttpStatus.UNPROCESSABLE_CONTENT, "COVER_DIMENSIONS", "封面尺寸过大，请选择不超过 1600 万像素、单边不超过 8192 像素的图片。");
                double scale = Math.min(1, 512.0 / Math.max(width, height));
                BufferedImage image = reader.read(0);
                BufferedImage thumbnail = new BufferedImage(Math.max(1, (int) Math.round(width * scale)),
                        Math.max(1, (int) Math.round(height * scale)), BufferedImage.TYPE_INT_RGB);
                Graphics2D graphics = thumbnail.createGraphics();
                try {
                    graphics.setColor(new Color(28, 38, 31));
                    graphics.fillRect(0, 0, thumbnail.getWidth(), thumbnail.getHeight());
                    graphics.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BICUBIC);
                    graphics.drawImage(image, 0, 0, thumbnail.getWidth(), thumbnail.getHeight(), null);
                } finally { graphics.dispose(); }
                var output = new ByteArrayOutputStream();
                if (!ImageIO.write(thumbnail, "jpeg", output)) throw invalid();
                return output.toByteArray();
            } finally { reader.dispose(); }
        } catch (IOException | IllegalArgumentException e) { throw invalid(); }
    }

    private static ApiException invalid() {
        return new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "INVALID_COVER", "无法读取封面，请选择完整的 JPG 或 PNG 图片。");
    }
    private static ApiException tooLarge() {
        return new ApiException(HttpStatus.CONTENT_TOO_LARGE, "COVER_TOO_LARGE", "封面最大为 5 MB。");
    }
}
