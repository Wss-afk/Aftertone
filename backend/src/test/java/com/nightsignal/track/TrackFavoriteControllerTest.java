package com.nightsignal.track;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import org.junit.jupiter.api.*;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class TrackFavoriteControllerTest {
    TrackService service;
    MockMvc mvc;

    @BeforeEach void setup() {
        service = mock(TrackService.class);
        mvc = MockMvcBuilders.standaloneSetup(new TrackController(service, mock(TrackStorage.class)))
                .setControllerAdvice(new ApiErrors()).build();
    }

    @Test void explicitTrueAndFalseReturnOnlyFavoriteState() throws Exception {
        for (boolean favorite : new boolean[] { true, false }) {
            when(service.setFavorite(7, favorite)).thenReturn(new FavoriteTrackResponse(7, favorite));
            mvc.perform(patch("/api/v1/tracks/7/favorite").contentType(MediaType.APPLICATION_JSON)
                            .content("{\"favorite\":" + favorite + "}"))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(7))
                    .andExpect(jsonPath("$.favorite").value(favorite)).andExpect(jsonPath("$.audioUrl").doesNotExist());
        }
    }

    @Test void malformedOrMissingJsonIsRejected() throws Exception {
        for (String body : new String[] { "", "null", "{", "{\"favorite\":{}}", "{\"favorite\":\"invalid\"}" })
            mvc.perform(patch("/api/v1/tracks/7/favorite").contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_REQUEST"));
        verifyNoInteractions(service);
    }

    @Test void missingStateHasReadable400() throws Exception {
        when(service.setFavorite(7, null)).thenThrow(new ApiException(HttpStatus.BAD_REQUEST, "INVALID_FAVORITE", "请指定是否收藏这首歌。"));
        mvc.perform(patch("/api/v1/tracks/7/favorite").contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_FAVORITE"));
    }

    @Test void notFoundIsPreserved() throws Exception {
        when(service.setFavorite(999, true)).thenThrow(new ApiException(HttpStatus.NOT_FOUND, "TRACK_NOT_FOUND", "没有找到这首歌。"));
        mvc.perform(patch("/api/v1/tracks/999/favorite").contentType(MediaType.APPLICATION_JSON).content("{\"favorite\":true}"))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("TRACK_NOT_FOUND"));
    }
}
