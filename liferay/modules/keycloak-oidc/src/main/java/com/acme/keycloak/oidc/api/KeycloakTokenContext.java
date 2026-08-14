package com.acme.keycloak.oidc.api;

import java.util.Date;

/**
 * Snapshot of the Keycloak/OIDC token state associated with the current
 * Liferay user HTTP session.
 *
 * <p>POC API: exposes the raw access token and decoded JWT parts for local
 * development testing only. Do not expose this API through an untrusted
 * endpoint in production.</p>
 */
public interface KeycloakTokenContext {

    String REQUEST_ATTRIBUTE = KeycloakTokenContext.class.getName();

    String getAuthServerWellKnownURI();

    String getClientId();

    String getIssuer();

    String getSessionId();

    long getUserId();

    Date getAccessTokenExpirationDate();

    String getAccessToken();

    String getAccessTokenHeader();

    String getAccessTokenPayload();

    String getAccessTokenSignature();

    boolean hasAccessToken();

    boolean isAccessTokenExpired();

    boolean isKeycloak(String keycloakIssuer);
}
