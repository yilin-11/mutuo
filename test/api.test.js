// End-to-end checks against the real express app and a throwaway in-memory
// SQLite database (see config/config.js, "test" environment).
var assert = require("assert");
var request = require("supertest");

var app = require("../app");
var db = require("../models");
var demo = require("../config/demo");
var seeder = require("../scripts/seed");

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

describe("Mutuo", function() {
  before(function() {
    return db.sequelize.sync({ force: true });
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

  describe("page guards", function() {
    // The pages used to live in public/, which express.static served directly,
    // so the member area was reachable without ever reaching isAuthenticated.
    it("does not serve member pages straight out of the static directory", function() {
      return request(app)
        .get("/pages/members.html")
        .expect(404);
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
