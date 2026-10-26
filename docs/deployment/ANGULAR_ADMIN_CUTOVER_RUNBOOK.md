# Angular Admin Console — canary, cutover and rollback runbook

**Audience:** the operator with `sudo` on the VPS. **Authority:** ADR-031. **Nothing here is run by CI or by `deploy.sh`.**
`deploy.sh` packages the Admin SPA (Step A) and never touches nginx; Steps B–D change live routing and need a human.

> The EJS admin CMS (`/admin/*`) is the emergency and rollback path. It stays reachable at every step, including after Step D.

## The five steps

| Step | What happens | Who | Changes live routing? |
|---|---|---|---|
| A | Code packaging: `deploy.sh` builds both Angular apps into the release (`static/staff/`, `static/admin-console/`) | CI/CD, automatic after green CI on `main` | No |
| B | Canary: a separate host serves the Admin SPA | Operator | Adds a new host only; the admin host is untouched |
| C | Acceptance on the canary with synthetic accounts | Operator + owner | No |
| D | Host switch: the admin host root serves the Admin SPA | Operator, **after the owner approves C** | Yes |
| E | Watch, and roll back if needed | Operator | Rollback restores the old file |

## Step A — verify the package exists (read-only)

After a deploy, on the VPS:

```bash
C=/srv/immigration-horizons/current
ls "$C/static"                                   # expect: admin-console  staff
node "$C/scripts/deploy/verify-admin-build.js" "$C/static/admin-console"
node "$C/scripts/deploy/verify-staff-build.js" "$C/static/staff"
stat -c '%A %U' "$C/static/admin-console/index.html"   # must be world-readable (nginx's worker user reads it)
```

Both verifiers print `OK`. If `static/admin-console` is missing, the release was built by an older `deploy.sh`: redeploy from `origin/main`.

## Step B — canary on its own host

The Admin SPA is built with `<base href="/">`, so it must own a host root. **Do not serve it under a path such as `/admin-preview/`**: its assets and router would resolve against `/` and the page would be blank. Use a dedicated canary host.

1. **DNS:** add an `A` record for `admin-preview.immigrationhorizons.com` pointing at the VPS (same address as the other hosts).
2. **nginx server block**, by copying the existing admin one so the headers match:
   ```bash
   sudo cp -a /etc/nginx /root/nginx-backup-$(date -u +%Y%m%d%H%M)
   sudo cp /srv/immigration-horizons/current/scripts/deploy/nginx/snippets/ih-admin-routes.conf /etc/nginx/snippets/
   sudo cp /etc/nginx/sites-available/admin.immigrationhorizons.com /etc/nginx/sites-available/admin-preview.immigrationhorizons.com
   ```
   In the **new** file only: change `server_name` to `admin-preview.immigrationhorizons.com`, delete its `location / { ... }` block, and add one line in its place:
   ```nginx
   include /etc/nginx/snippets/ih-admin-routes.conf;
   ```
   Keep `client_max_body_size 25M;`, `X-Robots-Tag "noindex, nofollow"`, `X-Frame-Options "DENY"` and `X-Content-Type-Options "nosniff"`.
3. **Enable and certify:**
   ```bash
   sudo ln -s /etc/nginx/sites-available/admin-preview.immigrationhorizons.com /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo certbot --nginx -d admin-preview.immigrationhorizons.com
   sudo nginx -t && sudo systemctl reload nginx
   ```
4. **Cookies:** the CMS session cookie has no `Domain` attribute, so the canary host gets its own session and never shares one with `admin.` or `app.`. Do not add a parent-domain cookie.
5. **Smoke test (no secrets):**
   ```bash
   H=https://admin-preview.immigrationhorizons.com
   curl -s -o /dev/null -w '%{http_code} spa root\n'            $H/                       # 200
   curl -s $H/ | grep -o '<base href="[^"]*">'                                            # <base href="/">
   curl -s -o /dev/null -w '%{http_code} deep link\n'           $H/content/blog           # 200 (shell)
   curl -s -o /dev/null -w '%{http_code} missing asset\n'       $H/main-nope.js           # 404, never the shell
   curl -s -o /dev/null -w '%{http_code} ejs login\n'           $H/admin/login            # 200
   curl -s -i $H/api/v1/admin/session/bootstrap | head -1                                 # JSON contract, not HTML
   curl -s -o /dev/null -w '%{http_code} unauth api (expect 401)\n' $H/api/v1/admin/users
   curl -s -i $H/ | grep -i x-robots-tag                                                  # noindex, nofollow
   ```

## Step C — acceptance (owner signs off)

