// Columns added to a table that already exists.
//
// `sequelize.sync()` creates missing tables, and that is all it does — it will
// not add a column to a table it finds already there. So a database created
// before `Profile.latitude` existed keeps a table without it, and since
// Sequelize names every attribute in its SELECT, the very first query then dies
// on "no such column". A new deployment is fine; every existing one breaks.
//
// `sync({ alter: true })` would cover it and much more besides — it also drops
// and retypes things to match the models, which is not a thing to point at a
// database holding real rows. This is the additive half only: look at what the
// table has, add what it is missing, touch nothing else.
var db = require("../models");

// Each entry names a model attribute that may post-date the table. Adding a
// column to a model means adding it here too, or existing deployments will not
// get it.
var ADDED_COLUMNS = [
  { model: "Profile", column: "latitude" },
  { model: "Profile", column: "longitude" },
  { model: "User", column: "matchesSeenAt" }
];

function addIfMissing(queryInterface, entry) {
  var model = db[entry.model];
  var table = model.getTableName();

  return queryInterface.describeTable(table).then(function(existing) {
    if (existing[entry.column]) {
      return null;
    }
    // The definition comes from the model rather than being written out a
    // second time here, so the added column cannot drift from the one a fresh
    // database gets from sync().
    return queryInterface.addColumn(table, entry.column, model.rawAttributes[entry.column]);
  });
}

/**
 * Brings existing tables up to date with the models, additively.
 * Runs after sync(), so every table is known to exist by this point.
 *
 * @returns {Promise<void>}
 */
module.exports = function addMissingColumns() {
  var queryInterface = db.sequelize.getQueryInterface();

  // In sequence: SQLite serialises writes anyway, and a schema change is not
  // where concurrency is worth having.
  return ADDED_COLUMNS.reduce(function(chain, entry) {
    return chain.then(function() {
      return addIfMissing(queryInterface, entry);
    });
  }, Promise.resolve());
};
