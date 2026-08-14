package com.acme.keycloak.oidc.checker.internal.resource;

import com.acme.keycloak.oidc.api.KeycloakTokenContext;
import com.acme.keycloak.oidc.api.KeycloakTokenContextService;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import jakarta.servlet.http.HttpServletRequest;

import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Reference;

/**
 * Diagnostic REST endpoint for verifying the current Liferay OIDC context.
 * Never returns the raw access token.
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
    public Response getContext() {
        KeycloakTokenContext context =
            _keycloakTokenContextService.getCurrent(_request).orElse(null);

        if (context == null) {
            return Response.ok(
                "{\"authenticated\":false,\"keycloak\":false,\"hasAccessToken\":false}"
            ).build();
        }

        String json = String.format(
            "{\"authenticated\":true,\"keycloak\":true,\"hasAccessToken\":%s,\"expired\":%s,\"issuer\":%s,\"clientId\":%s,\"userId\":%d}",
            context.hasAccessToken(),
            context.isAccessTokenExpired(),
            quote(context.getIssuer()),
            quote(context.getClientId()),
            context.getUserId());

        return Response.ok(json).build();
    }

    private String quote(String value) {
        if (value == null) {
            return "null";
        }

        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
    }

    @Reference
    private KeycloakTokenContextService _keycloakTokenContextService;

    @Reference
    private HttpServletRequest _request;
}
