# Deployment and recovery

The application is independently hosted on Render from this GitHub repository. Canonical hostname: linkbudget.st-dba.com. The existing st-dba.com WordPress site keeps its hosting and root DNS.

## Service

render.yaml defines one free Docker web service in Oregon, tracking main, with /api/health and deploys after GitHub checks pass. Docker builds React in Node 22 and runs Python 3.12 as a non-root user. Dependencies are locked in requirements-lock.txt and web/package-lock.json. Base images track supported minor versions for OS fixes; each deployment is identified by its Git commit and built image, not guaranteed bit-identical rebuilds.

Keep one Uvicorn process and one replica while jobs use memory. No secrets are needed for USGS. The service needs HTTPS egress to USGS elevation/index services. OpenStreetMap tiles use visible attribution and ordinary browser caching; no bulk prefetch is implemented.

The free instance sleeps after inactivity; the first request can wait for startup. Free-instance hours and other limits are shared within the workspace. No always-on availability is promised. See [Render free service limits](https://render.com/docs/free).

## Custom domain

1. Deploy tested main through the existing Render account.
2. Add linkbudget.st-dba.com in the new service's Settings.
3. In GoDaddy DNS for st-dba.com, add a linkbudget CNAME pointing to the exact onrender.com hostname shown by that service. Do not change @, nameservers, MX or existing application subdomains.
4. The owner completes email two-factor verification if GoDaddy prompts.
5. Verify the domain in Render, wait for TLS, and check both the page and /api/health on the custom hostname.

Do not point this domain to ChatGPT/Sites or a ChatGPT conversation.

## Release verification

- Green GitHub CI: numerical/API/provider/import tests, type checking/build and container health/page smoke checks.
- Live /api/health identifies the Git commit; HTML and referenced JS/CSS load.
- Anonymous live terrain analysis completes and appears in the browser.
- Edited inputs visibly invalidate results and disable calculation exports.
- Exercise project save/load, JSON import, CSV/print export, invalid input, no-terrain mode and an obstructed path.
- Inspect desktop, narrow-phone and printed layouts.
- Confirm domain DNS, HTTPS and Render deployment status.

## Recovery

No server database exists in 1.0. Users retain project and calculation JSON; browser saves alone are not durable backups. Restarts remove temporary runs. Expired-run errors instruct users to recalculate saved inputs.

Rollback through Render's successful deploy history, then check /api/health and run the example. Alternatively revert the faulty GitHub commit, wait for CI and deploy. Schema-version-1 projects remain readable. Do not repoint DNS to an unrelated service.

Inspect Render logs for failed builds, Python errors and provider timeouts. Access logs do not contain input bodies or bearer headers. Rates, queue limits and deadlines are enforced on the server. Sustained 429/503 responses require capacity/provider review, not disabling limits.
