// Vercel entry point.
//
// Vercel invokes a function per request rather than running server.js, so
// nothing here binds a port. It hands the request to the same express app the
// local server and the test suite use, which keeps this file to the two things
// serverless actually changes: there is no startup phase in which to create the
// schema, and a throw at module scope takes the whole invocation down.
var app = null;
var ready = null;

// Required inside the handler rather than at module scope. Both app.js and
// config/config.js refuse to load when the deployment is misconfigured, and at
// module scope that reaches the browser as Vercel's generic
// FUNCTION_INVOCATION_FAILED — which says nothing about the cause and sends you
// to the logs to find out. Loading here means the reason can be answered with.
function load() {
  if (!app) {
    // Before the app, because requiring it constructs a Sequelize instance, and
    // that constructor throws for a dialect whose driver is missing — "Please
    // install sqlite3 package manually" — which is what a deployment with no
    // DATABASE_URL hits. ready() checks this too, but it only runs after the
    // module graph has loaded, by which point that throw has already happened
    // and the honest explanation has been replaced by a confusing one.
    var err = require("../config/requirements").asError();
    if (err) {
      throw err;
    }
    ready = require("../config/ready");
    app = require("../app");
  }
}

// Named in the generic message below. Just the dialect — no host, no
// credentials — because "could not be reached" while speaking the wrong protocol
// to a perfectly healthy database is otherwise indistinguishable from a database
// that is genuinely down.
function dialectInUse() {
  try {
    var config = require("../config/config")[process.env.NODE_ENV || "development"];
    return (config && config.dialect) || "unknown";
  } catch (err) {
    return "unknown";
  }
}

function unavailable(res, err, context) {
  console.error(context);
  console.error(err);

  res.statusCode = 503;
  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Cache-Control", "no-store");

  // Only our own configuration messages are quoted back. Anything else may be a
  // driver error carrying the connection string — password included — and this
  // response is public.
  res.end(err && err.mutuoConfig
    ? "Mutuo is misconfigured: " + err.message
    : "Mutuo is unavailable: its database could not be reached (dialect: " +
      dialectInUse() + ").");
}

module.exports = function handler(req, res) {
  try {
    // A module that throws is not added to require's cache, and `app` stays
    // null, so a later request retries rather than inheriting the failure.
    load();
  } catch (err) {
    return unavailable(res, err, "Mutuo could not start:");
  }

  return ready()
    .then(function() {
      app(req, res);
    })
    .catch(function(err) {
      // The database is unreachable or will not sync — not a bad request. 503
      // rather than 500, so it reads as "try again" to anything watching status
      // codes.
      unavailable(res, err, "Mutuo could not prepare its database:");
    });
};
