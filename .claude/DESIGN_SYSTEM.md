# DESIGN_SYSTEM.md
# Immigration Horizons Design System
Version: 1.0
Status: Production

---

# Purpose

This document defines the official design language for the Immigration Horizons platform.

Every engineer, designer, and AI agent must follow these standards before designing or implementing any interface.

The goal is to ensure every screen feels like it belongs to the same product regardless of who builds it.

This design system governs:

- Public Website
- Admin Dashboard
- CRM
- Lead Management
- Petition Workflow
- Blog
- CMS
- Client Portal
- Future Mobile Applications

This document is mandatory.

Do not create new UI patterns unless absolutely necessary.

Always reuse existing design patterns.

---

# Design Philosophy

Immigration Horizons is not a generic immigration consultancy.

It is a premium technology company specializing in immigration consulting and petition preparation.

The interface should communicate:

• Trust

• Professionalism

• Authority

• Precision

• Simplicity

• Modern Engineering

• Transparency

• Premium Quality

Every page should feel calm, organized, and intentionally designed.

Never make the interface feel crowded.

Never sacrifice readability for decoration.

The interface should help users make decisions with confidence.

---

# Brand Personality

Every screen should reflect these characteristics.

Professional

Reliable

Premium

Elegant

Modern

Minimal

Calm

Educational

Structured

Technology Driven

Trustworthy

Transparent

Never create interfaces that feel:

Cheap

Flashy

Noisy

Salesy

Over Animated

Childish

Corporate Template

Generic WordPress

---

# Design Inspiration

The user experience should be inspired by companies such as:

Stripe

Linear

Vercel

Notion

Clerk

Mercury

Ramp

Apple

GitHub

Intercom

The objective is not to copy these products.

The objective is to match their quality level.

---

# Overall Design Language

Every page should follow the same principles.

Large white space.

Clear hierarchy.

Simple navigation.

Readable typography.

Strong imagery.

Meaningful graphics.

Thoughtful animations.

Excellent accessibility.

Fast performance.

Every section should have a clear purpose.

If a section does not contribute to user understanding or conversion, remove it.

---

# Brand Colors

Primary

Navy Blue

Purpose:

Authority

Trust

Navigation

Buttons

Headings

Dashboard Sidebar

Links

Tables

Charts

Primary Actions

Secondary

Gold

Purpose:

Highlights

Statistics

Icons

Hover States

Accents

Timeline

Progress Indicators

Success Moments

Never use gold for large paragraphs of text.

Background

White

Purpose:

Content

Cards

Forms

Blog

Dashboard

Sections

Neutral

Light Gray

Purpose:

Borders

Cards

Section Separation

Table Rows

Input Backgrounds

Dark

Slate

Purpose:

Footer

Charts

Dark Overlays

Admin Navigation

Analytics

Success

Green

Warnings

Amber

Errors

Red

Information

Blue

Maintain these meanings consistently across the application.

---

# Color Usage Rules

Blue establishes authority.

Gold attracts attention.

White improves readability.

Gray separates content.

Do not use gradients excessively.

Avoid bright saturated colors.

Avoid rainbow dashboards.

Avoid random accent colors.

The entire platform should feel visually consistent.

---

# Typography

Headings

Source Serif 4

Purpose:

Authority

Professionalism

Editorial Feel

Body Text

Inter

Purpose:

Maximum readability

Forms

Tables

Dashboard

Documentation

Never introduce additional font families.

---

# Typography Scale

Display

Homepage Hero

H1

Page Titles

H2

Major Sections

H3

Cards

H4

Subsections

Body Large

Lead Paragraphs

Body

Normal Reading

Small

Labels

Caption

Metadata

Footer

Every page must follow the same hierarchy.

Never skip heading levels.

---

# Spacing System

Base Unit

4px

Spacing Scale

4

8

12

16

20

24

32

40

48

64

80

96

120

160

Section spacing should be generous.

Cards should breathe.

Never compress layouts simply to fit more content.

Whitespace is a design element.

---

# Grid System

Desktop

12 Columns

