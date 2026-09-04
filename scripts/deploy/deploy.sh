#!/usr/bin/env bash
#
# Production deploy for Immigration Horizons.
#
# Runs ON THE SERVER as the `deploy` user. CI triggers it over SSH; you can
# also run it by hand. See docs/deployment/CONTABO_VPS_SETUP.md.
#
#   ./deploy.sh              deploy origin/main
#   ./deploy.sh <ref>        deploy a specific branch, tag or commit
#
# ## Why release directories rather than `git pull` in place
#
# `npm run build` rewrites `.next/` in place. Next.js reads chunks from disk
# on demand, so a build running underneath the live process means ~60-90
# seconds where visitors can get missing chunks and 500s. Building a NEW
# directory and swapping a symlink means the running process never sees a
# half-written build, and rollback is a symlink swap rather than a rebuild.
#
# Anything that must outlive a release — the two .env files, admin uploads,
# private client documents, logs — lives in shared/ and is symlinked in.

set -Eeuo pipefail

APP_ROOT="${APP_ROOT:-/srv/immigration-horizons}"
REPO_URL="${REPO_URL:-git@github.com:ashderkarim123/Immigration-Horizons.git}"
REF="${1:-origin/main}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"

RELEASES="$APP_ROOT/releases"
SHARED="$APP_ROOT/shared"
CURRENT="$APP_ROOT/current"
CACHE="$APP_ROOT/repo-cache"

