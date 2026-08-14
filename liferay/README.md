# Liferay Workspace — DXP 2026.Q1.4 LTS

Target platform: `dxp-2026.q1.4-lts`.

This workspace validates the `keycloak-saml` module against the Jakarta-based DXP 2026.Q1 LTS line.

## Build

From this directory:

```cmd
gradle :modules:keycloak-saml:build --no-daemon --stacktrace
```

The GitHub Actions workflow runs the same build with Java 21.

> The DXP product target is intentionally pinned in `gradle.properties`. Do not replace it with a Portal GA target when validating this module.