Container Width

1280px

Content Width

760–860px

Reading Width

680–760px

Tablet

8 Columns

Mobile

4 Columns

Maintain consistent gutters.

Never place content against screen edges.

---

# Border Radius

Small

8px

Medium

12px

Large

16px

Extra Large

24px

Cards

12–16px

Buttons

12px

Inputs

12px

Dialogs

16px

Keep radius consistent throughout the platform.

---

# Shadows

Use subtle elevation.

Avoid harsh shadows.

Cards should appear lightweight.

Dialogs may have stronger shadows.

Never use exaggerated floating effects.

---

# Icons

Use Lucide Icons throughout the application.

Never mix multiple icon libraries.

Icons should clarify meaning.

Never decorate purely for aesthetics.

Use consistent sizing.

Small

16px

Normal

20px

Large

24px

Hero

32–48px

---

# Buttons

Button Types

Primary

Secondary

Ghost

Outline

Danger

Success

Icon

Loading

Disabled

Every button must have:

Hover State

Focus State

Active State

Disabled State

Loading State

Buttons should feel tactile but not oversized.

---

# Inputs

Every form element must include:

Label

Placeholder

Helper Text

Validation

Error Message

Success State

Disabled State

Required Indicator

Focus State

Forms should guide users through completion.

Never rely solely on placeholder text.

---

# Cards

Cards are the primary content container.

Every card should include:

Padding

Border

Radius

Hover State

Responsive Layout

Optional Footer

Optional Actions

Optional Tags

Optional Status

Cards should never feel overloaded.

Use multiple cards rather than one giant container.

---

# Tables

Admin tables must support:

Sorting

Filtering

Searching

Pagination

Bulk Actions

Column Visibility

Export

Sticky Headers

Responsive Layout

Never display raw database information without formatting.

---

# Forms

Forms are conversion points.

Every form should:

Reduce friction.

Validate instantly.

Explain errors clearly.

Preserve entered values.

Prevent duplicate submissions.

Show progress indicators.

Provide success confirmation.

Support keyboard navigation.

---

# Empty States

Never leave blank pages.

Every empty state should explain:

Why no data exists.

How to create data.

Provide an action button.

Use a simple illustration where appropriate.

Examples:

No Leads

Create Lead

No Blog Posts

Write Article

No Tasks

Assign Task

No Notifications

Everything is up to date.

---

# Loading States

Never show blank white pages during loading.

Use:

Skeleton Components

Progress Indicators

Optimistic UI where appropriate

Loading Text

Spinners only when unavoidable.

Prefer skeletons.

---

# Design Consistency Rules

Before creating any new UI:

Search the existing component library.

Reuse existing components.

Improve existing components.

Never duplicate components.

Never redesign a component for one page only.

The design system is the single source of truth.

---

# ============================================================
# PART 2 — COMPONENT LIBRARY
# ============================================================

---

# Component Philosophy

Every component in Immigration Horizons must be:

Reusable

Accessible

Responsive

Well Documented

Highly Performant

Composable

Theme Consistent

Never create one-off components.

If two pages require similar functionality,
create one reusable component.

---

# Component Categories

The design system consists of:

Layout Components

Navigation Components

Typography Components

Data Display Components

Forms

Feedback Components

Dashboard Components

Marketing Components

CMS Components

CRM Components

Workflow Components

Analytics Components

Media Components

---

# Layout Components

## Page Container

Purpose

Provides the maximum readable width.

Rules

Max Width:
1280px

Centered

Responsive

Horizontal Padding:

Desktop:
32px

Tablet:
24px

Mobile:
16px

Never place content directly on screen edges.

---

## Section

Purpose

Separates logical content.

Contains:

Heading

Body

CTA

Optional Graphics

Spacing

Top:
96px

Bottom:
96px

Mobile:
64px

---

## Content Wrapper

Maximum reading width

760–860px

Used for:

Blogs

Service Pages

Policies

Documentation

---

## Two Column Layout

Desktop

Content

Sidebar

Tablet

Stack

Mobile

Stack

