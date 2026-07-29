# FRONTEND_ARCHITECTURE.md

# Immigration Horizons Frontend Architecture

Version: 1.0

---

# Purpose

Defines the frontend architecture, folder structure, coding standards, routing, state management, and UI implementation rules.

All frontend development must follow this document.

---

# Tech Stack

Framework
- Next.js 16 (App Router)

Language
- TypeScript

Styling
- Tailwind CSS v4

UI Components
- shadcn/ui

Icons
- Lucide React

Forms
- React Hook Form
- Zod

State Management
- Zustand

Data Fetching
- TanStack Query

Charts
- Recharts

Animations
- CSS Animations
- Framer Motion (only when necessary)

---

# Folder Structure

```
src/
├── app/
├── components/
├── features/
├── hooks/
├── lib/
├── services/
├── store/
├── types/
├── utils/
└── styles/
```

---

# Application Structure

Public Website

```
app/
├── (website)
├── services
├── blog
├── about
├── contact
└── resources
```

Admin Dashboard

```
app/
└── dashboard/
```

Authentication

```
app/
└── auth/
```

---

# Components

Organize components by feature.

Example

```
components/

layout/

navigation/

dashboard/

crm/

petitions/

blog/

seo/

forms/

shared/

ui/
```

Never create duplicate components.

---

# Feature Modules

Each module contains

```
feature/

components/

hooks/

services/

types/

utils/
```

Every feature should remain independent.

---

# Routing

Use App Router.

Public routes

```
/
about
services
blog
resources
contact
```

Protected routes

```
/dashboard
/dashboard/leads
/dashboard/clients
/dashboard/cases
/dashboard/tasks
/dashboard/blog
/dashboard/settings
```

---

# State Management

Global State

- Authentication
- User
- Theme
- Sidebar
- Notifications

Feature State

Keep inside feature modules.

Avoid unnecessary global state.

---

# API Layer

Never call APIs directly from components.

Use service functions.

```
Component

↓

Hook

↓

Service

↓

API
```

---

# Forms

All forms use

- React Hook Form
- Zod Validation

Forms must include

- Validation
- Loading State
- Success State
- Error State

---

# Layouts

Website Layout

- Header
- Footer
- Navigation

Dashboard Layout

- Sidebar
- Topbar
- Content Area

Authentication Layout

- Minimal

---

# Error Handling

Every page must support

- Loading
- Empty
- Error
- Success

Use Error Boundaries where appropriate.

---

# Performance

- Lazy load large modules
- Optimize images
- Use Server Components where possible
- Minimize Client Components
- Avoid unnecessary re-renders

---

# Coding Standards

- Functional Components
- TypeScript Only
- Reusable Components
- Strict Typing
- Consistent Naming
- Clean Imports

---

# Success Criteria

The frontend should be modular, reusable, scalable, accessible, and optimized for performance.