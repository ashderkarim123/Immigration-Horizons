# Contabo VPS — complete setup and CI/CD guide

**Written:** 2026-09-04 · For `vmi3538706` (`169.58.250.40`), Ubuntu 24.04.4 LTS.

This is the runbook. `VPS_MIGRATION.md` is the *why* and the readiness
checks; this is the *how*, with the commands for this specific machine.

Work through it in order. Sections 1–4 are one-time server setup, 5 is DNS
and mail, 6 is the first deploy, 7 is CI/CD, 8 is the go-live checklist.

Budget about three hours, plus DNS propagation.

---

## 0. Your server, and what to fix about it

```
Host      vmi3538706 · Contabo · KVM
OS        Ubuntu 24.04.4 LTS (noble), kernel 6.8.0-136
CPU       6 vCPU AMD EPYC @ 2.0GHz
RAM       11 GiB   ← no swap
Disk      193 GB, 2.8 GB used
IPv4      169.58.250.40
IPv6      2a02:c207:2353:8706::1
```

Comfortably sized — the constraint will be disk if document uploads grow,
not CPU or RAM. Four things to deal with before anything else:

| Finding | Why it matters | Fixed in |
|---|---|---|
| **You are logged in as `root`** | Everything runs as root, and a single app bug is a full compromise | §2.1 |
| **No swap** | `next build` peaks around 2–3 GB; 11 GB covers it, but zero swap means the OOM killer has no runway at all | §1.3 |
| **No firewall** | Contabo ships none. Ports 3000/4000 would be open to the internet the moment you start the apps | §2.3 |
| **`docker0` exists, DOWN** | Docker is installed and unused. Its default bridge can conflict with UFW rules | §1.4 |

---

## 1. Base system

SSH in as root for this section only.

### 1.1 Update and set the hostname

```bash
apt update && apt upgrade -y
hostnamectl set-hostname immigrationhorizons
timedatectl set-timezone UTC
```

> Keep the **server** on UTC and set the business timezone in `APP_TIMEZONE`.
> Mixing the two is how "today's consultations" ends up wrong by a day.

### 1.2 Install what you need

```bash
# Node 20 LTS. Ubuntu 24.04's own repo has Node 18, which Next.js 16 rejects.
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs git nginx ufw fail2ban curl unzip

npm install -g pm2

node -v    # expect v20.x
nginx -v
```

### 1.3 Add swap

```bash
fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Prefer RAM; swap is insurance, not working memory.
sysctl -w vm.swappiness=10
echo 'vm.swappiness=10' >> /etc/sysctl.conf

free -h    # Swap should now show 4.0Gi
```

### 1.4 Deal with Docker

You are not using it. Either remove it:

```bash
apt remove -y docker.io docker-ce containerd runc 2>/dev/null || true
ip link delete docker0 2>/dev/null || true
```

…or, if you want to keep it, know that **Docker writes iptables rules that
bypass UFW**. If you ever run a container with `-p 3000:3000`, it is exposed
to the internet regardless of what UFW says.

---

## 2. Users, SSH, firewall

### 2.1 Create the deploy user

> **If you are logged into root with a password** — which is Contabo's
> default — read this whole section before running any of it. You need a
> working SSH key *and* a sudo password for `deploy` before §2.2, or the
> hardening step locks you out of SSH entirely.
>
> It is recoverable if that happens: Contabo's customer panel has a **VNC
> console** that does not go through SSH. But it is far easier not to need it.

**Step 1 — generate a key on your own machine**, not on the server. The
private half should never exist on a box that faces the internet.

```powershell
# Windows PowerShell. Press Enter for the default path; a passphrase is
# optional but worth setting.
ssh-keygen -t ed25519 -C "ashder@immigrationhorizons"

# Copy the PUBLIC half — the line starting `ssh-ed25519`.
type $env:USERPROFILE\.ssh\id_ed25519.pub
```

**Step 2 — create the user and install that key**, as root on the server:

