package com.acme.keycloak.oidc.checker.internal.filter;

import com.acme.keycloak.oidc.api.KeycloakTokenContext;
import com.acme.keycloak.oidc.api.KeycloakTokenContextService;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.FilterConfig;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;

import java.io.IOException;

import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Reference;

@Component(
    property = {
        "servlet-filter-name=Keycloak Token Context Filter",
        "dispatcher=REQUEST",
        "url-pattern=/*"
    },
    service = Filter.class
)
public class OpenIdConnectSessionCheckerFilter implements Filter {

    @Override
    public void doFilter(
            ServletRequest request, ServletResponse response,
            FilterChain chain)
        throws IOException, ServletException {

        HttpServletRequest httpServletRequest =
            (HttpServletRequest)request;

        _keycloakTokenContextService.getCurrent(httpServletRequest).ifPresent(
            context -> request.setAttribute(
                KeycloakTokenContext.REQUEST_ATTRIBUTE, context));

        chain.doFilter(request, response);
    }

    @Reference
    private KeycloakTokenContextService _keycloakTokenContextService;
}
