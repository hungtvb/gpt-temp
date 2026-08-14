package com.acme.keycloak.oidc.checker.internal.filter;

import com.liferay.portal.kernel.util.PortalUtil;
import com.liferay.portal.security.sso.openid.connect.persistence.model.OpenIdConnectSession;
import com.liferay.portal.security.sso.openid.connect.persistence.service.persistence.OpenIdConnectSessionPersistence;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.FilterConfig;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;

import java.io.IOException;
import java.util.List;

import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Reference;

@Component(
    property = {
        "servlet-filter-name=Custom OpenID Connect Session Checker",
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

        long userId = PortalUtil.getUserId(request);

        if (userId > 0) {
            List<OpenIdConnectSession> sessions =
                _openIdConnectSessionPersistence.findByUserId(userId);

            for (OpenIdConnectSession session : sessions) {
                // Inspect only non-sensitive metadata here.
                // session.getClientId();
                // session.getAuthServerWellKnownURI();
                // session.getUserId();
                // session.getOpenIdConnectSessionId();
                // Do not log access/refresh tokens or ID token contents.
            }
        }

        chain.doFilter(request, response);
    }

    @Reference
    private OpenIdConnectSessionPersistence _openIdConnectSessionPersistence;
}
