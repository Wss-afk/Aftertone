package com.nightsignal.track;

import jakarta.persistence.*;

@Entity
@Table(name = "track_artwork")
public class TrackArtwork {
    @Id private Long trackId;
    @Lob @Column(nullable = false, columnDefinition = "LONGBLOB") private byte[] imageData;

    protected TrackArtwork() {}
    TrackArtwork(long trackId, byte[] imageData) { this.trackId = trackId; this.imageData = imageData; }
    public byte[] getImageData() { return imageData; }
}