```bash
# Safe to re-run: skips creation if the account already exists.
id deploy >/dev/null 2>&1 || adduser --disabled-password --gecos "" deploy
usermod -aG sudo deploy

mkdir -p /home/deploy/.ssh

# Paste YOUR public key between the quotes, on one line.
echo 'ssh-ed25519 AAAA...paste-your-public-key... ashder@immigrationhorizons' \
  > /home/deploy/.ssh/authorized_keys

chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

**Step 3 — set a password for `deploy`.** This is not for logging in — §2.2
turns off password authentication over SSH. It is what `sudo` prompts for,
and without it `deploy` cannot run any of the `sudo` commands in §3 and §6:

```bash
passwd deploy
```

> `adduser --disabled-password` creates the account with its password field
> locked. That is correct for SSH, but `sudo` authenticates against the same
> field — so a `deploy` user who never gets a password is in the `sudo` group
> and still cannot use it. Setting one here, and disabling password *login*
> in §2.2, gives you both halves.

**Step 4 — prove it works before hardening anything.** Leave your root
session open and use a **second terminal**:

```powershell
ssh deploy@169.58.250.40
```

```bash
# in that new session
whoami        # deploy
sudo whoami   # root, after entering the password from Step 3
```

Both must succeed. Only then continue to §2.2.

### 2.2 Harden SSH

```bash
cat > /etc/ssh/sshd_config.d/99-hardening.conf <<'EOF'
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
X11Forwarding no
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
AllowUsers deploy
EOF

sshd -t && systemctl restart ssh
```

`sshd -t` validates before restarting. If it prints nothing, the config is
good.

> **If you do lock yourself out:** Contabo's customer control panel has a
> **VNC / noVNC console** that connects below SSH and is unaffected by any of
> this. Log in there as `root` with the password Contabo issued, then
> `rm /etc/ssh/sshd_config.d/99-hardening.conf && systemctl restart ssh` to
> undo it and start again. Worth confirming that console works *before* you
> run the block above.

### 2.3 Firewall

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
ufw status verbose
```

**Ports 3000 and 4000 must not appear.** nginx reaches them on loopback.
Verify from your own machine — this must fail:

```bash
curl --max-time 5 http://169.58.250.40:3000    # expect a timeout
```

### 2.4 fail2ban

```bash
cat > /etc/fail2ban/jail.local <<'EOF'
[sshd]
enabled = true
maxretry = 4
findtime = 10m
bantime = 1h
EOF

systemctl enable --now fail2ban
fail2ban-client status sshd
```

From here on, **work as `deploy`**, not root.

---

## 3. Directory layout

```bash
sudo mkdir -p /srv/immigration-horizons/{releases,shared/{logs,uploads,private-documents,bin},repo-cache}
sudo chown -R deploy:deploy /srv/immigration-horizons
chmod 700 /srv/immigration-horizons/shared/private-documents
```

You end up with:

```
/srv/immigration-horizons/
├── current -> releases/20260904…    the live release (a symlink)
├── releases/                        last 5 builds; rollback = move the symlink
├── repo-cache/                      one git clone, worktrees per release
└── shared/                          survives every deploy
    ├── root.env                     the Next.js app's .env
    ├── server.env                   the admin CMS's .env
    ├── uploads/                     admin media library
    ├── private-documents/           CLIENT PASSPORTS — mode 700, back this up
    ├── logs/
    └── bin/                         deploy scripts (bootstrap copies)
```

**Why release directories rather than `git pull`:** `npm run build` rewrites
`.next/` in place, and Next.js reads chunks from disk on demand. Building
underneath the live process gives visitors 60–90 seconds of missing chunks
and 500s on every deploy. Building a new directory and moving a symlink means
the running process never sees a half-written build — and rollback becomes a
symlink move instead of a rebuild.

### 3.1 Give the server read access to GitHub

The VPS has to `git clone` and `git fetch` your repository on every deploy,
so it needs its own key.

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N "" -C "vmi3538706-deploy"
cat ~/.ssh/github_deploy.pub
```

Copy that whole line, then **in a browser**:

1. `github.com/ashderkarim123/Immigration-Horizons` → **Settings**
2. **Deploy keys** in the left sidebar → **Add deploy key**
3. Title `vmi3538706`, and paste the key into the Key box
4. **Leave "Allow write access" unticked** → *Add key*

> A **deploy key** grants access to one repository only. Your personal SSH
> key would give this server access to everything in your GitHub account,
> which is far more than it needs — it only ever reads this one repo, and
> never pushes, so write access would be permission it never uses.

> **This is not the same key as the one in §7.1.** They point in opposite
> directions and are easy to confuse:
>
> | | §3.1 `github_deploy` | §7.1 `ci_deploy` |
> |---|---|---|
> | Direction | VPS → GitHub | GitHub Actions → VPS |
> | Purpose | the server pulls your code | CI triggers a deploy |
> | Public half goes to | GitHub → repo **Deploy keys** | the VPS's `authorized_keys` |
> | Private half stays | on the VPS | in GitHub **Secrets** |

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/github_deploy
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config

ssh -T git@github.com    # "successfully authenticated" — shell access denied is expected
```

