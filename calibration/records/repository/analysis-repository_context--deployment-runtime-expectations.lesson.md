---
type: "analysis"
id: "analysis@repository|repository_context.deployment-runtime-expectations"
scope:
  type: "repository"
source: "repository_context"
facet: "Deployment/runtime expectations"
review: null
---

For a remote server, the documented sequence is `npm ci && npx prisma migrate deploy && node dist/api/main.js`.

The docs do not describe any alternate test harness startup, mock server, or self-seeding behavior.
