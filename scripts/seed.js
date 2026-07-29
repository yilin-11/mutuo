// Demo data, so a fresh checkout has something to look at.
//
// An empty directory makes both the search and the random match look broken,
// which is a poor first impression for something meant to be browsed. These
// fifty members form twenty-five reciprocal pairs — each one can teach what
// their partner wants to learn — so the directory reads as a swap network
// rather than a list.
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
// **Several members share a city on purpose.** With one member per city the
// nearest anyone ever got to anyone was about three hundred kilometres, which
// made the distance ordering a formality and the "within 50 km" control on the
// members page permanently empty — a filter that can only ever return nothing
// is worse than no filter. Boston, London, New York, Berlin, Amsterdam,
// Seattle, Toronto and Melbourne each hold a few members now, and the account
// the login page hands out (see config/demo.js) is in the densest of them, so a
// visitor's first screen has both kinds of result on it: a straight swap far
// away, and people they could actually walk to.
//
// The coordinates are written out rather than looked up. A real profile is
// geocoded when it is saved (see config/locate.js), but doing that here would
// put fifty serialised lookups against a third-party service — the better part
// of a minute, and many times over its queue limit besides — into a build step.
// These are demo members in cities that have not moved, so the postal code's
// centre is a constant, and seeding stays offline.
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
  },

  // --- Boston -----------------------------------------------------------------
  // The demo account is Ada, above, so this is the cluster a visitor lands in.
  // Rosa teaches guitar, which is what Ada wants — a partial swap four
  // kilometres away, sitting under a straight swap in Lisbon. That contrast is
  // the ordering explaining itself on the first screen.
  {
    email: "grace@example.com",
    firstName: "Grace", lastName: "Mbeki",
    city: "Boston", zipCode: "02116",
    latitude: 42.3496, longitude: -71.0746,
    teachSkill: "Node.js", learnSkill: "Presentation",
    bio: "Backend engineer. I can show you how a server actually answers a request, which is less magic than it looks. I go to pieces in front of more than four people."
  },
  {
    email: "idris@example.com",
    firstName: "Idris", lastName: "Bello",
    city: "Brookline", zipCode: "02446",
    latitude: 42.3421, longitude: -71.1211,
    teachSkill: "Presentation", learnSkill: "Node.js",
    bio: "I coach people out of reading their slides aloud. Twenty minutes of practice fixes more than an hour of redesign. I would like to build the tool I keep describing to developers."
  },
  {
    email: "rosa@example.com",
    firstName: "Rosa", lastName: "Delgado",
    city: "Cambridge", zipCode: "02138",
    latitude: 42.378, longitude: -71.117,
    teachSkill: "Guitar", learnSkill: "Piano",
    bio: "Flamenco first, then everything else. I will have you playing something recognisable by the end of week two. The piano has been sitting in my flat judging me for a year."
  },
  {
    email: "ethan@example.com",
    firstName: "Ethan", lastName: "Brooks",
    city: "Boston", zipCode: "02215",
    latitude: 42.347, longitude: -71.103,
    teachSkill: "Piano", learnSkill: "Guitar",
    bio: "Accompanist for a small choir. Scales are not the point and I will not make you do them. I want something I can carry to a park."
  },

  // --- London -----------------------------------------------------------------
  {
    email: "freya@example.com",
    firstName: "Freya", lastName: "Larsen",
    city: "London", zipCode: "SE1 9GF",
    latitude: 51.5045, longitude: -0.0865,
    teachSkill: "Aerobic Dance", learnSkill: "Cooking",
    bio: "I teach a class that people come back to, which is the only measure I trust. My own diet is an embarrassment given the above."
  },
  {
    email: "omar@example.com",
    firstName: "Omar", lastName: "Farouk",
    city: "London", zipCode: "E2 7DG",
    latitude: 51.529, longitude: -0.062,
    teachSkill: "Cooking", learnSkill: "Aerobic Dance",
    bio: "Egyptian home cooking and a lot of opinions about bread. I sit down for eleven hours a day and it is starting to show."
  },
  {
    email: "beatrice@example.com",
    firstName: "Beatrice", lastName: "Adeyemi",
    city: "London", zipCode: "N1 6AH",
    latitude: 51.5362, longitude: -0.103,
    teachSkill: "Excel", learnSkill: "Python",
    bio: "Finance, so spreadsheets that other people have to trust. Pivot tables in an afternoon. My models have outgrown the tool and I know it."
  },
  {
    email: "callum@example.com",
    firstName: "Callum", lastName: "Reid",
    city: "London", zipCode: "W11 2ED",
    latitude: 51.514, longitude: -0.201,
    teachSkill: "Python", learnSkill: "Excel",
    bio: "Ten years writing it, four teaching it. We start with something you actually want automated. I am the developer who cannot read the finance team's workbook."
  },

  // --- New York ---------------------------------------------------------------
  {
    email: "nadia@example.com",
    firstName: "Nadia", lastName: "Haddad",
    city: "Brooklyn", zipCode: "11201",
    latitude: 40.694, longitude: -73.99,
    teachSkill: "English", learnSkill: "Excel",
    bio: "I taught English in three countries before this one. Conversation practice with someone who will not wince. I have been faking my way around a spreadsheet for years."
  },
  {
    email: "peter@example.com",
    firstName: "Peter", lastName: "Lindqvist",
    city: "New York", zipCode: "10014",
    latitude: 40.734, longitude: -74.006,
    teachSkill: "Excel", learnSkill: "English",
    bio: "Operations. If you are copying numbers between two sheets by hand, I can give you that hour back every week. My written English is fine and my spoken English deserts me on calls."
  },

  // --- Berlin -----------------------------------------------------------------
  {
    email: "anja@example.com",
    firstName: "Anja", lastName: "Kowalski",
    city: "Berlin", zipCode: "10437",
    latitude: 52.548, longitude: 13.413,
    teachSkill: "Writing", learnSkill: "English",
    bio: "I edit for a living, mostly other people's first drafts. The problem is almost never the sentences. I write English far better than I speak it and would like to close the gap."
  },
  {
    email: "mateo@example.com",
    firstName: "Mateo", lastName: "Rossi",
    city: "Berlin", zipCode: "10999",
    latitude: 52.498, longitude: 13.423,
    teachSkill: "English", learnSkill: "Writing",
    bio: "Bilingual since school and now teaching it. Happy to just talk for an hour. Everything I put on paper comes out three times longer than it needs to be."
  },

  // --- Amsterdam --------------------------------------------------------------
  {
    email: "sanne@example.com",
    firstName: "Sanne", lastName: "de Vries",
    city: "Amsterdam", zipCode: "1017 CJ",
    latitude: 52.363, longitude: 4.885,
    teachSkill: "Photoshop", learnSkill: "Presentation",
    bio: "Retouching and layout, eight years of it. Masks and layers first, filters never. I do good work and then explain it terribly to the client."
  },
  {
    email: "joost@example.com",
    firstName: "Joost", lastName: "Bakker",
    city: "Amsterdam", zipCode: "1052 GA",
    latitude: 52.384, longitude: 4.871,
    teachSkill: "Presentation", learnSkill: "Photoshop",
    bio: "I train sales teams to stop talking and start showing. Structure beats slides. I would like to make my own visuals instead of waiting three days for them."
  },

  // --- Seattle ----------------------------------------------------------------
  {
    email: "wei@example.com",
    firstName: "Wei", lastName: "Chen",
    city: "Seattle", zipCode: "98122",
    latitude: 47.613, longitude: -122.299,
    teachSkill: "SQL", learnSkill: "Tableau",
    bio: "Data engineer. Joins are the part everyone gets wrong and they take about two hours to fix for good. My charts look like they were made in 2003."
  },
  {
    email: "harper@example.com",
    firstName: "Harper", lastName: "Quinn",
    city: "Seattle", zipCode: "98103",
    latitude: 47.673, longitude: -122.342,
    teachSkill: "Tableau", learnSkill: "SQL",
    bio: "I make dashboards that answer a question instead of showing everything at once. I keep having to ask someone else to pull the data first."
  },

  // --- Toronto ----------------------------------------------------------------
  {
    email: "jaewon@example.com",
    firstName: "Jae-won", lastName: "Park",
    city: "Toronto", zipCode: "M4K 1N2",
    latitude: 43.677, longitude: -79.353,
    teachSkill: "Cooking", learnSkill: "Guitar",
    bio: "Korean home cooking, the kind with eight small dishes. Start with two and you will still eat well. I have wanted to play since I was twelve and I am now thirty-four."
  },
  {
    email: "nadine@example.com",
    firstName: "Nadine", lastName: "Tremblay",
    city: "Toronto", zipCode: "M6J 1J4",
    latitude: 43.647, longitude: -79.409,
    teachSkill: "Guitar", learnSkill: "Cooking",
    bio: "I play in two bands and teach between them. Four chords is genuinely most songs. I have eaten the same three meals since university."
  },

  // --- Melbourne --------------------------------------------------------------
  {
    email: "oliver@example.com",
    firstName: "Oliver", lastName: "Nguyen",
    city: "Richmond", zipCode: "3121",
    latitude: -37.823, longitude: 144.995,
    teachSkill: "JavaScript", learnSkill: "Node.js",
    bio: "Front-end, mostly. I can explain why your event handler fires twice. Everything behind the API is still a rumour to me."
  },
  {
    email: "ingrid@example.com",
    firstName: "Ingrid", lastName: "Solberg",
    city: "Brunswick", zipCode: "3056",
    latitude: -37.769, longitude: 144.96,
    teachSkill: "Node.js", learnSkill: "JavaScript",
    bio: "I build the services other people's apps talk to. Happy to walk through a real one rather than a tutorial. My browser work is fifteen years out of date."
  },

  // --- and the rest of the world -----------------------------------------------
  {
    email: "kavya@example.com",
    firstName: "Kavya", lastName: "Iyer",
    city: "Bengaluru", zipCode: "560001",
    latitude: 12.975, longitude: 77.605,
    teachSkill: "Mathematics", learnSkill: "Python",
    bio: "Statistics, mostly, and the parts of it people get wrong confidently. I would like to stop doing by hand what a script could do overnight."
  },
  {
    email: "limei@example.com",
    firstName: "Li Mei", lastName: "Tan",
    city: "Singapore", zipCode: "188966",
    latitude: 1.299, longitude: 103.852,
    teachSkill: "Python", learnSkill: "Mathematics",
    bio: "I write it every day and can get you past the point where the error messages stop being frightening. I can call the statistics library and not explain what it did."
  },
  {
    email: "zofia@example.com",
    firstName: "Zofia", lastName: "Nowak",
    city: "Warsaw", zipCode: "00-001",
    latitude: 52.232, longitude: 21.006,
    teachSkill: "Piano", learnSkill: "Aerobic Dance",
    bio: "Conservatory trained, now mostly teaching adults who were told at nine that they had no talent. They were told wrong. I have not moved properly in years."
  },
  {
    email: "mads@example.com",
    firstName: "Mads", lastName: "Jensen",
    city: "Copenhagen", zipCode: "1050",
    latitude: 55.679, longitude: 12.582,
    teachSkill: "Aerobic Dance", learnSkill: "Piano",
    bio: "I run early classes for people who are not morning people. Come once and see. I can read music slowly and play nothing at all."
  },
  {
    email: "aoife@example.com",
    firstName: "Aoife", lastName: "Byrne",
    city: "Dublin", zipCode: "D02 XY45",
    latitude: 53.34, longitude: -6.26,
    teachSkill: "Project Management", learnSkill: "Excel",
    bio: "Delivery lead. Most of the job is deciding what not to do, and that part can be taught. My tracking spreadsheet is held together with hope."
  },
  {
    email: "tomasz@example.com",
    firstName: "Tomasz", lastName: "Wójcik",
    city: "Manchester", zipCode: "M1 1AE",
    latitude: 53.479, longitude: -2.238,
    teachSkill: "Excel", learnSkill: "Project Management",
    bio: "Twelve years of it, including the parts nobody admits to using. I am good at the work and bad at saying when it will be finished."
  },
  {
    email: "nuria@example.com",
    firstName: "Núria", lastName: "Prat",
    city: "Barcelona", zipCode: "08001",
    latitude: 41.38, longitude: 2.171,
    teachSkill: "Skateboarding", learnSkill: "Photoshop",
    bio: "Twelve years skating and four teaching kids and nervous adults. Falling properly is the first lesson. I want to edit my own clips instead of posting them raw."
  },
  {
    email: "diego@example.com",
    firstName: "Diego", lastName: "Morales",
    city: "Mexico City", zipCode: "06700",
    latitude: 19.418, longitude: -99.167,
    teachSkill: "Photoshop", learnSkill: "Skateboarding",
    bio: "Photo retouching for magazines. I can teach you to fix a bad photograph without it looking fixed. I have owned a board for a month and used it twice."
  },
  {
    email: "camila@example.com",
    firstName: "Camila", lastName: "Souza",
    city: "São Paulo", zipCode: "01310-100",
    latitude: -23.561, longitude: -46.656,
    teachSkill: "Presentation", learnSkill: "English",
    bio: "I prepare founders for rooms they are frightened of. The fear is fine; the structure is what is missing. My English holds up until someone asks a question."
  },
  {
    email: "lucia@example.com",
    firstName: "Lucía", lastName: "Fernández",
    city: "Buenos Aires", zipCode: "C1425",
    latitude: -34.58, longitude: -58.42,
    teachSkill: "English", learnSkill: "Presentation",
    bio: "Eight years teaching, mostly to people who already read it well and freeze when they speak. I am one of those people the moment I stand up."
  },
  {
    email: "thabo@example.com",
    firstName: "Thabo", lastName: "Dlamini",
    city: "Cape Town", zipCode: "8001",
    latitude: -33.925, longitude: 18.424,
    teachSkill: "Tableau", learnSkill: "Mathematics",
    bio: "I build reporting for a health nonprofit. Happy to show you how to make one chart that replaces a meeting. The statistics underneath are further than I can see."
  },
  {
    email: "wanjiru@example.com",
    firstName: "Wanjiru", lastName: "Kamau",
    city: "Nairobi", zipCode: "00200",
    latitude: -1.27, longitude: 36.81,
    teachSkill: "Mathematics", learnSkill: "Tableau",
    bio: "University tutor. I am good at finding the assumption you were never told about. I have results nobody outside the department can read."
  },
  {
    email: "jiho@example.com",
    firstName: "Ji-ho", lastName: "Kang",
    city: "Seoul", zipCode: "04524",
    latitude: 37.564, longitude: 126.977,
    teachSkill: "Node.js", learnSkill: "SQL",
    bio: "Services and APIs, six years. We will build something small that actually runs. My queries work and I could not tell you why they are slow."
  },
  {
    email: "yiting@example.com",
    firstName: "Yi-Ting", lastName: "Hsu",
    city: "Taipei", zipCode: "100",
    latitude: 25.046, longitude: 121.517,
    teachSkill: "SQL", learnSkill: "Node.js",
    bio: "Database work, including the unglamorous half where things are made fast. I would like to write the thing that calls the database for once."
  },
  {
    email: "elodie@example.com",
    firstName: "Élodie", lastName: "Gagnon",
    city: "Montreal", zipCode: "H2X 1Y6",
    latitude: 45.51, longitude: -73.568,
    teachSkill: "Writing", learnSkill: "Project Management",
    bio: "Documentation, which is writing for people in a hurry and slightly annoyed. I can teach you to cut half of it. I am running a team now and improvising."
  },
  {
    email: "simon@example.com",
    firstName: "Simon", lastName: "Achebe",
    city: "Vancouver", zipCode: "V6B 1A1",
    latitude: 49.281, longitude: -123.109,
    teachSkill: "Project Management", learnSkill: "Writing",
    bio: "Fifteen years shipping things roughly on time. Estimation is a skill, not a personality trait. Everything I write reads like a status update."
  },
  {
    email: "elin@example.com",
    firstName: "Elin", lastName: "Bergström",
    city: "Stockholm", zipCode: "111 22",
    latitude: 59.332, longitude: 18.064,
    teachSkill: "Aerobic Dance", learnSkill: "Skateboarding",
    bio: "I teach three classes a week and still get nervous before each one. Come to the beginners' hour. I want to learn something where falling over is expected."
  },
  {
    email: "ren@example.com",
    firstName: "Ren", lastName: "Fujita",
    city: "Kyoto", zipCode: "604-8005",
    latitude: 35.009, longitude: 135.768,
    teachSkill: "Skateboarding", learnSkill: "Aerobic Dance",
    bio: "Street skating for eleven years, teaching for two. The first hour is entirely about how to fall. I have no rhythm and would like some."
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
// Left alone, a demo that has been deployed before would come back with fifty
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