Use synthetic accounts you create for this and delete afterwards; never a real client's data.

- [ ] Sign in at the canary host with an admin account; a wrong password is refused with a message.
- [ ] **Session isolation:** the Admin session does **not** open `https://app.immigrationhorizons.com/staff/` or `/api/v1/staff/me`, and a Staff session does not open `/api/v1/admin/*`.
- [ ] **CSRF:** a write that omits the token is refused (403); the same write through the UI succeeds.
- [ ] **Roles:** an editor can edit content but cannot open Users, Roles or Security; a super admin can.
- [ ] **Blog:** create a draft, publish it, confirm it appears at `https://immigrationhorizons.com/blog`, unpublish it.
- [ ] **Media:** upload an image of about 20 MB; it displays from `/uploads/...` and from the public site.
- [ ] **Users:** create an employee, see the one-time temporary password, sign in with it and be forced to set a new one. Reset it again from the Users page.
- [ ] **Security events:** the actions above appear in the Security viewer.
- [ ] **Mobile:** every screen is usable at phone width.
- [ ] **Escape hatch:** `/admin/login` on the canary host works with the same account.
- [ ] **Unaffected:** the public site, the client portal and the Staff app behave as before.

## Step D — switch the admin host (only after Step C is signed off)

```bash
sudo cp -a /etc/nginx /root/nginx-backup-$(date -u +%Y%m%d%H%M)        # new backup, new timestamp
sudo cp /etc/nginx/sites-available/admin.immigrationhorizons.com /root/admin-host.before-angular.conf
```

In `/etc/nginx/sites-available/admin.immigrationhorizons.com` replace the single `location / { ... }` block with `include /etc/nginx/snippets/ih-admin-routes.conf;` (keep the TLS lines certbot added and every `add_header`). Then:

```bash
sudo nginx -t                         # must say "syntax is ok" AND "test is successful"
sudo systemctl reload nginx           # reload, never restart
```

Repeat the Step B smoke tests against `https://admin.immigrationhorizons.com`, plus:

```bash
curl -s -o /dev/null -w '%{http_code} ejs login\n' https://admin.immigrationhorizons.com/admin/login   # 200
```

The root `/` now serves the SPA instead of redirecting to `/admin`. Tell the team the new address is the root; bookmarks to `/admin/...` keep working.

## Step E — watch and roll back

Watch for the first day: `pm2 logs ih-admin --lines 200`, the Security viewer, and the contact/lead inbox.

**Roll back the host (seconds):**
```bash
sudo cp /root/admin-host.before-angular.conf /etc/nginx/sites-available/admin.immigrationhorizons.com
sudo nginx -t && sudo systemctl reload nginx
```
Everyone is back on the EJS CMS immediately. Only if a bad release (not just the routing) is the cause:
`ln -sfn /srv/immigration-horizons/releases/<previous> /srv/immigration-horizons/current && pm2 reload all --update-env`.

## Failure modes and what they look like

| Symptom | Cause | Fix |
|---|---|---|
| Sign-in form loads, sign-in does nothing / 403 | CSRF bootstrap blocked: `/api/v1/` not proxied, or a different host than the page's own | Confirm the `^~ /api/v1/` block and that the browser URL host equals the page host |
| Signed in, then logged out on every request | Cookie set for another host, or `X-Forwarded-Proto` missing so the `Secure` cookie is dropped | Keep `proxy_set_header X-Forwarded-Proto $scheme;` on every proxy block |
| Refreshing `/users/new` shows nginx 404 | The final `location /` lost `try_files $uri /index.html` | Restore the snippet |
| `/api/v1/admin/...` returns an HTML page | A catch-all matched before the API block | `^~ /api/v1/` must stay a prefix location; unauthenticated calls must be JSON `401` |
| Upload of a large image fails with 413 | `client_max_body_size` missing in the server block | Keep `25M` in the server block |
| Old UI after a deploy | The shell was cached | `index.html` is served with `expires -1`; only hashed files are cached for a year |
| Admin pages indexed by a search engine | `X-Robots-Tag` missing | Keep the `add_header ... noindex, nofollow` lines; the SPA also carries a noindex meta |
| Blog cover images vanish on the public site | `/uploads/` no longer proxied | Keep the `^~ /uploads/` block |
| Public site, portal or Staff app changed behaviour | A snippet landed in the wrong server block | Restore the backup. Nothing in this runbook edits `immigrationhorizons.com` or `app.immigrationhorizons.com` |

## What this runbook does not do

It does not remove the EJS CMS, migrate Firebase login, wire more CMS content into the public site, or change the Staff app. Retiring `/admin` is a later, separate decision.
