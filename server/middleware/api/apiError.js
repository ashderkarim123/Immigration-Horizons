/**
 * Centralized API error formatter.
 * Ensures all JSON API responses use the same `{ error: { code, message, ... } }` envelope.
 */
function apiErrorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  console.error('[API Error]', err);

  const statusCode = err.status || 500;
  const errorCode = err.code || (statusCode === 500 ? 'server_error' : 'invalid_request');
  const message = err.expose || statusCode < 500 ? err.message : 'Internal Server Error';

  res.status(statusCode).json({
    error: {
      code: errorCode,
      message: message,
      fieldErrors: err.fieldErrors || null,
      requestId: req.id || null,
    },
  });
}

function createApiError(status, code, message, fieldErrors = null) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.fieldErrors = fieldErrors;
  error.expose = true;
  return error;
}

module.exports = { apiErrorHandler, createApiError };
