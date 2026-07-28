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

module.exports = function sessionStore(session) {
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

  // Creates the Session table if it is not there yet. server.js syncs the rest
  // of the schema; this one belongs to the store, which owns its own shape.
  store.sync();

  return store;
};
