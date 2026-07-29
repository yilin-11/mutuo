var db = require("../models");
var passport = require("../config/passport");
var apiAuth = require("../config/middleware/apiAuth");
var rateLimit = require("../config/middleware/rateLimit");
var geocode = require("../config/geocode");
var locate = require("../config/locate");
var distanceKm = require("../config/distance");
var demo = require("../config/demo");

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
//
// `extras` carries whatever only makes sense relative to whoever is asking —
// how far away this member is, whether the asker has matched them. Those are
// properties of the pair, not of the profile, so they are passed in rather than
// read off the row.
function serializeProfile(profile, extras) {
  var json = {
    id: profile.id,
    firstName: profile.firstName,
    lastName: profile.lastName,
    city: profile.city,
    zipCode: profile.zipCode,
    teachSkill: profile.teachSkill,
    learnSkill: profile.learnSkill,
    bio: profile.bio,
    email: profile.User ? profile.User.email : null,
    // Only as precise as a postal code, and the detail page draws a two
    // kilometre circle from it — the same approximation the map already made
    // with a lookup of its own. Sending it saves that lookup.
    latitude: profile.latitude === null || profile.latitude === undefined ? null : Number(profile.latitude),
    longitude: profile.longitude === null || profile.longitude === undefined ? null : Number(profile.longitude)
  };

  if (extras) {
    Object.keys(extras).forEach(function(key) {
      json[key] = extras[key];
    });
  }
  return json;
}

// A profile as a point, or null when it has never been placed.
function coordinates(profile) {
  if (!profile || profile.latitude === null || profile.latitude === undefined) {
    return null;
  }
  if (profile.longitude === null || profile.longitude === undefined) {
    return null;
  }
  return { lat: Number(profile.latitude), lng: Number(profile.longitude) };
}

// How this member's pair of skills lines up with the asker's.
//
// This is the thing the app is actually for, and until now it was the one thing
// it never said out loud: the directory was sorted by distance and left the
// reader to compare two pills on every card to work out whether a swap was even
// possible. The seed data is built as six reciprocal pairs precisely to show
// this off, and nothing showed it.
//
//   "both"    — a straight trade: they teach what you want, you teach what they want
//   "teaches" — they teach what you want to learn
//   "wants"   — they want to learn what you teach
//   null      — no overlap either way, or the asker has no profile to compare
function swapKind(own, profile) {
  if (!own) {
    return null;
  }
  var teaches = Boolean(own.learnSkill) && profile.teachSkill === own.learnSkill;
  var wants = Boolean(own.teachSkill) && profile.learnSkill === own.teachSkill;

  if (teaches && wants) {
    return "both";
  }
  if (teaches) {
    return "teaches";
  }
  if (wants) {
    return "wants";
  }
  return null;
}

var SWAP_RANK = { both: 0, teaches: 1, wants: 2 };

function swapRank(kind) {
  return Object.prototype.hasOwnProperty.call(SWAP_RANK, kind) ? SWAP_RANK[kind] : 3;
}

// Best swap first, then nearest within each kind.
//
// Complementarity outranks distance because it is the harder constraint: a
// neighbour who teaches nothing you want is not a swap, and someone who teaches
// exactly what you want is worth a longer trip. Distance still decides
// everything within a group, and the radius control on the page is there for
// anyone who disagrees about how long a trip is reasonable.
//
// A member we cannot place goes last rather than first, which is what a plain
// numeric compare against null would do. Ties keep the order they arrived in —
// Array#sort is stable — so unplaced members stay newest first.
function bySwapThenDistance(a, b) {
  var rank = swapRank(a.swap) - swapRank(b.swap);
  if (rank !== 0) {
    return rank;
  }
  if (a.distanceKm === b.distanceKm) {
    return 0;
  }
  if (a.distanceKm === null) {
    return 1;
  }
  if (b.distanceKm === null) {
    return -1;
  }
  return a.distanceKm - b.distanceKm;
}