---

## 4. MongoDB Atlas

Free M0 is enough to launch; move to M10 when documents grow.

1. Create a cluster in the region closest to Contabo's datacentre.
2. **Database Access** → add user `ih_app` with **Read and write to any
   database** scoped to `immigration-horizons`. Not an admin user.
3. **Network Access** → add `169.58.250.40/32`. Not `0.0.0.0/0`.
4. Copy the connection string; append the database name:

```
mongodb+srv://ih_app:PASSWORD@cluster0.xxxxx.mongodb.net/immigration-horizons?retryWrites=true&w=majority
```

> On M0 there are **no managed backups**. §9 sets up your own.

---

## 5. DNS and mail (GoDaddy)

This is the section that most often goes wrong, and the part that is hardest
to debug afterwards. Read it before touching the GoDaddy panel.

### 5.1 The mail decision — read this first

You have GoDaddy mail for `immigrationhorizons.com` — one mailbox with
several aliases. That is the right place for *human* correspondence:
`info@`, `rahat@`.

**Do not send the application's mail through it**, whichever GoDaddy product
it turns out to be. Check which you have — it only matters so you know what
to leave alone in DNS:

```bash
dig +short MX immigrationhorizons.com
```

| MX answer | Product |
|---|---|
| `…mail.protection.outlook.com` | Microsoft-backed (Microsoft 365 / Professional Email) |
| `smtp.secureserver.net`, `mailstore1.secureserver.net` | GoDaddy Workspace Email (legacy) |

The reasons not to route app mail through either:

1. **Send limits.** Legacy Workspace Email allows a few hundred messages a
   day. Microsoft 365 allows roughly 30 a minute and 10,000 recipients a
   day, and its terms discourage app-generated mail outright. Marketing
   automation hits both ceilings.
2. **Authentication is unreliable or absent.** Microsoft has been switching
   off Basic Auth (SMTP AUTH) — off by default on new tenants and being
   permanently disabled — so SMTP that works today can stop without warning,
   and the symptom is "invitations silently stopped arriving". The legacy
   product has no sending API at all.
3. **Aliases cannot send.** On Microsoft-backed plans an alias is
   receive-only; you can only authenticate as the primary mailbox. So the
   tidy `notifications@` sender you would want does not exist as a
   credential.
4. **A shared sending reputation.** App mail marked as spam damages
   deliverability for the mailbox your clients actually reply to — and with
   a single mailbox, that is the only one you have.

**Recommended split:**

| Mail | Sent by | From |
|---|---|---|
| Human correspondence | GoDaddy Outlook (M365) | `info@immigrationhorizons.com` |
| App transactional — invites, resets, notifications | Resend (or SES) | `notifications@send.immigrationhorizons.com` |
| Marketing / automation (later) | A separate subdomain again | `news@mail.immigrationhorizons.com` |

Sending app mail from the **subdomain** `send.immigrationhorizons.com` is the
key move. It gets its own SPF/DKIM/DMARC and leaves your existing M365
records on the root domain completely untouched — so there is no way to break
`info@` while configuring the app, and a deliverability problem on one side
cannot drag down the other.

The code already supports either transport (`MAIL_TRANSPORT=resend|smtp`), so
this is a configuration choice, not a code change.

### 5.2 DNS records at GoDaddy

GoDaddy → **My Products → DNS → Manage Zones → immigrationhorizons.com**.

**First, delete GoDaddy's parking records** — the `@` A record pointing at a
GoDaddy IP, and any `www` CNAME to `@parked`. Leaving them means the site
resolves to a GoDaddy placeholder for some visitors.

