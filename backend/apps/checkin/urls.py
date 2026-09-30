from django.urls import path

from . import views

urlpatterns = [
    path("org/checkin/", views.CheckInView.as_view(), name="checkin"),
    path("org/checkin/lookup/", views.CheckInLookupView.as_view(), name="checkin-lookup"),
    path(
        "org/tickets/<str:code>/undo-checkin/",
        views.UndoCheckInView.as_view(),
        name="org-ticket-undo-checkin",
    ),
]
