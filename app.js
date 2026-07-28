var crypto = require("crypto");
var path = require("path");
var express = require("express");
var session = require("express-session");

var passport = require("./config/passport");
var sessionStore = require("./config/sessionStore");

var app = express();
var isProduction = process.env.NODE_ENV === "production";

// No reason to advertise the framework and version to anyone scanning for
// known bugs in it.
app.disable("x-powered-by");

// Behind a proxy (Heroku, Render, nginx) express needs to be told to trust
// X-Forwarded-Proto, otherwise a `secure` session cookie is never sent.
if (isProduction) {
  app.set("trust proxy", 1);
}

// A body limit keeps a single oversized request from eating memory.
app.use(express.urlencoded({ extended: true, limit: "100kb" }));
app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));

// The session secret signs the session cookie, so a known value means anyone
// can forge a login. In production we insist on a real one; in development we
// generate a throwaway (sessions then end when the server restarts, which is
// a fair trade for not having a fake secret committed to the repo).
var sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  // In development this throwaway is the whole point: sessions end when the
  // server restarts, and no fake secret is committed to the repo.
  //
  // In production a missing secret is fatal, but config/requirements.js is what
  // says so — it refuses every request and stops server.js from binding a port.
  // Reporting it there rather than throwing here keeps module load from crashing
  // a serverless invocation before anything can explain why. This value never
  // signs a cookie that matters, because no request gets through to use it.
  sessionSecret = crypto.randomBytes(32).toString("hex");
}

app.use(session({
  secret: sessionSecret,
  // Sessions live in the database rather than in this process's memory, so they
  // survive a restart and are shared across however many processes are running.
  // express-session's default MemoryStore does neither, and leaks besides.
  store: sessionStore(session),
  resave: false,
  // Don't store a session for visitors who never log in.
  saveUninitialized: false,
  cookie: {
    // Not readable from JavaScript, so an XSS bug cannot steal the session.
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction,
    maxAge: 1000 * 60 * 60 * 24
  }
}));
app.use(passport.initialize());
app.use(passport.session());

// Every API answer depends on who is asking, so none of it may be stored by a
// browser or an intermediary. Without this a cached /api/user_data could still
// name the previous member after a logout.
app.use("/api", function(req, res, next) {
  res.set("Cache-Control", "no-store");
  next();
});

require("./routes/html-routes.js")(app);
require("./routes/api-routes.js")(app);

// Nothing matched. API callers get JSON; anyone else gets plain text.
app.use(function(req, res) {
  if (req.path.indexOf("/api/") === 0) {
    return res.status(404).json({ message: "No such endpoint." });
  }
  return res.status(404).type("text").send("Page not found.");
});

// Last line of defence. Without this express prints stack traces to the
// browser, and a rejected promise passed to next() would hang the request.
app.use(function(err, req, res, next) { // eslint-disable-line no-unused-vars
  console.error(err);
  if (res.headersSent) {
    return;
  }
  if (req.path.indexOf("/api/") === 0) {
    res.status(500).json({ message: "Something went wrong on our end." });
    return;
  }
  res.status(500).type("text").send("Something went wrong on our end.");
});

module.exports = app;
