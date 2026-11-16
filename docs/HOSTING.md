# Hosting loodle.online

Status: deployment files and local hosting checks are prepared. **The domain has not been deployed or changed.** GitHub is authenticated as `anzumr`; no project remote or matching accessible repository was found. DNS checked on 2026-11-16: Namecheap nameservers (`dns1.registrar-servers.com`, `dns2.registrar-servers.com`), apex A record `162.255.119.8`.

## Architecture

One Node process serves the built website, `/api/auth/*`, `/healthz`, and multiplayer at `/ws`. A managed host terminates HTTPS and WSS on the same domain. GitHub stores source and runs CI; GitHub Pages cannot run this Node/WebSocket backend.

`Dockerfile` builds the website and runs the server as a non-root user. The owner selected Render's **free** web-service plan in `render.yaml`. Automatic deployment is disabled. Free services sleep after 15 minutes without inbound traffic and typically take about a minute to wake. Free instance hours are shared across the workspace, including the existing project-trace service. No paid service has been created.

Rooms still live in memory. Deploys/restarts lose online matches; use one instance until shared persistence is implemented. Google account identity is stable, but no account database, cloud saves, match history, account linking or cross-device offline progression exists yet. Treat this as an initial public playtest, not a completed production service.

## GitHub and hosting

1. Review the local changes and authorize a commit/push under the handoff's commit-only-on-request agreement. Suggested private repository: `anzumr/loodle` (not created).
2. Connect Render and select that GitHub repository/branch. Import `render.yaml`, or configure a Docker web service with health path `/healthz` and one instance.
3. Keep `PUBLIC_ORIGIN=https://loodle.online,https://www.loodle.online`. To test the assigned `onrender.com` URL before DNS cutover, add its exact HTTPS origin to this list too.
4. Set `GOOGLE_CLIENT_ID` to the Google OAuth web client ID. Render generates `AUTH_SECRET`; keep this secret stable across deploys and out of browser/VITE variables. Rotating it signs everyone out. To deploy guests first, leave the Google client ID empty.
5. Confirm the default hosting URL serves the page and `/healthz`. Check two browsers can create/join/play/reconnect using `/ws` before changing DNS.

## Namecheap DNS

After Render has provisioned the service and listed the custom domain:

| Type | Namecheap host | Value |
|---|---|---|
| A | `@` | Render's supplied apex target; documentation currently lists `216.24.57.1` |
| CNAME | `www` | The exact assigned `<service>.onrender.com` hostname, without `https://` |

In Namecheap's **Advanced DNS**, replace conflicting parking/redirect/A records only for these web hostnames. Check for conflicting AAAA records using Render's instructions. Preserve unrelated records, including mail MX/TXT records. Do not guess the assigned service hostname. Verify the domain in Render and wait for TLS issuance before advertising the URL.

## Google sign-in setup

The owner-provided public web client ID is already set in `render.yaml`. The steps below document its setup; actual authorized origins and live Google login still need verification after deployment.

In Google Cloud / Google Auth Platform:

1. Configure branding and audience for LOODL. Add the domain and any consent-screen information Google requires for the selected audience; do not invent privacy-policy URLs.
2. Create an **OAuth client ID → Web application**.
3. Add authorized JavaScript origins `https://loodle.online` and `https://www.loodle.online`. Optionally add the actual host preview URL and `http://localhost:5173` for testing.
4. Set the resulting public client ID in `GOOGLE_CLIENT_ID`. This popup/callback integration does not need a client secret or redirect endpoint.
5. If the Google project is in testing mode, add the intended test users. Test a real Google account, logout, guest play, and seat recovery before declaring sign-in live.

Server verification uses Google's official library to check the ID token against the configured client ID, plus a nonce and CSRF challenge. Sessions use signed HttpOnly cookies, Secure in production, with 24-hour expiry. The stable Google subject identifies online room ownership; client-supplied guest tokens cannot claim it. Guest games and Google games have separate identities; signing in does not migrate an existing guest room. Logout clears the current browser session; it does not revoke sessions already copied to another browser. No Google tokens or session secrets are committed.

## Local verification

```powershell
npm ci
npm test
npm run typecheck
npm run build
npm run smoke:hosting -w @loodl/server
npm start
# In another terminal, with server running:
npm run smoke:reconnect -w @loodl/server
```

`smoke:hosting` starts and stops its own server on port 8792. It checks HTTP/assets, origin protection and account-seat recovery with locally signed test sessions; it does **not** claim a real Google login. Normal `npm start` serves the built website at `http://localhost:8787`; Vite dev mode proxies `/api` and `/ws` to that server.

Docker Desktop's Linux engine was not running during preparation; the container itself has not been built locally. The GitHub workflow includes a Docker build after tests/typecheck/build. Production TLS, actual Google login and browser layout remain unverified until hosting is connected.

References: [Render web services](https://render.com/docs/web-services), [Render blueprint fields](https://render.com/docs/blueprint-spec), [Namecheap DNS for Render](https://render.com/docs/configure-namecheap-dns), [Google ID-token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token), [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).
