// Demo data, so a fresh checkout has something to look at.
//
// An empty directory makes both the search and the random match look broken,
// which is a poor first impression for something meant to be browsed. These
// twelve members form six reciprocal pairs — each one can teach what their
// partner wants to learn — so the directory reads as a swap network rather than
// a list.
//
// The count is quoted back to a reader in three places: the login page's demo
// offer, scripts/vercel-build.js, and the README. Change it here and change it
// there.
//
//   npm run seed            add the demo members, leaving anything else alone
//   npm run seed -- --fresh drop every table first, then add them
//
// Every skill below comes from the list in public/js/common.js, so the profile
// form's dropdowns can represent them.
//
// The coordinates are written out rather than looked up. A real profile is
// geocoded when it is saved (see config/locate.js), but doing that here would
// put twelve serialised lookups against a third-party service — better than a
// minute of them, and overrunning that service's queue limit besides — into a
// build step. These are demo members in twelve cities that have not moved, so
// the postal code's centre is a constant, and seeding stays offline.
var db = require("../models");
var demo = require("../config/demo");
var addMissingColumns = require("../config/schema");

// Shared with the login page, which offers one of these accounts to a visitor
// on a demo deployment. See config/demo.js.
var DEMO_PASSWORD = demo.PASSWORD;

var MEMBERS = [
  {
    email: "ada@example.com",
    firstName: "Ada", lastName: "Okonkwo",
    city: "Boston", zipCode: "02115",
    latitude: 42.343, longitude: -71.09,
    teachSkill: "Python", learnSkill: "Guitar",
    bio: "Data engineer by day. I can get you from zero to writing your own scripts, and I have wanted to play guitar since I was fifteen."
  },
  {
    email: "marco@example.com",
    firstName: "Marco", lastName: "Ferreira",
    city: "Lisbon", zipCode: "1100-148",
    latitude: 38.715, longitude: -9.133,
    teachSkill: "Guitar", learnSkill: "Python",
    bio: "Fifteen years of playing, six of teaching. Patient with beginners. Trying to automate the boring parts of running a music school."
  },
  {
    email: "yuki@example.com",
    firstName: "Yuki", lastName: "Tanaka",
    city: "Seattle", zipCode: "98101",
    latitude: 47.61, longitude: -122.335,
    teachSkill: "JavaScript", learnSkill: "Photoshop",
    bio: "Front-end developer. Happy to pair on anything from your first function to why your promise chain is not doing what you expect."
  },
  {
    email: "priya@example.com",
    firstName: "Priya", lastName: "Raman",
    city: "Austin", zipCode: "78701",
    latitude: 30.27, longitude: -97.742,
    teachSkill: "Photoshop", learnSkill: "JavaScript",
    bio: "Graphic designer, mostly print and packaging. I want to build my own portfolio site instead of paying someone else to."
  },
  {
    email: "sofia@example.com",
    firstName: "Sofia", lastName: "Almeida",
    city: "Berlin", zipCode: "10115",
    latitude: 52.532, longitude: 13.388,
    teachSkill: "SQL", learnSkill: "Cooking",
    bio: "Analyst. I promise queries are less frightening than they look. I would like to stop eating the same four dinners."
  },
  {
    email: "daniel@example.com",
    firstName: "Daniel", lastName: "Osei",
    city: "Toronto", zipCode: "M5V 2T6",
    latitude: 43.643, longitude: -79.387,
    teachSkill: "Cooking", learnSkill: "SQL",
    bio: "Line cook turned caterer. West African home cooking, and knife skills that will save you an hour a week."
  },
  {
    email: "lena@example.com",
    firstName: "Lena", lastName: "Vogt",
    city: "Amsterdam", zipCode: "1012 AB",
    latitude: 52.373, longitude: 4.893,
    teachSkill: "Tableau", learnSkill: "Writing",
    bio: "I build dashboards people actually open. My weak spot is explaining them in prose, which is why I am here."
  },
  {
    email: "ravi@example.com",
    firstName: "Ravi", lastName: "Menon",
    city: "London", zipCode: "NW1 6XE",
    latitude: 51.524, longitude: -0.155,
    teachSkill: "Writing", learnSkill: "Tableau",
    bio: "Ex-journalist, now technical writer. I can teach you to cut a paragraph in half without losing anything worth keeping."
  },
  {
    email: "clara@example.com",
    firstName: "Clara", lastName: "Nystrom",
    city: "Melbourne", zipCode: "3000",
    latitude: -37.814, longitude: 144.963,
    teachSkill: "Project Management", learnSkill: "Piano",
    bio: "I run delivery for a small agency. Estimation, scope, and how to say no politely. Learning piano is my one non-work goal this year."
  },
  {
    email: "tomas@example.com",
    firstName: "Tomas", lastName: "Herrera",
    city: "New York", zipCode: "10001",
    latitude: 40.75, longitude: -73.997,
    teachSkill: "Piano", learnSkill: "Project Management",
    bio: "Classically trained, but I will teach you whatever you actually want to play. Terrible at keeping my own students' schedules straight."
  },
  {
    email: "amara@example.com",
    firstName: "Amara", lastName: "Njoroge",
    city: "Nairobi", zipCode: "00100",
    latitude: -1.286, longitude: 36.817,
    teachSkill: "Mathematics", learnSkill: "Skateboarding",
    bio: "Secondary school maths teacher. I am very good at finding the exact place someone got lost, which is usually four topics before the one they asked about."
  },
  {
    email: "hana@example.com",
    firstName: "Hana", lastName: "Sato",
    city: "Osaka", zipCode: "530-0001",
    latitude: 34.702, longitude: 135.495,
    teachSkill: "Skateboarding", learnSkill: "Mathematics",
    bio: "Fifteen years on a board and still learning. I can get you rolling and stopping on purpose in an afternoon. Going back to the maths I gave up on at school."
  }
];

