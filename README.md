## (fake) Instrumented Web App
This is a react app (made with create-react-app) designed to test Sentry.io features. Feel free to fork :)

**Deployed here:**
https://k-fish.github.io/fake-instrumented-web-app/

### Overview
- Added error monitoring
- Added transaction sampling, and will also manually emit a long transaction every time the app is loaded
- Uses github actions to deploy to gh-pages automatically
- Also uses a github action to automate releases in Sentry, along with this repo being added via a github integration, which enables the **suspect commits** feature, which is pretty neat.
