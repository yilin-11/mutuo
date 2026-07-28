// Environment variables the app cannot serve without — collected, not thrown.
//
// Throwing while a module loads looks like the direct way to refuse a
// misconfigured deployment, and on a long-lived process it is: server.js never
// reaches app.listen(). On Vercel it was actively counterproductive. The runtime
// eagerly loads the entry point's module graph at boot to warm a bytecode cache,
// so the throw happened before any request had a handler to be answered by, and
// took the process down with it — the visitor got Vercel's generic
// FUNCTION_INVOCATION_FAILED, and the reason existed only in the logs. Requiring
// the app lazily inside a try/catch did not help, because the eager load happens
// outside the handler entirely.
//
// So nothing here throws. config/ready.js checks this before it lets a request
// through, which refuses a misconfigured deployment just as firmly — every
// request gets a 503 naming what is missing, and server.js still exits non-zero
// rather than binding a port.
module.exports = function problems() {
  var found = [];

  if (process.env.VERCEL && !process.env.DATABASE_URL) {
    found.push(
      "DATABASE_URL is not set. The filesystem is not writable on Vercel, so " +
      "the SQLite fallback cannot be used — attach a Postgres database and set " +
      "DATABASE_URL, DB_DIALECT=postgres and DB_SSL=true."
    );
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

    // Every managed Postgres reachable from a deployment insists on TLS and
    // presents a certificate Node does not ship an authority for. Without
    // DB_SSL the connection is refused outright.
    if (process.env.VERCEL && wanted === "postgres" && process.env.DB_SSL !== "true") {
      found.push("DB_SSL is not \"true\", which managed Postgres requires. Set DB_SSL=true.");
    }
  }

  return found;
};