// Seeding writes fabricated accounts with a published password. That belongs
// nowhere near a real deployment, so production refuses by default.
//
// The public demo is the one deployment that does want them — its whole point is
// that a visitor can log in without signing up — so it opts in explicitly with
// MUTUO_DEMO_SEED=true. Naming the variable rather than dropping the check keeps
// the default safe: a real deployment has to say the words to get demo accounts.
function assertSeedable(fresh) {
  if (process.env.NODE_ENV !== "production") {
    return;
  }
  if (process.env.MUTUO_DEMO_SEED !== "true") {
    throw new Error(
      "Refusing to seed with NODE_ENV=production. If this really is a throwaway " +
      "demo and you want accounts with a published password in it, set " +
      "MUTUO_DEMO_SEED=true."
    );
  }
  if (fresh) {
    // --fresh drops every table. No opt-in makes that safe to run against
    // something reached by a production connection string.
    throw new Error("Refusing --fresh with NODE_ENV=production. Seeding is additive.");
  }
}

// A demo member seeded before Profile carried coordinates has none of its own:
// config/schema.js adds the columns to an existing table but cannot know what
// belongs in them, and the seed skips anyone already present.
//
// Left alone, a demo that has been deployed before would come back with twelve
// members and not one of them placed — no distances, nothing for the nearby
// ordering to sort on, and the account the login page hands out greeted by
// "we could not place your postal code". That is the one deployment whose whole
// job is to show the feature working.
//
// Only fills a blank. A member who has since been placed — or moved — is left
// exactly as they are.
function placeExisting(user, member) {
  return db.Profile.findOne({ where: { userId: user.id } })
    .then(function(profile) {
      // Both spellings of "no value": a row read back from the database gives
      // null, but an instance whose column was never set reads undefined, and
      // a check for only one of them silently skips the other.
      var placed = profile && profile.latitude !== null && profile.latitude !== undefined;
      if (!profile || placed) {
        return false;
      }
      return profile
        .update({ latitude: member.latitude, longitude: member.longitude })
        .then(function() {
          return true;
        });
    });
}

