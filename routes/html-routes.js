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
  //
  // The order of these three is the order they appear in the nav, and it is
  // deliberate: who is nearby first, then who you have matched with, then your
  // own profile — which is a thing you fill in once and edit rarely, and had no
  // business being the second thing on the page.
  app.get("/members", isAuthenticated, sendPage("members.html"));

  app.get("/matches", isAuthenticated, sendPage("matches.html"));

  // The profile form, where a member fills in or edits their own details.
  app.get("/application", isAuthenticated, sendPage("application.html"));

  // The random match used to be a page of its own. It is a button on /members
  // now — dealing a random member is something you do while browsing the ones
  // near you, not a separate destination — so this is here for anyone holding
  // an old link or a bookmark. A 302 rather than a 301: a permanent redirect is
  // cached by the browser more or less forever, which is a lot of certainty to
  // hand out about the shape of a menu.
  app.get("/game", function(req, res) {
    res.redirect("/members");
  });

  // A single member's profile. The id in the URL is read by profile-detail.js,
  // which fetches /api/profiles/:id.
  app.get("/detail/:id", isAuthenticated, sendPage("profile-detail.html"));
};
