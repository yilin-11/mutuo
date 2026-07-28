"use strict";

var path = require("path");

// Database configuration for Mutuo.
//
// Nothing in here is a secret: every environment either points at a local
// SQLite file (no database server to install) or reads its connection string
// from the environment. See .env.example for the variables involved.
var storage = process.env.SQLITE_STORAGE ||
  path.join(__dirname, "..", "data", "mutuo.sqlite");

var shared = {
  // Set SQL_LOG=true to see every query Sequelize runs.
  logging: process.env.SQL_LOG === "true" ? console.log : false
};

function sqlite(file) {
  return Object.assign({ dialect: "sqlite", storage: file }, shared);
}

// A serverless deployment has no writable disk, so the SQLite fallback below
// cannot work there. That is reported by config/requirements.js rather than
// thrown from here — see the comment in that file for why a throw during module
// load was the wrong tool on Vercel.
//
// A managed database (Heroku, Render, RDS, ...) hands us a single URL.
// When it is present we use it; otherwise production also falls back to
// SQLite so a fresh deploy still boots instead of crashing on startup.
function fromUrl() {
  var options = {
    use_env_variable: "DATABASE_URL",
    dialect: process.env.DB_DIALECT || "mysql"
  };

  // Managed Postgres (Render, Heroku, Neon, Supabase) insists on TLS, and
  // presents a certificate signed by an authority Node does not ship. Without
  // this the connection is refused outright with "no pg_hba.conf entry".
  if (process.env.DB_SSL === "true") {
    options.dialectOptions = {
      ssl: { require: true, rejectUnauthorized: false }
    };
  }

  return Object.assign(options, shared);
}

module.exports = {
  development: process.env.DATABASE_URL ? fromUrl() : sqlite(storage),
  // Tests run against a throwaway in-memory database.
  test: sqlite(":memory:"),
  production: process.env.DATABASE_URL ? fromUrl() : sqlite(storage)
};
