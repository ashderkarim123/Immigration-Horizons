# Immigration Horizons — Reference UX + Smart Intake to USCIS Autofill Product Specification

**Status:** Product target / architecture specification  
**Reference direction:** 8am DocketWise-style immigration case-management workflows, implemented with Immigration Horizons branding and original UI components  
**Date:** 2026-10-03  
**Implementation dependency:** Stabilization Phase 01 must make existing Staff/Client workflows reliable before the USCIS autofill engine is released.

---

## 1. Product target

Immigration Horizons should feel like a polished immigration-specific operating system rather than a generic CRM.

The target experience is:

~~~text
Client enters information once
        +
Client uploads categorized / requested documents
        ↓
Immigration Horizons stores normalized reusable case data
        ↓
Staff reviews / corrects / approves the data
        ↓
The same approved data populates all applicable USCIS forms
        ↓
Staff reviews generated USCIS PDFs
        ↓
Approved forms feed the Filing Packet
~~~

The reference screenshots show the desired interaction patterns:

- persistent left navigation;
- prominent Create New action;
- universal search;
- role/user identity in the shell;
- matter/case page with horizontal workflow tabs;
- global Messages/Chat;
- dashboard cards/queues;
- case tracking;
- Smart Form intake;
- document review/import;
- form review;
- USCIS form preview/output.

Do not copy 8am DocketWise trademarks, logos, proprietary imagery, text, or pixel-perfect styling. Reproduce the workflow quality and information architecture using Immigration Horizons branding and original components.

---

## 2. UX shell

### Staff desktop shell

Recommended composition:

~~~text
┌──────────────────────────────────────────────────────────────────────┐
│ Search Immigration Horizons     Recents       + Create   Help  Bell │
├───────────────┬──────────────────────────────────────────────────────┤
│ IH Logo       │                                                      │
│               │  Current page / case                                 │
│ User / Role   │                                                      │
│               │                                                      │
│ + Create New  │                                                      │
│               │                                                      │
│ Dashboard     │                                                      │
│ Cases         │                                                      │
│ Clients       │                                                      │
│ Tasks         │                                                      │
│ Messages      │                                                      │
│ Deadlines     │                                                      │
│               │                                                      │
│ Settings*     │                                                      │
└───────────────┴──────────────────────────────────────────────────────┘
~~~

Settings is shown only when the staff capability allows operational settings.

### Create New

Create New is context/capability aware.

Potential actions:

~~~text
New Case
New Client / Invite Client
New Task
New Message
New Smart Intake
New Document Request
New Petition
New Filing Packet
~~~

Only authorized actions appear.

---

## 3. Staff Dashboard

Use actionable cards/queues instead of decorative metrics.

Recommended PM dashboard:

~~~text
My Cases
Tasks Due Today
Overdue Tasks
Unread Client Messages
Upcoming Deadlines
Documents Awaiting Review
Forms Awaiting Review
Evidence Gaps
Petition Work Needing Action
Filing Packets Needing Action
Recent Case Activity
~~~

Each metric links to its actual queue.

Recommended Operations Admin dashboard:

~~~text
Unassigned Cases
Cases Without PM
Team Assignment Issues
Overdue Work Across Firm
Unread / Unhandled Client Communications
Documents Awaiting Review
Forms Awaiting Review
Evidence Blockers
Petition Review Queue
Filing Packet Review Queue
Workload by Employee
Recent Firm Activity
~~~

---

## 4. Case / Matter workspace

The visual interaction may resemble the reference matter view, but use Immigration Horizons terminology.

Header:

~~~text
IH-2026-00124
EB-2 NIW — Ahmed Khan

Client: Ahmed Khan
Project Manager: Sarah Ali
Stage: Evidence Collection
Priority: High
Target Filing: 2026-11-15
~~~

Recommended navigation:

~~~text
Overview
Case Tracking
Forms
Tasks
Documents
Evidence
Messages
Petition
Filing Packet
Team
Activity
~~~

For non-technical users, these can also be grouped visually:

~~~text
Client Inputs:
  Documents
  Evidence
  Forms

Case Work:
  Tasks
  Petition
  Filing Packet

