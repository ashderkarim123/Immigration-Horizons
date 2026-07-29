# DATABASE.md

# Immigration Horizons Database Architecture

Version: 2.0

---

# Purpose

This document defines the data architecture for Immigration Horizons.

It explains how data is organized, how modules relate to each other, and the rules developers must follow when implementing database models.

The database must support:

- Website
- Admin Dashboard
- CRM
- Lead Management
- Petition Management
- Blog CMS
- SEO
- Notifications
- Client Portal
- Analytics

---

# Database Stack

Database
- MongoDB

ODM
- Mongoose

Validation
- Zod

Authentication
- Session Based

Password Hashing
- Argon2

Email
- Resend

Future
- Redis
- BullMQ
- Mongo Atlas Search

---

# Architecture

```
Users
│
├── Roles
├── Permissions
├── Sessions
│
Leads
│
└── Clients
      │
      ├── Cases
      │     ├── Petitions
      │     ├── Tasks
      │     └── Documents
      │
      └── Communications

CMS
│
├── Blog
├── Categories
├── Tags
├── Media
└── SEO

System
│
├── Notifications
├── Audit Logs
├── Settings
└── Analytics
```

---

# Core Collections

## Users

### Purpose

Stores authenticated users.

### Relationships

- One Role
- Many Tasks
- Many Notifications
- Many Audit Logs

### Rules

- Email must be unique.
- Passwords are hashed.
- Soft delete only.
- Activity is logged.

---

## Roles

### Purpose

Defines user roles.

### Default Roles

- Super Admin
- Admin
- Project Manager
- Case Manager
- Petition Writer
- Business Plan Writer
- USCIS Specialist
- SEO Manager
- Marketing
- Finance
- Client

### Rules

Permissions are assigned to roles.

Never hardcode permissions.

---

## Permissions

### Purpose

Controls access across the platform.

Examples

- Manage Users
- Manage Leads
- Manage Cases
- Manage Petitions
- Publish Blogs
- Manage SEO
- Manage Settings

---

## Sessions

Stores active login sessions.

Tracks

- Device
- Browser
- IP
- Last Activity
- Expiration

---

# CRM Collections

## Leads

### Purpose

Stores every inquiry before becoming a client.

### Sources

- Website
- Facebook
- Instagram
- Google Ads
- WhatsApp
- Referral
- Manual

### Workflow

New

↓

Contacted

↓

Qualified

↓

Consultation

↓

Proposal

↓

Won / Lost

↓

Client

### Stores

- Contact Information
- Immigration Interest
- Source
- Campaign
- Notes
- Tags
- Timeline
- Attachments

### Rules

- One owner per lead.
- Assignment creates notification.
- Every change is logged.
- Can be converted into one client.

---

## Clients

### Purpose

Stores active customers.

### Relationships

One Client

↓

Many Cases

### Stores

- Personal Details
- Immigration Profile
- Documents
- Billing
- Portal Access

---

## Cases

### Purpose

Represents one immigration engagement.

Examples

- EB-2 NIW
- EB-1A
- EB-1B
- EB-1C
- O-1

### Stores

- Assigned Team
- Timeline
- Status
- Deadlines
- Related Petition

---

## Petitions

### Purpose

Stores petition work.

### Includes

- Eligibility
- Evidence
- Recommendation Letters
- Business Plan
- USCIS Forms
- QA
- Submission

### Workflow

Planning

↓

Evidence

↓

Draft

↓

Review

↓

Forms

↓

QA

↓

Submission

↓

RFE

↓

Completed

---

## Tasks

### Purpose

Tracks work across teams.

### Types

- Petition Writing
- Business Plan
- Recommendation Letter
- Research
- USCIS Forms
- QA
- Marketing
- SEO

### Status

Backlog

Todo

In Progress

Review

Completed

Blocked

---

## Documents

Stores every uploaded file.

Examples

- Passport
- CV
- Publications
- Recommendation Letters
- Business Plans
- USCIS Forms
- Evidence

### Rules

- Version history
- Soft delete
- Approval workflow

---

# CMS Collections

## Blog

Stores blog articles.

Supports

- Drafts
- Publishing
- SEO
- Authors
- Categories
- Tags

---

## Media

Stores images, PDFs, videos and downloadable resources.

Supports

- Folder structure
- Optimization
- Metadata
- Versioning

---

## SEO

Stores

- Meta Titles
- Descriptions
- Canonicals
- Open Graph
- Schema
- Redirects

---

# System Collections

## Notifications

Supports

- Dashboard
- Email
- Future SMS
- Future Push

---

## Audit Logs

Every important action is logged.

Examples

- Login
- Lead Assignment
- Petition Update
- Blog Published
- User Created

---

## Settings

Stores

- Company Settings
- Branding
- Email
- Integrations
- SEO Defaults
- Feature Flags

---

## Analytics

Stores business metrics.

Examples

- Leads
- Conversions
- Traffic
- Blog Views
- User Activity

---

# Business Rules

- Every Lead becomes one Client.
- One Client can have multiple Cases.
- One Case can have multiple Petitions.
- Every Petition has Tasks.
- Every Task belongs to one owner.
- Every upload creates a document record.
- Every assignment creates notifications.
- Every important action creates an audit log.

---

# Development Standards

- Use ObjectId references.
- Use soft deletes.
- Validate all inputs with Zod.
- Never duplicate business data.
- Keep schemas modular.
- Index searchable fields.
- Maintain backward compatibility.

---

# Future Expansion

- AI Case Assistant
- Workflow Automation
- Payments
- Client Portal
- Calendar
- Video Meetings
- Internal Chat
- Knowledge Base
- AI Document Analysis
- OCR
- eSignature
- Mobile App

---

# Success Criteria

The database should support:

- Multi-user collaboration
- High-volume lead management
- Complex petition workflows
- SEO-driven CMS
- Enterprise reporting
- Future AI automation

without requiring major architectural changes.