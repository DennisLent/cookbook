"""Custom authentication backends used by the API."""

from typing import Optional, Tuple

from django.contrib.auth import get_user_model
from django.conf import settings
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework import exceptions


class SingleUserAuthentication(BaseAuthentication):
    """Authenticate every API request as the shared owner in single-user mode."""

    def authenticate(self, request):
        if getattr(settings, "APP_MODE", "multi_user") != "single_user":
            return None
        from users.instance_mode import get_single_user_owner

        return get_single_user_owner(), None

import jwt
from jwt import PyJWKClient
from jwt import InvalidTokenError, ExpiredSignatureError
from jwt.exceptions import PyJWKClientError
import urllib.error


class OIDCAuthentication(BaseAuthentication):
    """
    Bearer token authentication against a Keycloak OIDC realm.
    Verifies RS256 access tokens via JWKS and maps claims to a local User.
    """

    def authenticate(self, request) -> Optional[Tuple[object, str]]:
        # Only active when backend is configured for Keycloak
        if getattr(settings, 'AUTH_PROVIDER', 'jwt') != 'keycloak':
            return None
        auth = get_authorization_header(request).split()
        if not auth or auth[0].lower() != b'bearer':
            return None

        if len(auth) == 1:
            raise exceptions.AuthenticationFailed('Invalid Authorization header')
        if len(auth) > 2:
            raise exceptions.AuthenticationFailed('Invalid Authorization header')

        token = auth[1].decode('utf-8')

        # If token is not from our Keycloak issuer, ignore and allow other auth backends
        try:
            unverified = jwt.decode(token, options={"verify_signature": False})
            token_iss = unverified.get('iss')
            kc_iss = getattr(settings, 'KEYCLOAK_ISSUER', None)
            if not kc_iss or token_iss != kc_iss:
                return None
        except Exception:
            # Not a JWT we can parse; let other authenticators try
            return None

        payload = self._decode_token(token)
        user = self._get_or_create_user_from_claims(payload)
        return user, token

    def _decode_token(self, token: str) -> dict:
        issuer = getattr(settings, 'KEYCLOAK_ISSUER', None)
        audience = getattr(settings, 'KEYCLOAK_AUDIENCE', None)
        jwks_url = getattr(settings, 'KEYCLOAK_JWKS_URL', None)

        if not issuer or not audience or not jwks_url:
            raise exceptions.AuthenticationFailed('OIDC settings are not configured')

        try:
            jwk_client = PyJWKClient(jwks_url)
            signing_key = jwk_client.get_signing_key_from_jwt(token)
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=["RS256"],
                audience=audience,
                issuer=issuer,
                options={
                    "require": ["exp", "iat", "iss", "aud", "sub"],
                },
            )
            return payload
        except ExpiredSignatureError:
            raise exceptions.AuthenticationFailed('Token expired')
        except (InvalidTokenError, PyJWKClientError, urllib.error.URLError) as e:
            raise exceptions.AuthenticationFailed(f'OIDC token verification failed: {e}')

    def _get_or_create_user_from_claims(self, claims: dict):
        User = get_user_model()

        username = (
            claims.get('preferred_username')
            or claims.get('email')
            or claims.get('sub')
        )
        if not username:
            raise exceptions.AuthenticationFailed('Token missing username')

        user, _created = User.objects.get_or_create(username=username)

        email = claims.get('email')
        given = claims.get('given_name')
        family = claims.get('family_name')

        if email is not None:
            user.email = email
        if given is not None:
            user.first_name = given
        if family is not None:
            user.last_name = family

        roles = set()
        realm_roles = (claims.get('realm_access') or {}).get('roles') or []
        roles.update(realm_roles)
        client_id = getattr(settings, 'KEYCLOAK_CLIENT_ID', None)
        if client_id:
            resource_access = (claims.get('resource_access') or {}).get(client_id) or {}
            roles.update(resource_access.get('roles') or [])

        admin_role = getattr(settings, 'KEYCLOAK_ADMIN_ROLE', 'cookbook-admin')
        is_admin = admin_role in roles

        # Map to local permissions and role field if present
        if hasattr(user, 'role'):
            user.role = 'admin' if is_admin else 'user'
        user.is_staff = bool(is_admin)

        user.save()
        return user