Never reverse reading order.

---

## Dashboard Layout

Contains

Sidebar

Top Navigation

Page Header

Content

Right Utility Panel (optional)

Sticky Header

Scrollable Content

Responsive Collapse

---

# Navigation Components

## Header

Must Include

Logo

Primary Navigation

Mega Menu

Search (future)

Consultation CTA

Dashboard Login

Sticky on Scroll

Transparent on Hero

Solid after scroll

---

## Mega Menu

Services grouped by:

Employment Immigration

Support Services

Resources

Company

Dashboard

Use icons.

Support keyboard navigation.

---

## Sidebar

Admin only.

Contains

Dashboard

CRM

Leads

Clients

Petitions

Tasks

Blog

SEO

Analytics

Settings

Support nested navigation.

Collapsed state required.

---

## Breadcrumb

Every internal page requires breadcrumb navigation.

Example

Home

>

Services

>

EB2 NIW

Schema must match.

---

# Hero Components

Every public page begins with a Hero.

Hero Contains

Badge

H1

Supporting Paragraph

Primary CTA

Secondary CTA

Trust Indicators

Professional Image

Background Graphic

Optional Statistics

Optional Video

---

Hero Variants

Homepage

Service

Blog

About

Contact

Dashboard

Landing Page

Resource

Each variant follows the same spacing system.

---

# Buttons

Supported Types

Primary

Secondary

Outline

Ghost

Text

Danger

Success

Warning

Loading

Disabled

Icon

Split Button

Dropdown Button

Floating Button

---

Button Sizes

Small

Medium

Large

Hero

Icon

Buttons always include

Hover

Focus

Active

Loading

Disabled

ARIA labels

---

# Cards

Cards are the most common UI element.

Types

Service Card

Blog Card

Feature Card

Statistic Card

Lead Card

Client Card

Petition Card

Task Card

Notification Card

Media Card

Dashboard Widget

Profile Card

Pricing Card

Comparison Card

FAQ Card

Every card supports

Hover

Responsive Layout

Optional Badge

Optional CTA

Optional Footer

Optional Actions

---

# Statistics Cards

Homepage

Dashboard

Analytics

Contains

Icon

Title

Metric

Trend

Description

Optional Chart

Optional Link

---

# Feature Cards

Contains

Icon

Heading

Description

Optional CTA

Equal height.

Responsive.

---

# Service Cards

Contains

Service Icon

Title

Description

Benefits

CTA

Related Services

SEO Friendly URL

---

# Blog Cards

Contains

Featured Image

Category

Reading Time

Author

Title

Summary

Publish Date

CTA

---

# Testimonial Card

Contains

Photo

Name

Role

Country

Review

Rating

Verification Badge

Never fabricate testimonials.

---

# Timeline Component

Supports

Vertical

Horizontal

Collapsible

Animated

Used for

Immigration Process

Petition Workflow

Roadmap

Project Progress

---

# Accordion

Used for

FAQs

Policies

Documentation

Keyboard Accessible

Searchable

Deep Link Support

---

# Tabs

Use only when content is naturally grouped.

Avoid excessive nesting.

---

# Badge

Types

Success

Warning

Information

Primary

Secondary

Pending

Completed

Rejected

Draft

Published

---

# Alerts

Success

Error

Information

Warning

Critical

Dismissible

Optional Action Button

---

# Toast Notifications

Top Right

Auto Dismiss

Persistent

Action Support

Undo Support

Queue Support

---

# Modal

Small

Medium

Large

Fullscreen

Confirmation

Wizard

Never use modal for long forms.

---

# Drawer

Right Drawer

Left Drawer

Bottom Drawer

Used for

Quick Edit

Preview

Lead Details

Client Details

---

# Forms

Every form uses

Field Label

Description

Placeholder

Validation

Helper Text

Success

Error

Loading

Character Counter

---

Supported Inputs

Text

Textarea

Email

Phone

Number

Password

URL

Date

Time

Date Range

Checkbox

Switch

Radio

Dropdown

Multi Select

Tag Selector

Country Selector

File Upload