Communication:
  Messages

Management:
  Team
  Activity

Post-Filing:
  Case Tracking
~~~

### Case Overview

The overview is a case dashboard, not just metadata.

Show:

- current stage;
- next milestone;
- PM;
- client;
- important filing/deadline date;
- open tasks;
- unread messages;
- requested documents outstanding;
- documents awaiting review;
- Smart Forms completion;
- evidence completion;
- petition state;
- filing packet state;
- recent activity;
- client-visible update action when allowed.

---

## 5. Client Portal target

The Client Portal is simpler than the Staff Portal.

Primary navigation:

~~~text
Home
My Cases
Documents
Forms
Messages
Notifications
Profile
~~~

### Client Home

The first section is:

~~~text
Action Required
~~~

Example:

~~~text
3 things need your attention

Upload Passport Copy                  [Upload]
Upload Master's Degree               [Upload]
Complete Personal Information Form   [Continue]
~~~

Then:

~~~text
My Case
Messages
Documents
Forms
Recent Updates
USCIS Status (after tracking is enabled)
~~~

The client should not need to understand internal objects such as workspace, channel, evidence IDs, form mappings or packet versions.

---

## 6. Client document center

### Human-readable categories

Provide a canonical category tree.

#### Identity & Immigration

- Passport
- National ID
- Visa
- I-94
- EAD
- Green Card
- Travel document
- Previous USCIS notices
- Previous immigration filings
- Other immigration identity/status evidence

#### Education

- Degree / Diploma
- Transcript
- Credential Evaluation
- Professional Certificate
- License
- Training Certificate

#### Employment & Experience

- Experience Letter
- Employment Verification
- Offer Letter
- Employment Contract
- Pay Records
- Resume / CV
- Job Description
- Employer Letter

#### Recommendation Letters

- Recommender Information
- Draft Recommendation Letter
- Signed Recommendation Letter
- Independent Expert Letter

#### Research, Publications & Citations

- Publication
- Journal Article
- Conference Paper
- Citation Report
- Peer Review Evidence
- Research Project

#### Awards, Memberships & Recognition

- Award
- Membership
- Press / Media
- Speaking Engagement
- Judging / Reviewing Evidence
- Other Recognition

#### USCIS / Government Documents

- I-797 Receipt Notice
- Approval Notice
- RFE
- NOID
- Biometrics Notice
- Interview Notice
- Transfer Notice
- USCIS Correspondence
- Consular / Department of State Document

#### Personal / Civil Documents

- Birth Certificate
- Marriage Certificate
- Divorce Decree
- Name Change Document
- Family Relationship Document
- Address Evidence

#### Business / Financial

- Business Registration
- Tax Return
- Financial Statement
- Bank Statement
- Invoice / Revenue Evidence
- Business Plan
- Organizational Document

#### Other Supporting Evidence

- Other

Category definitions must be server-owned and configurable/versioned enough to evolve without hard-coded client UI logic.

### Requested upload

If staff requests a specific document, the client does not categorize it manually.

Example:

~~~text
Passport Copy
Category: Identity & Immigration
Requested for: Ahmed Khan
Status: Requested

[Upload Passport]
~~~

The request/category/subject is already bound.

### General upload

General Upload allows:

~~~text
Who is this document for?
Category
Document type
Title
Optional description
File
~~~

Use a small number of clear choices with searchable selectors when necessary.

### Client-facing statuses

Use plain language:

~~~text
Requested
Uploaded
Under Review
Accepted
Replacement Needed
Rejected
~~~

Replacement Needed shows the staff's client-visible reason and one clear Upload Replacement action.

---

## 7. Smart Intake / Smart Forms target

The target workflow should follow a structured wizard.

Recommended staff workflow:

~~~text
1. Assemble
2. Documents
3. Invite
4. Intake
5. Review
~~~

### 7.1 Assemble

Staff chooses:

- case/client;
- preparer;
- case participants and roles;
- one or more USCIS forms;
- reusable intake template if desired;
- custom questions if necessary.

Examples of roles:

~~~text
Beneficiary
Petitioner
Applicant
Sponsor
Derivative Spouse
Derivative Child
Employer
Preparer
Interpreter
~~~

