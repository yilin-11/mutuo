// End-to-end checks against the real express app and a throwaway in-memory
// SQLite database (see config/config.js, "test" environment).
var assert = require("assert");
var request = require("supertest");

var app = require("../app");
var db = require("../models");
var demo = require("../config/demo");
var seeder = require("../scripts/seed");
var limiters = require("../routes/api-routes").limiters;

var VALID_PROFILE = {
  firstName: "Ada",
  lastName: "Lovelace",
  city: "London",
  zipCode: "NW1 6XE",
  teachSkill: "Mathematics",
  learnSkill: "Piano",
  bio: "Happy to walk anyone through algorithms over coffee."
};

// Signs up a fresh member and returns an agent that keeps their session cookie.
function signUp(email, password) {
  var agent = request.agent(app);
  return agent
    .post("/api/signup")
    .send({ email: email, password: password || "correct horse" })
    .expect(201)
    .then(function() {
      return agent;
    });
}

// Signs up a member and gives them a profile. Resolves to { agent, profile }.
function withProfile(email, overrides) {
  return signUp(email).then(function(agent) {
    return agent
      .post("/api/profiles")
      .send(Object.assign({}, VALID_PROFILE, overrides))
      .expect(200)
      .then(function(res) {
        return { agent: agent, profile: res.body };
      });
  });
}

// Coordinates are resolved by a third-party geocoder when a profile is saved,
// and config/locate.js declines to call it under NODE_ENV=test — the suite must
// not depend on a service being reachable, or spend a second per save in its
// queue. So anything that cares about distance writes the coordinates itself.
function place(profileId, latitude, longitude) {
  return db.Profile.update(
    { latitude: latitude, longitude: longitude },
    { where: { id: profileId } }
  );
}

// Where in a list of serialised profiles a given id ended up.
function positionOf(profiles, id) {
  return profiles.findIndex(function(profile) {
    return profile.id === id;
  });
}

