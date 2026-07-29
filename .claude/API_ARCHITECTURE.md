# API_ARCHITECTURE.md

# Immigration Horizons API Architecture

Version: 1.0

---

# Purpose

Defines the backend API architecture, standards, and implementation rules for the Immigration Horizons platform.

All backend APIs must follow this document.

---

# API Style

- REST API
- JSON Request/Response
- Versioned (`/api/v1`)
- Session-based Authentication
- Role-Based Access Control (RBAC)
- Server-side Validation
- Consistent Error Responses

---

# Base URL

Development

```
/api/v1
```

Production

```
https://your-domain.com/api/v1
```

---

# Backend Structure

```
src/
├── app/
├── api/
├── controllers/
├── services/
├── repositories/
├── models/
├── validators/
├── middleware/
├── lib/
├── utils/
└── types/
```

---

# Request Flow

```
Request
    ↓
Middleware
    ↓
Authentication
    ↓
Authorization
    ↓
Validation
    ↓
Controller
    ↓
Service
    ↓
Repository
    ↓
Database
    ↓
Response
```

---

# Response Format

Success

```json
{
  "success": true,
  "message": "Operation completed.",
  "data": {}
}
```

Error

```json
{
  "success": false,
  "message": "Validation failed.",
  "errors": []
}
```

---

# Authentication

Protected endpoints require authentication.

Supported:

- Login
- Logout
- Session Validation
- Password Reset
- Email Verification

Future:

- Two-Factor Authentication

---

# Authorization

Access is controlled using RBAC.

Roles include:

- Super Admin
- Admin
- Project Manager
- Case Manager
- Petition Writer
- USCIS Specialist
- SEO Manager
- Marketing
- Finance
- Support
- Client

All permissions must be validated on the server.

---

# Validation

All request data must be validated before processing.

Validation includes:

- Required Fields
- Data Types
- Length
- Format
- Enum Values
- File Size
- File Type

Reject invalid requests with appropriate HTTP status codes.

---

# Error Handling

Use standard HTTP status codes.

| Code | Meaning |
|------|----------|
|200|Success|
|201|Created|
|400|Bad Request|
|401|Unauthorized|
|403|Forbidden|
|404|Not Found|
|409|Conflict|
|422|Validation Error|
|500|Server Error|

Never expose internal errors or stack traces.

---

# API Modules

## Authentication

```
/auth
```

Functions

- Login
- Logout
- Session
- Forgot Password
- Reset Password

---

## Users

```
/users
```

Functions

- List
- Create
- Update
- Delete
- Profile

---

## Roles

```
/roles
```

Functions

- List
- Create
- Update
- Delete

---

## Leads

```
/leads
```

Functions

- Create
- List
- Details
- Update
- Assign
- Convert to Client
- Archive

---

## Clients

```
/clients
```

Functions

- Create
- List
- Update
- View
- Archive

---

## Cases

```
/cases
```

Functions

- Create
- Update
- Assign
- Timeline
- Status

---

## Petitions

```
/petitions
```

Functions

- Create
- Update
- Workflow
- QA
- Submit

---

## Tasks

```
/tasks
```

Functions

- Create
- Assign
- Update
- Complete
- Comments

---

## Documents

```
/documents
```

Functions

- Upload
- Download
- Preview
- Version History
- Delete

---

## Notifications

```
/notifications
```

Functions

- List
- Mark Read
- Mark All Read
- Delete

---

## Blog

```
/blog
```

Functions

- Create
- Update
- Publish
- Draft
- Delete

---

## SEO

```
/seo
```

Functions

- Meta Data
- Redirects
- Sitemap
- Robots
- Schema

---

## Media

```
/media
```

Functions

- Upload
- List
- Delete
- Folder Management

---

## Settings

```
/settings
```

Functions

- Company
- Branding
- Email
- Integrations
- System

---

## Dashboard

```
/dashboard
```

Functions

- Statistics
- Recent Activity
- Analytics
- Notifications

---

# Pagination

Collection endpoints support:

- page
- limit
- sort
- order
- search
- filters

---

# File Upload

Supported Files

- PDF
- DOCX
- XLSX
- JPG
- PNG
- WEBP

All uploads must:

- Validate type
- Validate size
- Generate metadata
- Store upload information
- Support version history

---

# Logging

Log:

- Authentication
- API Errors
- CRUD Operations
- File Uploads
- Permission Failures

---

# Security

- Validate every request
- Authorize every protected route
- Sanitize user input
- Rate limit authentication endpoints
- Never trust client-side data

---

# Development Standards

- Thin Controllers
- Business Logic in Services
- Database Access through Repositories
- Shared Validation
- Reusable Utilities
- Consistent Response Format
- Proper Error Handling

---

# API Versioning

Current Version

```
/api/v1
```

Future versions must not break existing clients.

---

# Success Criteria

The API should be:

- Modular
- Secure
- Scalable
- Maintainable
- Well-Validated
- Consistent
- Ready for future integrations and automation.