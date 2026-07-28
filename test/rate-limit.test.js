// The rate limiter in isolation. The API's own limits are set high enough that
// the end-to-end suite never trips them, so the behaviour is pinned down here
// against a throwaway app with a budget of two.
var assert = require("assert");
var express = require("express");
var request = require("supertest");

var rateLimit = require("../config/middleware/rateLimit");

function appWith(limiter, handler) {
  var app = express();
  app.get("/thing", limiter, handler || function(req, res) {
    res.json({ ok: true });
  });
  return app;
}

describe("rateLimit", function() {
  it("allows requests up to the limit and refuses the next one", function() {
    var limiter = rateLimit({ max: 2, windowMs: 60000, message: "Slow down." });
    var app = appWith(limiter);

    return request(app).get("/thing").expect(200)
      .then(function() {
        return request(app).get("/thing").expect(200);
      })
      .then(function() {
        return request(app).get("/thing").expect(429);
      })
      .then(function(res) {
        assert.strictEqual(res.body.message, "Slow down.");
        assert.ok(res.headers["retry-after"], "should say how long to wait");
      });
  });

  it("starts a fresh window once the old one has expired", function() {
    // A window of 1ms is over by the time the second request arrives.
    var limiter = rateLimit({ max: 1, windowMs: 1, message: "Slow down." });
    var app = appWith(limiter);

    return request(app).get("/thing").expect(200)
      .then(function() {
        return new Promise(function(resolve) {
          setTimeout(resolve, 5);
        });
      })
      .then(function() {
        return request(app).get("/thing").expect(200);
      });
  });

  it("only counts responses countIf accepts", function() {
    var limiter = rateLimit({
      max: 1,
      windowMs: 60000,
      message: "Slow down.",
      countIf: function(res) {
        return res.statusCode === 401;
      }
    });
    var app = appWith(limiter, function(req, res) {
      res.status(req.query.fail ? 401 : 200).json({});
    });

    // Successes are free: three of them do not use up a budget of one.
    return request(app).get("/thing").expect(200)
      .then(function() {
        return request(app).get("/thing").expect(200);
      })
      .then(function() {
        return request(app).get("/thing").expect(200);
      })
      .then(function() {
        return request(app).get("/thing?fail=1").expect(401);
      })
      .then(function() {
        return request(app).get("/thing").expect(429);
      });
  });

  // Sharing one module-level store would have let a failed login spend the
  // signup budget, since both limiters key on the same address.
  it("keeps each limiter's budget separate", function() {
    var first = rateLimit({ max: 1, windowMs: 60000, message: "First." });
    var second = rateLimit({ max: 1, windowMs: 60000, message: "Second." });

    return request(appWith(first)).get("/thing").expect(200)
      .then(function() {
        return request(appWith(second)).get("/thing").expect(200);
      })
      .then(function() {
        return request(appWith(first)).get("/thing").expect(429);
      })
      .then(function(res) {
        assert.strictEqual(res.body.message, "First.");
      });
  });
});
