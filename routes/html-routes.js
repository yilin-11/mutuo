var path = require("path");

var isAuthenticated = require("../config/middleware/isAuthenticated");

// Pages live outside public/ on purpose. While they sat in public/pages the
// static middleware served them directly, so GET /pages/members.html returned
// the member area to anyone, never reaching the isAuthenticated guard below.
var PAGES = path.join(__dirname, "..", "views");

function sendPage(name) {
  return function(req, res) {
    res.sendFile(path.join(PAGES, name));
  };
}

module.exports = function(app) {

  // Landing page. The `return` matters: without it the old code called
  // res.redirect and then res.sendFile on the same request, which threw
  // ERR_HTTP_HEADERS_SENT for every logged-in visitor.
  app.get("/", function(req, res) {
    if (req.user) {
      return res.redirect("/members");
    }
    return sendPage("index.html")(req, res);
  });

  app.get("/login", function(req, res) {
    if (req.user) {
      return res.redirect("/members");
    }
    return sendPage("login.html")(req, res);
  });

  app.get("/signup", function(req, res) {
    if (req.user) {
      return res.redirect("/members");
    }
    return sendPage("signup.html")(req, res);
  });

  // Member area. Everything below needs a session.
  app.get("/members", isAuthenticated, sendPage("members.html"));

  // The profile form, where a member fills in or edits their own details.
  app.get("/application", isAuthenticated, sendPage("application.html"));

  app.get("/game", isAuthenticated, sendPage("game.html"));

  // A single member's profile. The id in the URL is read by profile-detail.js,
  // which fetches /api/profiles/:id.
  app.get("/detail/:id", isAuthenticated, sendPage("profile-detail.html"));
};
