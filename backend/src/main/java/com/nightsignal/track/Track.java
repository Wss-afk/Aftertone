package com.nightsignal.track;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "tracks")
public class Track {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(nullable = false, length = 255)
    private String title;
    @Column(nullable = false, length = 255)
    private String artist = "";
    @Column(nullable = false, length = 255)
    private String album = "";
    private Double durationSeconds;
    @Column(length = 36)
    private String coverVersion;
    @Column(nullable = false)
    private boolean detailsScanned;
    @Column(nullable = false)
    private boolean favorite;
    @Column(nullable = false, unique = true, length = 40)
    private String storageKey;
    @Column(nullable = false, length = 255)
    private String originalFilename;
    @Column(nullable = false, length = 64)
    private String mimeType;
    @Column(nullable = false)
    private long sizeBytes;
    @Column(length = 64)
    private String sourceSha256;
    @Column(nullable = false, columnDefinition = "DATETIME(6)")
    private Instant createdAt;
    @Column(nullable = false)
    private boolean deleting;

    protected Track() {}

    public Track(String title, String storageKey, String originalFilename, long sizeBytes) {
        this.title = title;
        this.storageKey = storageKey;
        this.originalFilename = originalFilename;
        this.mimeType = "audio/mpeg";
        this.sizeBytes = sizeBytes;
        this.createdAt = Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS);
        this.detailsScanned = true;
    }

    public Long getId() { return id; }
    public String getTitle() { return title; }
    void rename(String title) { this.title = title; }
    public String getArtist() { return artist; }
    void setArtist(String artist) { this.artist = artist; }
    public String getAlbum() { return album; }
    void setAlbum(String album) { this.album = album; }
    public Double getDurationSeconds() { return durationSeconds; }
    void setDurationSeconds(Double duration) { this.durationSeconds = duration; }
    public String getCoverVersion() { return coverVersion; }
    void setCoverVersion(String version) { this.coverVersion = version; }
    public boolean isDetailsScanned() { return detailsScanned; }
    void setDetailsScanned(boolean scanned) { this.detailsScanned = scanned; }
    public boolean isFavorite() { return favorite; }
    void setFavorite(boolean favorite) { this.favorite = favorite; }
    public String getStorageKey() { return storageKey; }
    public String getOriginalFilename() { return originalFilename; }
    public String getMimeType() { return mimeType; }
    public long getSizeBytes() { return sizeBytes; }
    String getSourceSha256() { return sourceSha256; }
    void setSourceSha256(String sourceSha256) { this.sourceSha256 = sourceSha256; }
    public Instant getCreatedAt() { return createdAt; }
    public boolean isDeleting() { return deleting; }
    public void setDeleting(boolean deleting) { this.deleting = deleting; }
}
