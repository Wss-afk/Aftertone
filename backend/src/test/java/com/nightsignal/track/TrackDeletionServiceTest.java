package com.nightsignal.track;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.*;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

class TrackDeletionServiceTest {
    TrackRepository repository;
    TrackStorage storage;
    PlatformTransactionManager manager;
    TrackService service;
    Track track;

    @BeforeEach void setup() {
        repository = mock(TrackRepository.class);
        storage = mock(TrackStorage.class);
        manager = mock(PlatformTransactionManager.class);
        when(manager.getTransaction(any())).thenAnswer(call -> new SimpleTransactionStatus());
        service = new TrackService(repository, storage, manager, mock(TrackArtworkRepository.class));
        track = new Track("测试歌曲", UUID.randomUUID() + ".mp3", "测试歌曲.mp3", 1000);
        ReflectionTestUtils.setField(track, "id", 7L);
        when(repository.findLockedById(7L)).thenReturn(Optional.of(track));
    }

    @Test void deletesOneFileOnlyAfterIntentCommitAndThenRemovesRow() {
        service.delete(7L);
        var order = inOrder(repository, manager, storage);
        order.verify(repository).saveAndFlush(track);
        order.verify(manager).commit(any());
        order.verify(storage).deleteTrackFile(track.getStorageKey());
        order.verify(repository).delete(track);
        verify(storage, times(1)).deleteTrackFile(anyString());
    }

    @Test void unknownIdNeverTouchesDisk() {
        ApiException error = assertThrows(ApiException.class, () -> service.delete(999L));
        assertEquals("TRACK_NOT_FOUND", error.code);
        verifyNoInteractions(storage);
    }

    @Test void uncertainIntentCommitNeverTouchesDisk() {
        doThrow(new DataAccessResourceFailureException("Commit result unknown")).when(manager).commit(any());
        assertEquals("DELETE_FAILED", assertThrows(ApiException.class, () -> service.delete(7L)).code);
        verifyNoInteractions(storage);
        verify(repository, never()).delete(any(Track.class));
    }

    @Test void fileFailureRestoresVisibleTrackAndDoesNotDeleteRow() {
        doThrow(new ApiException(HttpStatus.CONFLICT, "DELETE_FAILED", "File is in use"))
                .when(storage).deleteTrackFile(track.getStorageKey());
        assertEquals("DELETE_FAILED", assertThrows(ApiException.class, () -> service.delete(7L)).code);
        assertFalse(track.isDeleting());
        verify(repository, never()).delete(any(Track.class));
        verify(repository, times(2)).saveAndFlush(track);
    }

    @Test void finalDatabaseFailureRetainsHiddenRecoveryIntent() {
        doNothing().doThrow(new DataAccessResourceFailureException("Database unavailable")).when(manager).commit(any());
        assertDoesNotThrow(() -> service.delete(7L));
        assertTrue(track.isDeleting());
        when(repository.findById(7L)).thenReturn(Optional.of(track));
        assertEquals("TRACK_NOT_FOUND", assertThrows(ApiException.class, () -> service.find(7L)).code);
    }

    @Test void startupRestoresInterruptedDeleteWhenFileStillExists() {
        track.setDeleting(true);
        when(repository.findAllByDeletingTrue()).thenReturn(List.of(track));
        when(storage.existsForDeletionRecovery(track.getStorageKey())).thenReturn(true);
        service.recoverInterruptedDeletions();
        assertFalse(track.isDeleting());
        verify(storage, never()).deleteTrackFile(anyString());
        verify(repository, never()).delete(any(Track.class));
    }

    @Test void startupFinalizesOnlyPendingRowWhenFileIsAlreadyGone() {
        track.setDeleting(true);
        when(repository.findAllByDeletingTrue()).thenReturn(List.of(track));
        when(storage.existsForDeletionRecovery(track.getStorageKey())).thenReturn(false);
        service.recoverInterruptedDeletions();
        verify(repository).delete(track);
        verify(storage, never()).deleteTrackFile(anyString());
    }
}
