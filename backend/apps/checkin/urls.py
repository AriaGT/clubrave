from django.urls import path

from . import door, views

urlpatterns = [
    path("org/checkin/", views.CheckInView.as_view(), name="checkin"),
    path("org/checkin/lookup/", views.CheckInLookupView.as_view(), name="checkin-lookup"),
    path("org/door/events/", door.DoorEventListView.as_view(), name="door-events"),
    path("org/door/events/<uuid:pk>/", door.DoorEventDetailView.as_view(), name="door-event-detail"),
    path(
        "org/tickets/<str:code>/undo-checkin/",
        views.UndoCheckInView.as_view(),
        name="org-ticket-undo-checkin",
    ),
]
