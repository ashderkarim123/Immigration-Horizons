# DEPLOYMENT.md

# Immigration Horizons Deployment Guide

Version: 1.0

---

# Purpose

Defines the target deployment process for development, staging, and production.

**Scope note (Current vs Target)**: this describes a Dev → Staging → Production pipeline; **there is no staging environment today**. The repo's own root `DEPLOYMENT.md` is the authoritative, detailed, current process (single VPS, PM2, nginx, direct dev → production) — read that first for anything you're actually about to do. Treat this file as the target shape, not the current runbook.

---

# Environments

- Development
- Staging
- Production

---

# Deployment Flow

Development

↓

Testing

↓

Staging

↓

QA Approval

↓

Production

---

# Requirements

- Successful Build
- TypeScript Clean
- Lint Clean
- Tests Passed
- Environment Variables Configured

---

# Environment Variables

Manage separately for each environment.

Never commit secrets.

---

# Database

- Backup before deployment
- Run migrations if required
- Verify connectivity

---

# Deployment Checklist

- Build
- Smoke Test
- Health Check
- Forms
- Authentication
- Dashboard
- CMS
- Blog
- SEO
- Analytics

---

# Rollback

Keep previous deployment available.

Rollback immediately if critical issues occur.

---

# Monitoring

Monitor

- Errors
- Performance
- API Health
- Database
- Uptime

---

# Success Criteria

Every deployment should be repeatable, secure, and minimize downtime.