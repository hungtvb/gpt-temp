# Keycloak Local ↔ Liferay SAML Integration

> Local/dev reference. Assumes Keycloak on `8180` and Liferay on `8080`.

## 1. Keycloak local (Windows)

Check Java:

```cmd
java -version
where java
echo %JAVA_HOME%
```

Extract Keycloak, for example:

```text
C:\tools\keycloak\
```

Set bootstrap admin credentials in CMD:

```cmd
set KC_BOOTSTRAP_ADMIN_USERNAME=admin
set KC_BOOTSTRAP_ADMIN_PASSWORD=admin123
```

Run development mode:

```cmd
cd /d C:\tools\keycloak
bin\kc.bat start-dev --http-port 8180
```

Admin URL:

```text
http://localhost:8180
```

Liferay:

```text
http://localhost:8080
```

## 2. Realm

Create:

```text
Realm: liferay
```

Realm URL:

```text
http://localhost:8180/realms/liferay
```

SAML metadata / entity descriptor:

```text
http://localhost:8180/realms/liferay/protocol/saml/descriptor
```

## 3. SAML client

Create a SAML client named `LiferaySaml`.

Do not blindly copy an example Entity ID or ACS URL. First establish the exact Liferay SP metadata/entity descriptor and configure the Keycloak client to match it.

Useful settings to verify:

```text
Entity ID
Assertion Consumer Service / bindings
Sign Documents
Sign Assertions
NameID format
Force POST binding
Encryption only when both sides are configured for it
```

## 4. Certificate / PKCS12

Liferay needs the IdP public certificate to validate signed SAML responses. Never invent a `.p12` and assume it is the certificate Keycloak is using.

For a generic local keystore test:

```cmd
keytool -genkeypair ^
  -alias keycloak-saml ^
  -keyalg RSA ^
  -keysize 2048 ^
  -validity 3650 ^
  -keystore keycloak-saml.p12 ^
  -storetype PKCS12 ^
  -storepass changeit ^
  -dname "CN=keycloak.local, OU=Dev, O=Local, L=HCM, ST=HCM, C=VN"
```

But the certificate exported for Liferay must correspond to the actual signing key configured by Keycloak.

## 5. Test user / role

Create a test user, for example:

```text
Username: liferay.test
Email: liferay.test@example.local
```

Create a test realm role if role mapping is required.

Remember that a Keycloak SAML role/attribute does not automatically become a Liferay Role. Configure attribute/role mapping deliberately.

## 6. Liferay SAML Admin

Open the SAML Admin configuration in Liferay and configure Liferay as SP.

Before enabling SAML, keep a local administrator login path and make sure a Sign In widget/page is available.

Configure the Keycloak IdP connection using the Keycloak metadata URL:

```text
http://localhost:8180/realms/liferay/protocol/saml/descriptor
```

Verify:

```text
IdP Entity ID
Single Sign-On URL
Single Logout URL
Signing certificate
Binding
NameID format
Clock Skew
User Resolution
Attribute Mapping
```

## 7. Login / logout test

Expected flow:

```text
Browser
  -> Liferay
  -> Keycloak
  -> SAMLResponse
  -> Liferay
  -> authenticated user
```

Inspect the SAML response for:

```text
Issuer
NameID
Audience
Destination
NotBefore
NotOnOrAfter
Attributes
Signature
```

Test both login and logout.

## 8. Custom OSGi checks

### Option A: login.events.post

Use the public SAML runtime service:

```java
SamlSpSession samlSpSession =
    _webSsoProfile.getSamlSpSession(request);
```

Source-verified method:

```java
WebSsoProfile#getSamlSpSession(HttpServletRequest)
```

This is suitable when the check is tied to the login event.

### Option B: request filter

Resolve the servlet session ID and then:

```java
SamlSpSession samlSpSession =
    _samlSpSessionLocalService.getSamlSpSessionByJSessionId(
        httpSession.getId());
```

Source-verified method:

```java
SamlSpSessionLocalService#getSamlSpSessionByJSessionId(String)
```

This is suitable when the check must run on arbitrary requests after the SAML session exists.

Current Liferay SAML source uses `jakarta.servlet.*` for these components.

## 9. Dependencies

The module uses Liferay-provided APIs as compile-only dependencies. The exact artifact/version should be managed by the target Liferay Workspace/BOM.

Example:

```gradle
dependencies {
    compileOnly group: "com.liferay.portal", name: "release.portal.api"
    compileOnly group: "com.liferay", name: "com.liferay.saml.api"
    compileOnly group: "com.liferay", name: "com.liferay.saml.persistence.api"
}
```

`com.liferay.saml.api` is required because the lifecycle implementation imports `WebSsoProfile`; `com.liferay.saml.persistence.api` is required for `SamlSpSession` and `SamlSpSessionLocalService`.

Do not hard-code an API version copied from Liferay master into a production workspace unless it matches the target distribution.

## 10. Troubleshooting

### Endpoint mismatch

Compare exact values for:

```text
Entity ID
ACS URL
HTTP/HTTPS
hostname
port
path
trailing slash
```

### Clock skew

```cmd
w32tm /query /status
w32tm /resync
```

### Certificate/signature failure

Verify that Liferay trusts the certificate that Keycloak actually uses to sign the SAML response.

### User resolution failure

Inspect `NameID`, email and other attributes in the assertion and compare them with the Liferay user resolution configuration.

### SAML enabled but login path is awkward/blocked

Keep a working administrator login path and Sign In widget/page before enabling SAML in a test environment.

## 11. Compatibility note

Liferay has a dedicated Keycloak integration knowledge-base article, but Keycloak is not part of Liferay's formally certified compatibility matrix. Treat the integration as a protocol-level integration and validate it against the exact Liferay/DXP version you deploy.

## 12. Version note

As of **2026-08-14**, public Liferay release indexes checked for this research did not expose a `2026.Q4.1` release. If the target is an internal/pre-release build, the exact installed bundles are the authoritative source for API and compatibility verification.

## 13. Recommended test order

```text
1. Keycloak local
2. Realm
3. SAML client
4. Test user
5. Metadata
6. Liferay SAML Admin
7. Login/logout
8. Inspect SAMLResponse
9. Verify user resolution
10. Deploy custom OSGi checker
11. Verify bundle ACTIVE
12. Verify the SAML session APIs at runtime
```

## References

- Keycloak docs: https://www.keycloak.org/documentation
- Liferay SAML Admin: https://learn.liferay.com/w/dxp/security-and-administration/security/configuring-sso/authenticating-with-saml/saml-admin
- Liferay + Keycloak KB: https://learn.liferay.com/kb-article/step-by-step-saml-integration-with-liferay-and-keycloak
- Liferay SAML authentication process: https://learn.liferay.com/w/dxp/security-and-administration/security/configuring-sso/authenticating-with-saml/saml-authentication-process-overview
- Liferay DXP releases repository: https://repository.liferay.com/nexus/content/repositories/liferay-public-releases/com/liferay/portal/release.dxp.bom/
