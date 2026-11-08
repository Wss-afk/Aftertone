package com.nightsignal.track;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.*;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

class TrackRenameServiceTest {
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
        track = new Track("旧歌名", UUID.randomUUID() + ".mp3", "原文件.mp3", 1000);
        ReflectionTestUtils.setField(track, "id", 7L);
        when(repository.findLockedById(7L)).thenReturn(Optional.of(track));
        when(repository.saveAndFlush(track)).thenReturn(track);
    }

    @Test void renamesOnlyTitleAndCommitsWithoutTouchingAudio() {
        String key = track.getStorageKey();
        var created = track.getCreatedAt();
        TrackResponse result = service.rename(7L, "\u00a0　 夜航 · 新名字 🎵 　");
        assertEquals("夜航 · 新名字 🎵", result.title());
        assertEquals("原文件.mp3", result.originalFilename());
        assertEquals(1000, result.sizeBytes());
        assertEquals(created, result.createdAt());
        assertEquals(key, track.getStorageKey());
        assertFalse(track.isDeleting());
        verify(manager).commit(any());
        verifyNoInteractions(storage);
    }

    @Test void accepts255UnicodeCharactersIncludingEmoji() {
        String title = "🎵".repeat(255);
        assertEquals(title, service.rename(7L, title).title());
    }

    @Test void savesTrimmedArtistAndAllowsClearingIt() {
        TrackResponse result = service.rename(7L, "新歌名", "　 歌手 🎵　");
        assertEquals("歌手 🎵", result.artist());
        assertEquals("", service.rename(7L, "新歌名", "　").artist());
        verifyNoInteractions(storage);
    }

    @Test void titleOnlyRequestPreservesExistingArtist() {
        track.setArtist("原歌手");
        assertEquals("原歌手", service.rename(7L, "新歌名").artist());
    }

    @Test void rejectsInvalidArtistBeforeChangingEitherField() {
        for (String artist : new String[] { "🎵".repeat(256), "甲\n乙", "甲\u0000乙" }) {
            assertEquals("INVALID_ARTIST", assertThrows(ApiException.class, () -> service.rename(7L, "新歌名", artist)).code);
        }
        assertEquals("旧歌名", track.getTitle());
        verifyNoInteractions(repository, storage, manager);
    }

    @Test void rejectsMissingBlankLongAndControlTitlesBeforeDatabaseWork() {
        for (String title : new String[] { null, "", " \u00a0　\n", "歌".repeat(256), "🎵".repeat(256), "甲\n乙", "甲\u0000乙" }) {
            ApiException error = assertThrows(ApiException.class, () -> service.rename(7L, title));
            assertEquals(HttpStatus.BAD_REQUEST, error.status);
            assertEquals("INVALID_TITLE", error.code);
        }
        verifyNoInteractions(repository, storage, manager);
    }

    @Test void missingTrackReturns404() {
        ApiException error = assertThrows(ApiException.class, () -> service.rename(999L, "新名字"));
        assertEquals(HttpStatus.NOT_FOUND, error.status);
        verify(repository, never()).saveAndFlush(any());
        verifyNoInteractions(storage);
    }

    @Test void deletingTrackCannotBeRenamedOrRestored() {
        track.setDeleting(true);
        assertEquals("TRACK_NOT_FOUND", assertThrows(ApiException.class, () -> service.rename(7L, "新名字")).code);
        assertEquals("旧歌名", track.getTitle());
        assertTrue(track.isDeleting());
        verify(repository, never()).saveAndFlush(any());
    }

    @Test void saveFailureReportsRenameProblemAndRollsBack() {
        when(repository.saveAndFlush(track)).thenThrow(new DataAccessResourceFailureException("Unavailable"));
        assertEquals("RENAME_FAILED", assertThrows(ApiException.class, () -> service.rename(7L, "新名字")).code);
        verify(manager).rollback(any());
        verifyNoInteractions(storage);
    }

    @Test void uncertainCommitAsksUserToRefreshBeforeRetry() {
        doThrow(new DataAccessResourceFailureException("Commit uncertain")).when(manager).commit(any());
        ApiException error = assertThrows(ApiException.class, () -> service.rename(7L, "新名字"));
        assertEquals("RENAME_FAILED", error.code);
        assertTrue(error.getMessage().contains("刷新曲库确认"));
        verifyNoInteractions(storage);
    }
}
