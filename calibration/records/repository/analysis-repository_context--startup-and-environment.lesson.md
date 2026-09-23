---
type: "analysis"
id: "analysis@repository|repository_context.startup-and-environment"
scope:
  type: "repository"
source: "repository_context"
facet: "Startup and environment"
review: null
---

Set `DATABASE_URL`, `JWT_SECRET`, and `NODE_ENV=production` in a root `.env` file for local runs.

Install dependencies with `npm install`.

Generate the Prisma client with `npx prisma generate`.

Apply migrations with `npx prisma migrate deploy`.

Start the API with `npx nx serve api`.