// The profile ids the given member has matched with.
function matchedProfileIds(userId) {
  return db.Match.findAll({
    where: { userId: userId },
    attributes: ["profileId"],
    order: [["createdAt", "DESC"]]
  }).then(function(matches) {
    return matches.map(function(match) {
      return match.profileId;
    });
  });
}

// Which of the given profiles' owners have matched `profile` back. Answers a
// lookup table keyed by profile id, so a caller can mark the mutual ones
// without a query each. An asker who has no profile of their own cannot have
// been matched by anyone, so that case never reaches the database.
function mutualProfileIds(profile, profiles) {
  if (!profile || !profiles.length) {
    return Promise.resolve({});
  }

  var ownerIds = profiles.map(function(item) {
    return item.userId;
  });

  return db.Match.findAll({
    where: { profileId: profile.id, userId: ownerIds },
    attributes: ["userId"]
  }).then(function(matches) {
    var byOwner = {};
    matches.forEach(function(match) {
      byOwner[match.userId] = true;
    });

    var lookup = {};
    profiles.forEach(function(item) {
      lookup[item.id] = Boolean(byOwner[item.userId]);
    });
    return lookup;
  });
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

  // --- Demo ------------------------------------------------------------------

  // What the login page asks before deciding whether to offer a way in without
  // signing up. Answers null on any deployment that is not a demo, so the hint
  // is absent rather than merely hidden — see config/demo.js.
  //
  // Open deliberately: it is the one thing a visitor needs before they have a
  // session, and the credentials it hands out are the same ones the seed prints
  // to the build log.
  app.get("/api/demo", function(req, res) {
    res.json({ account: demo.account() });
  });

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

  // Everyone else, nearest first — the list behind /members, which reads as
  // "people nearby" rather than as a directory in insertion order.
  //
  // Sorting happens here rather than in SQL because the distance is a haversine
  // against the asker's own coordinates, and expressing that as an ORDER BY
  // means writing it once per dialect. The set is every member of a
  // skill-swapping app; if it ever stops fitting in memory, a bounding box in
  // the WHERE clause is the thing to add before the trigonometry moves.
  //
  // Behind apiAuth: a profile carries the member's email address, and the whole
  // point of /members being guarded is that the directory is for members. While
  // this was open, `curl /api/profiles` handed every address to anyone who
  // asked, guard or no guard.
  app.get("/api/profiles", apiAuth, function(req, res, next) {
    Promise.all([
      db.Profile.findOne({ where: { userId: req.user.id } }),
      db.Profile.findAll({
        // Everyone but the asker. Being told how far away you are from yourself
        // is noise on a page about who is nearby, and the random match on the
        // same page used to be able to deal you your own card.
        where: { userId: { [db.Sequelize.Op.ne]: req.user.id } },
        include: [{ model: db.User, attributes: ["email"] }],
        order: [["createdAt", "DESC"]]
      }),
      matchedProfileIds(req.user.id)
    ])
      .then(function(results) {
        var own = results[0];
        var here = coordinates(own);
        var profiles = results[1];
        var matched = results[2];

        var ranked = profiles.map(function(profile) {
          return {
            profile: profile,
            distanceKm: distanceKm(here, coordinates(profile)),
            swap: swapKind(own, profile)
          };
        });
        ranked.sort(bySwapThenDistance);

        // One more query for the whole list, so a card looks the same here as it
        // does on the matches page. Cheaper than letting the two pages disagree
        // about whether someone has matched you back.
        return mutualProfileIds(own, profiles).then(function(mutual) {
          res.json(ranked.map(function(entry) {
            return serializeProfile(entry.profile, {
              distanceKm: entry.distanceKm,
              swap: entry.swap,
              matched: matched.indexOf(entry.profile.id) > -1,
              mutual: Boolean(mutual[entry.profile.id])
            });
          }));
        });
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

        // The same pair-relative extras the nearby list carries, so the detail
        // page can show the match button in the state the card had.
        return Promise.all([
          db.Profile.findOne({ where: { userId: req.user.id } }),
          db.Match.count({ where: { userId: req.user.id, profileId: profile.id } })
        ])
          .then(function(results) {
            var own = results[0];
            return mutualProfileIds(own, [profile]).then(function(mutual) {
              return res.json(serializeProfile(profile, {
                distanceKm: distanceKm(coordinates(own), coordinates(profile)),
                swap: swapKind(own, profile),
                matched: results[1] > 0,
                mutual: Boolean(mutual[profile.id]),
                // So the page can hide the controls that make no sense on it.
                isOwn: profile.userId === req.user.id
              }));
            });
          });
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

    // Resolve the postal code before writing, so the row lands with the
    // coordinates the nearby list sorts on. This is the one place the geocoder
    // is spoken to per member rather than per page — see config/locate.js — and
    // it never rejects, so a geocoder having a bad day costs a member their
    // place in the ordering and nothing else.
    //
    // Only when the postal code is new or changed, for two reasons: an unchanged
    // one has already been resolved, and a lookup that fails would otherwise
    // wipe good coordinates off a profile whose location never moved. Saving a
    // typo in your bio should not cost you your place in the ordering.
    function withCoordinates(existing) {
      if (!values.zipCode) {
        return Promise.resolve(null);
      }
      if (existing && existing.zipCode === values.zipCode && existing.latitude !== null) {
        return Promise.resolve(null);
      }
      return locate(values.zipCode, values.city).then(function(location) {
        values.latitude = location.latitude;
        values.longitude = location.longitude;
        return null;
      });
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
        return withCoordinates(profile).then(function() {
          return profile;
        });
      })
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

  // --- Matches ---------------------------------------------------------------

  // The members you have matched with, most recently matched first. Each one
  // carries `mutual`, which is true when they have matched you back — the whole
  // reason a one-directional model is enough to build a page on.
  app.get("/api/matches", apiAuth, function(req, res, next) {
    Promise.all([
      db.Profile.findOne({ where: { userId: req.user.id } }),
      db.Match.findAll({
        where: { userId: req.user.id },
        include: [{
          model: db.Profile,
          include: [{ model: db.User, attributes: ["email"] }]
        }],
        order: [["createdAt", "DESC"]]
      })
    ])
      .then(function(results) {
        var own = results[0];
        // A match whose profile has since gone leaves a row pointing at
        // nothing. Drop it here rather than serialising a null.
        var profiles = results[1]
          .map(function(match) {
            return match.Profile;
          })
          .filter(Boolean);

        return mutualProfileIds(own, profiles).then(function(mutual) {
          var here = coordinates(own);
          var serialised = profiles.map(function(profile) {
            return serializeProfile(profile, {
              distanceKm: distanceKm(here, coordinates(profile)),
              swap: swapKind(own, profile),
              matched: true,
              mutual: Boolean(mutual[profile.id])
            });
          });

          // Mutual first. Those are the ones where something can actually
          // happen; the rest is a list of people who have not answered. Stable,
          // so within each half the most recently matched still comes first.
          serialised.sort(function(a, b) {
            return (b.mutual ? 1 : 0) - (a.mutual ? 1 : 0);
          });

          res.json(serialised);
        });
      })
      .catch(next);
  });

  // What the nav badge is drawn from: how many mutual matches this member has,
  // and how many of those arrived since they last looked at the page.
  //
  // Its own endpoint rather than a field on /api/user_data because every member
  // page asks for it and none of them want the rest of that answer.
  app.get("/api/matches/count", apiAuth, function(req, res, next) {
    db.Profile.findOne({ where: { userId: req.user.id } })
      .then(function(own) {
        // Nobody can have matched a profile that does not exist.
        if (!own) {
          return res.json({ mutual: 0, unseen: 0 });
        }

        return db.Match.findAll({
          where: { userId: req.user.id },
          include: [{ model: db.Profile, attributes: ["id", "userId"] }]
        })
          .then(function(outbound) {
            var ownerIds = outbound
              .filter(function(match) {
                return match.Profile;
              })
              .map(function(match) {
                return match.Profile.userId;
              });

            if (!ownerIds.length) {
              return res.json({ mutual: 0, unseen: 0 });
            }

            // The rows pointing back at me. A pair of facing rows is a mutual
            // match, and the inbound one is the half that has a date worth
            // comparing — it is when they answered.
            return db.Match.findAll({
              where: { profileId: own.id, userId: ownerIds },
              attributes: ["createdAt"]
            }).then(function(inbound) {
              var seenAt = req.user.matchesSeenAt;
              var unseen = inbound.filter(function(match) {
                return !seenAt || match.createdAt > seenAt;
              });
              return res.json({ mutual: inbound.length, unseen: unseen.length });
            });
          });
      })
      .catch(next);
  });

  // Called by the matches page once it has drawn, which is the moment the
  // member can be said to have seen them.
  //
  // A POST rather than a side effect of GET /api/matches: a browser or a proxy
  // is entitled to prefetch a GET, and clearing someone's unread count because
  // their browser looked ahead is exactly the kind of thing that makes a badge
  // untrustworthy.
  //
  // Declared before POST /api/matches/:profileId, which would otherwise match
  // this path first and read "seen" as an id. Express takes the first route that
  // matches, so the order of these two is load-bearing.
  app.post("/api/matches/seen", apiAuth, function(req, res, next) {
    req.user.update({ matchesSeenAt: new Date() })
      .then(function() {
        res.json({ seen: true });
      })
      .catch(next);
  });

  // Reads the profile id out of the URL, or answers the caller and returns null.
  function matchTarget(req, res) {
    var id = Number(req.params.profileId);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ message: "That is not a valid profile id." });
      return null;
    }
    return id;
  }

  app.post("/api/matches/:profileId", apiAuth, function(req, res, next) {
    var profileId = matchTarget(req, res);
    if (profileId === null) {
      return undefined;
    }

    return db.Profile.findByPk(profileId)
      .then(function(profile) {
        if (!profile) {
          return res.status(404).json({ message: "No member found with that id." });
        }
        if (profile.userId === req.user.id) {
          return res.status(400).json({ message: "You cannot match with yourself." });
        }

        // Look first, because the button is a toggle and a second press of an
        // already-matched one is the state the member can already see they are
        // in — a 200, not a 409 about a collision they did not cause.
        //
        // Look-then-insert rather than findOrCreate, and for the same reason
        // saveOwnProfile above avoids it: findOrCreate opens a transaction, and
        // concurrent transactions are what SQLite refuses outright. The unique
        // index is the arbiter instead, and losing to it is a success.
        return db.Match.findOne({
          where: { userId: req.user.id, profileId: profileId }
        })
          .then(function(existing) {
            if (existing) {
              return res.json({ matched: true });
            }
            return db.Match.create({ userId: req.user.id, profileId: profileId })
              .then(function() {
                return res.status(201).json({ matched: true });
              })
              .catch(function(err) {
                // A double-tapped button: both presses looked, neither found,
                // and one insert lost the race. The member wanted a match and
                // has one.
                if (err instanceof db.Sequelize.UniqueConstraintError) {
                  return res.json({ matched: true });
                }
                throw err;
              });
          });
      })
      .catch(next);
  });

  // Idempotent: unmatching someone you were not matched with is not an error,
  // it is the state you asked for.
  app.delete("/api/matches/:profileId", apiAuth, function(req, res, next) {
    var profileId = matchTarget(req, res);
    if (profileId === null) {
      return undefined;
    }

    return db.Match.destroy({ where: { userId: req.user.id, profileId: profileId } })
      .then(function() {
        res.json({ matched: false });
      })
      .catch(next);
  });

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

// Exposed so the test suite can empty them between tests. Every request in the
// suite arrives from the same address, so a run long enough to sign up fifty
// members starts failing on the budget rather than on whatever it was trying to
// check. The limiters' own behaviour is the subject of test/rate-limit.test.js;
// here they are only scenery.
module.exports.limiters = {
  login: loginLimiter,
  signup: signupLimiter
};
