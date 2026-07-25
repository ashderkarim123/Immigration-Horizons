# Immigration Horizons — Admin CMS

A standalone Express + EJS admin panel that manages the MongoDB behind the
Immigration Horizons website: leads, blog, testimonials, FAQs, SEO, media,
settings, and admin users. It runs independently of the Next.js frontend and
shares only the database.

## Run it

```bash
cd web/server
npm install
cp .env.example .env      # then fill in MONGODB_URI etc.
npm run seed              # optional: migrate existing testimonials/FAQs/settings
npm run dev               # http://localhost:4000/admin
```

## Login

Two ways to authenticate:

- **Environment credentials** — `ADMIN_USERNAME` / `ADMIN_PASSWORD` in `.env`
  (works even before any DB users exist).
- **Database users** — create named, role-based accounts under **Users**
  (`super_admin`, `admin`, `editor`). Passwords are hashed with bcrypt.

## Sections

| Route | What it manages |
|---|---|
| `/admin` | Dashboard — lead + content counts, recent activity |
| `/admin/leads` | Consultation leads — search, filter, paginate, detail, notes, delete, CSV export |
| `/admin/blog` | Blog posts — full CRUD, draft/publish, cover image, tags, SEO |
| `/admin/seo` | Per-page SEO metadata |
| `/admin/testimonials` | Client testimonials CRUD |
| `/admin/faqs` | FAQ CRUD (with homepage / service-page targeting) |
| `/admin/services` | Service page SEO overrides |
| `/admin/media` | Local media library — upload, copy URL, delete |
| `/admin/settings` | Company, social, analytics, SEO defaults, contact |
| `/admin/contact-form` | Read-only integration status (MongoDB / Sheets / Email) |
| `/admin/users` | Admin user management |

## Notes

- Uploaded files are stored locally in `public/uploads/`.
- The panel is resilient to the database being unreachable: it degrades to
  empty views rather than crashing.
- Lead notifications (Resend email) and Google Sheets syncing happen in the
  website's form handler, not here — this panel only reads and manages the
  stored data. The **Contact Form** page shows whether those integrations are
  configured.
