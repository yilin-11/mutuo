// Entry point: create the schema if needed, then start listening.
// The express app itself lives in app.js so the tests can import it without
// binding a port.
// On Vercel this file is not used at all — see api/index.js, which hands the
// same app to a per-request function instead of binding a port.
var app = require("./app");
var ready = require("./config/ready");

var PORT = process.env.PORT || 8080;

ready()
  .then(function() {
    app.listen(PORT, function() {
      console.log("Mutuo is listening on http://localhost:%s/", PORT);
    });
  })
  .catch(function(err) {
    // Without this a bad database configuration failed silently: the process
    // stayed alive with an unhandled rejection and never served a request.
    console.error("Could not start Mutuo — database sync failed:");
    console.error(err);
    process.exit(1);
  });
