package com.acme.keycloak.oidc.checker.internal.resource;

import com.acme.keycloak.oidc.api.KeycloakTokenContext;
import com.acme.keycloak.oidc.api.KeycloakTokenContextService;
import com.liferay.portal.kernel.json.JSONFactoryUtil;
import com.liferay.portal.kernel.json.JSONObject;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;

import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Reference;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Diagnostic REST endpoint for the local OIDC POC.
 *
 * <p>The accessToken value stored by Liferay is a JSON string containing the
 * OAuth token response (for example access_token, token_type, expires_in,
 * refresh_token, scope, and id_token). The endpoint parses that string so the
 * response exposes the token response as JSON instead of returning a nested
 * escaped JSON string.</p>
 *
 * <p>Local PoC only. Do not deploy this endpoint to a shared or production
 * environment.</p>
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
            body.put("accessToken", _parseTokenResponse(context.getAccessToken()));
        }

        return Response.ok(body)
            .type(MediaType.APPLICATION_JSON)
            .build();
    }

    private Object _parseTokenResponse(String accessToken) {
        if (accessToken == null || accessToken.isBlank()) {
            return null;
        }

        try {
            JSONObject tokenResponse =
                JSONFactoryUtil.createJSONObject(accessToken);

            Map<String, Object> parsed = new LinkedHashMap<>();

            for (String key : tokenResponse.keySet()) {
                parsed.put(key, tokenResponse.get(key));
            }

            return parsed;
        }
        catch (Exception exception) {
            // Keep the original value visible for the POC if the stored value
            // is not a JSON OAuth token response.
            return accessToken;
        }
    }

    @Reference
    private KeycloakTokenContextService _keycloakTokenContextService;
}
