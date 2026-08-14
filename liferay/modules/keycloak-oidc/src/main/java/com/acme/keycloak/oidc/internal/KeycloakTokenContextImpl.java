package com.acme.keycloak.oidc.internal;

import com.acme.keycloak.oidc.api.KeycloakTokenContext;
import com.acme.keycloak.oidc.api.KeycloakTokenContextService;
import com.liferay.portal.kernel.exception.PortalException;
import com.liferay.portal.kernel.util.PortalUtil;
import com.liferay.portal.security.sso.openid.connect.constants.OpenIdConnectWebKeys;
import com.liferay.portal.security.sso.openid.connect.persistence.model.OpenIdConnectSession;
import com.liferay.portal.security.sso.openid.connect.persistence.service.OpenIdConnectSessionLocalService;

import jakarta.servlet.http.HttpServletRequest;

import java.util.Date;
import java.util.Optional;

import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Reference;

@Component(service = KeycloakTokenContextService.class)
public class KeycloakTokenContextImpl implements KeycloakTokenContextService {

    @Override
    public Optional<KeycloakTokenContext> getCurrent(
        HttpServletRequest request) {

        if (request == null || PortalUtil.getUserId(request) <= 0) {
            return Optional.empty();
        }

        Object sessionIdAttribute = request.getAttribute(
            OpenIdConnectWebKeys.OPEN_ID_CONNECT_SESSION_ID);

        if (!(sessionIdAttribute instanceof String)) {
            return Optional.empty();
        }

        String openIdConnectSessionId = (String)sessionIdAttribute;

        if (openIdConnectSessionId.isBlank()) {
            return Optional.empty();
        }

        try {
            OpenIdConnectSession session =
                _openIdConnectSessionLocalService.getOpenIdConnectSession(
                    openIdConnectSessionId);

            if (session.getUserId() != PortalUtil.getUserId(request)) {
                return Optional.empty();
            }

            return Optional.of(toContext(session));
        }
        catch (PortalException portalException) {
            return Optional.empty();
        }
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

    private static KeycloakTokenContext toContext(
        OpenIdConnectSession session) {

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
                String accessToken = session.getAccessToken();

                return accessToken != null && !accessToken.isBlank();
            }

            @Override
            public boolean isAccessTokenExpired() {
                Date expirationDate = getAccessTokenExpirationDate();

                return expirationDate != null &&
                    expirationDate.before(new Date());
            }

            @Override
            public boolean isKeycloak(String keycloakIssuer) {
                if (keycloakIssuer == null || keycloakIssuer.isBlank()) {
                    return false;
                }

                return keycloakIssuer.equals(getIssuer());
            }
        };
    }

    @Reference
    private OpenIdConnectSessionLocalService _openIdConnectSessionLocalService;
}
