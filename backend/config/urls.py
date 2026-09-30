from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView


def health(request):
    from django.db import connections

    db_ok = True
    try:
        connections["default"].cursor()
    except Exception:
        db_ok = False
    return JsonResponse({"status": "ok" if db_ok else "degraded", "database": db_ok})


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", health),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
    path("api/", include("apps.accounts.urls")),
    path("api/", include("apps.common.urls")),
    path("api/", include("apps.events.urls")),
    path("api/", include("apps.orders.urls")),
    path("api/", include("apps.payments.urls")),
    path("api/", include("apps.checkin.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