### 7.2 Documents

Staff attaches document requests to the intake.

Requests can be required/optional and bound to:

- a participant;
- a document category/type;
- a case requirement;
- an evidence requirement;
- optionally a USCIS form requirement.

### 7.3 Invite

Send the intake to the client through:

- Client Portal;
- email invitation;
- later SMS if enabled.

### 7.4 Intake

Client completes one guided questionnaire.

The questionnaire is not a literal copy of a USCIS PDF.

It should ask questions in a human-friendly order and reuse previous data.

Examples:

~~~text
About You
Contact Information
Addresses
Immigration History
Passport / Travel Documents
Education
Employment
Family
Petitioner / Employer Information
Case-Specific Questions
Additional Information
Documents
Review
~~~

Question logic should hide irrelevant questions.

### 7.5 Review

Staff sees:

- client answers;
- missing required data;
- validation issues;
- conflicts with existing approved data;
- associated document requests;
- generated USCIS form previews;
- data provenance.

Staff can return the intake for changes or approve/lock a revision.

---

## 8. Core requirement — answer once, reuse everywhere

This is the central architecture rule.

Do not model all important data only as ad-hoc answers inside one CaseSmartForm.

Introduce a normalized, typed immigration data layer.

### 8.1 Canonical data keys

Examples:

~~~text
person.legalName.first
person.legalName.middle
person.legalName.last
person.otherNames[]
person.birth.date
person.birth.city
person.birth.country
person.gender
person.ssn
person.aNumber
person.uscisOnlineAccountNumber

contact.email
contact.phone

address.current.street1
address.current.street2
address.current.city
address.current.state
address.current.postalCode
address.current.country
address.history[]

passport.number
passport.country
passport.issueDate
passport.expiryDate

immigration.i94.number
immigration.currentStatus
immigration.statusExpiryDate

education.history[]
employment.history[]
family.spouse
family.children[]
~~~

Canonical keys must be stable and reusable across questionnaire templates and USCIS form mappings.

### 8.2 Multiple people / organizations

A case can contain multiple parties.

Introduce a canonical case-party/participant layer instead of assuming every answer belongs to the primary client.

Example:

~~~text
CaseParty
  case
  partyType: person | organization
  sourceContact/client
  role: beneficiary | petitioner | spouse | child | employer | sponsor ...
~~~

Each Smart Form question and each USCIS field mapping points to a participant role + canonical data key.

---

## 9. Data provenance and review

Every canonical value used to generate a USCIS form should be able to answer:

~~~text
Where did this value come from?
Who last changed it?
Was it client supplied, staff supplied, or document-extracted?
When was it approved?
~~~

Recommended provenance metadata:

~~~text
value
sourceType
sourceId
sourceRevision
capturedAt
capturedBy
reviewStatus
reviewedAt
reviewedBy
~~~

Do not put sensitive values in generic audit logs.

---

## 10. USCIS form template registry

Official form rendering must be edition-aware.

Introduce a versioned registry concept such as:

~~~text
USCISFormTemplate
  formNumber
  formTitle
  editionDate
  expirationDate
  sourceUrl
  sourceChecksum
  status
  pdfFieldMap
  computedRules
  validationRules
  supportedCaseTypes
  publishedAt
~~~

Never silently reuse an outdated mapping when USCIS publishes a new edition.

A new form edition creates a new mapping version.

The source PDF must be obtained from an approved official USCIS source and checked before publication.

---

## 11. USCIS field mapping

Each PDF field mapping points to canonical data.

Conceptually:

~~~text
Form I-140
  Part 1, Employer Legal Name
    <- petitioner.organization.legalName

  Part 2, Classification
    <- case.classification

Form I-485
  Family Name
    <- beneficiary.person.legalName.last

  Given Name
    <- beneficiary.person.legalName.first

  A-Number
    <- beneficiary.person.aNumber
~~~

Mappings may be:

- direct;
- formatted;
- computed;
- conditional;
- repeated-array;
- checkbox/radio selection;
- derived from case/party metadata.

Computed fields must be deterministic and tested.

---

## 12. Autofill pipeline

