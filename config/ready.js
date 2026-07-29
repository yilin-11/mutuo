// Everything that has to be true before the app can answer its first request.
//
// A long-lived server does this once, before it binds a port — see server.js.
// A serverless deployment has no startup phase at all: the first request into a
// cold instance is the first opportunity to create the schema. So the work is
// memoised here and every entry point awaits the same promise, which makes the
// two deployments differ only in when they call it, not in what happens.
var db = require("../models");
var sessionStore = require("./sessionStore");
var problems = require("./requirements");
var addMissingColumns = require("./schema");

var pending = null;

module.exports = function ready() {
  if (pending) {
    return pending;
  }

  pending = Promise.resolve()
    // Before touching the database, because a deployment missing DATABASE_URL
    // would otherwise fail here as a driver error rather than as the
    // configuration mistake it is.
    .then(function() {
      var err = problems.asError();
      if (err) {
        throw err;
      }
      return db.sequelize.sync();
    })
    // sync() creates tables it cannot find but never alters one it can, so a
    // database that predates a new column needs it added explicitly. See
    // config/schema.js.
    .then(function() {
      return addMissingColumns();
    })
    // The Sessions table belongs to the session store rather than to models/,
    // so the store creates its own. Awaiting it matters: until this resolves a
    // login has nowhere to write, and on a cold instance that is a live race
    // against the very first request.
    .then(function() {
      return sessionStore.synced();
    });

  // A failure must not be cached as a permanent one. A database that was
  // briefly unreachable would otherwise poison this instance for as long as it
  // stays warm, answering every later request from the same rejected promise.
  pending = pending.catch(function(err) {
    pending = null;
    throw err;
  });

  return pending;
};
