/**
 * Trusted Origin CSRF defense for the staff API.
 * Ensures state-mutating requests come from a recognized Immigration Horizons origin.
 */
const { createApiError } = require('./apiError');

function trustedOriginMiddleware(req, res, next) {
  // Safe methods don't need CSRF protection
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const origin = req.headers.origin || req.headers.referer;
  
  // If there's no origin/referer, block it (unless you have mobile apps that don't send it,
  // but for Angular web app, browsers always send it on CORS requests).
  if (!origin) {
    return next(createApiError(403, 'forbidden', 'Missing Origin header'));
  }

  try {
    const originUrl = new URL(origin);
    const host = originUrl.hostname;

    // Allow localhost for dev, and immigrationhorizons.com for prod
    if (
      host === 'localhost' || 
      host === '127.0.0.1' || 
      host.endsWith('immigrationhorizons.com')
    ) {
      return next();
    }
  } catch (err) {
    // Invalid URL format
  }

  return next(createApiError(403, 'forbidden', 'Untrusted origin'));
}

module.exports = { trustedOriginMiddleware };
