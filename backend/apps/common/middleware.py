"""Cabecera Content-Security-Policy (§13.1). Django ya pone
`X-Content-Type-Options: nosniff` y `Referrer-Policy: same-origin` por
defecto vía `SecurityMiddleware`; CSP es la única de la lista que no trae
de fábrica.

La política es más permisiva de lo ideal para una API pura porque también
cubre el admin de Django y `/api/docs/` (Swagger UI), que usan estilos en
línea y —en el caso de Swagger— assets de un CDN. Si se retira el admin o se
sirve Swagger UI localmente, esta política puede endurecerse.
"""

CONTENT_SECURITY_POLICY = (
    "default-src 'self'; "
    "img-src 'self' data: https:; "
    "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
    "script-src 'self' https://cdn.jsdelivr.net; "
    "font-src 'self' https://cdn.jsdelivr.net; "
    "connect-src 'self'; "
    "frame-ancestors 'none'; "
    "base-uri 'self'; "
    "object-src 'none'"
)


class SecurityHeadersMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response.setdefault("Content-Security-Policy", CONTENT_SECURITY_POLICY)
        return response