The minimum safe pipeline:

~~~text
Client Intake
    ↓
Normalize / Validate
    ↓
Canonical Immigration Data
    ↓
Staff Review
    ↓
Approved Data Revision
    ↓
USCIS Form Mapping Engine
    ↓
Generated Draft PDF
    ↓
Missing / Conflict Review
    ↓
Staff Approval
    ↓
Locked Form Version
    ↓
Filing Packet
~~~

### Rules

- Generated forms are drafts until staff review.
- Never claim a form is ready merely because all mapped fields have values.
- Required USCIS form logic/instructions still require legal/professional review.
- Preserve the exact template edition used.
- A locked generated version should be immutable.
- Regeneration creates a new version.
- Filing Packet pins exact form versions.

---

## 13. Form Review UI

Target interaction:

~~~text
Left:
  official USCIS form preview

Right:
  data / issues / field source
~~~

For each mapped field, staff can see:

~~~text
Field
Current generated value
Source
Validation state
Override / correction action where permitted
~~~

Filters:

~~~text
All
Missing
Needs Review
Conflicts
Overridden
~~~

Use visual highlighting for fields requiring attention.

A deliberate override must record provenance and reason where appropriate.

---

## 14. Sync model

### Phase 1 — canonical-data-to-form sync

Required first:

~~~text
Client/staff edits approved canonical data
    ↓
Draft USCIS form regenerates / updates
~~~

This gives answer-once reuse across forms.

### Phase 2 — controlled two-way sync

Later, if staff edits a supported field in the USCIS form review UI, allow that value to propose an update back to canonical data.

Never allow an unreviewed arbitrary PDF edit to silently overwrite canonical client information.

Computed fields generally should not sync backward.

---

## 15. Document Data Capture

The reference screenshot also shows document-to-data extraction.

This should be a separate, controlled capability.

Possible supported documents:

- passport;
- green card;
- EAD;
- I-94;
- USCIS receipt/approval notices;
- later additional structured documents.

Workflow:

~~~text
Upload Document
   ↓
Extract Candidate Values
   ↓
Review & Import
   ↓
Staff/client confirms each value
   ↓
Confirmed values update canonical immigration data
   ↓
Forms can use the confirmed data
~~~

Do not automatically overwrite canonical data from extraction without human confirmation.

Display:

~~~text
Field
Current data
Extracted candidate
Import?
~~~

This mirrors the useful interaction pattern in the supplied reference screenshot while using Immigration Horizons styling.

---

## 16. Missing-data and conflict engine

Before form generation/finalization, surface:

~~~text
Missing required canonical data
Invalid formatting
Expired document
Conflicting answer vs approved profile
Conflicting data between two source documents
Unsupported PDF mapping
USCIS edition mismatch
Required form field not mapped
Conditional section requiring review
~~~

These should become actionable staff queues, not silent failures.

---

## 17. Integration with current Smart Forms

Do not discard:

- SmartFormTemplate
- CaseSmartForm
- SmartFormAudit
- autosave;
- revision conflict protection;
- submit / return / approve / lock;
- client/staff field visibility.

Extend the template field definitions to optionally map to participantRole + canonicalDataKey, or an equivalent schema.

When a client saves an answer to a mapped field:

1. validate the questionnaire answer;
2. update the CaseSmartForm revision as today;
3. write/propose the canonical value through a dedicated data service;
4. preserve provenance;
5. apply conflict policy if an approved value already differs.

Unmapped custom questions may remain CaseSmartForm-only answers.

---

## 18. Integration with Documents and Evidence

Document requests created during Smart Intake should use the existing canonical document/request domain.

Do not create a second upload system.

A received document can be linked to:

~~~text
DocumentRequest
EvidenceRequirement
Smart Intake
Case
Participant
USCIS form support requirement
~~~

without duplicating the file.

The existing private storage and secure-download rules remain authoritative.

---

## 19. Integration with Filing Packets

Filing Packet eventually includes exact generated USCIS form versions.

Conceptually:

~~~text
FilingPacketItem
  sourceType: uscis_form_version
  sourceId: <immutable generated form version>
~~~

Packet readiness must fail if a required form is:

