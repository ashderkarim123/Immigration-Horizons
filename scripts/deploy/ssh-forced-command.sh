#!/usr/bin/env bash
#
# Forced command for the CI deploy key.
#
# Referenced from ~/.ssh/authorized_keys on the server:
#
#   command="/srv/immigration-horizons/shared/bin/ssh-forced-command.sh",\
#   no-agent-forwarding,no-port-forwarding,no-pty,no-user-rc,no-X11-forwarding \
#   ssh-ed25519 AAAA... github-actions-deploy
#
# With that in place the key CANNOT open a shell, forward a port, or run
# anything else — whatever the client asks for, sshd runs only this script
# and puts the requested command in SSH_ORIGINAL_COMMAND for us to inspect.
#
# That matters because a GitHub Actions secret is readable by anyone who can
# push a workflow file to the repo. Restricting the key means the worst case
# of a leak is an unwanted deploy of a commit already on main, not a root
# shell on the box holding client passports.

set -Eeuo pipefail

APP_ROOT="${APP_ROOT:-/srv/immigration-horizons}"
LOG="$APP_ROOT/shared/logs/deploy.log"

# Prefer the script from the live release, so it stays version-controlled
# and a change to it ships with the commit that needs it. Fall back to the
# copy in shared/bin, which is what the very first deploy uses — `current`
# does not exist yet at that point.
DEPLOY="$APP_ROOT/current/scripts/deploy/deploy.sh"
[[ -x "$DEPLOY" ]] || DEPLOY="$APP_ROOT/shared/bin/deploy.sh"

mkdir -p "$(dirname "$LOG")"

deny() {
  printf 'Refused: %s\n' "$1" >&2
  printf '%s  REFUSED  from=%s  cmd=%q  reason=%s\n' \
    "$(date -uIseconds)" "${SSH_CLIENT%% *}" "${SSH_ORIGINAL_COMMAND:-}" "$1" >> "$LOG"
  exit 1
}

REQUEST="${SSH_ORIGINAL_COMMAND:-}"

# An empty command means someone tried to open an interactive shell.
[[ -n "$REQUEST" ]] || deny "interactive shell is not permitted for this key"

read -r VERB REF _EXTRA <<<"$REQUEST"

[[ "$VERB" == "deploy" ]] || deny "only 'deploy [ref]' is permitted"
[[ -z "${_EXTRA:-}" ]]    || deny "unexpected extra arguments"

REF="${REF:-origin/main}"

# A git ref, nothing else. Without this, `deploy 'main; rm -rf /'` would be
# passed straight into the deploy script's own git invocations.
[[ "$REF" =~ ^[A-Za-z0-9._/-]{1,120}$ ]] || deny "ref contains characters that are not allowed"
[[ "$REF" != *".."* ]]                   || deny "ref may not contain '..'"

[[ -x "$DEPLOY" ]] || deny "deploy script not found or not executable at $DEPLOY"

printf '%s  DEPLOY   from=%s  ref=%s\n' \
  "$(date -uIseconds)" "${SSH_CLIENT%% *}" "$REF" >> "$LOG"

# Unbuffered through tee so GitHub Actions shows progress live rather than
# in one block when the deploy finishes.
exec "$DEPLOY" "$REF" 2>&1 | tee -a "$LOG"
