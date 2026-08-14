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

@SuppressWarnings("deprecation")
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

        Object webSessionAttribute = httpSession.getAttribute(
            OpenIdConnectWebKeys.OPEN_ID_CONNECT_SESSION);

        if (!(webSessionAttribute instanceof
                com.liferay.portal.security.sso.openid.connect.OpenIdConnectSession)) {
            return Optional.empty();
        }

        com.liferay.portal.security.sso.openid.connect.OpenIdConnectSession webSession =
            (com.liferay.portal.security.sso.openid.connect.OpenIdConnectSession)
                webSessionAttribute;

        if (webSession.getLoginUserId() != currentUserId) {
            return Optional.empty();
        }

        String accessToken = webSession.getAccessTokenValue();

        if (accessToken == null || accessToken.isBlank()) {
            return Optional.empty();
        }

        OpenIdConnectSession sessionModel = _fetchSessionModel(
            httpSession, currentUserId);

        return Optional.of(
            _toContext(webSession, sessionModel, accessToken));
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

    private OpenIdConnectSession _fetchSessionModel(
        HttpSession httpSession, long currentUserId) {

        Object sessionIdAttribute = httpSession.getAttribute(
            OpenIdConnectWebKeys.OPEN_ID_CONNECT_SESSION_ID);

        if (!(sessionIdAttribute instanceof Long)) {
            return null;
        }

        try {
            OpenIdConnectSession session =
                _openIdConnectSessionLocalService.getOpenIdConnectSession(
                    ((Long)sessionIdAttribute).longValue());

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
        com.liferay.portal.security.sso.openid.connect.OpenIdConnectSession webSession,
        OpenIdConnectSession sessionModel, String accessToken) {

        return new KeycloakTokenContext() {

            @Override
            public String getAuthServerWellKnownURI() {
                if (sessionModel != null) {
                    return sessionModel.getAuthServerWellKnownURI();
                }

                return webSession.getOpenIdProviderName();
            }

            @Override
            public String getClientId() {
                if (sessionModel != null) {
                    return sessionModel.getClientId();
                }

                return null;
            }

            @Override
            public String getIssuer() {
                if (sessionModel != null) {
                    return sessionModel.getIssuer();
                }

                return webSession.getOpenIdProviderName();
            }

            @Override
            public String getSessionId() {
                if (sessionModel != null) {
                    return sessionModel.getSessionId();
                }

                return null;
            }

            @Override
            public long getUserId() {
                return webSession.getLoginUserId();
            }

            @Override
            public Date getAccessTokenExpirationDate() {
                if (sessionModel != null) {
                    return sessionModel.getAccessTokenExpirationDate();
                }

                return null;
            }

            @Override
            public boolean hasAccessToken() {
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
