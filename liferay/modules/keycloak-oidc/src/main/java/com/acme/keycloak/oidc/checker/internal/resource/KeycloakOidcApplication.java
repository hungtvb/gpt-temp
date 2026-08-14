package com.acme.keycloak.oidc.checker.internal.resource;

import java.util.Collections;
import java.util.Set;

import jakarta.ws.rs.core.Application;

import org.osgi.service.component.annotations.Component;

@Component(
    property = {
        "auth.verifier.guest.allowed=false",
        "liferay.oauth2.application=false",
        "osgi.jaxrs.application.base=/keycloak-oidc",
        "osgi.jaxrs.name=com.acme.keycloak.oidc"
    },
    service = Application.class
)
public class KeycloakOidcApplication extends Application {

    @Override
    public Set<Object> getSingletons() {
        return Collections.singleton(new KeycloakTokenContextResource());
    }
}
