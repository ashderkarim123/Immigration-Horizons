/** Small helpers every JSON route needs, in one place. */

/** Wraps an async handler so a rejection reaches the error middleware. */
const route = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (err) {
    next(err);
  }
};

/** `?page=&limit=` as bounded integers: page >= 1, 1 <= limit <= max. */
function paging(req, { limit = 25, max = 100 } = {}) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const size = Math.min(Math.max(parseInt(req.query.limit, 10) || limit, 1), max);
  return { page, limit: size, skip: (page - 1) * size };
}

module.exports = { route, paging };
