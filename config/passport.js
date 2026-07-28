var passport = require("passport");
var LocalStrategy = require("passport-local").Strategy;

var db = require("../models");

// Members log in with an email and password rather than a username.
passport.use(new LocalStrategy(
  {
    usernameField: "email"
  },
  function(email, password, done) {
    db.User.findOne({ where: { email: String(email || "").trim().toLowerCase() } })
      .then(function(dbUser) {
        // Deliberately the same message for "no such email" and "wrong
        // password" so the response cannot be used to discover which
        // addresses have accounts.
        if (!dbUser || !dbUser.validPassword(password)) {
          return done(null, false, { message: "Incorrect email or password." });
        }
        return done(null, dbUser);
      })
      // Without this a database error would leave the request hanging forever.
      .catch(done);
  }
));

// Only the user id goes into the session cookie. Serializing the whole record
// would put the password hash into the session store and leave logged-in users
// holding a snapshot that never reflects later changes.
passport.serializeUser(function(user, cb) {
  cb(null, user.id);
});

passport.deserializeUser(function(id, cb) {
  db.User.findByPk(id)
    .then(function(dbUser) {
      // A deleted account resolves to false, which logs the session out.
      cb(null, dbUser || false);
    })
    .catch(cb);
});

module.exports = passport;
