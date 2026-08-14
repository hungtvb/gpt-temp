package com.acme.keycloak.oidc.api;

import java.util.Date;

/**
 * Snapshot of the Keycloak/OIDC token state associated with the current
 * Liferay user HTTP session.
 *
 * <p>The raw access token is intentionally not exposed by this API.</p>
 */
public interface KeycloakTokenContext {

    String REQUEST_ATTRIBUTE = KeycloakTokenContext.class.getName();

    String getAuthServerWellKnownURI();

    String getClientId();

    String getIssuer();

    String getSessionId();

    long getUserId();

    Date getAccessTokenExpirationDate();

    boolean hasAccessToken();

    boolean isAccessTokenExpired();

    boolean isKeycloak(String keycloakIssuer);
}