describe("Mutuo", function() {
  before(function() {
    return db.sequelize.sync({ force: true });
  });

  // Every request here comes from the same address, and signup allows fifty an
  // hour. Past that the suite starts reporting 429s from tests that only wanted
  // an account to work with. Clearing the budget keeps each test about its own
  // subject; the limiters themselves are exercised in rate-limit.test.js.
  beforeEach(function() {
    limiters.login.reset();
    limiters.signup.reset();
  });

  after(function() {
    return db.sequelize.close();
  });

  describe("pages", function() {
    it("serves the landing page to anonymous visitors", function() {
      return request(app)
        .get("/")
        .expect(200)
        .expect("Content-Type", /html/);
    });

    it("sends anonymous visitors from /members to the login page", function() {
      return request(app)
        .get("/members")
        .expect(302)
        .expect("Location", "/login");
    });

    it("sends logged-in members from / to /members", function() {
      return signUp("redirect@example.com").then(function(agent) {
        // Previously this route called redirect() and sendFile() on the same
        // response, which threw ERR_HTTP_HEADERS_SENT.
        return agent.get("/").expect(302).expect("Location", "/members");
      });
    });

    it("answers unknown API paths with JSON, not an HTML error page", function() {
      return request(app)
        .get("/api/nope")
        .expect(404)
        .expect("Content-Type", /json/);
    });
  });

  describe("signup and login", function() {
    it("creates an account, logs the member in, and never returns the password", function() {
      var agent = request.agent(app);
      return agent
        .post("/api/signup")
        .send({ email: "New.Member@Example.com", password: "correct horse" })
        .expect(201)
        .then(function(res) {
          assert.strictEqual(res.body.email, "new.member@example.com", "email should be normalised");
          assert.ok(res.body.id, "should return the new id");
          assert.strictEqual(res.body.password, undefined, "must not leak the password hash");
          // The signup response should already carry a session.
          return agent.get("/api/user_data").expect(200);
        })
        .then(function(res) {
          assert.strictEqual(res.body.email, "new.member@example.com");
        });
    });

    it("rejects a password that is too short", function() {
      return request(app)
        .post("/api/signup")
        .send({ email: "short@example.com", password: "abc" })
        .expect(400)
        .then(function(res) {
          assert.match(res.body.message, /8 characters/);
        });
    });

    it("rejects an invalid email", function() {
      return request(app)
        .post("/api/signup")
        .send({ email: "not-an-email", password: "correct horse" })
        .expect(400);
    });

    it("rejects a duplicate email regardless of casing", function() {
      return request(app)
        .post("/api/signup")
        .send({ email: "NEW.MEMBER@example.com", password: "correct horse" })
        .expect(409);
    });

    it("logs in with the right password", function() {
      return request(app)
        .post("/api/login")
        .send({ email: "new.member@example.com", password: "correct horse" })
        .expect(200)
        .then(function(res) {
          assert.strictEqual(res.body.email, "new.member@example.com");
        });
    });

    it("rejects a wrong password with a JSON message", function() {
      return request(app)
        .post("/api/login")
        .send({ email: "new.member@example.com", password: "wrong password" })
        .expect(401)
        .expect("Content-Type", /json/)
        .then(function(res) {
          assert.ok(res.body.message, "should explain the failure");
        });
    });

    it("gives the same answer for an unknown email as for a wrong password", function() {
      return request(app)
        .post("/api/login")
        .send({ email: "nobody@example.com", password: "correct horse" })
        .expect(401)
        .then(function(res) {
          assert.match(res.body.message, /Incorrect email or password/);
        });
    });

    it("returns an empty object from /api/user_data when not logged in", function() {
      return request(app)
        .get("/api/user_data")
        .expect(200)
        .then(function(res) {
          assert.deepStrictEqual(res.body, {});
        });
    });

    it("ends the session on logout", function() {
      return signUp("logout@example.com")
        .then(function(agent) {
          return agent.post("/api/logout").expect(200).then(function() {
            return agent.get("/api/user_data").expect(200);
          });
        })
        .then(function(res) {
          assert.deepStrictEqual(res.body, {});
        });
    });
  });

  describe("profiles", function() {
    it("refuses to save a profile for an anonymous visitor", function() {
      return request(app)
        .post("/api/profiles")
        .send(VALID_PROFILE)
        .expect(401);
    });

    it("returns null for a member who has not filled in the form yet", function() {
      return signUp("empty@example.com")
        .then(function(agent) {
          return agent.get("/api/profiles/me").expect(200);
        })
        .then(function(res) {
          assert.strictEqual(res.body, null);
        });
    });

    it("saves a profile owned by the logged-in member", function() {
      var agent;
      return signUp("ada@example.com")
        .then(function(created) {
          agent = created;
          return agent.post("/api/profiles").send(VALID_PROFILE).expect(200);
        })
        .then(function(res) {
          assert.strictEqual(res.body.firstName, "Ada");
          // The email comes from the account, not from the submitted form.
          assert.strictEqual(res.body.email, "ada@example.com");
          return agent.get("/api/profiles/me").expect(200);
        })
        .then(function(res) {
          assert.strictEqual(res.body.teachSkill, "Mathematics");
        });
    });

    it("updates the existing profile instead of creating a second one", function() {
      var agent;
      var userId;
      return signUp("once@example.com")
        .then(function(created) {
          agent = created;
          return agent.get("/api/user_data").expect(200);
        })
        .then(function(res) {
          userId = res.body.id;
          return agent.post("/api/profiles").send(VALID_PROFILE).expect(200);
        })
        .then(function() {
          return agent
            .post("/api/profiles")
            .send(Object.assign({}, VALID_PROFILE, { city: "Manchester" }))
            .expect(200);
        })
        .then(function(res) {
          assert.strictEqual(res.body.city, "Manchester");
          return db.Profile.count({ where: { userId: userId } });
        })
        .then(function(count) {
          assert.strictEqual(count, 1, "submitting twice must not create a second profile");
        });
    });

    it("ignores an attempt to set userId through the request body", function() {
      var victimId;
      return signUp("victim@example.com")
        .then(function(agent) {
          return agent.get("/api/user_data");
        })
        .then(function(res) {
          victimId = res.body.id;
          return signUp("attacker@example.com");
        })
        .then(function(agent) {
          return agent
            .post("/api/profiles")
            .send(Object.assign({}, VALID_PROFILE, { userId: victimId, id: 1 }))
            .expect(200);
        })
        .then(function(res) {
          return db.Profile.findByPk(res.body.id);
        })
        .then(function(profile) {
          assert.notStrictEqual(profile.userId, victimId, "must not write another member's profile");
        });
    });

    it("rejects a profile with missing fields", function() {
      return signUp("incomplete@example.com")
        .then(function(agent) {
          return agent.post("/api/profiles").send({ firstName: "Just" }).expect(400);
        })
        .then(function(res) {
          assert.ok(res.body.message, "should say what is wrong");
          assert.ok(Array.isArray(res.body.errors), "should list the invalid fields");
        });
    });

    it("rejects an implausible postal code", function() {
      return signUp("badzip@example.com").then(function(agent) {
        return agent
          .post("/api/profiles")
          .send(Object.assign({}, VALID_PROFILE, { zipCode: "!!" }))
          .expect(400);
      });
    });

    it("lists profiles with the member's email attached", function() {
      return signUp("directory@example.com")
        .then(function(agent) {
          return agent.get("/api/profiles").expect(200);
        })
        .then(function(res) {
          assert.ok(res.body.length > 0);
          res.body.forEach(function(profile) {
            assert.ok(profile.email, "every listed profile should carry an email");
            assert.strictEqual(profile.password, undefined);
          });
        });
    });

    // The directory is for members. While these were open, anyone could read
    // every member's email address with a single unauthenticated request,
    // whatever the guard on the /members page said.
    it("refuses to list profiles for an anonymous visitor", function() {
      return request(app)
        .get("/api/profiles")
        .expect(401)
        .expect("Content-Type", /json/);
    });

    it("refuses to show a single profile to an anonymous visitor", function() {
      return request(app)
        .get("/api/profiles/1")
        .expect(401);
    });

    it("returns 404 for a profile id that does not exist", function() {
      return signUp("missing@example.com").then(function(agent) {
        return agent
          .get("/api/profiles/999999")
          .expect(404)
          .expect("Content-Type", /json/);
      });
    });

    it("returns 400 for a profile id that is not a number", function() {
      return signUp("notanumber@example.com").then(function(agent) {
        return agent.get("/api/profiles/not-a-number").expect(400);
      });
    });

    // Two submits racing each other used to both pass the "do I have a profile
    // yet?" check, so the loser's insert tripped the unique index on userId and
    // came back as a 409 about an email address the member never typed.
    it("survives a double submit without a second profile or a stray 409", function() {
      var agent;
      var userId;
      return signUp("double@example.com")
        .then(function(created) {
          agent = created;
          return agent.get("/api/user_data");
        })
        .then(function(res) {
          userId = res.body.id;
          return Promise.all([
            agent.post("/api/profiles").send(VALID_PROFILE),
            agent.post("/api/profiles").send(VALID_PROFILE)
          ]);
        })
        .then(function(responses) {
          responses.forEach(function(res) {
            assert.strictEqual(res.status, 200, "both submits should save, not collide");
          });
          return db.Profile.count({ where: { userId: userId } });
        })
        .then(function(count) {
          assert.strictEqual(count, 1);
        });
    });
  });

  // /api/profiles is the list behind /members, which reads as "people nearby":
  // everyone but you, closest first.
  describe("people nearby", function() {
    it("leaves the asker out of their own list", function() {
      var own;
      return withProfile("self@example.com")
        .then(function(member) {
          own = member;
          return member.agent.get("/api/profiles").expect(200);
        })
        .then(function(res) {
          assert.strictEqual(
            positionOf(res.body, own.profile.id), -1,
            "your own profile should not appear on a page about other people"
          );
          assert.ok(res.body.length > 0, "everyone else still should");
        });
    });

    it("sorts by distance, and puts members it cannot place last", function() {
      var here;
      var near;
      var far;
      var unplaced;

      // London, so the asker has somewhere to be measured from.
      return withProfile("nearby-me@example.com")
        .then(function(member) {
          here = member;
          return place(member.profile.id, 51.52, -0.15);
        })
        // A few kilometres away.
        .then(function() {
          return withProfile("nearby-near@example.com");
        })
        .then(function(member) {
          near = member.profile;
          return place(near.id, 51.5, -0.12);
        })
        // Another continent.
        .then(function() {
          return withProfile("nearby-far@example.com");
        })
        .then(function(member) {
          far = member.profile;
          return place(far.id, 35.68, 139.69);
        })
        // No coordinates at all.
        .then(function() {
          return withProfile("nearby-unplaced@example.com");
        })
        .then(function(member) {
          unplaced = member.profile;
          return here.agent.get("/api/profiles").expect(200);
        })
        .then(function(res) {
          var nearAt = positionOf(res.body, near.id);
          var farAt = positionOf(res.body, far.id);
          var unplacedAt = positionOf(res.body, unplaced.id);

          assert.ok(nearAt > -1 && farAt > -1 && unplacedAt > -1);
          assert.ok(nearAt < farAt, "the nearer member should come first");
          assert.ok(
            farAt < unplacedAt,
            "a member with no coordinates sorts last, not first — which is what " +
            "a plain numeric compare against null would have done"
          );

          assert.ok(res.body[nearAt].distanceKm < 10);
          assert.ok(res.body[farAt].distanceKm > 9000);
          assert.strictEqual(res.body[unplacedAt].distanceKm, null);
        });
    });

    // The point of the app, and the thing the list never used to say out loud.
    it("says how each member's skills line up with yours", function() {
      var mine;
      var both;
      var teaches;
      var wants;
      var neither;

      return withProfile("swap-me@example.com", {
        teachSkill: "Python", learnSkill: "Guitar"
      })
        .then(function(member) {
          mine = member;
          return withProfile("swap-both@example.com", {
            teachSkill: "Guitar", learnSkill: "Python"
          });
        })
        .then(function(member) {
          both = member.profile;
          return withProfile("swap-teaches@example.com", {
            teachSkill: "Guitar", learnSkill: "Tableau"
          });
        })
        .then(function(member) {
          teaches = member.profile;
          return withProfile("swap-wants@example.com", {
            teachSkill: "Tableau", learnSkill: "Python"
          });
        })
        .then(function(member) {
          wants = member.profile;
          return withProfile("swap-neither@example.com", {
            teachSkill: "Tableau", learnSkill: "Writing"
          });
        })
        .then(function(member) {
          neither = member.profile;
          return mine.agent.get("/api/profiles").expect(200);
        })
        .then(function(res) {
          function swapOf(id) {
            return res.body[positionOf(res.body, id)].swap;
          }
          assert.strictEqual(swapOf(both.id), "both");
          assert.strictEqual(swapOf(teaches.id), "teaches");
          assert.strictEqual(swapOf(wants.id), "wants");
          assert.strictEqual(swapOf(neither.id), null);
        });
    });

    // Complementarity is the harder constraint: a neighbour who teaches nothing
    // you want is not a swap at all, however close they are.
    it("puts a possible swap above a closer member who is no use", function() {
      var mine;
      var farSwap;
      var nearStranger;

      return withProfile("rank-me@example.com", {
        teachSkill: "SQL", learnSkill: "Piano"
      })
        .then(function(member) {
          mine = member;
          return place(member.profile.id, 51.52, -0.15);
        })
        // Teaches exactly what I want, but on the other side of the world.
        .then(function() {
          return withProfile("rank-far-swap@example.com", {
            teachSkill: "Piano", learnSkill: "SQL"
          });
        })
        .then(function(member) {
          farSwap = member.profile;
          return place(farSwap.id, -37.81, 144.96);
        })
        // Around the corner, and no overlap either way.
        .then(function() {
          return withProfile("rank-near-stranger@example.com", {
            teachSkill: "Writing", learnSkill: "Cooking"
          });
        })
        .then(function(member) {
          nearStranger = member.profile;
          return place(nearStranger.id, 51.5, -0.12);
        })
        .then(function() {
          return mine.agent.get("/api/profiles").expect(200);
        })
        .then(function(res) {
          var swapAt = positionOf(res.body, farSwap.id);
          var strangerAt = positionOf(res.body, nearStranger.id);

          assert.ok(
            swapAt < strangerAt,
            "a straight swap 16,000 km away should outrank a stranger 3 km away"
          );
          assert.ok(res.body[swapAt].distanceKm > res.body[strangerAt].distanceKm,
            "and it really is the further of the two");
        });
    });

    it("reports no swap at all to a member with no profile of their own", function() {
      return signUp("swap-none@example.com")
        .then(function(agent) {
          return agent.get("/api/profiles").expect(200);
        })
        .then(function(res) {
          res.body.forEach(function(profile) {
            assert.strictEqual(
              profile.swap, null,
              "there is nothing to compare against until you have your own skills"
            );
          });
        });
    });

    it("reports no distance to a member who has not been placed themselves", function() {
      return withProfile("nearby-nowhere@example.com")
        .then(function(member) {
          return member.agent.get("/api/profiles").expect(200);
        })
        .then(function(res) {
          res.body.forEach(function(profile) {
            assert.strictEqual(
              profile.distanceKm, null,
              "an asker with no coordinates cannot be a known distance from anyone"
            );
          });
        });
    });
  });

  describe("matches", function() {
    it("refuses to list matches for an anonymous visitor", function() {
      return request(app).get("/api/matches").expect(401);
    });

    it("refuses to add a match for an anonymous visitor", function() {
      return request(app).post("/api/matches/1").expect(401);
    });

    it("adds a match, lists it, and removes it again", function() {
      var mine;
      var theirs;

      return withProfile("match-a@example.com")
        .then(function(member) {
          mine = member;
          return withProfile("match-b@example.com", { firstName: "Bea" });
        })
        .then(function(member) {
          theirs = member.profile;
          return mine.agent.post("/api/matches/" + theirs.id).expect(201);
        })
        .then(function(res) {
          assert.strictEqual(res.body.matched, true);
          return mine.agent.get("/api/matches").expect(200);
        })
        .then(function(res) {
          assert.strictEqual(res.body.length, 1);
          assert.strictEqual(res.body[0].id, theirs.id);
          assert.strictEqual(res.body[0].matched, true);
          assert.strictEqual(res.body[0].mutual, false, "they have not matched back");
          return mine.agent.delete("/api/matches/" + theirs.id).expect(200);
        })
        .then(function(res) {
          assert.strictEqual(res.body.matched, false);
          return mine.agent.get("/api/matches").expect(200);
        })
        .then(function(res) {
          assert.deepStrictEqual(res.body, []);
        });
    });

    // The button is a toggle, so a second press of an already-matched one is
    // the state the member can already see. Answering 409 would be reporting a
    // collision about something they did not do twice on purpose.
    it("treats matching the same member twice as a success, not a collision", function() {
      var mine;
      var theirs;

      return withProfile("match-twice@example.com")
        .then(function(member) {
          mine = member;
          return withProfile("match-twice-target@example.com");
        })
        .then(function(member) {
          theirs = member.profile;
          return mine.agent.post("/api/matches/" + theirs.id).expect(201);
        })
        .then(function() {
          return mine.agent.post("/api/matches/" + theirs.id).expect(200);
        })
        .then(function() {
          return db.Match.count({ where: { profileId: theirs.id } });
        })
        .then(function(count) {
          assert.strictEqual(count, 1, "two presses must not make two matches");
        });
    });

    it("survives a double-tapped button without a stray 409", function() {
      var mine;
      var theirs;

      return withProfile("match-race@example.com")
        .then(function(member) {
          mine = member;
          return withProfile("match-race-target@example.com");
        })
        .then(function(member) {
          theirs = member.profile;
          return Promise.all([
            mine.agent.post("/api/matches/" + theirs.id),
            mine.agent.post("/api/matches/" + theirs.id)
          ]);
        })
        .then(function(responses) {
          responses.forEach(function(res) {
            assert.ok(res.status < 300, "both presses should succeed, not collide");
          });
          return db.Match.count({ where: { profileId: theirs.id } });
        })
        .then(function(count) {
          assert.strictEqual(count, 1);
        });
    });

    it("unmatching someone you never matched is not an error", function() {
      var theirs;
      return withProfile("match-none-target@example.com")
        .then(function(member) {
          theirs = member.profile;
          return withProfile("match-none@example.com");
        })
        .then(function(member) {
          return member.agent.delete("/api/matches/" + theirs.id).expect(200);
        })
        .then(function(res) {
          assert.strictEqual(res.body.matched, false);
        });
    });

    it("refuses a match with yourself", function() {
      return withProfile("match-self@example.com").then(function(member) {
        return member.agent
          .post("/api/matches/" + member.profile.id)
          .expect(400)
          .then(function(res) {
            assert.match(res.body.message, /yourself/);
          });
      });
    });

    it("answers 404 for a profile that does not exist and 400 for a bad id", function() {
      return signUp("match-bad@example.com").then(function(agent) {
        return agent.post("/api/matches/999999").expect(404).then(function() {
          return agent.post("/api/matches/not-a-number").expect(400);
        });
      });
    });

    // Matching is one-directional; two rows pointing at each other is what
    // makes a pair, and reporting that is the whole reason the simpler model
    // is enough.
    it("reports a mutual match to both sides", function() {
      var first;
      var second;

      return withProfile("mutual-a@example.com")
        .then(function(member) {
          first = member;
          return withProfile("mutual-b@example.com");
        })
        .then(function(member) {
          second = member;
          return first.agent.post("/api/matches/" + second.profile.id).expect(201);
        })
        .then(function() {
          return first.agent.get("/api/matches").expect(200);
        })
        .then(function(res) {
          assert.strictEqual(res.body[0].mutual, false, "not mutual until they answer");
          return second.agent.post("/api/matches/" + first.profile.id).expect(201);
        })
        .then(function() {
          return first.agent.get("/api/matches").expect(200);
        })
        .then(function(res) {
          assert.strictEqual(res.body[0].mutual, true);
          return second.agent.get("/api/matches").expect(200);
        })
        .then(function(res) {
          assert.strictEqual(res.body[0].mutual, true);
        });
    });

    it("marks the members you have matched in the nearby list and on their page", function() {
      var mine;
      var theirs;

      return withProfile("marked@example.com")
        .then(function(member) {
          mine = member;
          return withProfile("marked-target@example.com");
        })
        .then(function(member) {
          theirs = member.profile;
          return mine.agent.post("/api/matches/" + theirs.id).expect(201);
        })
        .then(function() {
          return mine.agent.get("/api/profiles").expect(200);
        })
        .then(function(res) {
          var listed = res.body[positionOf(res.body, theirs.id)];
          assert.strictEqual(listed.matched, true);
          res.body.forEach(function(profile) {
            if (profile.id !== theirs.id) {
              assert.strictEqual(profile.matched, false);
            }
          });
          return mine.agent.get("/api/profiles/" + theirs.id).expect(200);
        })
        .then(function(res) {
          assert.strictEqual(res.body.matched, true);
          assert.strictEqual(res.body.isOwn, false);
        });
    });

    it("puts mutual matches above the ones who have not answered", function() {
      var mine;
      var quiet;
      var answered;

      return withProfile("order-me@example.com")
        .then(function(member) {
          mine = member;
          return withProfile("order-quiet@example.com");
        })
        .then(function(member) {
          quiet = member;
          return withProfile("order-answered@example.com");
        })
        .then(function(member) {
          answered = member;
          // Matched in this order, so newest-first alone would put the mutual
          // one second and the assertion below would fail.
          return mine.agent.post("/api/matches/" + quiet.profile.id).expect(201);
        })
        .then(function() {
          return mine.agent.post("/api/matches/" + answered.profile.id).expect(201);
        })
        .then(function() {
          return answered.agent.post("/api/matches/" + mine.profile.id).expect(201);
        })
        .then(function() {
          return mine.agent.get("/api/matches").expect(200);
        })
        .then(function(res) {
          assert.strictEqual(res.body.length, 2);
          assert.strictEqual(res.body[0].id, answered.profile.id, "the mutual one first");
          assert.strictEqual(res.body[0].mutual, true);
          assert.strictEqual(res.body[1].mutual, false);
        });
    });

    // Without a count somewhere visible, matching was a dead end: the other
    // member was never told, and the mutual pill was only ever found by someone
    // who happened to reopen a page they had no reason to reopen.
    describe("the count in the nav", function() {
      it("is zero for a member with no profile and no matches", function() {
        return signUp("count-empty@example.com")
          .then(function(agent) {
            return agent.get("/api/matches/count").expect(200);
          })
          .then(function(res) {
            assert.deepStrictEqual(res.body, { mutual: 0, unseen: 0 });
          });
      });

      it("counts only matches that were answered, and only until they are seen", function() {
        var mine;
        var quiet;
        var answered;

        return withProfile("count-me@example.com")
          .then(function(member) {
            mine = member;
            return withProfile("count-quiet@example.com");
          })
          .then(function(member) {
            quiet = member;
            return withProfile("count-answered@example.com");
          })
          .then(function(member) {
            answered = member;
            return mine.agent.post("/api/matches/" + quiet.profile.id).expect(201);
          })
          .then(function() {
            return mine.agent.get("/api/matches/count").expect(200);
          })
          .then(function(res) {
            assert.deepStrictEqual(
              res.body, { mutual: 0, unseen: 0 },
              "matching someone is not news — them matching back is"
            );
            return mine.agent.post("/api/matches/" + answered.profile.id).expect(201);
          })
          .then(function() {
            return answered.agent.post("/api/matches/" + mine.profile.id).expect(201);
          })
          .then(function() {
            return mine.agent.get("/api/matches/count").expect(200);
          })
          .then(function(res) {
            assert.deepStrictEqual(res.body, { mutual: 1, unseen: 1 });
            return mine.agent.post("/api/matches/seen").expect(200);
          })
          .then(function() {
            return mine.agent.get("/api/matches/count").expect(200);
          })
          .then(function(res) {
            assert.deepStrictEqual(
              res.body, { mutual: 1, unseen: 0 },
              "still a match, no longer new"
            );
          });
      });

      it("refuses both routes to an anonymous visitor", function() {
        return request(app).get("/api/matches/count").expect(401).then(function() {
          return request(app).post("/api/matches/seen").expect(401);
        });
      });

      // POST /api/matches/:profileId is declared after this route, so a
      // mis-ordered router would read "seen" as a profile id and answer 400.
      it("does not mistake /matches/seen for a profile id", function() {
        return signUp("seen-route@example.com").then(function(agent) {
          return agent.post("/api/matches/seen").expect(200).then(function(res) {
            assert.strictEqual(res.body.seen, true);
          });
        });
      });

      // Marking them seen writes to the User row, and User has a beforeUpdate
      // hook that hashes the password. It only fires when the password actually
      // changed — but if that guard ever went, opening your own matches page
      // would hash your already-hashed password and lock you out of your
      // account, and nothing else here would have noticed.
      it("does not disturb the password on the way past the hashing hook", function() {
        return signUp("seen-password@example.com", "correct horse battery")
          .then(function(agent) {
            return agent.post("/api/matches/seen").expect(200);
          })
          .then(function() {
            return request(app)
              .post("/api/login")
              .send({ email: "seen-password@example.com", password: "correct horse battery" })
              .expect(200);
          });
      });
    });

    it("tells a member when they are looking at their own profile", function() {
      return withProfile("own-page@example.com").then(function(member) {
        return member.agent
          .get("/api/profiles/" + member.profile.id)
          .expect(200)
          .then(function(res) {
            assert.strictEqual(res.body.isOwn, true);
          });
      });
    });
  });

  describe("page guards", function() {
    // The pages used to live in public/, which express.static served directly,
    // so the member area was reachable without ever reaching isAuthenticated.
    it("does not serve member pages straight out of the static directory", function() {
      return request(app)
        .get("/pages/members.html")
        .expect(404);
    });

    // The random match used to be a page. It is a button on /members now, and
    // anyone holding the old link should still land somewhere.
    it("sends the retired /game page to the members page", function() {
      return request(app)
        .get("/game")
        .expect(302)
        .expect("Location", "/members");
    });

    it("still serves the front-end assets", function() {
      return request(app)
        .get("/js/common.js")
        .expect(200);
    });

    // Relative asset paths resolved against /detail/:id/ pointed at
    // /detail/js/common.js, so a trailing slash rendered a blank page.
    it("references assets by absolute path so nested routes still load them", function() {
      return signUp("assets@example.com")
        .then(function(agent) {
          return agent.get("/detail/1/").expect(200);
        })
        .then(function(res) {
          assert.ok(
            res.text.indexOf("src=\"/js/common.js\"") > -1,
            "pages must not link assets relatively"
          );
          assert.strictEqual(
            res.text.indexOf("../js/"), -1,
            "no relative asset paths should remain"
          );
        });
    });
  });

  describe("responses", function() {
    it("tells browsers not to store API answers", function() {
      return request(app)
        .get("/api/user_data")
        .expect(200)
        .expect("Cache-Control", "no-store");
    });

    it("does not advertise the framework", function() {
      return request(app)
        .get("/api/user_data")
        .then(function(res) {
          assert.strictEqual(res.headers["x-powered-by"], undefined);
        });
    });
  });

  describe("the demo account", function() {
    // MUTUO_DEMO_SEED is not set while the suite runs, which is the case this
    // has to be sure about: every other deployment must not publish a password.
    it("is not offered unless the deployment is a demo", function() {
      return request(app)
        .get("/api/demo")
        .expect(200)
        .then(function(res) {
          assert.strictEqual(res.body.account, null);
        });
    });

    it("is offered when MUTUO_DEMO_SEED is set", function() {
      process.env.MUTUO_DEMO_SEED = "true";
      return request(app)
        .get("/api/demo")
        .expect(200)
        .then(function(res) {
          assert.strictEqual(res.body.account.email, demo.EMAIL);
          assert.strictEqual(res.body.account.password, demo.PASSWORD);
        })
        .then(function() {
          delete process.env.MUTUO_DEMO_SEED;
        }, function(err) {
          delete process.env.MUTUO_DEMO_SEED;
          throw err;
        });
    });

    // The login page hands a visitor these credentials, so an address the seed
    // does not create would send them to a form that rejects them.
    it("names a member the seed actually creates", function() {
      var seeded = seeder.MEMBERS.some(function(member) {
        return member.email === demo.EMAIL;
      });
      assert.ok(seeded, demo.EMAIL + " is not one of the seeded members.");
      assert.strictEqual(seeder.DEMO_PASSWORD, demo.PASSWORD);
    });
  });

  describe("geocoding", function() {
    it("requires a postal code", function() {
      return signUp("geo@example.com").then(function(agent) {
        return agent.get("/api/geocode").expect(400);
      });
    });

    // Every miss costs an outbound request and a slot in a queue that is
    // serialised at roughly one lookup per second, so this stays behind a login.
    it("refuses an anonymous lookup", function() {
      return request(app)
        .get("/api/geocode?zip=NW1")
        .expect(401);
    });
  });
});
