# Keycloak ↔ Liferay OpenID Connect checker

Experimental Liferay OSGi module for inspecting the OIDC session associated with the current authenticated Liferay user.

## Implemented

- `OpenIdConnectSessionCheckerFilter` resolves the current portal user and queries Liferay's current `OpenIdConnectSessionPersistence` by `userId`.
- The module deliberately does not log access tokens, refresh tokens, or raw ID tokens.

## Why persistence instead of `OpenIdConnectSession`

Liferay's older `com.liferay.portal.security.sso.openid.connect.OpenIdConnectSession` API is deprecated. The current persistence model exposes provider/client/session metadata and is the safer API surface to target for this checker.

## Build

From the Liferay workspace root:

```cmd
gradle :modules:keycloak-oidc:build --no-daemon --stacktrace
```

## Target

The workspace is pinned to `dxp-2026.q1.4-lts`.
