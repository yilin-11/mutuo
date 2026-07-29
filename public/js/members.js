// Browse: everyone else, ordered by the server (best swap first, then closest —
// see /api/profiles), dealt onto shelves by what they teach.
//
// The page used to be one flat grid in that order. The order was always the
// good part and it survives untouched; what is new is the shape around it. A
// member arrives here to find someone who can teach them something, so the
// members are grouped by exactly that, one shelf per category, with the shelf
// of people you can actually trade with first. Search and the distance bound
// narrow every shelf at once; a category chip trades the shelves for a grid of
// that one category, because a shelf you have chosen to stand in front of
// should not still scroll sideways.
$(document).ready(function() {
  var results = $("#results");
  var chips = $("#category-chips");
  var searchInput = $("#myInput");
  var radiusSelect = $("#radius");
  var farSection = $("#farther");
  var farCount = $("#farther-count");
  var farContainer = $("#farther_cards");
  var prompt = $("#profile-prompt");
  var shuffleButton = $("#randomBtn");
  var shufflePanel = $("#match-panel");
  var shuffleResult = $("#match-result");
  var shuffleWhy = $("#match-why");
  var shuffleNote = $("#match-note");
  var shuffleStatus = $("#match-status");

  // Kept in memory so filtering is a re-render from data rather than hiding
  // DOM nodes by index. The old version walked the card list and the filter
  // list in parallel, which broke as soon as anything was already hidden.
  var allProfiles = [];
  var lastDealtId = null;
  // "" is every category. Anything else is one category's name.
  var activeCategory = "";

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

  // --- the shelves -----------------------------------------------------------

  // The categories present, in the order the server's ordering discovers them.
  // Nothing is hardcoded about which shelf comes first: the list arrives with
  // your best possible swap at the front, so the shelf that swap is on ends up
  // at the top of the page by construction — and the day the ordering changes,
  // this follows it rather than arguing with it.
  function categoriesIn(profiles) {
    var seen = {};
    var order = [];
    profiles.forEach(function(profile) {
      var name = Mutuo.categoryOf(profile.teachSkill);
      if (!seen[name]) {
        seen[name] = [];
        order.push(name);
      }
      seen[name].push(profile);
    });
    return order.map(function(name) {
      return { name: name, profiles: seen[name] };
    });
  }

  // One shelf. The arrows are rendered even when the track does not overflow —
  // updateArrows disables them rather than removing them, because a control
  // that appears and disappears as the window resizes is a control nobody
  // learns.
  function railHtml(shelf, index, modifier) {
    var titleId = "rail-title-" + index;

    return "" +
      "<section class='rail" + (modifier ? " " + modifier : "") +
        "' aria-labelledby='" + titleId + "'>" +
        "<div class='rail__head'>" +
          "<h2 class='rail__title' id='" + titleId + "'>" +
            Mutuo.escapeHtml(shelf.name) +
            "<span class='rail__count'>" + shelf.profiles.length + "</span>" +
          "</h2>" +
          "<div class='rail__nav'>" +
            "<button type='button' class='rail__arrow' data-dir='-1' aria-label='Scroll " +
              Mutuo.escapeHtml(shelf.name) + " left'>" +
              "<svg width='14' height='14' viewBox='0 0 14 14' fill='none' aria-hidden='true'>" +
                "<path d='M8.5 2.5L4 7l4.5 4.5' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/>" +
              "</svg>" +
            "</button>" +
            "<button type='button' class='rail__arrow' data-dir='1' aria-label='Scroll " +
              Mutuo.escapeHtml(shelf.name) + " right'>" +
              "<svg width='14' height='14' viewBox='0 0 14 14' fill='none' aria-hidden='true'>" +
                "<path d='M5.5 2.5L10 7l-4.5 4.5' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/>" +
              "</svg>" +
            "</button>" +
          "</div>" +
        "</div>" +
        "<div class='rail__frame'>" +
          "<div class='rail__track'>" +
            shelf.profiles.map(Mutuo.profileCard).join("") +
          "</div>" +
        "</div>" +
      "</section>";
  }

  // Which way each track can still go. Runs after a render, on scroll, and on
  // resize — the last of those matters because the same shelf overflows at one
  // window width and does not at another.
  function updateArrows($rail) {
    var $frame = $rail.find(".rail__frame");
    var track = $rail.find(".rail__track").get(0);
    if (!track) {
      return;
    }

    // A pixel of slack: browsers report fractional scroll positions, and an
    // exact comparison leaves the right-hand arrow enabled at the end of a
    // track it cannot move.
    var atStart = track.scrollLeft <= 1;
    var atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 1;

    $rail.find(".rail__arrow[data-dir='-1']").prop("disabled", atStart);
    $rail.find(".rail__arrow[data-dir='1']").prop("disabled", atEnd);
    $frame.toggleClass("rail__frame--more", !atEnd);
  }

  function updateAllArrows() {
    results.find(".rail").each(function() {
      updateArrows($(this));
    });
  }

  // --- rendering -------------------------------------------------------------

  function emptyMessage(term) {
    if (term) {
      return "Nobody here matches “" + term + "”.";
    }
    if (radius()) {
      return "Nobody within this distance. Try widening it — or the people " +
        "further away below.";
    }
    return "Nobody else has a profile yet — you are the first one here.";
  }

  function render() {
    var term = searchInput.val().trim();
    var groups = split(searched());
    var within = groups.within;

    if (activeCategory) {
      within = within.filter(function(profile) {
        return Mutuo.categoryOf(profile.teachSkill) === activeCategory;
      });
    }

    if (!within.length) {
      results.removeClass("rails").addClass("poster-grid");
      Mutuo.renderCards(results, [], emptyMessage(term));
    } else if (activeCategory) {
      // One category: a grid, not a shelf.
      results.removeClass("rails").addClass("poster-grid");
      Mutuo.renderCards(results, within, "");
    } else {
      results.removeClass("poster-grid").addClass("rails");

      // Everyone a trade is possible with, ahead of the categories and
      // deliberately duplicated inside them. A shelf is a way in, not a
      // partition: someone who can teach you guitar belongs under Music as
      // well, and a reader who came for music should not have to know that the
      // best of them was promoted out of it.
      var swappable = within.filter(function(profile) {
        return profile.swap;
      });

      var html = "";
      var index = 0;

      if (swappable.length) {
        html += railHtml(
          { name: "You can trade with these", profiles: swappable },
          index++,
          "rail--swap"
        );
      }

      categoriesIn(within).forEach(function(shelf) {
        html += railHtml(shelf, index++, "");
      });

      results.html(html);

      // Bound directly rather than delegated from #results: scroll does not
      // bubble, so a delegated handler here would never fire.
      results.find(".rail__track").on("scroll", function() {
        updateArrows($(this).closest(".rail"));
      });

      updateAllArrows();
    }

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

  // The chips, built from the members actually here rather than from the full
  // category list: a shelf nobody is standing on is not worth a button. Counts
  // come from everyone, not from the current search, so the row does not
  // reshuffle itself under the cursor as somebody types.
  function renderChips() {
    var shelves = categoriesIn(allProfiles);

    var html = "<button type='button' class='chip' data-category='' aria-pressed='" +
      (activeCategory ? "false" : "true") + "'>All" +
      "<span class='chip__count'>" + allProfiles.length + "</span></button>";

    shelves.forEach(function(shelf) {
      html += "<button type='button' class='chip' data-category='" +
        Mutuo.escapeHtml(shelf.name) + "' aria-pressed='" +
        (activeCategory === shelf.name ? "true" : "false") + "'>" +
        Mutuo.escapeHtml(shelf.name) +
        "<span class='chip__count'>" + shelf.profiles.length + "</span></button>";
    });

    chips.html(html);
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

  // How the pick was arrived at, said out loud. Which pool it came from is the
  // difference between a suggestion and a coin flip, and the reader cannot see
  // it otherwise.
  var POOL_NOTES = [
    "Picked from the members you can trade with, inside your chosen distance.",
    "Nobody inside your distance trades what you asked for, so this is anyone nearby.",
    "Nobody nearby at all, so this is anyone here."
  ];

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
        return { profile: fresh[Math.floor(Math.random() * fresh.length)], pool: i };
      }
    }

    // Everyone there is the member already showing, so there is exactly one
    // other member in the whole app. Dealing them again is the honest answer.
    return { profile: allProfiles[0], pool: 2 };
  }

  // What this member is to you, in one line. The poster beside it already says
  // who they are and what they teach, so this says why they are the one on
  // screen.
  function why(profile) {
    if (profile.swap === "both") {
      return "A straight swap — you each teach what the other wants.";
    }
    if (profile.swap === "teaches") {
      return "They teach " + profile.teachSkill + ", which is what you want to learn.";
    }
    if (profile.swap === "wants") {
      return "They want to learn " + profile.learnSkill + ", which is what you teach.";
    }
    return "No overlap with your two skills — but " + profile.city + " is not far.";
  }

  function deal() {
    if (!allProfiles.length) {
      shuffleStatus.text("There is nobody else here yet.");
      return;
    }

    var dealt = pick();
    lastDealtId = dealt.profile.id;

    shuffleResult.html(Mutuo.profileCard(dealt.profile));
    // The entrance animation lives on this class (see members.css). Added after
    // the poster is in the DOM so it runs on every deal, not just the first.
    shuffleResult.children(".poster").addClass("animate");
    shuffleWhy.text(why(dealt.profile));
    shuffleNote.text(POOL_NOTES[dealt.pool]);
    shuffleStatus.text("");
    shufflePanel.prop("hidden", false);
    shuffleButton.text("Someone else");
  }

  // --- loading ---------------------------------------------------------------

  checkOwnProfile();

  $.get("/api/profiles")
    .then(function(profiles) {
      allProfiles = profiles;
      renderChips();
      render();
    })
    .catch(function(jqXHR) {
      if (Mutuo.redirectedToLogin(jqXHR)) {
        return;
      }
      results.removeClass("rails").addClass("poster-grid").html(
        "<p class='empty-state'>" +
          Mutuo.escapeHtml(Mutuo.errorMessage(jqXHR, "Could not load members.")) +
        "</p>"
      );
    });

  searchInput.on("input", render);
  radiusSelect.on("change", render);

  // The search control lives in a <form>, so without preventDefault the button
  // submitted the page and reloaded away the results.
  $("#search-form").on("submit", function(event) {
    event.preventDefault();
    render();
  });

  chips.on("click", ".chip", function() {
    var chosen = $(this).attr("data-category");
    // Pressing the category you are already in returns you to the shelves,
    // which is what every other filter row on the web does.
    activeCategory = chosen === activeCategory ? "" : chosen;
    chips.find(".chip").each(function() {
      var $chip = $(this);
      $chip.attr("aria-pressed",
        String($chip.attr("data-category") === activeCategory));
    });
    render();
  });

  // Scrolling a shelf. By a little under a full track so the tile at the edge
  // stays on screen and the reader keeps their place.
  results.on("click", ".rail__arrow", function() {
    var $rail = $(this).closest(".rail");
    var track = $rail.find(".rail__track").get(0);
    var direction = Number($(this).attr("data-dir"));
    track.scrollLeft += direction * Math.round(track.clientWidth * 0.85);
  });

  // A shelf that overflows at one window width does not at another.
  $(window).on("resize", updateAllArrows);

  shuffleButton.on("click", deal);

  // One source of truth for whether a member is matched: the toggle can be
  // pressed on the dealt poster, on a shelf, in a category grid, or in the
  // folded-away section, and all of them have to end up showing the same thing.
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