**Then add:**

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `@` | `169.58.250.40` | 600 |
| A | `www` | `169.58.250.40` | 600 |
| A | `app` | `169.58.250.40` | 600 |
| A | `admin` | `169.58.250.40` | 600 |

**Leave every existing MX, and the `autodiscover` / `_dmarc` / SPF records
that GoDaddy created for Microsoft 365, exactly as they are.** Touching those
breaks your existing email.

> **Set TTL to 600 now**, a day before cutover. GoDaddy defaults to 1 hour,
> and you want a fast rollback if something is wrong.

**Do not add AAAA records** unless you also confirm nginx is listening on
IPv6. The configs in `scripts/deploy/nginx/` do listen on `[::]`, so you may
add them — but a half-configured IPv6 path produces intermittent failures for
some visitors only, which is miserable to diagnose. IPv4-only is fine.

### 5.3 Set up the sending subdomain in Resend

1. Resend → **Domains → Add Domain** → `send.immigrationhorizons.com`.
2. Resend gives you three records. Add them at GoDaddy **exactly as shown**,
   with the host names as given:

| Type | Name | Purpose |
|---|---|---|
| TXT | `send` | SPF |
| TXT | `resend._domainkey.send` | DKIM |
| MX | `send` | bounce handling |

> GoDaddy appends the domain automatically. If Resend says the record is for
> `send.immigrationhorizons.com`, enter `send` — not the full name, or you
> will create `send.immigrationhorizons.com.immigrationhorizons.com`.

3. Add a DMARC record for the subdomain:

| Type | Name | Value |
|---|---|---|
| TXT | `_dmarc.send` | `v=DMARC1; p=none; rua=mailto:info@immigrationhorizons.com` |

> Point `rua=` at an address that **actually receives**. Reports are noisy
> XML, so a dedicated `dmarc@` alias is tidier if your plan allows one — but
> an alias that does not exist means the reports bounce, which is worse than
> sending them to your main inbox.

Start at `p=none` and read the reports for a couple of weeks before
tightening to `quarantine`. Jumping straight to `p=reject` on a new sending
domain is how legitimate mail disappears.

4. Wait for Resend to show **Verified**, then generate an API key.

`EMAIL_FROM` becomes:

```
EMAIL_FROM=Immigration Horizons <notifications@send.immigrationhorizons.com>
```

### 5.4 If you must use SMTP instead

The code supports it. Point it at a relay, **never at a mail server on this
VPS** — Contabo IP ranges are blocklisted by default at most providers and
you cannot fix that from the server.

For GoDaddy/M365, if your tenant still permits SMTP AUTH:

```bash
MAIL_TRANSPORT=smtp
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_USER=notifications@immigrationhorizons.com
SMTP_PASSWORD=<mailbox password or app password>
SMTP_SECURE=false        # 587 is STARTTLS
```

You must first enable it: **Microsoft 365 admin → Users → Active users →
select the mailbox → Mail → Manage email apps → tick Authenticated SMTP**.

Re-read §5.1 before choosing this.

---

## 6. First deploy

### 6.1 Bootstrap the deploy scripts

```bash
cd /srv/immigration-horizons
git clone git@github.com:ashderkarim123/Immigration-Horizons.git repo-cache
cp repo-cache/scripts/deploy/deploy.sh              shared/bin/
cp repo-cache/scripts/deploy/ssh-forced-command.sh  shared/bin/
chmod +x shared/bin/*.sh
```

### 6.2 Write the two `.env` files

They are **separate files with different values**. Generate the secrets
first:

```bash
node -e "console.log('SESSION_SECRET=' + require('crypto').randomBytes(48).toString('hex'))"
cd repo-cache && npm i bcryptjs --no-save >/dev/null 2>&1
node -e "console.log('ADMIN_PASSWORD_HASH=' + require('bcryptjs').hashSync('PICK-A-REAL-PASSWORD', 12))"
cd ..
```

```bash
nano /srv/immigration-horizons/shared/root.env
```

