package com.acme.keycloak.saml.checker.internal;

import static org.junit.Assert.assertNotNull;

import com.liferay.saml.persistence.service.SamlSpSessionLocalService;
import com.liferay.saml.runtime.servlet.profile.WebSsoProfile;

import org.junit.Test;

public class SamlApiPresenceTest {

    @Test
    public void verifyPublicSamlApisAreLoadable() {
        assertNotNull(WebSsoProfile.class);
        assertNotNull(SamlSpSessionLocalService.class);

        // Compile-time references below deliberately pin the exact methods used
        // by the module. The test remains lightweight and does not need a live
        // Liferay runtime.
        try {
            WebSsoProfile.class.getMethod(
                "getSamlSpSession",
                jakarta.servlet.http.HttpServletRequest.class);

            SamlSpSessionLocalService.class.getMethod(
                "getSamlSpSessionByJSessionId", String.class);
        }
        catch (NoSuchMethodException exception) {
            throw new AssertionError(
                "Target Liferay distribution does not expose the expected SAML APIs",
                exception);
        }
    }
}
