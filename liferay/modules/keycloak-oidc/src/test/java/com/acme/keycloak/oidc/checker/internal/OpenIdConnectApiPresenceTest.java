package com.acme.keycloak.oidc.checker.internal;

import static org.junit.Assert.assertNotNull;

import com.acme.keycloak.oidc.api.KeycloakTokenContextService;
import com.liferay.portal.security.sso.openid.connect.persistence.model.OpenIdConnectSession;
import com.liferay.portal.security.sso.openid.connect.persistence.service.persistence.OpenIdConnectSessionPersistence;

import org.junit.Test;

import jakarta.servlet.http.HttpServletRequest;

public class OpenIdConnectApiPresenceTest {

    @Test
    public void verifyPublicApisAreLoadable() {
        assertNotNull(OpenIdConnectSession.class);
        assertNotNull(OpenIdConnectSessionPersistence.class);
        assertNotNull(KeycloakTokenContextService.class);

        assertMethod(OpenIdConnectSession.class, "getAccessToken");
        assertMethod(
            OpenIdConnectSession.class, "getAccessTokenExpirationDate");
        assertMethod(OpenIdConnectSession.class, "getSessionId");
        assertMethod(OpenIdConnectSession.class, "getIssuer");
        assertMethod(
            OpenIdConnectSessionPersistence.class, "findByUserId",
            long.class);
        assertMethod(
            KeycloakTokenContextService.class, "getCurrent",
            HttpServletRequest.class);
        assertMethod(
            KeycloakTokenContextService.class, "hasKeycloakToken",
            HttpServletRequest.class, String.class);
    }

    private static void assertMethod(
        Class<?> type, String methodName, Class<?>... parameterTypes) {

        try {
            type.getMethod(methodName, parameterTypes);
        }
        catch (NoSuchMethodException exception) {
            throw new AssertionError(
                "Target distribution does not expose " +
                    type.getName() + "#" + methodName,
                exception);
        }
    }
}
