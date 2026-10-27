from sentry.models.apitoken import ApiToken
from sentry.users.models.user import User
user = User.objects.filter(is_superuser=True).order_by("id").first() or User.objects.order_by("id").first()
token = ApiToken.objects.create(user=user, scope_list=["org:read", "project:read", "event:read", "org:admin"], name="otlp-poc")
print("USER", user.username)
print("TOKEN", token.token)
