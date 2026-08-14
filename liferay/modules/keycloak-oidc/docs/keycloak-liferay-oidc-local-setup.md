# Keycloak Local ↔ Liferay OpenID Connect

## 1. Keycloak local

Assume:

```text
Keycloak: http://localhost:8180
Liferay:  http://localhost:8080
```

Run Keycloak locally:

```cmd
cd /d C:\tools\keycloak
set KC_BOOTSTRAP_ADMIN_USERNAME=admin
set KC_BOOTSTRAP_ADMIN_PASSWORD=admin123
bin\kc.bat start-dev --http-port 8180
```

## 2. Realm and OIDC discovery

Create/use realm:

```text
liferay
```

Keycloak OIDC discovery endpoint:

```text
http://localhost:8180/realms/liferay/.well-known/openid-configuration
```

The discovery document supplies issuer, authorization endpoint, token endpoint, userinfo endpoint and JWKS URI.

## 3. Create an OIDC client for Liferay

Create a client in Keycloak:

```text
Client ID: liferay-oidc
Client authentication: On
Standard flow: On
```

For a local test, configure the redirect URI required by Liferay:

```text
http://localhost:8080/c/portal/login/openidconnect
```

Prefer exact host/port/path matching. Do not use a broad wildcard redirect URI in a non-test environment.

Record:

```text
Client ID
Client Secret
Issuer
Discovery URL
```

## 4. Scopes

Start with:

```text
openid
profile
email
```

Liferay uses OIDC claims to resolve/create the user. The mandatory user mappings include email address, first name, last name and screen name; if screen name is absent/empty, Liferay can generate one.

## 5. Liferay OIDC provider connection

Liferay documentation provides two configuration paths. For the standard virtual-instance configuration:

```text
Global Menu
  -> Control Panel
  -> Instance Settings
  -> Security
  -> SSO
  -> OpenID Connect Provider
```

Create a provider connection and configure:

```text
Provider Name
Scopes
Discovery Endpoint
Issuer URL
JWKS URI
Authorization Endpoint
Token Endpoint
User Information Endpoint
OpenID Connect Client ID
OpenID Connect Client Secret
ID Token Signing Algorithms
Subject Types
```

The preferred approach is to use the Keycloak well-known discovery endpoint rather than hand-copying every endpoint.

## 6. User mapping

At minimum verify mappings equivalent to:

```text
Liferay emailAddress -> email
Liferay firstName    -> given_name
Liferay lastName     -> family_name
Liferay screenName   -> preferred_username
```

Inspect the actual claims returned by Keycloak before finalizing mappings.

## 7. Enable OIDC

Enable OpenID Connect under the virtual instance's SSO settings.

For DXP 2024.Q3 through 2026.Q1, the default Sign-In utility page uses the local login flow. Liferay documents using the default Sign In portlet or a custom page/redirect if the OIDC option is not exposed there. DXP 2026.Q2 changes utility-page behavior so this is version-sensitive.

For the `2026.Q1.4` target in this workspace, test with a Sign In portlet/page path that explicitly exposes the OpenID Connect login option.

## 8. Login test

Expected flow:

```text
Browser
  -> Liferay /c/portal/login/openidconnect
  -> Keycloak Authorization Endpoint
  -> Keycloak login
  -> Authorization Code
  -> Liferay callback
  -> Token endpoint
  -> ID Token / UserInfo
  -> Liferay authenticated user
```

Inspect:

```text
issuer
sub
aud
nonce
exp
iat
email
name/given_name/family_name
preferred_username
signature / JWKS key
```

## 9. PKCE

Liferay supports PKCE for OpenID Connect. Keep it enabled/compatible with the Keycloak client configuration when applicable.

## 10. Back-channel logout

Liferay DXP 2026.Q1+ supports OIDC back-channel logout. Liferay exposes:

```text
http://localhost:8080/o/open_id_connect/backchannel_logout
```

Configure this as the provider's back-channel logout endpoint when using the feature. Test that logging out at Keycloak terminates the matching Liferay session.

## 11. Custom OSGi session checker

The module in this workspace uses the current persistence API:

```java
List<OpenIdConnectSession> sessions =
    _openIdConnectSessionPersistence.findByUserId(userId);
```

Useful non-secret metadata to inspect:

```java
session.getClientId();
session.getAuthServerWellKnownURI();
session.getUserId();
session.getOpenIdConnectSessionId();
```

Do **not** log:

```text
access token
refresh token
raw ID token
authorization code
client secret
```

## 12. Troubleshooting

### `invalid_redirect_uri`

Compare Keycloak client redirect URI with exactly:

```text
http://localhost:8080/c/portal/login/openidconnect
```

Watch for:

```text
http vs https
hostname
port
path
trailing slash
```

### Discovery endpoint cannot be reached

From the Liferay host test:

```cmd
curl http://localhost:8180/realms/liferay/.well-known/openid-configuration
```

Liferay must be able to reach Keycloak from the server, not merely from the developer browser.

### Signature/JWKS failure

Verify that the issuer and JWKS URI came from the same Keycloak realm discovery document and that Keycloak signing keys are current.

### User resolution failure

Inspect the ID token/userinfo claims and compare them with the Liferay OIDC user mapping.

### Logout works only in browser

Test OIDC back-channel logout separately. It is a server-to-server flow and is independent from front-channel browser redirects.

## 13. Security notes

- Use HTTPS outside local development.
- Do not commit Keycloak client secrets.
- Do not log tokens.
- Do not use wildcard redirect URIs for production.
- Validate issuer, audience, nonce, expiration and signature according to the OIDC flow.
- Keep the custom checker read-only until the exact assertion/session policy is defined.

## 14. References

- Liferay OpenID Connect: https://learn.liferay.com/w/dxp/security-and-administration/security/configuring-sso/using-openid-connect
- Keycloak documentation: https://www.keycloak.org/documentation
- Keycloak OIDC discovery for this local realm: `http://localhost:8180/realms/liferay/.well-known/openid-configuration`
