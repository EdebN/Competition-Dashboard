# Community API setup

This folder contains the production API source. It is deliberately separate from the dashboard's public JavaScript.

## Important: this does not deploy itself

Adding `apps-script/Code.gs` to GitHub does not change the Apps Script project bound to your private `Competition Community Data` spreadsheet. The existing deployed endpoint remains the test version until you copy this code into Apps Script, configure it, and deploy a new version.

## 1. Configure the private Apps Script project

1. Open the Apps Script project attached to **Competition Community Data**.
2. Replace the contents of its `Code.gs` with `apps-script/Code.gs` from this repository.
3. Open **Project Settings**.
4. Under **Script Properties**, add these properties:
   - `SPREADSHEET_ID`: the ID of your private **Competition Community Data** spreadsheet.
   - `ADMIN_TOKEN`: a long, random secret (at least 32 random characters). Generate it privately and do not put it in GitHub, a screenshot, a public sheet, or dashboard source code.
5. Save the project.
6. Run a function only if prompted for permissions, then review and approve the requested spreadsheet access.

The script creates a dedicated **Team Settings** tab when the public read endpoint is first used. It never accepts a sheet name, range, formula, fixture, or score from a request.

## 2. Deploy a new version

1. In Apps Script, choose **Deploy → Manage deployments**.
2. Edit the existing web-app deployment.
3. Select **New version**, then deploy.
4. Keep it configured to execute as you (the spreadsheet owner) and allow public access so the public dashboard can read settings.
5. Use the existing `/exec` URL. If Apps Script gives you a different URL, use that one.

The public endpoint must be readable without signing in. Therefore, only public team display settings are returned by GET. Never put private information in the Team Settings tab.

## 3. API contract

### Public read

- `GET /exec?action=health`
- `GET /exec?action=getTeamSettings`
- Add `&callback=someFunction` to a read URL for JSONP from GitHub Pages.

A successful settings response includes five records with `teamId`, `displayName`, `primaryColor`, `secondaryColor`, `logoUrl`, and `updatedAt`.

### Admin write

POST JSON using the `text/plain;charset=UTF-8` content type from a browser's `no-cors` request. Include:

- `action: "updateTeamSettings"`
- `adminToken`: the secret entered by the administrator for this session
- `teams`: exactly one validated settings record for each team ID A–E

The server validates names (1–30 characters), optional hex colours, optional HTTPS logo URLs, and unique team IDs. It writes only the **Team Settings** tab. For a cross-origin browser request using `no-cors`, JavaScript cannot read the POST response, so the client must follow it with a public GET and verify the saved values.

**Never hardcode the admin token in `script.js` or another public website file.** The token should be entered into a protected admin interface at runtime and kept only in memory for that page session. Anyone who can see the request while it is being made can see the bearer token, so use a private admin device and do not share it.

## 4. Before connecting the dashboard

The existing `api-test.html` page tests the old `testWrite` action. After deploying this new API, that old test-write action is intentionally no longer accepted, so the old diagnostic write test will fail. That is expected. The production API should be verified with read-only health/settings requests first, then with the new validated update operation using the private token.

Do not connect the dashboard's team-name editor until the production deployment is configured and the settings response has been checked. The current client-side PIN in `script.js` is visible to every visitor and is not server-side authentication.
