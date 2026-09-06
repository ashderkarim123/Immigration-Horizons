const crypto = require('crypto');

function requestIdMiddleware(req, res, next) {
  // Use existing header if forwarded by a proxy, otherwise generate one
  const reqId = req.headers['x-request-id'] || crypto.randomUUID();
  req.id = reqId;
  res.setHeader('X-Request-Id', reqId);
  next();
}

module.exports = { requestIdMiddleware };
