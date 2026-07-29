# PROJECT.md

# Immigration Horizons --- Project Master Document

> **Purpose:** This document is the single source of truth for the
> Immigration Horizons project. It provides business context, product
> goals, architecture direction, workflows, roadmap, and engineering
> expectations for all contributors and AI agents.
>
> **Scope note:** this is a business/product document, so most sections describe the long-term product (Target), not just what's shipped. Where a section could be mistaken for "this already exists," it's flagged below. For the precise current-implementation detail, see `ARCHITECTURE.md`, `DATABASE.md`, `ADMIN_WORKFLOW.md`, and `API_ARCHITECTURE.md` — each split into Current/Target parts.

------------------------------------------------------------------------

# 1. Executive Summary

Immigration Horizons is a premium immigration consulting and petition
preparation platform focused on employment-based U.S. immigration
pathways.

The platform consists of:

-   Public marketing website
-   SEO content platform
-   Admin CMS
-   CRM
-   Lead Management System
-   Team Collaboration
-   Petition Workflow Management
-   Client Portal (future)
-   AI-assisted productivity tools (future)

The objective is to create the most trusted digital immigration
consulting platform by combining outstanding content, modern
engineering, and operational excellence.

------------------------------------------------------------------------

# 2. Business Overview

## Mission

Help qualified professionals prepare high-quality immigration petitions
through structured consulting, document preparation, and workflow
management.

## Vision

Become a globally recognized technology-driven immigration consulting
platform.

## Core Services

-   EB-2 National Interest Waiver (NIW)
-   EB-1A Extraordinary Ability
-   EB-1B Outstanding Professor / Researcher
-   EB-1C Multinational Executive / Manager
-   O-1 Visa
-   RFE Response Preparation
-   Recommendation Letter Drafting
-   Expert Opinion Letters
-   Business Plans
-   Evidence Packaging
-   USCIS Form Preparation

Immigration Horizons is **not a law firm** and does not provide legal
representation.

------------------------------------------------------------------------

# 3. Target Audience

Primary: - Researchers - Scientists - Physicians - Engineers -
Entrepreneurs - Executives - Professors - AI & Tech Professionals

Secondary: - Universities - Employers - Startups - Immigration referral
partners

Customer goals: - Permanent residence - Faster preparation - Organized
documentation - Professional petition package

------------------------------------------------------------------------

# 4. Product Vision

Public Website: - Premium brand - Lead generation - SEO authority -
Educational resources

Admin Dashboard: - CRM - Lead Management - Petition Workflow - Task
Assignment - Team Collaboration - Blog CMS - SEO Management - Analytics

Future Client Portal: - Secure login - Case timeline - Messaging -
Document upload - Deliverables

------------------------------------------------------------------------

# 5. Website Information Architecture

Home

About

Services - EB-2 NIW - EB-1A - EB-1B - EB-1C - O-1 - RFE - Recommendation
Letters - Expert Opinion Letters - Business Plans - Evidence Packaging -
USCIS Forms

Resources - Blog - Guides - FAQs

Contact

Consultation

------------------------------------------------------------------------

# 6. Lead Lifecycle

Visitor

↓

Consultation Form / Facebook / Instagram / Google Ads / WhatsApp /
Manual Entry

↓

Lead Created

↓

Qualification

↓

Project Manager Assignment

↓

Consultation

↓

Client Onboarding

↓

Petition Preparation

↓

QA

↓

Submission

↓

Monitoring

↓

Completed

↓

Archive

All status changes must be logged.

------------------------------------------------------------------------

# 7. Petition Workflow

1.  Eligibility Review
2.  Client Onboarding
3.  Evidence Collection
4.  Research
5.  Recommendation Letters
6.  Business Plan (if applicable)
7.  Petition Draft
8.  Internal QA
9.  USCIS Forms
10. Package Assembly
11. Client Approval
12. Submission
13. RFE Handling (if required)
14. Completion

------------------------------------------------------------------------

# 8. Team Roles

-   Super Admin
-   Administrator
-   Project Manager
-   Case Manager
-   Petition Writer
-   Recommendation Letter Specialist
-   Business Plan Specialist
-   Research Analyst
-   USCIS Forms Specialist
-   QA Reviewer
-   Marketing Manager
-   SEO Manager
-   Content Writer
-   Support
-   Finance
-   Client

Role-based permissions (RBAC) are mandatory.

------------------------------------------------------------------------

# 9. Admin Dashboard Modules

**Current**: Dashboard, Leads, Tasks, Sprints, Notifications, Delivery, Blog CMS, SEO Manager, Testimonials, FAQs, Media Library, Settings, Users, Search.

**Target** (not yet built — see `ADMIN_WORKFLOW.md` Part 2): CRM, Clients, Petitions, Kanban Board (today's task view is list/status-based, not drag-and-drop), Team (beyond user management), Calendar, Documents (beyond `DeliveryRecord.files`), Analytics, Reports, Audit Logs (beyond per-lead `ActivityLog`).

------------------------------------------------------------------------

# 10. Lead Management

Store:

-   Source
-   Status
-   Priority
-   Owner
-   Contact history
-   Tasks
-   Notes
-   Documents
-   Timeline
-   Tags

Support filtering, assignment, reminders, exports and reporting.

------------------------------------------------------------------------

# 11. Content Strategy

Every service page should include:

-   Hero
-   Eligibility
-   Benefits
-   Process
-   FAQs
-   CTA
-   Internal links
-   Structured data
-   EEAT signals

No guarantees, fabricated statistics, or invented case studies.

------------------------------------------------------------------------

# 12. SEO Strategy

Implement:

-   Metadata
-   Canonicals
-   XML Sitemap
-   Robots
-   Breadcrumb Schema
-   FAQ Schema
-   Organization Schema
-   Article Schema
-   Internal Linking
-   Fast Core Web Vitals

------------------------------------------------------------------------

# 13. Design Principles

Brand: - Premium - Professional - Trustworthy - Technology-driven

Palette: - Navy - Gold - White - Neutral gray

Use authentic photography, custom illustrations, timelines, diagrams and
lightweight animations.

------------------------------------------------------------------------

# 14. Technology Stack

Frontend: - Next.js - React - TypeScript - Tailwind CSS

Backend: - Node.js

Database: - MongoDB

Email: - Resend

Analytics: - Google Analytics - Google Tag Manager

Future: - Redis - Queue Workers - Object Storage

------------------------------------------------------------------------

# 15. Product Roadmap

Phase 1 - Website redesign

Phase 2 - Admin CMS

Phase 3 - CRM & Lead Management

Phase 4 - Team Workflow

Phase 5 - Client Portal

Phase 6 - AI Automation

Phase 7 - Business Intelligence

------------------------------------------------------------------------

# 16. Success Metrics

-   Organic traffic
-   Qualified leads
-   Consultation bookings
-   Conversion rate
-   Blog growth
-   Core Web Vitals
-   Team productivity
-   Client satisfaction

------------------------------------------------------------------------

# 17. Non-Goals

-   Legal representation
-   Unsupported visa categories
-   Artificial success claims
-   Hardcoded workflows
-   Vendor lock-in

------------------------------------------------------------------------

# 18. Glossary

Lead, Client, Petition, Beneficiary, Petitioner, USCIS, RFE, NIW,
Evidence, Recommendation Letter, Business Plan, Priority Date, Task,
Sprint.

------------------------------------------------------------------------

# 19. Living Document

This document must be updated whenever:

-   Business processes change
-   New services are introduced
-   Technology stack changes
-   Major architectural decisions are made
-   Product roadmap evolves

It is the authoritative business context for Immigration Horizons.