Image Upload

Rich Text Editor

Search Box

---

# Search Component

Supports

Instant Search

Debounce

Filters

Recent Searches

Suggestions

Keyboard Navigation

---

# Data Table

Features

Sorting

Filtering

Searching

Pagination

Bulk Actions

Export CSV

Column Toggle

Sticky Header

Responsive

Selection

Inline Actions

---

# Pagination

Desktop

Numbers

Previous

Next

Mobile

Previous

Next

Infinite Scroll only where appropriate.

---

# Charts

Supported

Line

Bar

Area

Pie

Donut

Heatmap

Progress Ring

Funnel

Timeline

Growth

Calendar Heatmap

Never use more than five colors.

---

# Progress Components

Progress Bar

Circular Progress

Step Indicator

Timeline Progress

Checklist Progress

---

# File Upload

Supports

Drag Drop

Browse

Preview

Validation

Progress

Version History

Multiple Files

Image Preview

PDF Preview

Virus Scan Hook

---

# Rich Text Editor

Used for

Blog

Resources

Documentation

Supports

Headings

Lists

Tables

Images

Videos

Callouts

Code

Links

Internal Link Picker

SEO Metadata

Auto Save

Revision History

---

# Notifications Panel

Displays

Unread

Read

Priority

Task Updates

Lead Updates

Mentions

Assignments

Comments

Deadlines

Supports

Filtering

Mark All Read

Deep Linking

---

# Activity Feed

Displays

User Actions

Lead Changes

Task Updates

Comments

Blog Publishing

Assignments

System Events

Newest First

---

# Calendar Component

Views

Day

Week

Month

Agenda

Supports

Meetings

Deadlines

Consultations

Task Due Dates

Petition Milestones

---

# Empty States

Each empty state contains

Illustration

Title

Explanation

Primary CTA

Secondary CTA

Never leave empty pages blank.

---

# Skeleton Components

Create skeleton versions for

Cards

Tables

Forms

Blog

Dashboard

Charts

Sidebar

Hero

Avoid spinner-only loading.

---

# Error States

Must include

Clear Explanation

Error Code (optional)

Retry Button

Support Link

Home Button

---

# Success Screens

Contains

Success Icon

Confirmation Message

Summary

Next Action

Return Button

---

# Component Naming Convention

Components/

Button/

Card/

Hero/

ServiceCard/

LeadCard/

TaskCard/

Chart/

Sidebar/

Navbar/

Modal/

Accordion/

Timeline/

Calendar/

Never create inconsistent naming.

---

# Component Rules

Every reusable component must include

TypeScript Types

Accessibility

Responsive Design

Loading State

Empty State

Error State

Documentation

Storybook Compatibility (future)

Unit Testing (future)

Never build UI without considering reusability.

---
# End of Part 2

# ============================================================
# PART 3 — PAGE TEMPLATES, DASHBOARD, UX, MEDIA, AI RULES
# ============================================================

---

# WEBSITE PAGE STANDARDS

Every public-facing page must follow a consistent information architecture.

Users should always know:

• Where they are

• What this page is about

• Why it matters

• What action they should take next

Never create pages without a clear conversion goal.

---

# HOMEPAGE TEMPLATE

Homepage Structure

1. Hero Section
2. Trust Indicators
3. Services Overview
4. Why Choose Immigration Horizons
5. Immigration Process Timeline
6. Client Success / Testimonials
7. About Immigration Horizons
8. Featured Resources
9. Frequently Asked Questions
10. Final Consultation CTA
11. Footer

Homepage Requirements

✓ Premium Hero

✓ Professional Photography

✓ Animated SVG Graphics

✓ Statistics

✓ Interactive Service Cards

✓ Process Timeline

✓ Internal Links

✓ FAQ Schema

✓ Organization Schema

✓ Strong CTAs

✓ Mobile Optimized

---

# SERVICE PAGE TEMPLATE

Every service page must follow exactly the same structure.

Hero

↓

Quick Overview

↓

Who Can Apply

↓

Eligibility Criteria

↓

Benefits

