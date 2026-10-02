from django.urls import path

from . import views

urlpatterns = [
    path("webhooks/izipay/", views.IzipayWebhookView.as_view(), name="izipay-webhook"),
    path("webhooks/mercadopago/", views.MercadoPagoWebhookView.as_view(), name="mercadopago-webhook"),
    path("checkout/orders/<str:code>/confirm/", views.confirm_from_browser, name="order-confirm"),
    path("org/payments/", views.OrgPaymentSettingsView.as_view(), name="org-payment-settings"),
]
