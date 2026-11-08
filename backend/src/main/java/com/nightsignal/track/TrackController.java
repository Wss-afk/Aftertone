package com.nightsignal.track;

import java.io.IOException;
import java.net.URI;
import java.util.List;
import org.springframework.core.io.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v1/tracks")
public class TrackController {
    private final TrackService service;
    private final TrackStorage storage;

    public TrackController(TrackService service, TrackStorage storage) {
        this.service = service;
        this.storage = storage;
    }

    @GetMapping
    public List<TrackResponse> list() { return service.list(); }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<TrackResponse> upload(@RequestPart("file") MultipartFile file,
            @RequestParam(defaultValue = "false") boolean skipDuplicates) {
        TrackResponse track = service.upload(file, skipDuplicates);
        return ResponseEntity.created(URI.create("/api/v1/tracks/" + track.id())).body(track);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    @PatchMapping(value = "/{id}", consumes = MediaType.APPLICATION_JSON_VALUE)
    public TrackResponse rename(@PathVariable long id, @RequestBody RenameTrackRequest request) {
        return service.rename(id, request.title(), request.artist(), request.album());
    }

    @PutMapping(value = "/{id}/information", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public TrackResponse information(@PathVariable long id, @RequestParam String title,
            @RequestParam String artist, @RequestParam String album,
            @RequestPart(value = "cover", required = false) MultipartFile cover,
            @RequestParam(defaultValue = "false") boolean removeCover) {
        return service.updateInformation(id, title, artist, album, cover, removeCover);
    }

    @PatchMapping(value = "/{id}/favorite", consumes = MediaType.APPLICATION_JSON_VALUE)
    public FavoriteTrackResponse favorite(@PathVariable long id, @RequestBody FavoriteTrackRequest request) {
        return service.setFavorite(id, request.favorite());
    }

    @GetMapping("/{id}/cover")
    public ResponseEntity<byte[]> cover(@PathVariable long id, @RequestParam(value = "v", required = false) String version) {
        return ResponseEntity.ok().contentType(MediaType.IMAGE_JPEG)
                .header("X-Content-Type-Options", "nosniff")
                .header(HttpHeaders.CACHE_CONTROL, "private, no-cache")
                .body(service.cover(id, version));
    }

    @GetMapping("/{id}/audio")
    public ResponseEntity<?> audio(@PathVariable long id,
            @RequestHeader(value = "Range", required = false) String range) throws IOException {
        Track track = service.find(id);
        Resource resource = new FileSystemResource(storage.read(track.getStorageKey()));
        long length = resource.contentLength();
        if (range != null) {
            try {
                if (HttpRange.parseRanges(range).isEmpty()) throw new IllegalArgumentException();
                HttpRange.toResourceRegions(HttpRange.parseRanges(range), resource);
            } catch (IllegalArgumentException e) {
                return ResponseEntity.status(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
                        .header(HttpHeaders.CONTENT_RANGE, "bytes */" + length)
                        .header(HttpHeaders.ACCEPT_RANGES, "bytes").build();
            }
        }
        return ResponseEntity.ok().contentType(MediaType.parseMediaType("audio/mpeg"))
                .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                .header(HttpHeaders.CACHE_CONTROL, "private, max-age=3600")
                .body(resource);
    }
}
