// Everything that has to be true before the app can answer its first request.
//
// A long-lived server does this once, before it binds a port — see server.js.
// A serverless deployment has no startup phase at all: the first request into a
// cold instance is the first opportunity to create the schema. So the work is
// memoised here and every entry point awaits the same promise, which makes the
// two deployments differ only in when they call it, not in what happens.
var db = require("../models");
var sessionStore = require("./sessionStore");

var pending = null;

module.exports = function ready() {
  if (pending) {
    return pending;
  }

  pending = db.sequelize.sync()
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
