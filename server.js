// Entry point: create the schema if needed, then start listening.
// The express app itself lives in app.js so the tests can import it without
// binding a port.
var app = require("./app");
var db = require("./models");

var PORT = process.env.PORT || 8080;

db.sequelize.sync()
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
