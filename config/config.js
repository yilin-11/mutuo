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
// cannot work there: the file would either fail to open or live in one frozen
// instance's /tmp and be invisible to the next. Say so plainly rather than
// letting it surface later as an opaque write error on somebody's first signup.
if (process.env.VERCEL && !process.env.DATABASE_URL) {
  var noUrl = new Error(
    "DATABASE_URL must be set when running on Vercel — the filesystem is not " +
    "writable, so the SQLite fallback cannot be used. Attach a Postgres " +
    "database and set DATABASE_URL, DB_DIALECT=postgres and DB_SSL=true. " +
    "See .env.example."
  );
  // Marks this as our own message about how the app is configured, rather than
  // an error from a driver. api/index.js will show it to a visitor; see there
  // for why that distinction has to exist.
  noUrl.mutuoConfig = true;
  throw noUrl;
}

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
