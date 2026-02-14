# Web Deploy Runbook (apps/web, includes /ops)

## Current State (as of 2026-02-14)

- This repo's `firebase.json` has **no** `hosting` config, so `firebase deploy --only hosting` does not work.
- There is **no existing web deploy workflow** in `.github/workflows/` (only Functions deploy + E2E).

Conclusion: **web deployment path was not defined in this repo**. To make `/ops` reliably visible in production, we need an explicit deploy path.

## Recommended Default: Vercel (GitHub Actions)

This repo now includes a GitHub Actions workflow to deploy `apps/web` to Vercel when configured:

- Workflow: `.github/workflows/web-deploy-vercel.yml`
- Triggers:
  - Manual: `workflow_dispatch`
  - Auto: push to `main` (web-related paths only)

### Required GitHub Secrets

Add these to the GitHub repo secrets:

- `VERCEL_TOKEN`: a Vercel personal token with deploy permissions
- `VERCEL_ORG_ID`: Vercel team/org id (or user id)
- `VERCEL_PROJECT_ID`: the Vercel project id for the Next app

Optional:

- `VERCEL_ENV`: `production` (default) or `preview` (manual runs)

### Environment Variables (Vercel Project)

The Next app needs client-side Firebase config. Configure these in Vercel Project Settings:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

Depending on how `apps/web` is configured, you may also need:

- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`

### Verify /ops Is Deployed

After deploy:

1. Open the production URL for the web app.
2. Confirm `/_not-found` works and `/ops` loads.
3. In `/ops`, select a known `siteId` and `runDate` and confirm:
   - `taskRuns` rows are visible
   - Cost widget shows non-NaN values (0 is ok if genuinely no usage for that KST day)

## Alternative: Cloud Run (Not Implemented Here)

Cloud Run deployment is possible (build a container for `apps/web`), but it needs more infra choices:

- Dockerfile + Cloud Build / GitHub Actions auth to GCP
- service account + IAM + domain mapping / CDN decisions

If you want this route, do it as a separate PR so the deployment target and access model are explicit.

