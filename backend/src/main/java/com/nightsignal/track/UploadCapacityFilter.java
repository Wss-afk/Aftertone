package com.nightsignal.track;

import java.io.IOException;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.servlet.HandlerExceptionResolver;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class UploadCapacityFilter extends OncePerRequestFilter {
    private final StorageCapacity capacity;
    private final HandlerExceptionResolver errors;

    public UploadCapacityFilter(StorageCapacity capacity,
            @Qualifier("handlerExceptionResolver") HandlerExceptionResolver errors) {
        this.capacity = capacity;
        this.errors = errors;
    }

    @Override protected boolean shouldNotFilter(HttpServletRequest request) {
        return !"POST".equals(request.getMethod())
                || !request.getRequestURI().equals(request.getContextPath() + "/api/v1/tracks");
    }

    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        try { capacity.requireUploadSpace(); }
        catch (ApiException e) {
            // Reject before Spring parses/stages the multipart body, using the normal problem response.
            if (errors.resolveException(request, response, null, e) == null) response.sendError(e.status.value(), e.getMessage());
            return;
        }
        chain.doFilter(request, response);
    }
}
