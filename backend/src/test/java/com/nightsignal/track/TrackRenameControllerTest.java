package com.nightsignal.track;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class TrackRenameControllerTest {
    TrackService service;
    MockMvc mvc;

    @BeforeEach void setup() {
        service = mock(TrackService.class);
        mvc = MockMvcBuilders.standaloneSetup(new TrackController(service, mock(TrackStorage.class)))
                .setControllerAdvice(new ApiErrors()).build();
    }

    @Test void acceptsJsonPatchAndReturnsUpdatedTrack() throws Exception {
        when(service.rename(7L, "新名字", "歌手", null)).thenReturn(new TrackResponse(7L, "新名字", "歌手", "原文件.mp3", 1000,
                Instant.parse("2026-11-06T00:00:00Z"), "/api/v1/tracks/7/audio", "", 120.0, null, false));
        mvc.perform(patch("/api/v1/tracks/7").contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"新名字\",\"artist\":\"歌手\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.title").value("新名字"))
                .andExpect(jsonPath("$.artist").value("歌手"))
                .andExpect(jsonPath("$.audioUrl").value("/api/v1/tracks/7/audio"));
    }

    @Test void malformedOrMissingJsonReturnsReadable400() throws Exception {
        for (String body : new String[] { "", "null", "{", "{\"title\":{}}" }) {
            mvc.perform(patch("/api/v1/tracks/7").contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isBadRequest()).andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                    .andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        }
        verifyNoInteractions(service);
    }

    @Test void preservesNotFoundProblem() throws Exception {
        when(service.rename(7L, "新名字", null, null)).thenThrow(new ApiException(HttpStatus.NOT_FOUND, "TRACK_NOT_FOUND", "没有找到这首歌。"));
        mvc.perform(patch("/api/v1/tracks/7").contentType(MediaType.APPLICATION_JSON).content("{\"title\":\"新名字\"}"))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("TRACK_NOT_FOUND"));
    }
}