↓

Required Evidence

↓

Immigration Process

↓

Timeline Graphic

↓

Frequently Asked Questions

↓

Related Services

↓

Final CTA

↓

Footer

Every service page should contain:

Professional Illustration

Process Diagram

Comparison Table

FAQ

Internal Links

External USCIS References

Schema

Breadcrumb

---

# ABOUT PAGE

Sections

Hero

Mission

Vision

Core Values

Company Story

Leadership

Our Process

Why Clients Trust Us

Global Reach

CTA

---

# CONTACT PAGE

Contains

Contact Information

Business Hours

Office Location

Google Map

Consultation Form

Social Media

FAQs

Emergency Notice

---

# BLOG PAGE

Must Include

Hero Image

Category

Author

Reading Time

Publish Date

Last Updated

Table of Contents

Content

Callout Boxes

Images

Infographics

Related Articles

Newsletter

CTA

Author Bio

Comments (Future)

---

# RESOURCE PAGE

Contains

Search

Categories

Downloads

Guides

Templates

FAQs

Latest Articles

CTA

---

# ERROR PAGES

404

500

403

Maintenance

Every error page should provide

Clear explanation

Action button

Search

Helpful links

Never display technical errors to users.

---

# DASHBOARD DESIGN

The dashboard should feel like enterprise software.

Inspired by

Linear

Stripe

Vercel

GitHub

Notion

Mercury

---

Dashboard Layout

Sidebar

Top Navigation

Breadcrumb

Page Header

Quick Actions

Content

Widgets

Activity Feed

Footer

---

Dashboard Home

Widgets

Today's Leads

Open Tasks

Pending Reviews

Upcoming Consultations

Recent Activity

Analytics

Notifications

Quick Actions

Calendar

---

# CRM DESIGN

CRM contains

Lead Table

Lead Details

Timeline

Notes

Tasks

Documents

Emails

Assignments

Activity

Every lead should have a complete history.

Nothing should be lost.

---

Lead Profile Layout

Header

Status

Priority

Owner

Source

Contact Details

Timeline

Tasks

Notes

Documents

Communication

Activity

---

# KANBAN BOARD

Columns

New

Contacted

Qualified

Proposal

Client

Evidence Collection

Petition Draft

QA

USCIS Forms

Ready for Submission

Submitted

RFE

Completed

Archived

Cards must support

Drag

Drop

Comments

Files

Checklist

Priority

Assignee

Due Date

---

# TASK MANAGEMENT

Every task includes

Title

Description

Owner

Priority

Sprint

Deadline

Attachments

Comments

Subtasks

Status

History

Estimated Hours

Actual Hours

---

# PETITION MANAGEMENT

Each petition should display

Client

Visa Type

Current Stage

Assigned Team

Documents

Deadlines

Forms

Letters

Evidence

QA

Submission

Status

Timeline

---

# BLOG CMS

Editor

Preview

SEO Score

Internal Linking Suggestions

Slug

Meta Title

Description

Featured Image

Categories

Tags

Author

Scheduling

Revision History

Publishing Workflow

---

# MEDIA LIBRARY

Supports

Images

PDFs

Word Files

Videos

SVG

Icons

Documents

Folders

Search

Tags

Optimization

Version History

---

# ANALYTICS DASHBOARD

Charts

Traffic

Leads

Conversions

Blog Performance

Page Views

Bounce Rate

Keywords

Campaigns

Revenue (Future)

Team Productivity

---

# REPORTS

Generate reports for

Leads

Marketing

SEO

Blog

Tasks

Petitions

Revenue

User Activity

Support CSV

Excel

PDF

---

# GRAPHICS SYSTEM

Every page should contain meaningful graphics.

Never rely on text alone.

---

Homepage Graphics

Animated Globe

USA Map

Immigration Timeline

Professional Office

Team Photo

Icons

Statistics

Workflow Diagram

Trust Badges

Background Shapes

---

EB2 NIW

Research Illustration

Scientist

Innovation Icons

Evidence Flowchart

USCIS Process Diagram

Timeline

