from sentry.models.organization import Organization
from sentry.models.project import Project
from sentry.models.projectkey import ProjectKey
from sentry.models.team import Team
from sentry.models.projectteam import ProjectTeam

org = Organization.objects.get(slug="sentry")
project, created = Project.objects.get_or_create(organization=org, slug="otlp-poc", defaults={"name": "otlp-poc", "platform": "node"})
team = Team.objects.filter(organization=org).first()
if team and not ProjectTeam.objects.filter(project=project, team=team).exists():
    ProjectTeam.objects.create(project=project, team=team)
key = ProjectKey.objects.filter(project=project).first() or ProjectKey.objects.create(project=project)
print("PROJECT", project.id, project.slug, "created" if created else "existing")
print("PUBLIC_KEY", key.public_key)
print("DSN", key.get_dsn(public=True))
