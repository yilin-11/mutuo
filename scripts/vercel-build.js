// Vercel runs this as the build step (see the "vercel-build" script in
// package.json).
//
// There is nothing to compile — the point is to get demo data into the database
// before the deployment goes live. A directory with nothing in it makes both the
// search and the random match look broken, which is a poor first impression for
// something whose whole purpose is to be browsed.
//
// Doing it here rather than on the first request means it happens exactly once
// per deploy, in a process that is allowed to take its time, instead of on a
// cold instance while somebody is waiting for a page.

// Both of these are deliberately skips rather than failures: the deployment is
// still perfectly serviceable without demo data, and a build that refuses to
// finish would leave the previous one live for a reason nobody asked about.
if (!process.env.DATABASE_URL) {
  // Required before requiring anything that touches models/ — config/config.js
  // throws on a serverless deployment with no DATABASE_URL, and that error is
  // about the app being unable to run at all, not about seeding.
  console.warn("No DATABASE_URL set — skipping the demo seed.");
  console.warn("Mutuo cannot run on Vercel without one. See README.md.");
  process.exit(0);
}

if (process.env.MUTUO_DEMO_SEED !== "true") {
  console.log("MUTUO_DEMO_SEED is not \"true\" — skipping the demo seed.");
  console.log("Set it to \"true\" to put the twelve demo members in the directory.");
  process.exit(0);
}

var db = require("../models");
var seeder = require("./seed");

// Additive, and every member is skipped if already present, so this is safe to
// run on every deploy. --fresh is refused in production by seed.js.
seeder.seed()
  .then(function(added) {
    seeder.report(added);
    return db.sequelize.close();
  })
  .catch(function(err) {
    // Past this point something is genuinely wrong — an unreachable database, a
    // schema that will not sync — and that is worth failing the build over. A
    // non-zero exit keeps the previous deployment serving rather than replacing
    // it with one that cannot answer a request.
    console.error("Seeding failed, so the build is stopping here:");
    console.error(err.message || err);
    process.exit(1);
  });
