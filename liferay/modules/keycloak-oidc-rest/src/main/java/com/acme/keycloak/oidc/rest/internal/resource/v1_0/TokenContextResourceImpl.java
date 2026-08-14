package com.acme.keycloak.oidc.rest.internal.resource.v1_0;

import com.acme.keycloak.oidc.api.KeycloakTokenContext;
import com.acme.keycloak.oidc.api.KeycloakTokenContextService;
import com.acme.keycloak.oidc.rest.dto.v1_0.TokenContext;
import com.acme.keycloak.oidc.rest.internal.resource.v1_0.BaseTokenContextResourceImpl;

import com.liferay.portal.kernel.json.JSONFactoryUtil;
import com.liferay.portal.vulcan.pagination.Pagination;

import java.util.Map;
import java.util.Optional;

import org.osgi.service.component.annotations.Component;
import org.osgi.service.component.annotations.Reference;
import org.osgi.service.component.annotations.ServiceScope;

/**
 * REST Builder implementation for the current Keycloak/OIDC token context.
 *
 * <p>This is intentionally a local proof-of-concept endpoint. The token
 * response is mapped into a nested object instead of exposing the raw JSON
 * string stored by Liferay.</p>
 */
@Component(
    properties = "OSGI-INF/liferay/rest/v1_0/token-context.properties",
    scope = ServiceScope.PROTOTYPE,
    service = com.acme.keycloak.oidc.rest.resource.v1_0.TokenContextResource.class
)
public class TokenContextResourceImpl extends BaseTokenContextResourceImpl {

    @Override
    public TokenContext getTokenContext() throws Exception {
        Optional<KeycloakTokenContext> optionalContext =
            _keycloakTokenContextService.getCurrent(
                contextHttpServletRequest);

        TokenContext tokenContext = new TokenContext();

        if (optionalContext.isEmpty()) {
            tokenContext.setAuthenticated(false);
            tokenContext.setKeycloak(false);
            tokenContext.setHasAccessToken(false);

            return tokenContext;
        }

        KeycloakTokenContext context = optionalContext.get();

        tokenContext.setAuthenticated(true);
        tokenContext.setKeycloak(true);
        tokenContext.setHasAccessToken(context.hasAccessToken());
        tokenContext.setExpired(context.isAccessTokenExpired());
        tokenContext.setAuthServerWellKnownURI(
            context.getAuthServerWellKnownURI());
        tokenContext.setClientId(context.getClientId());
        tokenContext.setIssuer(context.getIssuer());
        tokenContext.setSessionId(context.getSessionId());
        tokenContext.setUserId(context.getUserId());
        tokenContext.setAccessTokenExpirationDate(
            context.getAccessTokenExpirationDate());

        String accessTokenJson = context.getAccessToken();

        if (accessTokenJson != null && !accessTokenJson.isBlank()) {
            try {
                Map<String, Object> accessToken =
                    JSONFactoryUtil.createJSONObject(
                        accessTokenJson).toMap();

                tokenContext.setAccessToken(accessToken);
            }
            catch (Exception exception) {
                // Keep the endpoint usable even if Liferay contains malformed
                // token JSON. The raw stored value is intentionally not returned.
            }
        }

        return tokenContext;
    }

    @Reference
    private KeycloakTokenContextService _keycloakTokenContextService;
}
