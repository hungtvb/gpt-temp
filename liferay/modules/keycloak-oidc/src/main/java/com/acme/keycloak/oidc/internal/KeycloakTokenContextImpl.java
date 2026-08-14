package com.acme.keycloak.oidc.internal;

import com.acme.keycloak.oidc.api.KeycloakTokenContext;
import com.acme.keycloak.oidc.api.KeycloakTokenContextService;
import com.liferay.portal.kernel.exception.PortalException;
import com.liferay.portal.kernel.util.PortalUtil;
import com.liferay.portal.security.sso.openid.connect.constants.OpenIdConnectWebKeys;
import com.liferay.portal.security.sso.openid.connect.persistence.model.OpenIdConnectSession;
import com.liferay.portal.security.sso.openid.connect.persistence.service.OpenIdConnectSessionLocalService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;

import java.util.Date;
import java.util.Optional;

import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Reference;

@Component(service = KeycloakTokenContextService.class)
public class KeycloakTokenContextImpl implements KeycloakTokenContextService {

    @Override
    public Optional<KeycloakTokenContext> getCurrent(
        HttpServletRequest request) {

        if (request == null) {
            return Optional.empty();
        }

        HttpServletRequest originalRequest =
            PortalUtil.getOriginalServletRequest(request);

        long currentUserId = PortalUtil.getUserId(originalRequest);

        if (currentUserId <= 0) {
            return Optional.empty();
        }

        HttpSession httpSession = originalRequest.getSession(false);

        if (httpSession == null) {
            return Optional.empty();
        }

        Object sessionIdAttribute = httpSession.getAttribute(
            OpenIdConnectWebKeys.OPEN_ID_CONNECT_SESSION_ID);

        if (!(sessionIdAttribute instanceof Long)) {
            return Optional.empty();
        }

        OpenIdConnectSession session = _fetchSession(
            ((Long)sessionIdAttribute).longValue(), currentUserId);

        if (session == null) {
            return Optional.empty();
        }

        String accessToken = session.getAccessTokenValue();

        if (accessToken == null || accessToken.isBlank()) {
            return Optional.empty();
        }

        return Optional.of(_toContext(session, accessToken));
    }

    @Override
    public boolean hasKeycloakToken(
        HttpServletRequest request, String keycloakIssuer) {

        return getCurrent(request).map(
            context -> context.hasAccessToken() &&
                !context.isAccessTokenExpired() &&
                context.isKeycloak(keycloakIssuer)
        ).orElse(false);
    }

    private OpenIdConnectSession _fetchSession(
        long sessionPrimaryKey, long currentUserId) {

        try {
            OpenIdConnectSession session =
                _openIdConnectSessionLocalService.getOpenIdConnectSession(
                    sessionPrimaryKey);

            if (session.getUserId() != currentUserId) {
                return null;
            }

            return session;
        }
        catch (PortalException portalException) {
            return null;
        }
    }

    private KeycloakTokenContext _toContext(
        OpenIdConnectSession session, String accessToken) {

        return new KeycloakTokenContext() {

            @Override
            public String getAuthServerWellKnownURI() {
                return session.getAuthServerWellKnownURI();
            }

            @Override
            public String getClientId() {
                return session.getClientId();
            }

            @Override
            public String getIssuer() {
                return session.getIssuer();
            }

            @Override
            public String getSessionId() {
                return session.getSessionId();
            }

            @Override
            public long getUserId() {
                return session.getUserId();
            }

            @Override
            public Date getAccessTokenExpirationDate() {
                return session.getAccessTokenExpirationDate();
            }

            @Override
            public boolean hasAccessToken() {
                return accessToken != null && !accessToken.isBlank();
            }

            @Override
            public boolean isAccessTokenExpired() {
                Date expirationDate = session.getAccessTokenExpirationDate();

                return expirationDate != null &&
                    expirationDate.before(new Date());
            }

            @Override
            public boolean isKeycloak(String keycloakIssuer) {
                if (keycloakIssuer == null || keycloakIssuer.isBlank()) {
                    return false;
                }

                return keycloakIssuer.equals(session.getIssuer());
            }
        };
    }

    @Reference
    private OpenIdConnectSessionLocalService _openIdConnectSessionLocalService;
}
