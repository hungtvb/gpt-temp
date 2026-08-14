package com.acme.keycloak.oidc.checker.internal.resource;

import com.acme.keycloak.oidc.api.KeycloakTokenContext;
import com.acme.keycloak.oidc.api.KeycloakTokenContextService;
import com.liferay.portal.kernel.json.JSONFactoryUtil;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import java.util.LinkedHashMap;
import java.util.Map;

import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Reference;

/**
 * Diagnostic REST endpoint for the local OIDC POC.
 * This endpoint intentionally exposes the token response for local testing.
 * Do not deploy this endpoint to a shared or production environment.
 */
@Component(
    property = {
        "osgi.jaxrs.application.select=(osgi.jaxrs.name=com.acme.keycloak.oidc)",
        "osgi.jaxrs.resource=true"
    },
    service = Object.class
)
@Path("/token-context")
@Produces(MediaType.APPLICATION_JSON)
public class KeycloakTokenContextResource {

    @GET
    public Response getContext(@Context HttpServletRequest request) {
        KeycloakTokenContext context =
            _keycloakTokenContextService.getCurrent(request).orElse(null);

        Map<String, Object> body = new LinkedHashMap<>();

        if (context == null) {
            body.put("authenticated", false);
            body.put("keycloak", false);
            body.put("hasAccessToken", false);
        }
        else {
            body.put("authenticated", true);
            body.put("keycloak", true);
            body.put("hasAccessToken", context.hasAccessToken());
            body.put("expired", context.isAccessTokenExpired());
            body.put("issuer", context.getIssuer());
            body.put("clientId", context.getClientId());
            body.put("userId", context.getUserId());
            body.put("sessionId", context.getSessionId());
            body.put("authServerWellKnownURI", context.getAuthServerWellKnownURI());
            body.put(
                "accessTokenExpirationDate",
                context.getAccessTokenExpirationDate());
            body.put("accessToken", _deserializeAccessToken(context.getAccessToken()));
        }

        return Response.ok(body)
            .type(MediaType.APPLICATION_JSON)
            .build();
    }

    private Object _deserializeAccessToken(String accessToken) {
        if (accessToken == null || accessToken.isBlank()) {
            return null;
        }

        try {
            return JSONFactoryUtil.looseDeserialize(accessToken);
        }
        catch (RuntimeException runtimeException) {
            // Keep the original value if the stored value is not a JSON object.
            return accessToken;
        }
    }

    @Reference
    private KeycloakTokenContextService _keycloakTokenContextService;
}
