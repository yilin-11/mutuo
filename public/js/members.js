// People nearby: everyone else, ordered by the server (best swap first, then
// closest — see /api/profiles), with search, a distance bound, and the random
// match that used to be a page of its own.
$(document).ready(function() {
  var container = $("#member_cards");
  var searchInput = $("#myInput");
  var radiusSelect = $("#radius");
  var farSection = $("#farther");
  var farCount = $("#farther-count");
  var farContainer = $("#farther_cards");
  var prompt = $("#profile-prompt");
  var shuffleButton = $("#randomBtn");
  var shufflePanel = $("#match-panel");
  var shuffleResult = $("#match-result");
  var shuffleStatus = $("#match-status");

  // Kept in memory so filtering is a re-render from data rather than hiding
  // DOM nodes by index. The old version walked the card list and the filter
  // list in parallel, which broke as soon as anything was already hidden.
  var allProfiles = [];
  var lastDealtId = null;

  // --- what the reader is being shown, and why ------------------------------

  // The whole page is sorted by the postal code on your own profile, so a member
  // who has not filled one in gets a list in no particular order and no hint as
  // to why. Saying so — and linking to the form — beats a page that quietly
  // does less than its own subtitle claims.
  function checkOwnProfile() {
    return $.get("/api/profiles/me").then(function(own) {
      if (!own) {
        prompt.html(
          "<p>Add your profile to see who is near you and who wants the skill " +
          "you teach. Until then this is just a list.</p>" +
          "<a class='btn btn--primary' href='/application'>Create your profile</a>"
        ).prop("hidden", false);
        return;
      }

      if (own.latitude === null || own.longitude === null) {
        prompt.html(
          "<p>We could not place " + Mutuo.escapeHtml(own.zipCode) + " on the map, " +
          "so this list is not sorted by distance. Check the postal code on your " +
          "profile.</p>" +
          "<a class='btn btn--secondary' href='/application'>Edit your profile</a>"
        ).prop("hidden", false);
      }
    }).catch(function() {
      // The prompt is an explanation, not the page. If it cannot be fetched,
      // the list still works.
    });
  }

  // --- filtering -------------------------------------------------------------

  function matches(profile, term) {
    return [
      profile.firstName,
      profile.lastName,
      profile.city,
      profile.zipCode,
      profile.teachSkill,
      profile.learnSkill
    ].some(function(field) {
      return String(field || "").toUpperCase().indexOf(term) > -1;
    });
  }

  function searched() {
    // Read the value from the input, not from the event target. The old search
    // button handler read event.target.value — a button has no value, so
    // clicking Search always filtered on the empty string.
    var term = searchInput.val().trim().toUpperCase();
    if (!term) {
      return allProfiles;
    }
    return allProfiles.filter(function(profile) {
      return matches(profile, term);
    });
  }

  function radius() {
    var value = Number(radiusSelect.val());
    return isFinite(value) && value > 0 ? value : null;
  }

  // Within the bound, and beyond it. A member we could not place counts as
  // beyond: we cannot claim they are close.
  function split(profiles) {
    var limit = radius();
    if (limit === null) {
      return { within: profiles, beyond: [] };
    }

    var within = [];
    var beyond = [];
    profiles.forEach(function(profile) {
      if (profile.distanceKm !== null && profile.distanceKm <= limit) {
        within.push(profile);
      } else {
        beyond.push(profile);
      }
    });
    return { within: within, beyond: beyond };
  }

  function applyFilter() {
    var term = searchInput.val().trim();
    var groups = split(searched());

    Mutuo.renderCards(
      container,
      groups.within,
      term ? "No members within this distance match “" + term + "”." :
        radius() ? "Nobody within this distance. Try widening it — or the " +
          "people further away below." :
          "Nobody else has a profile yet — you are the first one here."
    );

    // Folded away rather than dropped. A bound on "nearby" should be a bound on
    // what is shown first, not a claim that the rest do not exist.
    if (groups.beyond.length) {
      farCount.text(groups.beyond.length);
      Mutuo.renderCards(farContainer, groups.beyond, "");
      farSection.prop("hidden", false);
    } else {
      farSection.prop("hidden", true);
      farContainer.empty();
    }
  }

  // --- the random match ------------------------------------------------------

  // Who the button is allowed to deal, best group first.
  //
  // Dealing uniformly from everyone was the worst of both: it could hand you
  // someone on another continent who teaches nothing you asked for, which is not
  // a decision made for you so much as a coin flipped. So it prefers people a
  // swap is actually possible with, inside whatever distance is currently set.
  //
  // Three groups rather than one, because narrowing on its own creates a worse
  // bug than it fixes: a member with exactly one possible swap would be dealt
  // that same person every time, by a button that says "Someone else". Each
  // press takes the best group that has somebody new in it.
  function pools() {
    var visible = split(allProfiles).within;
    return [
      visible.filter(function(profile) {
        return profile.swap;
      }),
      visible,
      allProfiles
    ];
  }

  function pick() {
    var groups = pools();

    for (var i = 0; i < groups.length; i++) {
      var fresh = groups[i].filter(function(profile) {
        return profile.id !== lastDealtId;
      });
      if (fresh.length) {
        // Math.floor(Math.random() * length) — the old version added 1, so it
        // could pick an index one past the end and then crashed dereferencing
        // the resulting undefined.
        return fresh[Math.floor(Math.random() * fresh.length)];
      }
    }

    // Everyone there is the member already showing, so there is exactly one
    // other member in the whole app. Dealing them again is the honest answer.
    return allProfiles[0];
  }

  function deal() {
    if (!allProfiles.length) {
      shuffleStatus.text("There is nobody else here yet.");
      return;
    }

    var match = pick();
    lastDealtId = match.id;

    shuffleResult.html(Mutuo.profileCard(match));
    // The slide-in animation lives on this class (see members.css). Added after
    // the card is in the DOM so the entrance runs on every deal, not just the
    // first.
    shuffleResult.children(".member-card").addClass("animate");
    shuffleStatus.text("");
    shufflePanel.prop("hidden", false);
    shuffleButton.text("Someone else");
  }

  // --- loading ---------------------------------------------------------------

  checkOwnProfile();

  $.get("/api/profiles")
    .then(function(profiles) {
      allProfiles = profiles;
      applyFilter();
    })
    .catch(function(jqXHR) {
      if (Mutuo.redirectedToLogin(jqXHR)) {
        return;
      }
      container.html(
        "<p class='empty-state'>" +
          Mutuo.escapeHtml(Mutuo.errorMessage(jqXHR, "Could not load members.")) +
        "</p>"
      );
    });

  searchInput.on("input", applyFilter);
  radiusSelect.on("change", applyFilter);

  // The search control lives in a <form>, so without preventDefault the button
  // submitted the page and reloaded away the results.
  $("#search-form").on("submit", function(event) {
    event.preventDefault();
    applyFilter();
  });

  shuffleButton.on("click", deal);

  // One source of truth for whether a member is matched: the toggle can be
  // pressed on the dealt card, in the grid, or in the folded-away section, and
  // all of them have to end up showing the same thing.
  function remember(profileId, matched) {
    allProfiles.forEach(function(profile) {
      if (profile.id === profileId) {
        profile.matched = matched;
      }
    });

    $("[data-match-id='" + profileId + "']").each(function() {
      $(this)
        .attr("aria-pressed", matched ? "true" : "false")
        .toggleClass("match-btn--on", matched)
        .find(".match-btn__label")
        .text(matched ? "Matched" : "Match");
    });
  }

  Mutuo.bindMatchToggle($("main"), remember);
});
