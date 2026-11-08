package com.nightsignal.track;

import java.util.List;
import java.util.Optional;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface TrackRepository extends JpaRepository<Track, Long> {
    List<Track> findAllByDeletingFalseOrderByCreatedAtDescIdDesc();
    List<Track> findAllByDeletingTrue();
    List<Track> findAllByDeletingFalseAndDetailsScannedFalse();

    @Query("""
            select t from Track t where t.deleting = false and
            (t.sourceSha256 = :digest or (t.sourceSha256 is null and t.sizeBytes = :size))
            """)
    List<Track> findPossibleDuplicates(@Param("digest") String digest, @Param("size") long size);

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select t from Track t where t.id = :id")
    Optional<Track> findLockedById(@Param("id") long id);
}
