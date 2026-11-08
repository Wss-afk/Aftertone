package com.nightsignal.track;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.*;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

class TrackFavoriteServiceTest {
    TrackRepository repository;
    TrackStorage storage;
    TrackArtworkRepository artwork;
    PlatformTransactionManager manager;
    TrackService service;
    Track track;

    @BeforeEach void setup() {
        repository = mock(TrackRepository.class);
        storage = mock(TrackStorage.class);
        artwork = mock(TrackArtworkRepository.class);
        manager = mock(PlatformTransactionManager.class);
        when(manager.getTransaction(any())).thenAnswer(call -> new SimpleTransactionStatus());
        service = new TrackService(repository, storage, manager, artwork);
        track = new Track("Window", UUID.randomUUID() + ".mp3", "source.mp3", 12345);
        track.setArtist("Galdive"); track.setAlbum("专辑"); track.setDurationSeconds(330.1);
        track.setCoverVersion(UUID.randomUUID().toString());
        ReflectionTestUtils.setField(track, "id", 7L);
        when(repository.findLockedById(7L)).thenReturn(Optional.of(track));
        when(repository.saveAndFlush(track)).thenReturn(track);
    }

    @Test void favoritesAndUnfavoritesWithoutChangingSongDataOrFiles() {
        var before = TrackResponse.from(track);
        assertEquals(new FavoriteTrackResponse(7, true), service.setFavorite(7, true));
        assertTrue(TrackResponse.from(track).favorite());
        assertEquals(new FavoriteTrackResponse(7, false), service.setFavorite(7, false));
        assertEquals(before, TrackResponse.from(track));
        verify(manager, times(2)).commit(any());
        verify(repository, never()).delete(any());
        verifyNoInteractions(storage, artwork);
    }

    @Test void repeatedRequestsSetTheDesiredStateInsteadOfTogglingIt() {
        service.setFavorite(7, true); service.setFavorite(7, true);
        assertTrue(track.isFavorite());
        service.setFavorite(7, false); service.setFavorite(7, false);
        assertFalse(track.isFavorite());
        verifyNoInteractions(storage, artwork);
    }

    @Test void missingBooleanIsRejectedBeforeDatabaseWork() {
        assertEquals("INVALID_FAVORITE", assertThrows(ApiException.class, () -> service.setFavorite(7, null)).code);
        verifyNoInteractions(repository, manager, storage, artwork);
    }

    @Test void missingTrackReturns404WithoutSaving() {
        var error = assertThrows(ApiException.class, () -> service.setFavorite(999, true));
        assertEquals(404, error.status.value());
        verify(repository, never()).saveAndFlush(any());
    }

    @Test void deletingTrackCannotBeFavoritedOrRestored() {
        track.setDeleting(true);
        var error = assertThrows(ApiException.class, () -> service.setFavorite(7, true));
        assertEquals("TRACK_NOT_FOUND", error.code);
        assertFalse(track.isFavorite());
        assertTrue(track.isDeleting());
        verify(repository, never()).saveAndFlush(any());
    }

    @Test void databaseSaveFailureRollsBackAndReturnsReadableProblem() {
        when(repository.saveAndFlush(track)).thenThrow(new DataAccessResourceFailureException("Unavailable"));
        var error = assertThrows(ApiException.class, () -> service.setFavorite(7, true));
        assertEquals("FAVORITE_SAVE_FAILED", error.code);
        verify(manager).rollback(any());
        verifyNoInteractions(storage, artwork);
    }

    @Test void uncertainCommitAsksToRefreshAndNeverTouchesAudio() {
        doThrow(new DataAccessResourceFailureException("Commit uncertain")).when(manager).commit(any());
        var error = assertThrows(ApiException.class, () -> service.setFavorite(7, true));
        assertEquals("FAVORITE_SAVE_FAILED", error.code);
        assertTrue(error.getMessage().contains("刷新曲库确认"));
        verifyNoInteractions(storage, artwork);
    }
}
