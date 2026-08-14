package com.acme.keycloak.oidc.api;

import jakarta.servlet.http.HttpServletRequest;

import java.util.Optional;

import org.osgi.annotation.versioning.ProviderType;

/**
 * Resolves OIDC token state for the currently authenticated Liferay user
 * and HTTP session.
 */
@ProviderType
public interface KeycloakTokenContextService {

    Optional<KeycloakTokenContext> getCurrent(HttpServletRequest request);
}