```bash
NODE_ENV=production
PORT=3000

# NOT the marketing domain. This is the portal/staff host.
SITE_URL=https://app.immigrationhorizons.com
NEXT_PUBLIC_SITE_URL=https://immigrationhorizons.com
SITE_DOMAIN=immigrationhorizons.com

MONGODB_URI=mongodb+srv://ih_app:PASSWORD@cluster0.xxxxx.mongodb.net/immigration-horizons?retryWrites=true&w=majority

MAIL_TRANSPORT=resend
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxx
EMAIL_FROM=Immigration Horizons <notifications@send.immigrationhorizons.com>
CONTACT_RECEIVER_EMAIL=info@immigrationhorizons.com

# REQUIRED — the app refuses to start without it.
PRIVATE_DOCUMENT_ROOT=/srv/immigration-horizons/shared/private-documents

APP_TIMEZONE=America/New_York

SESSION_SECRET=<the hex you generated>
ADMIN_USERNAME=<something non-obvious>
ADMIN_PASSWORD_HASH=<the bcrypt hash>

NEXT_PUBLIC_CONTACT_EMAIL=info@immigrationhorizons.com
```

```bash
nano /srv/immigration-horizons/shared/server.env
```

```bash
NODE_ENV=production
PORT=4000

# The ADMIN host — a different value from root.env's SITE_URL.
SITE_URL=https://admin.immigrationhorizons.com

MONGODB_URI=<the same connection string>

SESSION_SECRET=<a DIFFERENT hex value>
ADMIN_USERNAME=<same as root.env>
ADMIN_PASSWORD_HASH=<same hash>

MAIL_TRANSPORT=resend
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxx
EMAIL_FROM=Immigration Horizons <notifications@send.immigrationhorizons.com>
CONTACT_RECEIVER_EMAIL=info@immigrationhorizons.com

# Must be the SAME directory as root.env — either app can serve a download.
PRIVATE_DOCUMENT_ROOT=/srv/immigration-horizons/shared/private-documents

# Must MATCH root.env or the two disagree about which day "today" is.
APP_TIMEZONE=America/New_York
```

```bash
chmod 600 /srv/immigration-horizons/shared/*.env
```

> **`SITE_URL` is the single highest-risk variable.** In `root.env` it drives
> the CSRF Origin check on every mutating portal and staff route. Get it
> wrong and every page loads perfectly while **every write returns 403** —
> the most time-wasting failure mode in this stack.

### 6.3 Run the first deploy

```bash
/srv/immigration-horizons/shared/bin/deploy.sh origin/main
```

It clones, installs both apps, builds, symlinks shared state, starts PM2,
and health-checks. If the health check fails it rolls back automatically.

```bash
pm2 list          # ih-web (2, cluster) and ih-admin (1, fork) online
pm2 startup       # run the command it prints, with sudo
pm2 save
```

### 6.4 nginx and TLS

```bash
sudo cp /srv/immigration-horizons/current/scripts/deploy/nginx/*.conf \
        /etc/nginx/sites-available/

cd /etc/nginx/sites-enabled
sudo ln -sf ../sites-available/immigrationhorizons.com.conf .
sudo ln -sf ../sites-available/app.immigrationhorizons.com.conf .
sudo ln -sf ../sites-available/admin.immigrationhorizons.com.conf .
sudo rm -f default

sudo nginx -t && sudo systemctl reload nginx
```

**Wait until DNS resolves to your IP before running certbot** — it fails
otherwise, and repeated failures hit Let's Encrypt rate limits:

```bash
dig +short immigrationhorizons.com app.immigrationhorizons.com admin.immigrationhorizons.com
# all three must return 169.58.250.40
```

```bash
sudo apt install -y certbot python3-certbot-nginx

sudo certbot --nginx \
  -d immigrationhorizons.com -d www.immigrationhorizons.com \
  -d app.immigrationhorizons.com \
  -d admin.immigrationhorizons.com \
  --agree-tos -m info@immigrationhorizons.com --redirect

sudo certbot renew --dry-run
```

### 6.5 Create the database indexes — never yet done

```bash
cd /srv/immigration-horizons/current
npm run db:indexes:dry-run     # prints what it would create, connects to nothing
npm run db:indexes
cd server && npm run db:indexes
```

Additive only; safe to re-run. This matters beyond speed — several are
**unique** constraints (`ClientUser.normalizedEmail`, `ClientCase.caseNumber`)
and until they exist nothing at the database level prevents duplicates.

### 6.6 Verify mail — never yet done

