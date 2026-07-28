// A small fixed-window rate limiter, kept in memory.
//
// Enough to stop someone working through a password list against one account
// from a single address. It is deliberately not a dependency: the whole thing
// is forty lines, and express-rate-limit would still need a shared store to
// mean anything once the app runs as more than one process. If you scale out,
// replace this with a limiter backed by Redis — see the README.

/**
 * @param {object} options
 * @param {number} options.max        Requests allowed per window.
 * @param {number} options.windowMs   Window length in milliseconds.
 * @param {string} options.message    What to tell a caller who is over.
 * @param {function} [options.countIf] Given the finished response, should this
 *   request count against the budget? Defaults to counting every request. The
 *   login limiter counts only failures, so getting your password right does
 *   not use up the budget.
 * @returns {function} Express middleware, with a `reset()` for the tests.
 */
module.exports = function rateLimit(options) {
  var max = options.max;
  var windowMs = options.windowMs;
  var message = options.message;
  var countIf = options.countIf;

  // One store per limiter. Sharing a module-level map would have let a failed
  // login eat into the signup budget, and vice versa.
  var buckets = new Map();

  // Drop windows that have expired, so a long-running process does not keep one
  // entry per address that ever connected.
  function sweep(now) {
    buckets.forEach(function(bucket, key) {
      if (bucket.resetAt <= now) {
        buckets.delete(key);
      }
    });
  }

  function middleware(req, res, next) {
    var now = Date.now();
    if (buckets.size > 5000) {
      sweep(now);
    }

    var key = req.ip;
    var bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    if (bucket.count >= max) {
      res.set("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({ message: message });
    }

    if (!countIf) {
      bucket.count += 1;
      return next();
    }

    // Decide once the handler has answered, so we can look at the status code.
    res.on("finish", function() {
      if (countIf(res)) {
        bucket.count += 1;
      }
    });
    return next();
  }

  middleware.reset = function() {
    buckets.clear();
  };

  return middleware;
};
