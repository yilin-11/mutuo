// Where sessions are kept.
//
// express-session defaults to an in-memory store that it warns about itself: it
// grows without bound, and every session is lost on restart and invisible to any
// other process. Rather than take on Redis for one table, sessions go in the
// database the app already has a connection to.
var SequelizeStore = require("connect-session-sequelize");

var db = require("./../models");

// The tests build and tear down the app repeatedly against an in-memory
// database; a store with a sweep timer would keep the process alive past the
// last test. Mocha's --exit papers over that, but not needing it is better.
var isTest = process.env.NODE_ENV === "test";
// On Vercel each request runs in an instance that is frozen between calls, so a
// periodic sweeper either never fires or fires at arbitrary times against a
// connection budget shared with real requests.
var isServerless = !!process.env.VERCEL;

// Resolves once the Sessions table exists. config/ready.js awaits this before
// letting a request through, because until it resolves a login has nowhere to
// write. Defaults to resolved for the tests, which use MemoryStore.
var lastSync = Promise.resolve();

function sessionStore(session) {
  if (isTest) {
    // Falls back to MemoryStore, which is the right shape for a suite that
    // starts from nothing every run.
    return undefined;
  }

  var Store = SequelizeStore(session.Store);
  var store = new Store({
    db: db.sequelize,
    // modelKey/tableName, not `table`: `table` means "reuse a model I already
    // defined", so passing it here left the store with no model at all.
    modelKey: "Session",
    tableName: "Sessions",
    // Clear expired rows every fifteen minutes rather than on every request.
    checkExpirationInterval: 15 * 60 * 1000,
    // Matches the cookie's maxAge in app.js.
    expiration: 24 * 60 * 60 * 1000
  });

  if (isServerless) {
    // Expired rows are still treated as "no session" when they are read, so
    // skipping the sweep leaves dead rows behind rather than stale logins.
    store.stopExpiringSessions();
  }

  // Creates the Session table if it is not there yet. models/ owns the rest of
  // the schema; this one belongs to the store, which owns its own shape.
  lastSync = store.sync();

  // This starts the moment the app is imported, but config/ready.js only awaits
  // it after the schema sync succeeds. When the database is unreachable both
  // fail, ready() rejects on the first, and this one is left with no handler —
  // an unhandled rejection, which Node treats as fatal. That killed the process
  // before the request it was failing could be answered. Attaching a no-op
  // marks it handled without settling it, so ready() still sees the rejection
  // if it gets that far.
  lastSync.catch(function() {});

  return store;
}

sessionStore.synced = function() {
  return lastSync;
};

module.exports = sessionStore;