log()  { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[fail]\033[0m %s\n' "$*" >&2; exit 1; }

# On any failure the new release directory is removed. `current` is only
# ever repointed at the very end, so a failed deploy leaves the running
# release untouched — there is no half-deployed state to clean up by hand.
RELEASE=""
cleanup_failed() {
  local code=$?
  if [[ -n "$RELEASE" && -d "$RELEASE" && "$(readlink -f "$CURRENT" 2>/dev/null)" != "$RELEASE" ]]; then
    warn "Deploy failed (exit $code). Removing incomplete release $RELEASE"
    warn "The live release is unchanged and still serving."
    rm -rf "$RELEASE"
  fi
  exit $code
}
trap cleanup_failed ERR

# ---------------------------------------------------------------------------
# Preflight
# ---------------------------------------------------------------------------
log "Preflight"

[[ -d "$SHARED" ]] || die "$SHARED does not exist — run the first-time setup in CONTABO_VPS_SETUP.md first."
[[ -f "$SHARED/root.env" ]]   || die "$SHARED/root.env is missing (the Next.js app's .env)."
[[ -f "$SHARED/server.env" ]] || die "$SHARED/server.env is missing (the admin CMS's .env)."

command -v node >/dev/null || die "node is not on PATH."
command -v pm2  >/dev/null || die "pm2 is not on PATH."

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[[ "$NODE_MAJOR" -ge 20 ]] || die "Node 20+ required (Next.js 16); found $(node -v)."

mkdir -p "$RELEASES" "$SHARED/logs"

# ---------------------------------------------------------------------------
# Fetch
# ---------------------------------------------------------------------------
log "Fetching $REF"

if [[ ! -d "$CACHE/.git" ]]; then
  git clone --quiet "$REPO_URL" "$CACHE"
fi
git -C "$CACHE" remote set-url origin "$REPO_URL"
git -C "$CACHE" fetch --quiet --all --prune --tags
SHA="$(git -C "$CACHE" rev-parse --short "$REF")"
SUBJECT="$(git -C "$CACHE" log -1 --pretty=%s "$REF")"

TIMESTAMP="$(date -u +%Y%m%d%H%M%S)"
RELEASE="$RELEASES/${TIMESTAMP}-${SHA}"

log "Building release ${TIMESTAMP}-${SHA}"
echo "    $SUBJECT"

git -C "$CACHE" worktree add --quiet --detach "$RELEASE" "$REF"

# ---------------------------------------------------------------------------
# Link shared state IN before building — the build reads .env
# ---------------------------------------------------------------------------
log "Linking shared state"

ln -sfn "$SHARED/root.env"   "$RELEASE/.env"
ln -sfn "$SHARED/server.env" "$RELEASE/server/.env"

# Admin CMS uploads. Gitignored, so nothing in the release overwrites them,
# but they must survive the release being deleted.
mkdir -p "$SHARED/uploads"
rm -rf "$RELEASE/server/public/uploads"
ln -sfn "$SHARED/uploads" "$RELEASE/server/public/uploads"

# Private client documents are NOT symlinked — PRIVATE_DOCUMENT_ROOT points
# both apps straight at shared/private-documents, outside any release.
mkdir -p "$SHARED/private-documents"
chmod 700 "$SHARED/private-documents"

# ---------------------------------------------------------------------------
# Install and build
# ---------------------------------------------------------------------------
log "Installing dependencies (npm ci, both apps)"
# --include=dev is required here, not optional: `next build` needs
# tailwindcss, @tailwindcss/postcss, and typescript, all devDependencies.
# npm's own docs warn that a bare `npm ci` silently omits devDependencies
# whenever NODE_ENV=production is already set in the environment it runs
# in — true regardless of any --omit/--include flag you didn't pass. This
# release's own .env (just linked in above, with NODE_ENV=production) is
# exactly that trigger the moment anything sources it into this shell, so
# the flag has to be explicit rather than relying on npm's default. The
# server's own npm ci is the mirror image, deliberately: server/ has no
# build step, so its devDependencies (mocha, etc.) are never needed here.
( cd "$RELEASE"        && npm ci --no-audit --no-fund --include=dev )
( cd "$RELEASE/server" && npm ci --no-audit --no-fund --omit=dev )

log "Building the Next.js app"
( cd "$RELEASE" && npm run build )

# The admin CMS has no build step, but a syntax error should surface here
# rather than as a PM2 crash loop after the symlink has already moved.
log "Smoke-checking the admin CMS entrypoint"
( cd "$RELEASE/server" && node --check server.js && node --check app.js )

# ---------------------------------------------------------------------------
# Swap
# ---------------------------------------------------------------------------
PREVIOUS="$(readlink -f "$CURRENT" 2>/dev/null || true)"

log "Activating"
ln -sfn "$RELEASE" "$CURRENT"

# --update-env so a changed .env is picked up; reload (not restart) so the
# clustered web app rolls workers rather than dropping connections.
if pm2 describe ih-web >/dev/null 2>&1; then
  pm2 reload "$RELEASE/ecosystem.config.js" --update-env
else
  pm2 start "$RELEASE/ecosystem.config.js"
fi
pm2 save --force >/dev/null

# ---------------------------------------------------------------------------
# Verify — and roll back automatically if the new release cannot serve
# ---------------------------------------------------------------------------
log "Verifying"

check() {
  local url="$1" name="$2"
  for _ in $(seq 1 20); do
    if curl -fsS -o /dev/null --max-time 5 "$url"; then
      echo "    OK   $name"
      return 0
    fi
    sleep 1
  done
  echo "    FAIL $name ($url)"
  return 1
}

HEALTHY=0
check "http://127.0.0.1:3000/"      "web (marketing)" && \
check "http://127.0.0.1:4000/admin/login" "admin CMS" && HEALTHY=1

if [[ "$HEALTHY" -ne 1 ]]; then
  warn "The new release is not serving."
  if [[ -n "$PREVIOUS" && -d "$PREVIOUS" && "$PREVIOUS" != "$RELEASE" ]]; then
    warn "Rolling back to $(basename "$PREVIOUS")"
    ln -sfn "$PREVIOUS" "$CURRENT"
    pm2 reload "$PREVIOUS/ecosystem.config.js" --update-env
    pm2 save --force >/dev/null
    warn "Rolled back. Logs: pm2 logs --lines 200"
  else
    warn "No previous release to roll back to. Check: pm2 logs --lines 200"
  fi
  # The failed release is kept for inspection; trap only removes releases
  # that never became current, and this one briefly did.
  exit 1
fi

# ---------------------------------------------------------------------------
# Prune
# ---------------------------------------------------------------------------
log "Pruning old releases (keeping $KEEP_RELEASES)"
cd "$RELEASES"
# shellcheck disable=SC2012
ls -1dt "$RELEASES"/*/ 2>/dev/null | tail -n "+$((KEEP_RELEASES + 1))" | while read -r old; do
  echo "    removing $(basename "$old")"
  git -C "$CACHE" worktree remove --force "${old%/}" 2>/dev/null || rm -rf "${old%/}"
done
git -C "$CACHE" worktree prune

trap - ERR
log "Deployed ${TIMESTAMP}-${SHA} — $SUBJECT"
echo "    rollback: ln -sfn <previous-release> $CURRENT && pm2 reload all"
