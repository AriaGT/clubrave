from django.urls import path

from . import views

urlpatterns = [
    path("checkout/orders/", views.CheckoutCreateView.as_view(), name="checkout-create"),
    path("checkout/orders/<str:code>/", views.OrderStatusView.as_view(), name="order-status"),
    path("me/orders/", views.MyOrdersListView.as_view(), name="my-orders"),
    path("me/orders/<str:code>/", views.MyOrderDetailView.as_view(), name="my-order-detail"),
    path(
        "me/orders/<str:code>/tickets.pdf",
        views.MyOrderTicketsPdfView.as_view(),
        name="my-order-tickets-pdf",
    ),
    path("me/tickets/", views.MyTicketsView.as_view(), name="my-tickets"),
    path(
        "org/events/<uuid:event_pk>/orders/",
        views.OrganizerEventOrdersView.as_view(),
        name="org-event-orders",
    ),
    path(
        "org/events/<uuid:event_pk>/orders/<str:code>/",
        views.OrganizerOrderDetailView.as_view(),
        name="org-event-order-detail",
    ),
    path(
        "org/events/<uuid:event_pk>/orders.csv",
        views.OrganizerEventOrdersCsvView.as_view(),
        name="org-event-orders-csv",
    ),
    path(
        "org/events/<uuid:event_pk>/attendees/",
        views.OrganizerEventAttendeesView.as_view(),
        name="org-event-attendees",
    ),
    path("org/orders/<str:code>/void/", views.OrderVoidView.as_view(), name="org-order-void"),
    path(
        "org/orders/<str:code>/mark-refunded/",
        views.OrderMarkRefundedView.as_view(),
        name="org-order-mark-refunded",
    ),
    path(
        "org/orders/<str:code>/resend-tickets/",
        views.OrderResendTicketsView.as_view(),
        name="org-order-resend-tickets",
    ),
    path("org/tickets/<str:code>/void/", views.TicketVoidView.as_view(), name="org-ticket-void"),
]
