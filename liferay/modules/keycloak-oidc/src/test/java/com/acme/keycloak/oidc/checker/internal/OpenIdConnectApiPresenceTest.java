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

        try {
            OpenIdConnectSessionPersistence.class.getMethod(
                "findByUserId", long.class);
        }
        catch (NoSuchMethodException exception) {
            throw new AssertionError(
                "Target Liferay distribution does not expose the expected OIDC session API",
                exception);
        }
    }
}
