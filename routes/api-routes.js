var db = require("../models");
var passport = require("../config/passport");
var apiAuth = require("../config/middleware/apiAuth");
var rateLimit = require("../config/middleware/rateLimit");
var geocode = require("../config/geocode");

// Counts only failed logins, so a member typing their password correctly never
// spends budget, while someone guessing runs out after ten tries a quarter hour.
var loginLimiter = rateLimit({
  max: 10,
  windowMs: 15 * 60 * 1000,
  message: "Too many failed login attempts. Please wait a few minutes and try again.",
  countIf: function(res) {
    return res.statusCode === 401;
  }
});

// Signup is capped per address so one client cannot mint accounts in a loop.
var signupLimiter = rateLimit({
  max: 50,
  windowMs: 60 * 60 * 1000,
  message: "Too many accounts created from this address. Please try again later."
});

// Shapes a profile for the browser. The member's email comes from the joined
// User row rather than a copy stored on the profile, so it can never drift.
function serializeProfile(profile) {
  return {
    id: profile.id,
    firstName: profile.firstName,
    lastName: profile.lastName,
    city: profile.city,
    zipCode: profile.zipCode,
    teachSkill: profile.teachSkill,
    learnSkill: profile.learnSkill,
    bio: profile.bio,
    email: profile.User ? profile.User.email : null
  };
}

// Copies only the fields a member is allowed to set. Anything else in the body
// (id, userId, createdAt, ...) is dropped instead of being trusted.
function pickEditableFields(body) {
  var values = {};
  db.Profile.EDITABLE_FIELDS.forEach(function(field) {
    if (typeof body[field] === "string") {
      values[field] = body[field].trim();
    }
  });
  return values;
}

// Which unique constraint did we trip? Sequelize reports the offending column
// in err.errors[].path. Without this check every UniqueConstraintError was
// reported as an email collision, so a member who double-submitted the profile
// form was told "an account with that email already exists" — a message about
// a form they were not filling in.
function uniqueFieldMessage(err) {
  var fields = (err.errors || []).map(function(item) {
    return item.path;
  });
  if (fields.indexOf("userId") > -1) {
    return "You already have a profile. Reload the page and edit it instead.";
  }
  if (fields.indexOf("email") > -1) {
    return "An account with that email already exists.";
  }
  return "That has already been taken.";
}

// Turns database errors into something the browser can display, and passes
// anything genuinely unexpected to the express error handler.
function handleWriteError(err, res, next) {
  if (err instanceof db.Sequelize.UniqueConstraintError) {
    return res.status(409).json({ message: uniqueFieldMessage(err) });
  }
  if (err instanceof db.Sequelize.ValidationError) {
    return res.status(400).json({
      message: err.errors.length ? err.errors[0].message : "Those details are not valid.",
      errors: err.errors.map(function(item) {
        return { field: item.path, message: item.message };
      })
    });
  }
  return next(err);
}

