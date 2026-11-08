package com.nightsignal.track;

import java.time.Instant;

public record TrackResponse(long id, String title, String artist, String originalFilename, long sizeBytes,
                            Instant createdAt, String audioUrl, String album, Double durationSeconds, String coverUrl, boolean favorite) {
    public static TrackResponse from(Track track) {
        return new TrackResponse(track.getId(), track.getTitle(), track.getArtist(), track.getOriginalFilename(),
                track.getSizeBytes(), track.getCreatedAt(), "/api/v1/tracks/" + track.getId() + "/audio",
                track.getAlbum(), track.getDurationSeconds(), track.getCoverVersion() == null ? null :
                "/api/v1/tracks/" + track.getId() + "/cover?v=" + track.getCoverVersion(), track.isFavorite());
    }
}
