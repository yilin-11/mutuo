// Vercel entry point.
//
// Vercel invokes a function per request rather than running server.js, so
// nothing here binds a port. It hands the request to the same express app the
// local server and the test suite use, which keeps this file to the one thing
// serverless actually changes: there is no startup phase in which to create the
// schema, so the first request into a cold instance has to wait for it.
var app = require("../app");
var ready = require("../config/ready");

module.exports = function handler(req, res) {
  ready()
    .then(function() {
      app(req, res);
    })
    .catch(function(err) {
      // Reaching here means the database is unreachable or misconfigured, not
      // that this request was bad. 503 rather than 500, so it reads as "try
      // again" to anything paying attention to status codes.
      console.error("Mutuo could not prepare its database:");
      console.error(err);
      res.statusCode = 503;
      res.setHeader("Content-Type", "text/plain");
      res.setHeader("Cache-Control", "no-store");
      res.end("Mutuo is unavailable: its database could not be reached.");
    });
};
