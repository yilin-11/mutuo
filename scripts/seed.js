// Demo data, so a fresh checkout has something to look at.
//
// An empty directory makes both the search and the random match look broken,
// which is a poor first impression for something meant to be browsed. These ten
// members form five reciprocal pairs — each one can teach what their partner
// wants to learn — so the directory reads as a swap network rather than a list.
//
//   npm run seed            add the demo members, leaving anything else alone
//   npm run seed -- --fresh drop every table first, then add them
//
// Every skill below comes from the list in public/js/common.js, so the profile
// form's dropdowns can represent them.
var db = require("../models");

var DEMO_PASSWORD = "swap-skills-demo";

var MEMBERS = [
  {
    email: "ada@example.com",
    firstName: "Ada", lastName: "Okonkwo",
    city: "Boston", zipCode: "02115",
    teachSkill: "Python", learnSkill: "Guitar",
    bio: "Data engineer by day. I can get you from zero to writing your own scripts, and I have wanted to play guitar since I was fifteen."
  },
  {
    email: "marco@example.com",
    firstName: "Marco", lastName: "Ferreira",
    city: "Lisbon", zipCode: "1100-148",
    teachSkill: "Guitar", learnSkill: "Python",
    bio: "Fifteen years of playing, six of teaching. Patient with beginners. Trying to automate the boring parts of running a music school."
  },
  {
    email: "yuki@example.com",
    firstName: "Yuki", lastName: "Tanaka",
    city: "Seattle", zipCode: "98101",
    teachSkill: "JavaScript", learnSkill: "Photoshop",
    bio: "Front-end developer. Happy to pair on anything from your first function to why your promise chain is not doing what you expect."
  },
  {
    email: "priya@example.com",
    firstName: "Priya", lastName: "Raman",
    city: "Austin", zipCode: "78701",
    teachSkill: "Photoshop", learnSkill: "JavaScript",
    bio: "Graphic designer, mostly print and packaging. I want to build my own portfolio site instead of paying someone else to."
  },
  {
    email: "sofia@example.com",
    firstName: "Sofia", lastName: "Almeida",
    city: "Berlin", zipCode: "10115",
    teachSkill: "SQL", learnSkill: "Cooking",
    bio: "Analyst. I promise queries are less frightening than they look. I would like to stop eating the same four dinners."
  },
  {
    email: "daniel@example.com",
    firstName: "Daniel", lastName: "Osei",
    city: "Toronto", zipCode: "M5V 2T6",
    teachSkill: "Cooking", learnSkill: "SQL",
    bio: "Line cook turned caterer. West African home cooking, and knife skills that will save you an hour a week."
  },
  {
    email: "lena@example.com",
    firstName: "Lena", lastName: "Vogt",
    city: "Amsterdam", zipCode: "1012 AB",
    teachSkill: "Tableau", learnSkill: "Writing",
    bio: "I build dashboards people actually open. My weak spot is explaining them in prose, which is why I am here."
  },
  {
    email: "ravi@example.com",
    firstName: "Ravi", lastName: "Menon",
    city: "London", zipCode: "NW1 6XE",
    teachSkill: "Writing", learnSkill: "Tableau",
    bio: "Ex-journalist, now technical writer. I can teach you to cut a paragraph in half without losing anything worth keeping."
  },
  {
    email: "clara@example.com",
    firstName: "Clara", lastName: "Nystrom",
    city: "Melbourne", zipCode: "3000",
    teachSkill: "Project Management", learnSkill: "Piano",
    bio: "I run delivery for a small agency. Estimation, scope, and how to say no politely. Learning piano is my one non-work goal this year."
  },
  {
    email: "tomas@example.com",
    firstName: "Tomas", lastName: "Herrera",
    city: "New York", zipCode: "10001",
    teachSkill: "Piano", learnSkill: "Project Management",
    bio: "Classically trained, but I will teach you whatever you actually want to play. Terrible at keeping my own students' schedules straight."
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

// One member: the account first, then the profile that belongs to it. Skips
// anyone already present, so re-running is safe without --fresh.
function seedMember(member) {
  return db.User.findOne({ where: { email: member.email } })
    .then(function(existing) {
      if (existing) {
        return null;
      }
      return db.User.create({ email: member.email, password: DEMO_PASSWORD })
        .then(function(user) {
          return db.Profile.create({
            userId: user.id,
            firstName: member.firstName,
            lastName: member.lastName,
            city: member.city,
            zipCode: member.zipCode,
            teachSkill: member.teachSkill,
            learnSkill: member.learnSkill,
            bio: member.bio
          });
        })
        .then(function() {
          return member.email;
        });
    });
}

/**
 * Adds the demo members, skipping any that are already there.
 *
 * @param {object} [options]
 * @param {boolean} [options.fresh] Drop and recreate every table first.
 * @returns {Promise<string[]>} The addresses actually added.
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
    .then(function() {
      if (fresh) {
        console.log("Dropped and recreated every table.");
      }
      // In sequence rather than in parallel: SQLite serialises writes anyway,
      // and one at a time keeps the "already there" check meaningful.
      return MEMBERS.reduce(function(chain, member) {
        return chain.then(function(added) {
          return seedMember(member).then(function(email) {
            return email ? added.concat(email) : added;
          });
        });
      }, Promise.resolve([]));
    });
}

function report(added) {
  if (!added.length) {
    console.log("Every demo member was already there. Nothing to do.");
  } else {
    console.log("Added " + added.length + " demo member(s).");
  }
  console.log("");
  console.log("Log in as any of them:");
  console.log("  email:    " + MEMBERS[0].email + "  (or any address above)");
  console.log("  password: " + DEMO_PASSWORD);
}

module.exports = { seed: seed, report: report, DEMO_PASSWORD: DEMO_PASSWORD };

// Only when run directly, so scripts/vercel-build.js can require this file for
// seed() without it running — and closing the connection — on import.
if (require.main === module) {
  seed({ fresh: process.argv.indexOf("--fresh") > -1 })
    .then(function(added) {
      report(added);
      return db.sequelize.close();
    })
    .catch(function(err) {
      console.error("Seeding failed:");
      console.error(err.message || err);
      process.exit(1);
    });
}
