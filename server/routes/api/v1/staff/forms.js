const express = require('express');

const { trustedOriginMiddleware } = require('../../../../middleware/api/trustedOrigin');
const { requireApiCapability } = require('../../../../middleware/api/staffAuth');
const { createApiError } = require('../../../../middleware/api/apiError');
const { can } = require('../../../../utils/permissions');
const { STAFF_EDITABLE_STATUSES } = require('../../../../utils/smartFormConstants');
const { hasActiveEmployeeMembership } = require('../../../../services/casePolicy');
const caseManagement = require('../../../../services/caseManagement');
const forms = require('../../../../services/smartForms/smartFormService');

/**
 * Canonical staff Smart Forms API (ADR-021 §22). Handlers authorize
 * (capability AND case membership unless `cases.view_all`), delegate to
 * smartFormService and map the outcome. Missing and not-yours are the same 404.
 */

const router = express.Router();

const response = (res, req, data, status = 200) => res.status(status).json({ data, meta: { requestId: req.id } });
const notFound = (what) => createApiError(404, 'not_found', `${what} not found.`);
const actorOf = (req) => ({ type: 'employee', id: req.staff._id, name: req.staff.name || 'Employee' });
const route = (handler) => async (req, res, next) => {
  try {
    await handler(req, res, next);
  } catch (err) {
    next(err);
  }
};

/** Capability is checked by the route middleware; this is the row policy half. */
const onCase = async (req, workspaceId) => can(req, 'cases.view_all') || hasActiveEmployeeMembership(req, workspaceId);

function failOnOutcome(result) {
  if (result.outcome === 'validation_error') throw createApiError(400, 'validation_error', 'Please correct the highlighted fields.', result.errors);
  if (result.outcome === 'conflict') throw createApiError(409, 'conflict', 'This form was changed by someone else. Reload to see the latest version.', result.current);
  if (result.outcome === 'invalid_state') throw createApiError(409, 'invalid_state', 'This form is not in a state that allows that action.', result.current);
}

function actionsFor(req, status) {
  const rule = (name, capability) => can(req, capability) && forms.TRANSITIONS[name].from.includes(status);
  return {
    canEdit: can(req, 'forms.edit') && STAFF_EDITABLE_STATUSES.includes(status),
    canSubmit: rule('submit', 'forms.edit'),
    canReturn: rule('return', 'forms.review'),
    canApprove: rule('approve', 'forms.review'),
    canLock: rule('lock', 'forms.lock'),
  };
}

const dto = (req, form, template) => forms.toStaffDto(form, template, actionsFor(req, form.status));

/** Loads the form the actor may view into req.smartForm, or answers the one identical 404. */
const formParam = route(async (req, res, next) => {
  const loaded = await forms.loadForm(req.params.formId);
  if (!loaded || !(await onCase(req, loaded.form.workspace))) return next(notFound('Form'));
  req.smartForm = loaded;
  return next();
});

// GET /api/v1/staff/cases/:caseId/forms
router.get('/cases/:caseId/forms', requireApiCapability('forms.view'), route(async (req, res, next) => {
  const loaded = await caseManagement.loadCaseAndWorkspace(req.params.caseId);
  if (!loaded || !(await onCase(req, loaded.workspace._id))) return next(notFound('Case'));
  const items = (await forms.listCaseForms(loaded.caseDoc._id)).map(forms.toListItem);
  return response(res, req, { forms: items, canProvision: can(req, 'forms.edit') });
}));

// POST /api/v1/staff/cases/:caseId/forms/provision — idempotent
router.post('/cases/:caseId/forms/provision', trustedOriginMiddleware, requireApiCapability('forms.edit'), route(async (req, res, next) => {
  const loaded = await caseManagement.loadCaseAndWorkspace(req.params.caseId);
  if (!loaded || !(await onCase(req, loaded.workspace._id))) return next(notFound('Case'));
  const result = await forms.provisionForms({ caseDoc: loaded.caseDoc, workspace: loaded.workspace, actor: actorOf(req) });
  const items = (await forms.listCaseForms(loaded.caseDoc._id)).map(forms.toListItem);
  return response(res, req, { ...result, forms: items }, result.created.length ? 201 : 200);
}));

// GET /api/v1/staff/forms/:formId
router.get('/forms/:formId', requireApiCapability('forms.view'), formParam, route(async (req, res) => {
  const { form, template } = req.smartForm;
  return response(res, req, dto(req, form, template));
}));

// PATCH /api/v1/staff/forms/:formId/answers  { revision, answers }
router.patch('/forms/:formId/answers', trustedOriginMiddleware, requireApiCapability('forms.edit'), formParam, route(async (req, res) => {
  const { form, template } = req.smartForm;
  const result = await forms.saveAnswers({ form, template, patch: req.body.answers, expectedRevision: req.body.revision, actor: actorOf(req) });
  failOnOutcome(result);
  return response(res, req, dto(req, result.form, template));
}));

// POST /api/v1/staff/forms/:formId/{submit,return,approve,lock}  { revision, clientReviewNote?, internalReviewNote? }
const lifecycle = (action, capability) =>
  router.post(`/forms/:formId/${action}`, trustedOriginMiddleware, requireApiCapability(capability), formParam, route(async (req, res) => {
    const { form, template } = req.smartForm;
    const result = await forms.transition(action, {
      form,
      template,
      expectedRevision: req.body.revision,
      actor: actorOf(req),
      note: req.body.clientReviewNote,
      internalNote: req.body.internalReviewNote,
    });
    failOnOutcome(result);
    return response(res, req, dto(req, result.form, template));
  }));

lifecycle('submit', 'forms.edit');
lifecycle('return', 'forms.review');
lifecycle('approve', 'forms.review');
lifecycle('lock', 'forms.lock');

// GET /api/v1/staff/forms/:formId/audit
router.get('/forms/:formId/audit', requireApiCapability('forms.view'), formParam, route(async (req, res) => {
  return response(res, req, { events: (await forms.listAudit(req.smartForm.form._id)).map(forms.toAuditDto) });
}));

module.exports = router;
