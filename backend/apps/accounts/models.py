from uuid import uuid4

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.utils import timezone

from apps.common.models import TimeStampedModel


class UserManager(BaseUserManager):
    def create_user(self, email: str, password: str | None = None, **extra):
        if not email:
            raise ValueError("El email es obligatorio.")
        user = self.model(email=self.normalize_email(email).lower(), **extra)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_superuser(self, email: str, password: str | None = None, **extra):
        extra.setdefault("role", User.Role.ADMIN)
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        return self.create_user(email, password, **extra)


class User(AbstractBaseUser, PermissionsMixin):
    """Un único modelo de usuario con rol.

    El comprador y el organizador son la misma tabla: pueden ser la misma
    persona, y la separación real ocurre en los permisos y el `scope` del
    JWT, no en el esquema (ver §4.2 del plan).
    """

    class Role(models.TextChoices):
        ORGANIZER = "ORGANIZER", "Organizador"
        CUSTOMER = "CUSTOMER", "Comprador"
        STAFF = "STAFF", "Personal de puerta"
        ADMIN = "ADMIN", "Administrador de la plataforma"

    id = models.UUIDField(primary_key=True, default=uuid4, editable=False)
    email = models.EmailField(unique=True)
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.CUSTOMER)
    full_name = models.CharField(max_length=150, blank=True)
    phone = models.CharField(max_length=32, blank=True)
    document_id = models.CharField(max_length=32, blank=True)
    marketing_consent = models.BooleanField(default=False)

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        ordering = ["-date_joined"]

    def __str__(self):
        return self.email

    @property
    def organization(self):
        membership = (
            self.memberships.filter(role=Membership.Role.OWNER).select_related("organization").first()
        )
        return membership.organization if membership else None


class Organization(TimeStampedModel):
    """El organizador como entidad comercial. Los eventos cuelgan de la
    organización, no del usuario, para que sumar colaboradores sea aditivo."""

    name = models.CharField(max_length=150)
    slug = models.SlugField(unique=True)
    logo = models.ImageField(upload_to="organizations/logos/", blank=True, null=True)
    contact_email = models.EmailField()
    timezone = models.CharField(max_length=64, default="America/Lima")
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Membership(TimeStampedModel):
    class Role(models.TextChoices):
        OWNER = "OWNER", "Dueño"
        STAFF = "STAFF", "Personal"

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="memberships")
    organization = models.ForeignKey(Organization, on_delete=models.CASCADE, related_name="memberships")
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.OWNER)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["user", "organization"], name="unique_membership_per_org"),
        ]

    def __str__(self):
        return f"{self.user.email} @ {self.organization.name} ({self.role})"


class LoginCode(TimeStampedModel):
    """Autenticación sin contraseña del comprador: OTP + magic link."""

    email = models.EmailField(db_index=True)
    code_hash = models.CharField(max_length=128)
    token_hash = models.CharField(max_length=128)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)
    attempts = models.PositiveSmallIntegerField(default=0)
    ip = models.GenericIPAddressField(null=True, blank=True)

    MAX_ATTEMPTS = 5

    class Meta:
        indexes = [models.Index(fields=["email", "consumed_at"])]

    def is_expired(self) -> bool:
        return timezone.now() >= self.expires_at

    def is_usable(self) -> bool:
        return self.consumed_at is None and not self.is_expired() and self.attempts < self.MAX_ATTEMPTS


class PasswordChangeRequest(TimeStampedModel):
    """Cambio de contraseña pendiente de confirmar por correo. La contraseña
    nueva se guarda ya hasheada; solo se aplica al usuario cuando abre el
    enlace enviado a su email (el token se guarda hasheado, de un solo uso)."""

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="password_change_requests")
    new_password_hash = models.CharField(max_length=256)
    token_hash = models.CharField(max_length=128, unique=True)
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)

    def is_usable(self) -> bool:
        return self.consumed_at is None and timezone.now() < self.expires_at
