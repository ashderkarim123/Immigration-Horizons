/**
 * PM2 process definitions for both Node applications.
 *
 * Run from the release directory that `current` points at, so `cwd` is
 * always the live release — see scripts/deploy/deploy.sh and
 * docs/deployment/CONTABO_VPS_SETUP.md.
 *
 * Both apps read their own .env; PM2 is not used to inject secrets. That
 * keeps the credentials in one place per app and out of `pm2 describe`
 * output, which is world-readable to anyone who can run pm2 as the deploy
 * user.
 */
module.exports = {
  apps: [
    {
      name: 'ih-web',
      // The Next.js process serves BOTH immigrationhorizons.com and
      // app.immigrationhorizons.com — they are separated by host in
      // src/proxy.ts, not by process (ADR-008).
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      cwd: '/srv/immigration-horizons/current',

      // Cluster mode is what makes `pm2 reload` a rolling restart rather
      // than a stop/start: PM2 brings up a new worker, waits for it to
      // listen, then retires the old one. 2 instances on 6 vCPU leaves
      // plenty of headroom for the admin app and the build itself.
      instances: 2,
      exec_mode: 'cluster',

      // Next.js does not call process.send('ready'), so wait_ready must
      // stay false — turning it on would make every reload hang until
      // listen_timeout. The rolling behaviour comes from having TWO
      // workers: PM2 replaces them one at a time, so one is always
      // serving even if the other takes a second to bind.
      wait_ready: false,
      listen_timeout: 30000,
      kill_timeout: 10000,

      max_memory_restart: '1G',
      autorestart: true,
      // A crash loop should be visible, not hidden by infinite retries.
      max_restarts: 10,
      min_uptime: '30s',

      env: { NODE_ENV: 'production' },
      error_file: '/srv/immigration-horizons/shared/logs/ih-web.error.log',
      out_file: '/srv/immigration-horizons/shared/logs/ih-web.out.log',
      merge_logs: true,
      time: true,
    },
    {
      name: 'ih-admin',
      script: 'server.js',
      cwd: '/srv/immigration-horizons/current/server',

      // Fork mode, deliberately. The admin CMS uses express-session with a
      // MongoDB store, which would survive clustering — but multer writes
      // uploads to local disk and several routes assume a single writer.
      // One process is correct until that changes.
      instances: 1,
      exec_mode: 'fork',

      kill_timeout: 10000,
      max_memory_restart: '512M',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '30s',

      env: { NODE_ENV: 'production' },
      error_file: '/srv/immigration-horizons/shared/logs/ih-admin.error.log',
      out_file: '/srv/immigration-horizons/shared/logs/ih-admin.out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
