// The account a visitor is invited to log in with, on a deployment whose whole
// purpose is to be looked at.
//
// Mutuo shows nothing to an anonymous visitor — the member directory is behind
// a session, which is correct for a service where the members are real people
// and wrong for a demo somebody was sent a link to. Rather than open the
// directory up, the login page offers a seeded account and fills the form in.
//
// Gated on MUTUO_DEMO_SEED, the same variable that decides whether the demo
// members are put in the database at all (see scripts/vercel-build.js). A
// deployment with real members is not a demo, and printing a working password
// on its login page would be an invitation to try that password against the
// real addresses next to it.
var PASSWORD = "swap-skills-demo";

// One of the seeded members — scripts/seed.js gives all of them this password,
// and a test holds the two files to the same address.
var EMAIL = "ada@example.com";

module.exports = {
  EMAIL: EMAIL,
  PASSWORD: PASSWORD,

  // Null on any deployment that is not a demo, which is what the login page
  // keys off. See routes/api-routes.js for how it gets there.
  account: function() {
    if (process.env.MUTUO_DEMO_SEED !== "true") {
      return null;
    }
    return { email: EMAIL, password: PASSWORD };
  }
};
