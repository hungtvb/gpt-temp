package com.acme.keycloak.oidc.api;

import jakarta.servlet.http.HttpServletRequest;

import java.util.Optional;

import org.osgi.annotation.versioning.ProviderType;

/**
 * Resolves Keycloak/OIDC token state for the currently authenticated Liferay
 * user and HTTP session.
 */
@ProviderType
public interface KeycloakTokenContextService {

    /**
     * Returns the Keycloak/OIDC token context associated with the current
     * Liferay user and HTTP session.
     */
    Optional<KeycloakTokenContext> getCurrent(HttpServletRequest request);

    /**
     * Returns true when the current Liferay user/session has an access token
     * issued by the expected Keycloak issuer.
     */
    boolean hasKeycloakToken(
        HttpServletRequest request, String keycloakIssuer);
}
