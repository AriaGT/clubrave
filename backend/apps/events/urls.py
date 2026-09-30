from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("events", views.EventPublicViewSet, basename="event-public")
router.register("org/events", views.OrganizerEventViewSet, basename="org-event")
router.register("org/ticket-types", views.OrganizerTicketTypeViewSet, basename="org-ticket-type")

event_images_list = views.OrganizerEventImageViewSet.as_view({"get": "list", "post": "create"})
event_images_detail = views.OrganizerEventImageViewSet.as_view(
    {"get": "retrieve", "patch": "partial_update", "delete": "destroy"}
)
event_images_reorder = views.OrganizerEventImageViewSet.as_view({"post": "reorder"})
event_ticket_types_list = views.OrganizerTicketTypeViewSet.as_view({"get": "list", "post": "create"})

urlpatterns = [
    path("org/events/<uuid:event_pk>/images/", event_images_list, name="org-event-images"),
    path(
        "org/events/<uuid:event_pk>/images/reorder/",
        event_images_reorder,
        name="org-event-images-reorder",
    ),
    path("org/events/<uuid:event_pk>/images/<uuid:pk>/", event_images_detail, name="org-event-image-detail"),
    path("org/events/<uuid:event_pk>/ticket-types/", event_ticket_types_list, name="org-event-ticket-types"),
]

urlpatterns += router.urls
