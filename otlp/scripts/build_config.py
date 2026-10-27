from sentry.tasks.relay import build_project_config
for key in ["0e82f64da02883cd8c307442dbe8cc4f", "d3605f2555f97301e8a15eb07ac845c9"]:
    build_project_config(public_key=key)
    print("built", key)