```bash
cd /srv/immigration-horizons/current
npm run mail:check -- --send your-personal@gmail.com

cd server
npm run mail:check -- --send your-personal@gmail.com
```

Both must pass, and **you must open the message**. Check whether it landed in
spam — that is a DNS question (§5.3), and only a real send answers it.

---

## 7. CI/CD

Push to `main` → tests run → deploy. Nothing reaches the server on a red
build.

### 7.1 Create the CI deploy key

**On the server**, as `deploy`:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/ci_deploy -N "" -C "github-actions"

# Restrict it to ONE command. Whatever GitHub sends, sshd runs only the
# wrapper — no shell, no port forwarding, no file copy.
cat >> ~/.ssh/authorized_keys <<EOF
command="/srv/immigration-horizons/shared/bin/ssh-forced-command.sh",no-agent-forwarding,no-port-forwarding,no-pty,no-user-rc,no-X11-forwarding $(cat ~/.ssh/ci_deploy.pub)
EOF

echo "--- PRIVATE KEY: copy into the GitHub secret, then delete it here ---"
cat ~/.ssh/ci_deploy
echo "--- KNOWN HOSTS: copy into the GitHub secret ---"
ssh-keyscan -t ed25519 169.58.250.40 2>/dev/null
```

Then remove the private key from the server — GitHub is the only place it
needs to exist:

```bash
rm ~/.ssh/ci_deploy
```

> **Why the forced command matters.** A GitHub Actions secret is readable by
> anyone who can push a workflow file. Without the restriction, a leaked key
> is a root-capable shell on the machine holding client passports. With it,
> the worst case is an unwanted deploy of a commit already on `main`.

### 7.2 Add the GitHub secrets

Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Value |
|---|---|
| `DEPLOY_SSH_KEY` | the full private key, `-----BEGIN` through `-----END` |
| `DEPLOY_HOST` | `169.58.250.40` |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_KNOWN_HOSTS` | the `ssh-keyscan` output line |

Then **Settings → Environments → New environment → `production`**. Add
yourself as a required reviewer if you want to approve each deploy — turn
this on once you have real clients.

### 7.3 What the workflows do

`.github/workflows/ci.yml` — on every push and PR:

- lint, `tsc --noEmit`, `next build`
- the root suite (315 tests) and the admin suite (417) as **separate parallel
  jobs**, each with its own MongoDB service container

  > They must not share a database: both call `clearCollections()` between
  > tests and would delete each other's fixtures. Separate databases is what
  > makes running them in parallel safe at all — locally, where they spawn
  > their own `mongodb-memory-server`, you must still run them **sequentially**.

`.github/workflows/deploy.yml` — on a green CI run on `main`:

- SSH with a pinned host key (never `StrictHostKeyChecking=no`)
- triggers the deploy, streams its output into the Actions log
- curls all three hostnames afterwards

### 7.4 Your day-to-day loop

```bash
git checkout -b feature/whatever
# work, commit
git push -u origin feature/whatever      # CI runs; no deploy
# open a PR, merge to main               # CI runs, then deploys
```

Deploy a specific commit, or roll back, from **Actions → Deploy to
production → Run workflow**, entering a ref.

Manual rollback on the server, if you ever need it:

```bash
ls -1t /srv/immigration-horizons/releases | head -5
ln -sfn /srv/immigration-horizons/releases/<previous> /srv/immigration-horizons/current
pm2 reload /srv/immigration-horizons/current/ecosystem.config.js --update-env
```

---

## 8. Go-live checklist

Do all of this before you tell anyone the site is live.

**Infrastructure**
- [ ] `pm2 list` — both online, restart count 0
- [ ] `sudo ufw status` — only OpenSSH and Nginx Full
- [ ] `curl --max-time 5 http://169.58.250.40:3000` from elsewhere **fails**
- [ ] `sudo certbot renew --dry-run` passes
- [ ] `free -h` shows 4 GB swap
- [ ] `ssh root@169.58.250.40` is **refused**

**Host separation** (routing, not authorization — ADR-008)
- [ ] `immigrationhorizons.com/portal` does **not** serve the portal
- [ ] `app.immigrationhorizons.com/portal/login` loads
- [ ] `admin.immigrationhorizons.com/admin/login` loads
- [ ] `curl -I https://app.immigrationhorizons.com/portal/login` shows
      `X-Robots-Tag: noindex` and `Cache-Control: private, no-store`
