// Environment problems the app cannot serve through — collected, not thrown.
//
// Throwing while a module loads looks like the direct way to refuse a
// misconfigured deployment, and on a long-lived process it is: server.js never
// reaches app.listen(). On a serverless one it was counterproductive. The runtime
// eagerly loads the entry point's module graph at boot to warm a bytecode cache,
// so the throw happened before any request had a handler to be answered by, and
// took the process down with it — the visitor got the platform's generic
// invocation-failed page, and the reason existed only in the logs. Requiring the
// app lazily inside a try/catch did not help, because the eager load happens
// outside the handler entirely.
//
// So nothing here throws. config/ready.js checks this before it lets a request
// through, which refuses a misconfigured deployment just as firmly — every
// request gets a 503 naming what is missing, and server.js still exits non-zero
// rather than binding a port.
var fs = require("fs");
var path = require("path");

// Whether the SQLite file could actually be created. models/index.js has already
// tried to make this directory by the time anything calls in here, so its absence
// means the attempt failed.
function canWrite(dir) {
  try {
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch (err) {
    return false;
  }
}

function isLocal(host) {
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

module.exports = function problems() {
  var found = [];
  var config = require("./config")[process.env.NODE_ENV || "development"];

  // Deliberately a test of the filesystem rather than a check for a platform
  // variable. The first version of this looked for process.env.VERCEL, which a
  // project can be configured not to expose — and when it is not exposed, the
  // check silently never fires and the fallback to an unwritable SQLite file
  // surfaces as "the database could not be reached" instead. Asking whether the
  // file can be written answers the real question on any host.
  if (config.dialect === "sqlite" && config.storage && config.storage !== ":memory:") {
    if (!canWrite(path.dirname(config.storage))) {
      found.push(
        "DATABASE_URL is not set, so Mutuo fell back to SQLite at " +
        config.storage + " — and that directory cannot be written, which is the " +
        "case on any read-only or serverless filesystem. Attach a Postgres " +
        "database and set DATABASE_URL, DB_DIALECT=postgres and DB_SSL=true."
      );
    }
  }

  if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
    found.push(
      "SESSION_SECRET is not set. It signs the session cookie, so running " +
      "without a real one would let anyone forge a login."
    );
  }

  // A dialect that does not match the URL fails as a connection error, which
  // reads as "the database is down" and sends you looking in the wrong place.
  // config/config.js defaults DB_DIALECT to mysql, so pointing DATABASE_URL at
  // Postgres and forgetting DB_DIALECT means talking MySQL to a Postgres server.
  var url = process.env.DATABASE_URL;
  if (url) {
    var scheme = String(url).split(":")[0].toLowerCase();
    var wanted = scheme === "postgresql" ? "postgres" : scheme;

    if (wanted === "postgres" || wanted === "mysql") {
      var dialect = process.env.DB_DIALECT;
      if (!dialect) {
        found.push(
          "DB_DIALECT is not set, so it defaults to mysql, but DATABASE_URL is " +
          "a " + wanted + " URL. Set DB_DIALECT=" + wanted + "."
        );
      } else if (dialect !== wanted) {
        found.push(
          "DB_DIALECT is \"" + dialect + "\" but DATABASE_URL is a " + wanted +
          " URL. Set DB_DIALECT=" + wanted + "."
        );
      }
    }

    // Every managed Postgres insists on TLS and presents a certificate Node does
    // not ship an authority for. Without DB_SSL the connection is refused
    // outright. Only for a remote host: a Postgres on this machine is normally
    // reached without it.
    if (wanted === "postgres" && process.env.DB_SSL !== "true") {
      var host = "";
      try {
        host = new URL(url).hostname;
      } catch (err) {
        host = "";
      }
      if (host && !isLocal(host)) {
        found.push(
          "DB_SSL is not \"true\", which managed Postgres requires. Set DB_SSL=true."
        );
      }
    }
  }

  return found;
};
