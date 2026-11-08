package com.nightsignal.track;

import static org.junit.jupiter.api.Assertions.*;
import java.awt.image.BufferedImage;
import java.io.*;
import java.nio.ByteBuffer;
import java.util.zip.CRC32;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;

class ArtworkImagesTest {
    static byte[] png(int width, int height) throws IOException {
        var output = new ByteArrayOutputStream();
        ImageIO.write(new BufferedImage(width, height, BufferedImage.TYPE_INT_ARGB), "png", output);
        return output.toByteArray();
    }

    @Test void normalizesPngToSmallJpegKeepingAspectRatio() throws Exception {
        byte[] jpeg = ArtworkImages.normalize(png(1600, 800));
        assertEquals(0xff, Byte.toUnsignedInt(jpeg[0]));
        assertEquals(0xd8, Byte.toUnsignedInt(jpeg[1]));
        var image = ImageIO.read(new ByteArrayInputStream(jpeg));
        assertEquals(512, image.getWidth());
        assertEquals(256, image.getHeight());
        var pixel = new java.awt.Color(image.getRGB(0, 0));
        assertEquals(28, pixel.getRed(), 3);
        assertEquals(38, pixel.getGreen(), 3);
        assertEquals(31, pixel.getBlue(), 3);
    }

    @Test void rejectsOversizedInvalidAndSvgInput() {
        assertEquals("COVER_TOO_LARGE", assertThrows(ApiException.class,
                () -> ArtworkImages.normalize(new byte[ArtworkImages.MAX_BYTES + 1])).code);
        for (String input : new String[] { "", "fake jpg", "<svg xmlns='http://www.w3.org/2000/svg'/>" })
            assertEquals("INVALID_COVER", assertThrows(ApiException.class,
                    () -> ArtworkImages.normalize(input.getBytes())).code);
    }

    @Test void rejectsHugeDeclaredDimensionsBeforePixelDecoding() throws Exception {
        byte[] png = png(1, 1);
        ByteBuffer.wrap(png).putInt(16, 20_000).putInt(20, 20_000);
        CRC32 crc = new CRC32();
        crc.update(png, 12, 17);
        ByteBuffer.wrap(png).putInt(29, (int) crc.getValue());
        assertEquals("COVER_DIMENSIONS", assertThrows(ApiException.class, () -> ArtworkImages.normalize(png)).code);
    }
}