// One member: the account first, then the profile that belongs to it. Anyone
// already present is left alone apart from the coordinate backfill above, so
// re-running is safe without --fresh.
function seedMember(member) {
  return db.User.findOne({ where: { email: member.email } })
    .then(function(existing) {
      if (existing) {
        return placeExisting(existing, member).then(function(placed) {
          return { added: null, placed: placed };
        });
      }
      return db.User.create({ email: member.email, password: DEMO_PASSWORD })
        .then(function(user) {
          return db.Profile.create({
            userId: user.id,
            firstName: member.firstName,
            lastName: member.lastName,
            city: member.city,
            zipCode: member.zipCode,
            latitude: member.latitude,
            longitude: member.longitude,
            teachSkill: member.teachSkill,
            learnSkill: member.learnSkill,
            bio: member.bio
          });
        })
        .then(function() {
          return { added: member.email, placed: false };
        });
    });
}

/**
 * Adds the demo members, skipping any that are already there — apart from
 * filling in coordinates for any that predate the columns holding them.
 *
 * @param {object} [options]
 * @param {boolean} [options.fresh] Drop and recreate every table first.
 * @returns {Promise<{added: string[], placed: number}>} The addresses actually
 *   added, and how many existing members were given coordinates.
 */
function seed(options) {
  var fresh = Boolean(options && options.fresh);

  // Inside the chain, not before it: thrown synchronously this would escape the
  // caller's .catch() entirely and surface as an uncaught exception with a stack
  // trace, instead of the one-line explanation it is written to be.
  return Promise.resolve()
    .then(function() {
      assertSeedable(fresh);
      return db.sequelize.sync(fresh ? { force: true } : {});
    })
    // The same additive step the app does on the way up (config/ready.js), for
    // the same reason and because this runs against the same database without
    // going through it. Without this the seed reads its own models against a
    // table that predates half their columns and dies on "no such column" — and
    // since scripts/vercel-build.js treats a failed seed as a failed build, a
    // deployment that added a column would refuse to ship at all.
    .then(function() {
      return addMissingColumns();
    })
    .then(function() {
      if (fresh) {
        console.log("Dropped and recreated every table.");
      }
      // In sequence rather than in parallel: SQLite serialises writes anyway,
      // and one at a time keeps the "already there" check meaningful.
      return MEMBERS.reduce(function(chain, member) {
        return chain.then(function(result) {
          return seedMember(member).then(function(outcome) {
            return {
              added: outcome.added ? result.added.concat(outcome.added) : result.added,
              placed: result.placed + (outcome.placed ? 1 : 0)
            };
          });
        });
      }, Promise.resolve({ added: [], placed: 0 }));
    });
}

function report(result) {
  if (!result.added.length) {
    console.log("Every demo member was already there.");
  } else {
    console.log("Added " + result.added.length + " demo member(s).");
  }
  if (result.placed) {
    console.log("Filled in coordinates for " + result.placed + " member(s) that had none.");
  }
  console.log("");
  console.log("Log in as any of them:");
  console.log("  email:    " + demo.EMAIL + "  (or any address above)");
  console.log("  password: " + DEMO_PASSWORD);
}

module.exports = {
  seed: seed,
  report: report,
  DEMO_PASSWORD: DEMO_PASSWORD,
  // Exported for the test that checks the account config/demo.js offers is one
  // this file actually creates.
  MEMBERS: MEMBERS
};

// Only when run directly, so scripts/vercel-build.js can require this file for
// seed() without it running — and closing the connection — on import.
if (require.main === module) {
  seed({ fresh: process.argv.indexOf("--fresh") > -1 })
    .then(function(result) {
      report(result);
      return db.sequelize.close();
    })
    .catch(function(err) {
      console.error("Seeding failed:");
      console.error(err.message || err);
      process.exit(1);
    });
}
