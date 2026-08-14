# Keycloak Token Context OSGi API

## Mục tiêu

Module này không cố lấy token từ `ThemeDisplay`/`User` object. Mục tiêu là xác định **current Liferay HTTP user context có OIDC session của Keycloak và access token được Liferay lưu hay không**.

Liferay lưu `OpenIdConnectSession` với các field:

- `userId`
- `sessionId`
- `accessToken`
- `accessTokenExpirationDate`
- `authServerWellKnownURI`
- `clientId`
- `issuer`
- `idToken`
- `refreshToken`

Source `service.xml` của Liferay xác nhận trực tiếp các field này.

## OSGi API

Consumer bundle chỉ cần:

```java
@Reference
private KeycloakTokenContextService _keycloakTokenContextService;
```

Sau đó:

```java
Optional<KeycloakTokenContext> context =
    _keycloakTokenContextService.getCurrent(request);

if (context.isPresent() && context.get().hasAccessToken()) {
    // Current Liferay user session has an OIDC access token.
}
```

Kiểm tra đúng Keycloak issuer:

```java
boolean keycloak = context.get().isKeycloak(
    "http://localhost:8180/realms/liferay");
```

## Cách xác định "current user context"

Không chỉ query theo `userId`.

Flow là:

```text
HttpServletRequest
      |
      +-- PortalUtil.getUserId(request)
      |
      +-- request.getSession(false).getId()
      |
      v
OpenIdConnectSession.findByUserId(userId)
      |
      +-- session.sessionId == current HttpSession.id
      |
      v
accessToken != blank
```

Điều này tránh nhầm một OIDC session cũ/khác của cùng user với session HTTP hiện tại.

## Request attribute

Filter đặt snapshot vào:

```java
KeycloakTokenContext.REQUEST_ATTRIBUTE
```

Consumer có thể đọc:

```java
KeycloakTokenContext context =
    (KeycloakTokenContext)request.getAttribute(
        KeycloakTokenContext.REQUEST_ATTRIBUTE);
```

## Security

API **không expose raw access token, refresh token hoặc ID token**.

Nó chỉ expose:

```text
hasAccessToken()
isAccessTokenExpired()
getAccessTokenExpirationDate()
getIssuer()
getClientId()
getAuthServerWellKnownURI()
getSessionId()
getUserId()
isKeycloak(expectedIssuer)
```

Nếu mục tiêu tiếp theo là gọi Keycloak API, nên thiết kế một API riêng để thực hiện operation bằng token server-side thay vì trả raw bearer token cho bundle khác.

## Important distinction

`User`/`ThemeDisplay` chỉ cho biết Liferay đã authenticate user. Nó không đồng nghĩa raw Keycloak access token nằm trực tiếp trong `User` object.

Bản này kiểm tra **Liferay's OpenID Connect session persistence** để xác định token state.

## References

- Liferay OIDC documentation: https://learn.liferay.com/w/dxp/security-and-administration/security/configuring-sso/using-openid-connect
- Liferay `OpenIdConnectSession` service definition: `portal-security-sso-openid-connect-persistence-service/service.xml`
