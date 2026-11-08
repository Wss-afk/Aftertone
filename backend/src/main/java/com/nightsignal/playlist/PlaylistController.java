package com.nightsignal.playlist;

import java.util.List;
import com.nightsignal.playlist.PlaylistService.Playlist;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/playlists")
public class PlaylistController {
    private final PlaylistService service;

    public PlaylistController(PlaylistService service) { this.service = service; }

    public record PlaylistName(String name) {}

    @GetMapping
    public List<Playlist> list() { return service.list(); }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Playlist create(@RequestBody PlaylistName request) { return service.create(request.name()); }

    @PatchMapping("/{id}")
    public Playlist rename(@PathVariable long id, @RequestBody PlaylistName request) { return service.rename(id, request.name()); }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable long id) { service.delete(id); }

    @PutMapping("/{id}/tracks/{trackId}")
    public Playlist add(@PathVariable long id, @PathVariable long trackId) { return service.addTrack(id, trackId); }

    @DeleteMapping("/{id}/tracks/{trackId}")
    public Playlist remove(@PathVariable long id, @PathVariable long trackId) { return service.removeTrack(id, trackId); }
}
