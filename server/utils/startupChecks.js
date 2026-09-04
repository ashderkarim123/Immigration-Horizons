/**
 * Production boot guards for the admin CMS.
 *
 * Extracted from server.js so they can be tested without a process that
 * calls `process.exit()` — the guards are the one part of startup most
 * likely to be wrong in a real deployment, and were previously the only
 * part with no test at all.
 *
 * The rule these encode: refuse to start rather than run with a credential
 * that was never rotated from a documented placeholder. A silent boot on a
 * guessable password is worse than a loud failure.
 */

// bcrypt output: $2a$ / $2b$ / $2y$, a two-digit cost, then 53 chars of
// salt+digest. Checked because a truncated paste produces a value that
// looks plausible and fails every login attempt with no useful error.
const BCRYPT_HASH_RE = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

const PLACEHOLDER_SESSION_SECRETS = [
  'insecure-dev-secret-change-me',
  'change-this-to-a-long-random-string',
  '',
];

const PLACEHOLDER_ADMIN_PASSWORDS = ['admin', 'admin123', 'admin123456', ''];

/**
 * Returns a list of human-readable problems. Empty means safe to boot.
 *
 * @param {Record<string, string | undefined>} env  usually process.env
 */
function productionStartupProblems(env) {
  const problems = [];

  if (PLACEHOLDER_SESSION_SECRETS.includes(env.SESSION_SECRET || '')) {
    problems.push(
      'SESSION_SECRET is unset or still a documented placeholder. Generate one with:\n' +
        '  node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
    );
  }

  // ADMIN_PASSWORD_HASH is the better credential and the login route prefers
  // it, so requiring the plaintext ALONGSIDE it would force an operator who
  // did the more secure thing to also keep a weaker copy on disk. Only one
  // of the two is required — but whichever is present must be real.
  if (env.ADMIN_PASSWORD_HASH) {
    if (!BCRYPT_HASH_RE.test(env.ADMIN_PASSWORD_HASH)) {
      problems.push(
        'ADMIN_PASSWORD_HASH is set but is not a bcrypt hash — it was probably truncated when\n' +
          '  pasted. It must be 60 characters beginning $2a$, $2b$ or $2y$. Regenerate with:\n' +
          '  node -e "console.log(require(\'bcryptjs\').hashSync(\'your-password\', 12))"'
      );
    }
  } else if (PLACEHOLDER_ADMIN_PASSWORDS.includes(env.ADMIN_PASSWORD || '')) {
    problems.push(
      'Neither ADMIN_PASSWORD_HASH nor a real ADMIN_PASSWORD is set. Prefer the hash:\n' +
        '  node -e "console.log(require(\'bcryptjs\').hashSync(\'your-password\', 12))"'
    );
  }

  return problems;
}

module.exports = {
  productionStartupProblems,
  BCRYPT_HASH_RE,
  PLACEHOLDER_SESSION_SECRETS,
  PLACEHOLDER_ADMIN_PASSWORDS,
};