Checklist

Professional Photography

---

EB1A

Awards

Research

Conference

Scientific Publication

Professor

Laboratory

Achievement Timeline

---

EB1B

University

Professor

Research Institution

Academic Publications

Peer Review

Teaching

---

EB1C

Corporate

Executive

Global Company

Management Structure

Business Expansion

Organization Chart

---

O1 Visa

Creative Professional

Artist

Athlete

Scientist

Media

Awards

Recognition

---

Admin Dashboard Graphics

Charts

Heatmaps

Lead Funnel

Activity Timeline

Progress Rings

Calendar

Kanban

Notifications

Statistics

---

# PHOTOGRAPHY GUIDELINES

Only use

Professional Office

Business Meetings

Universities

Scientists

Engineers

Medical Professionals

Researchers

Immigration Documents

US Skyline

International Professionals

Conference

Library

Innovation

Avoid

Fake Stock Call Centers

Overused Handshake Photos

Artificial AI Faces

Random Smiling Teams

Generic Office Cubicles

Poor Quality Images

Always use optimized

WebP

AVIF

SVG

---

# ICONOGRAPHY

Use Lucide Icons.

Never mix icon packs.

Icons should support content.

Not decorate content.

---

# ANIMATION SYSTEM

Animations should improve usability.

Never distract.

Allowed

Fade

Slide

Scale

Reveal

Hover

Progress

Accordion

Timeline

Card Hover

Micro Interactions

Page Transition

Number Counter

Chart Animation

Notification

Skeleton Loading

Drag & Drop

Avoid

Long Animations

Infinite Floating Objects

Heavy Parallax

Autoplay Carousels

Flashing Effects

Animation Duration

Fast

150ms

Medium

250ms

Slow

350ms

Anything above 500ms requires justification.

---

# ACCESSIBILITY

WCAG AA minimum.

Prefer AAA.

Support

Keyboard

Screen Reader

Reduced Motion

High Contrast

Focus States

Semantic HTML

ARIA Labels

Alt Text

Accessible Forms

Error Announcements

Logical Heading Structure

---

# RESPONSIVE DESIGN

Desktop

1440+

Laptop

1024

Tablet

768

Mobile

390+

Touch Targets

Minimum 44x44px

Navigation must adapt gracefully.

Never hide essential functionality on mobile.

---

# SEO INTEGRATION

Every page automatically includes

Title

Description

Canonical

Open Graph

Twitter Cards

Schema

Breadcrumb

Internal Links

XML Sitemap

Robots Compliance

Performance Optimization

---

# AI DESIGN RULES

Before building anything Claude must

Search existing components.

Reuse existing layouts.

Follow this design system.

Avoid duplicate UI.

Maintain consistency.

Improve rather than replace.

Respect accessibility.

Respect SEO.

Respect performance.

Think like a Senior Product Designer.

Think like a Frontend Architect.

Think like a UX Researcher.

Think like a Creative Director.

Never create inconsistent experiences.

---

# QUALITY CHECKLIST

Before every commit verify

✓ Brand consistency

✓ Typography

✓ Colors

✓ Responsive

✓ Accessibility

✓ SEO

✓ Component reuse

✓ Performance

✓ Animation quality

✓ Professional imagery

✓ Internal linking

✓ Semantic HTML

✓ Mobile UX

✓ Desktop UX

✓ Loading states

✓ Empty states

✓ Error states

✓ Documentation updated

✓ TypeScript passes

✓ Lint passes

✓ Build passes

✓ Production Ready

---

# FINAL DIRECTIVE

Every interface produced for Immigration Horizons must communicate:

Trust

Authority

Professionalism

Transparency

Technical Excellence

Premium Quality

Educational Value

Operational Efficiency

Every screen should feel like it belongs to one cohesive enterprise platform.

If a design decision conflicts with these principles, choose the solution that best supports long-term consistency, usability, accessibility, and maintainability.

This Design System is the single source of truth for all visual, interaction, and user experience decisions across the Immigration Horizons platform.

# End of DESIGN_SYSTEM.md