- [ ] `immigrationhorizons.com/robots.txt` allows; the other two `Disallow: /`

**The 403 trap — test writes, not page loads**
- [ ] Log into the portal and **change your profile**. A 403 means
      `SITE_URL` in `root.env` is wrong.
- [ ] Change a case stage in `/staff`.
- [ ] Submit any form in the admin CMS. A 403 there means the CSRF token is
      not rendering.

**Mail, end to end**
- [ ] Invite a client from the admin CMS — the email arrives
- [ ] The activation link points at `app.immigrationhorizons.com`
- [ ] Activation completes and the client can sign in
- [ ] A password reset link works
- [ ] **Check the spam folder for all of the above**

**Security**
- [ ] Five wrong admin passwords locks the account for 15 minutes
- [ ] A login appears in `security_events` within seconds
- [ ] `db.security_events.getIndexes()` shows six indexes
- [ ] You signed in with a real `/admin/users` account, not the env fallback

**Data**
- [ ] Submit a consultation on the public site — it lands in Mongo **and** emails
- [ ] Upload a document in the portal, then download it back
- [ ] The file is under `shared/private-documents/`, not in a release directory

**Recovery**
- [ ] A database backup exists (§9)
- [ ] An uploads backup exists (§9)
- [ ] You have rolled back once, deliberately, to prove it works

---

## 9. Backups and scheduled jobs

Two things need backing up. Only one has a provider behind it.

```bash
sudo apt install -y mongodb-database-tools
mkdir -p /srv/backups && sudo chown deploy:deploy /srv/backups
```

```bash
crontab -e
```

```cron
# Database — nightly, keep 14 days
0 2 * * * mongodump --uri="mongodb+srv://ih_app:PASSWORD@cluster0.xxxxx.mongodb.net/immigration-horizons" --archive=/srv/backups/db-$(date +\%F).gz --gzip >> /srv/immigration-horizons/shared/logs/backup.log 2>&1
30 2 * * * find /srv/backups -name 'db-*.gz' -mtime +14 -delete

# Documents and uploads — CLIENT PASSPORTS. Nothing else backs these up.
0 3 * * * tar -czf /srv/backups/files-$(date +\%F).tar.gz -C /srv/immigration-horizons/shared private-documents uploads >> /srv/immigration-horizons/shared/logs/backup.log 2>&1
30 3 * * * find /srv/backups -name 'files-*.tar.gz' -mtime +14 -delete

# Notification digests
0 8 * * * cd /srv/immigration-horizons/current/server && npm run notifications:send-digests:apply >> /srv/immigration-horizons/shared/logs/digests.log 2>&1

# Retention purge — DRY RUN only. Review, then apply by hand (ADR-014 §3).
0 4 * * 0 cd /srv/immigration-horizons/current && npm run db:purge >> /srv/immigration-horizons/shared/logs/purge.log 2>&1
```

> **`/srv/backups` is on the same disk as the application.** That protects
> you from a bad deploy or a bad migration, not from losing the server. Copy
> the archives somewhere else — Contabo object storage, S3, or a scheduled
> `rsync` to another machine — before you carry real client data.

**Test a restore once.** A backup you have never restored is a hypothesis.

---

## 10. Known gaps you are launching with

Decisions, not surprises. Tracked in `docs/security/THREAT_MODEL.md §4`.

- **No malware scanning** on uploads. Extension + declared MIME + magic-byte
  validation stops a renamed executable; nothing scans content.
- **No 2FA** on any surface.
- **Documents on local disk.** Correct on one VPS with backups; blocks a
  second app instance. Move to S3 before scaling horizontally.
- **No error tracking or uptime monitoring.** Cycle 13. Until then,
  `pm2 logs` and the backup log are what you have — put an uptime check
  (UptimeRobot or similar) on all three hostnames on day one; it is free and
  takes five minutes.
- **Append-only audit is enforced in the application only.** A raw Mongo
  connection can still rewrite `security_events`; keep `ih_app` scoped to
  `readWrite` and keep the Atlas admin credentials separate.
- **`p=none` DMARC** until you have read a fortnight of reports.