- still draft;
- based on stale data after a material approved-data change;
- generated from a retired/invalid form edition when policy requires regeneration;
- missing required review.

---

## 20. Search and Create New

The reference shell's universal search and Create New pattern are valuable.

Universal search should eventually find:

~~~text
Case number
Client
Email
Receipt number
Document
Task
Form
~~~

Respect authorization on every result.

Create New should never show unavailable actions.

---

## 21. Visual design language

Immigration Horizons should be original and more polished while keeping the reference product's clarity.

Recommended:

- light neutral page background;
- white content surfaces;
- navy primary text/navigation;
- restrained blue action color;
- Immigration Horizons gold accent;
- 8-12px corner radius;
- subtle borders instead of heavy shadows;
- 44px minimum interactive controls;
- readable 14-16px body text;
- high contrast;
- consistent icon set;
- sticky left navigation desktop;
- responsive drawer mobile/tablet;
- generous whitespace;
- strong section hierarchy.

Do not reproduce DocketWise logo, proprietary assets or identical screen styling.

---

## 22. Implementation sequence

### Stage 0 — Stabilization

Finish Stabilization Phase 01:

- Staff/Admin separation;
- Staff contract repair;
- Evidence;
- Tasks;
- global Messages;
- UX/dashboard simplification;
- real Client/Staff E2E.

### Stage 1 — Canonical Immigration Data

Build:

- CaseParty / participant roles;
- canonical field registry;
- canonical case/person data storage;
- provenance;
- review/conflict rules.

### Stage 2 — Smart Intake Mapping

Extend Smart Form fields to canonical keys.

Build:

- answer reuse;
- participant-aware questions;
- deduplication;
- intake assembly from selected forms;
- document requests in intake.

### Stage 3 — USCIS Form Registry + Generator

Build:

- edition-aware official form registry;
- PDF mappings;
- deterministic generator;
- form instance/version model;
- review UI;
- missing/conflict validation.

Start with a deliberately small set of forms relevant to current service lines and prove the architecture before expanding.

### Stage 4 — Filing Packet integration

Allow immutable reviewed USCIS form versions to be pinned into packets.

### Stage 5 — Document Data Capture

Add confirmation-based extraction/import after the canonical data model is stable.

### Stage 6 — Advanced sync

Consider controlled two-way form sync only after one-way canonical autofill is stable.

---

## 23. Definition of done for USCIS autofill

A form-autofill release is not complete until all of the following are true:

1. A client can complete a human-friendly intake.
2. Repeated facts are asked once rather than once per USCIS form.
3. Case participants/roles are explicit.
4. Mapped answers update canonical immigration data with provenance.
5. Staff can review conflicts before form generation.
6. Two different USCIS forms can reuse the same approved canonical answer.
7. A supported official USCIS PDF is generated from the correct edition mapping.
8. Missing/unmapped/invalid required data is visibly flagged.
9. Staff can review the generated form before locking.
10. A locked form version is immutable.
11. Material approved-data changes mark affected output appropriately according to policy.
12. Filing Packet can pin the exact approved form version.
13. Client cannot see internal-only staff data through the generated workflow.
14. Authorization is case/workspace scoped.
15. Audit/provenance does not duplicate sensitive values into generic logs.
16. Tests cover direct, computed, conditional, repeated and checkbox mappings.
17. Tests cover form-edition change behavior.
18. Tests cover stale-revision/conflict behavior.
19. The workflow passes Staff + Client browser QA.
20. No production form mapping is published without human verification against the official form edition.

---

## 24. Reference-source observations

The supplied screenshots establish the desired visual/workflow target, including:

- left navigation + Create New;
- messages composer;
- case/matter tabbed workspace;
- case tracking;
- dashboard work cards/activity feed;
- document data extraction review/import;
- official USCIS form preview.

Public 8am DocketWise documentation also describes:

- Smart Forms that gather data needed to fill associated immigration forms;
- combining multiple immigration forms into one questionnaire;
- client document requests;
- client portal access to questionnaires, tasks, files and USCIS receipt tracking;
- form sync between intake data and generated forms.

These are functional references, not code/design assets to copy.