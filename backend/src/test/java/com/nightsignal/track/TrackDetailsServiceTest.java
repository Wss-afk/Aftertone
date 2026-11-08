package com.nightsignal.track;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

class TrackDetailsServiceTest {
    TrackRepository repository = mock(TrackRepository.class);
    TrackStorage storage = mock(TrackStorage.class);
    TrackArtworkRepository artwork = mock(TrackArtworkRepository.class);
    PlatformTransactionManager manager = mock(PlatformTransactionManager.class);
    TrackService service;
    Track track;

    @BeforeEach void setup() {
        when(manager.getTransaction(any())).thenAnswer(call -> new SimpleTransactionStatus());
        service = new TrackService(repository, storage, manager, artwork);
        track = new Track("用户修改的歌名", UUID.randomUUID() + ".mp3", "source.mp3", 1200);
        track.setArtist("用户修改的歌手");
        track.setAlbum("原专辑");
        ReflectionTestUtils.setField(track, "id", 9L);
        when(repository.findLockedById(9L)).thenReturn(Optional.of(track));
        when(repository.findById(9L)).thenReturn(Optional.of(track));
        when(repository.saveAndFlush(track)).thenReturn(track);
    }

    @Test void validatesAndTrimsAlbumAndPreservesOmittedAlbum() {
        assertEquals("夜航专辑 🎵", service.rename(9, "歌", "歌手", "　夜航专辑 🎵　").album());
        assertEquals("夜航专辑 🎵", service.rename(9, "歌").album());
        assertEquals("", service.rename(9, "歌", "歌手", "　").album());
        for (String album : List.of("🎵".repeat(256), "甲\n乙", "甲\u0000乙"))
            assertEquals("INVALID_ALBUM", assertThrows(ApiException.class, () -> service.rename(9, "歌", "歌手", album)).code);
        verifyNoInteractions(storage, artwork);
    }

    @Test void updatesCoverAndMetadataTogetherAndVersionsTheImageUrl() throws Exception {
        var cover = new MockMultipartFile("cover", "cover.png", "image/png", ArtworkImagesTest.png(800, 400));
        var first = service.updateInformation(9, "歌", "歌手", "新专辑", cover, false);
        var second = service.updateInformation(9, "歌", "歌手", "新专辑", cover, false);
        assertEquals("新专辑", second.album());
        assertTrue(first.coverUrl().startsWith("/api/v1/tracks/9/cover?v="));
        assertNotEquals(first.coverUrl(), second.coverUrl());
        verify(artwork, times(2)).save(any(TrackArtwork.class));
        verify(manager, times(2)).commit(any());
        verifyNoInteractions(storage);
    }

    @Test void invalidCoverCannotStartAChangeAndConflictingActionsAreRejected() {
        var bad = new MockMultipartFile("cover", "fake.jpg", "image/jpeg", new byte[] { 1, 2, 3 });
        assertEquals("INVALID_COVER", assertThrows(ApiException.class, () -> service.updateInformation(9, "新", "新", "新", bad, false)).code);
        assertEquals("INVALID_COVER_ACTION", assertThrows(ApiException.class, () -> service.updateInformation(9, "新", "新", "新", bad, true)).code);
        assertEquals("用户修改的歌名", track.getTitle());
        assertEquals("原专辑", track.getAlbum());
        verifyNoInteractions(repository, storage, artwork, manager);
    }

    @Test void removesOnlySelectedArtworkAndDoesNotReimportIt() {
        track.setCoverVersion(UUID.randomUUID().toString());
        assertNull(service.updateInformation(9, "歌", "歌手", "专辑", null, true).coverUrl());
        service.rename(9, "歌");
        verify(artwork).deleteById(9L);
        verifyNoInteractions(storage);
        assertEquals("COVER_NOT_FOUND", assertThrows(ApiException.class, () -> service.cover(9, null)).code);
    }

    @Test void oldTracksAreSupplementedOnceWithoutChangingUserTitleOrArtist() {
        track.setDetailsScanned(false);
        track.setAlbum("");
        when(repository.findAllByDeletingFalseAndDetailsScannedFalse()).thenReturn(List.of(track));
        when(storage.inspect(track.getStorageKey())).thenReturn(new TrackStorage.StoredAudio(track.getStorageKey(), 1200,
                new AudioProcessor.Tags("旧标签歌名", "旧标签歌手", "内嵌专辑", 197.5, -1), 197.5, null));
        service.backfillDetails();
        service.backfillDetails();
        assertEquals("用户修改的歌名", track.getTitle());
        assertEquals("用户修改的歌手", track.getArtist());
        assertEquals("内嵌专辑", track.getAlbum());
        assertEquals(197.5, track.getDurationSeconds());
        assertTrue(track.isDetailsScanned());
        verify(storage, times(1)).inspect(track.getStorageKey());
    }
}