module.exports = function(app) {

  // --- Authentication -------------------------------------------------------

  // A custom callback (rather than bare passport.authenticate) so a failed
  // login answers with JSON the login page can show, instead of a bare 401.
  app.post("/api/login", loginLimiter, function(req, res, next) {
    passport.authenticate("local", function(err, user, info) {
      if (err) {
        return next(err);
      }
      if (!user) {
        return res.status(401).json({ message: (info && info.message) || "Incorrect email or password." });
      }
      return req.logIn(user, function(loginErr) {
        if (loginErr) {
          return next(loginErr);
        }
        return res.json(user.toSafeJSON());
      });
    })(req, res, next);
  });

  // Creates the account and logs the new member straight in. The old version
  // replayed the request to /api/login with a 307 redirect; logging in here
  // directly means one round trip and no reliance on redirect behaviour.
  app.post("/api/signup", signupLimiter, function(req, res, next) {
    db.User.create({
      email: req.body.email,
      password: req.body.password
    })
      .then(function(dbUser) {
        req.logIn(dbUser, function(loginErr) {
          if (loginErr) {
            return next(loginErr);
          }
          return res.status(201).json(dbUser.toSafeJSON());
        });
      })
      .catch(function(err) {
        handleWriteError(err, res, next);
      });
  });

  // passport 0.6 made logout asynchronous: without the callback the session is
  // not actually cleared before the response goes out.
  function logout(req, res, next, onDone) {
    req.logout(function(err) {
      if (err) {
        return next(err);
      }
      return req.session.destroy(function() {
        res.clearCookie("connect.sid");
        onDone();
      });
    });
  }

  // GET so the plain links in the navbar work.
  app.get("/logout", function(req, res, next) {
    logout(req, res, next, function() {
      res.redirect("/");
    });
  });

  app.post("/api/logout", function(req, res, next) {
    logout(req, res, next, function() {
      res.json({ message: "Logged out." });
    });
  });

  // Who am I? Returns an empty object for anonymous visitors.
  app.get("/api/user_data", function(req, res) {
    res.json(req.user ? req.user.toSafeJSON() : {});
  });

  // --- Profiles -------------------------------------------------------------

  // Every member profile, newest first.
  //
  // Behind apiAuth: a profile carries the member's email address, and the whole
  // point of /members being guarded is that the directory is for members. While
  // this was open, `curl /api/profiles` handed every address to anyone who
  // asked, guard or no guard.
  app.get("/api/profiles", apiAuth, function(req, res, next) {
    db.Profile.findAll({
      include: [{ model: db.User, attributes: ["email"] }],
      order: [["createdAt", "DESC"]]
    })
      .then(function(profiles) {
        res.json(profiles.map(serializeProfile));
      })
      .catch(next);
  });

  // The logged-in member's own profile, used to prefill the profile form.
  // Declared before /:id so "me" is never parsed as an id.
  app.get("/api/profiles/me", apiAuth, function(req, res, next) {
    db.Profile.findOne({
      where: { userId: req.user.id },
      include: [{ model: db.User, attributes: ["email"] }]
    })
      .then(function(profile) {
        // Not an error: a member who has not filled in the form yet has none.
        res.json(profile ? serializeProfile(profile) : null);
      })
      .catch(next);
  });

  app.get("/api/profiles/:id", apiAuth, function(req, res, next) {
    var id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      return res.status(400).json({ message: "That is not a valid profile id." });
    }

    return db.Profile.findOne({
      where: { id: id },
      include: [{ model: db.User, attributes: ["email"] }]
    })
      .then(function(profile) {
        // The old version sent back `null` with a 200, so the page had no way
        // to tell "not found" from a successful empty response.
        if (!profile) {
          return res.status(404).json({ message: "No member found with that id." });
        }
        return res.json(serializeProfile(profile));
      })
      .catch(next);
  });

  // Creates or updates the profile belonging to the logged-in member. The owner
  // always comes from the session, so no member can write another's profile.
  function saveOwnProfile(req, res, next) {
    var values = pickEditableFields(req.body);

    function findOwn() {
      return db.Profile.findOne({ where: { userId: req.user.id } });
    }

    // A plain find-then-insert leaves a window: two submits racing each other
    // both saw "no profile yet", both inserted, and the loser surfaced as a 409
    // about an email address the member never typed. Rather than widen the
    // window's cover with a transaction — findOrCreate opens one, and
    // concurrent transactions are exactly what SQLite will not do — let the
    // unique index on userId be the arbiter and treat losing the race as a
    // signal to go round once more, where the find now succeeds.
    findOwn()
      .then(function(profile) {
        if (profile) {
          return profile.update(values);
        }
        return db.Profile.create(Object.assign({ userId: req.user.id }, values))
          .catch(function(err) {
            if (!(err instanceof db.Sequelize.UniqueConstraintError)) {
              throw err;
            }
            return findOwn().then(function(existing) {
              // No row despite a uniqueness complaint means something else
              // collided; let the normal error handling describe it.
              if (!existing) {
                throw err;
              }
              return existing.update(values);
            });
          });
      })
      .then(function(profile) {
        return profile.reload({ include: [{ model: db.User, attributes: ["email"] }] });
      })
      .then(function(profile) {
        res.json(serializeProfile(profile));
      })
      .catch(function(err) {
        handleWriteError(err, res, next);
      });
  }

  app.post("/api/profiles", apiAuth, saveOwnProfile);
  app.put("/api/profiles/me", apiAuth, saveOwnProfile);

  // --- Map ------------------------------------------------------------------

  // Looks up coordinates for a postal code server-side. Doing it here keeps the
  // geocoder's contact details (and any future API key) out of the browser, and
  // lets one cache serve every visitor.
  // Behind apiAuth because it is the one route that spends an outbound request
  // on every miss: left open, anonymous callers could fill the cache and hold
  // the lookup queue against the members actually viewing a profile.
  app.get("/api/geocode", apiAuth, function(req, res, next) {
    var query = String(req.query.zip || "").trim();
    if (!query) {
      return res.status(400).json({ message: "A postal code is required." });
    }

    return geocode(query, req.query.city)
      .then(function(location) {
        if (!location) {
          return res.status(404).json({ message: "Could not find that postal code on the map." });
        }
        return res.json(location);
      })
      .catch(function(err) {
        // The queue is full: say so plainly rather than making the caller wait
        // out a backlog that is already longer than any map is worth.
        if (err && err.code === "GEOCODER_BUSY") {
          return res.status(503).json({ message: "The map service is busy. Please try again shortly." });
        }
        return next(err);
      });
  });
};
