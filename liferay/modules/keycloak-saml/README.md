# Keycloak ↔ Liferay SAML checker

Experimental Liferay OSGi module for inspecting the SAML SP session created by Liferay after a Keycloak login.

## Implemented

- `SamlLoginPostAction`: hooks `login.events.post` and resolves the SAML SP session through `WebSsoProfile#getSamlSpSession(HttpServletRequest)`.
- `SamlSessionCheckerFilter`: resolves the current SAML SP session from the HTTP session ID through `SamlSpSessionLocalService#getSamlSpSessionByJSessionId(String)`.

## Important

This module is intentionally non-invasive: it only resolves the session and leaves the policy hook as a TODO. Do not reject or invalidate requests until the target Liferay version and desired assertion policy are verified.

The code targets Jakarta Servlet APIs, matching current Liferay SAML source.

## Build

This directory assumes it is copied into a Liferay Workspace module. Run the Workspace Gradle build from the workspace root rather than this directory alone.

```cmd
gradlew :modules:keycloak-saml:build
```

Adjust the Gradle path if this module is placed elsewhere in the workspace.

## Verified source APIs

```java
WebSsoProfile#getSamlSpSession(HttpServletRequest)
SamlSpSessionLocalService#getSamlSpSessionByJSessionId(String)
```
