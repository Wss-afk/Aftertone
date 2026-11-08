package com.nightsignal.track;

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/storage")
public class StorageController {
    private final StorageCapacity capacity;
    public StorageController(StorageCapacity capacity) { this.capacity = capacity; }

    @GetMapping
    public StorageCapacity.Snapshot status() { return capacity.snapshot(); }
}
