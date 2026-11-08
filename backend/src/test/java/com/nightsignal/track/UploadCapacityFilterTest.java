package com.nightsignal.track;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.*;
import org.springframework.web.servlet.*;

class UploadCapacityFilterTest {
    @Test void lowCapacityStopsBeforeMultipartProcessing() throws Exception {
        StorageCapacity capacity = mock(StorageCapacity.class);
        HandlerExceptionResolver errors = mock(HandlerExceptionResolver.class);
        ApiException low = new ApiException(HttpStatus.INSUFFICIENT_STORAGE, "INSUFFICIENT_STORAGE", "Low disk space");
        doThrow(low).when(capacity).requireUploadSpace();
        when(errors.resolveException(any(), any(), isNull(), same(low))).thenAnswer(call -> {
            ((jakarta.servlet.http.HttpServletResponse) call.getArgument(1)).setStatus(507);
            return new ModelAndView();
        });
        var request = new MockHttpServletRequest("POST", "/api/v1/tracks");
        var response = new MockHttpServletResponse();
        var chain = new MockFilterChain();
        new UploadCapacityFilter(capacity, errors).doFilter(request, response, chain);
        assertEquals(507, response.getStatus());
        assertNull(chain.getRequest());
        verify(errors).resolveException(request, response, null, low);
    }

    @Test void healthyCapacityAllowsUpload() throws Exception {
        StorageCapacity capacity = mock(StorageCapacity.class);
        var request = new MockHttpServletRequest("POST", "/api/v1/tracks");
        var chain = new MockFilterChain();
        new UploadCapacityFilter(capacity, mock(HandlerExceptionResolver.class)).doFilter(request, new MockHttpServletResponse(), chain);
        assertSame(request, chain.getRequest());
    }

    @Test void readingPlayingAndDeletingRemainAvailableAtLowCapacity() throws Exception {
        StorageCapacity capacity = mock(StorageCapacity.class);
        var filter = new UploadCapacityFilter(capacity, mock(HandlerExceptionResolver.class));
        var list = new MockFilterChain();
        filter.doFilter(new MockHttpServletRequest("GET", "/api/v1/tracks"), new MockHttpServletResponse(), list);
        var deletion = new MockFilterChain();
        filter.doFilter(new MockHttpServletRequest("DELETE", "/api/v1/tracks/1"), new MockHttpServletResponse(), deletion);
        assertNotNull(list.getRequest());
        assertNotNull(deletion.getRequest());
        verifyNoInteractions(capacity);
    }
}
