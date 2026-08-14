package com.acme.keycloak.oidc.checker.internal;

import static org.junit.Assert.assertNotNull;

import com.liferay.portal.security.sso.openid.connect.persistence.model.OpenIdConnectSession;
import com.liferay.portal.security.sso.openid.connect.persistence.service.persistence.OpenIdConnectSessionPersistence;

import org.junit.Test;

public class OpenIdConnectApiPresenceTest {

    @Test
    public void verifyPublicOidcPersistenceApisAreLoadable() {
        assertNotNull(OpenIdConnectSession.class);
        assertNotNull(OpenIdConnectSessionPersistence.class);

        assertMethod(OpenIdConnectSession.class, "getAccessToken");
        assertMethod(
            OpenIdConnectSession.class, "getAccessTokenExpirationDate");
        assertMethod(OpenIdConnectSession.class, "getSessionId");
        assertMethod(OpenIdConnectSession.class, "getIssuer");
        assertMethod(OpenIdConnectSessionPersistence.class, "findByUserId",
            long.class);
    }

    private static void assertMethod(
        Class<?> type, String methodName, Class<?>... parameterTypes) {

        try {
            type.getMethod(methodName, parameterTypes);
        }
        catch (NoSuchMethodException exception) {
            throw new AssertionError(
                "Target Liferay distribution does not expose " +
                    type.getName() + "#" + methodName,
                exception);
        }
    }
}
