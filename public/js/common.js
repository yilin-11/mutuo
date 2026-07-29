// Shared helpers for every Mutuo page.
window.Mutuo = (function() {
  "use strict";

  // The single list of skills, used to build both dropdowns on the profile
  // form. Previously "teach" and "learn" had different hardcoded lists, so a
  // skill someone could teach was often one nobody was able to ask for.
  var SKILLS = [
    "Aerobic Dance",
    "Cooking",
    "English",
    "Excel",
    "Guitar",
    "JavaScript",
    "Mathematics",
    "Node.js",
    "Photoshop",
    "Piano",
    "Presentation",
    "Project Management",
    "Python",
    "Skateboarding",
    "SQL",
    "Tableau",
    "Writing"
  ];

  // Escapes text before it goes into an HTML string. Member names, cities and
  // bios are user input: interpolating them raw let anyone who typed
  // <img onerror=...> in their bio run script in every other member's browser.
  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // How many tones stylesheets/base.css defines as .tone-1 ... .tone-N.
  var AVATAR_TONES = 6;

  function initials(profile) {
    var first = String(profile.firstName || "").trim().charAt(0);
    var last = String(profile.lastName || "").trim().charAt(0);
    return ((first + last).toUpperCase() || "?");
  }

  // Which of the tones this member gets. Deterministic, so a face does not
  // change colour between the directory and their own page — and derived from
  // the name rather than the id, so it survives a reseeded database.
  function avatarTone(profile) {
    var seed = String(profile.firstName || "") + String(profile.lastName || "");
    var sum = 0;
    for (var i = 0; i < seed.length; i++) {
      sum = (sum + seed.charCodeAt(i)) % 9973;
    }
    return (sum % AVATAR_TONES) + 1;
  }

  // Drawn here rather than fetched. Two avatar services have been through this
  // file — adorable.io shut down and left every avatar broken, dicebear
  // replaced it — and two letters in a circle are not worth a request to
  // anyone, let alone a third party who then learns every member's name.
  function avatar(profile, extraClass) {
    return "<div class='avatar tone-" + avatarTone(profile) +
      (extraClass ? " " + extraClass : "") + "' aria-hidden='true'>" +
      escapeHtml(initials(profile)) + "</div>";
  }

  // How far away a member is, in words. Under ten kilometres the decimal is
  // worth having; past that it is false precision about a postal code.
  function formatDistance(km) {
    if (typeof km !== "number" || !isFinite(km)) {
      return "";
    }
    if (km < 1) {
      return "Less than a km away";
    }
    if (km < 10) {
      return (Math.round(km * 10) / 10) + " km away";
    }
    return Math.round(km) + " km away";
  }

  // What a swap looks like from the reader's side. The server works out which
  // of these applies (see swapKind in routes/api-routes.js); this is only the
  // wording, kept here so the card and the profile page cannot disagree.
  var SWAP_LABELS = {
    both: "Straight swap — you each teach what the other wants",
    teaches: "Teaches what you want to learn",
    wants: "Wants to learn what you teach"
  };

  // The short form, for a card where the long one would wrap to three lines.
  var SWAP_LABELS_SHORT = {
    both: "Straight swap",
    teaches: "Teaches what you want",
    wants: "Wants what you teach"
  };

  function swapNote(kind, short) {
    var labels = short ? SWAP_LABELS_SHORT : SWAP_LABELS;
    if (!kind || !labels[kind]) {
      return "";
    }
    return "<p class='swap-note swap-note--" + escapeHtml(kind) + "'>" +
      escapeHtml(labels[kind]) +
    "</p>";
  }

  // The match toggle. A button rather than a second link, and it carries its own
  // state in aria-pressed so a screen reader gets the same "on/off" the label
  // and the fill are showing everyone else.
  function matchButton(profile) {
    var matched = Boolean(profile.matched);
    return "" +
      "<button type='button' class='btn match-btn" + (matched ? " match-btn--on" : "") +
        "' data-match-id='" + escapeHtml(profile.id) +
        "' aria-pressed='" + (matched ? "true" : "false") + "'>" +
        "<span class='match-btn__label'>" + (matched ? "Matched" : "Match") + "</span>" +
      "</button>";
  }

  // An address is safe in an href once it has been through encodeURIComponent —
  // except for the @, which is legal in a mailto: and which encoding would
  // break.
  function mailto(email) {
    return "mailto:" + encodeURIComponent(email).replace(/%40/g, "@");
  }

  // The address at the foot of the card, and the one thing a mutual match
  // actually buys you: it becomes something you can press.
  //
  // Everyone's address is on every card either way — this is a directory of
  // people who joined to be contacted, and hiding it until both sides have
  // pressed a button would make the app worse at its job to make one feature
  // feel more important. What mutual changes is the invitation, not the access.
  function contactLine(profile) {
    if (!profile.mutual) {
      return "<p class='member-card__email'>" + escapeHtml(profile.email) + "</p>";
    }
    return "<a class='member-card__email member-card__email--link' href='" +
      escapeHtml(mailto(profile.email)) + "'>" +
      escapeHtml(profile.email) +
    "</a>";
  }

  // One member card. Every interpolated value is escaped.
  //
  // The card was a single <a> until it grew a match button, and a button inside
  // a link is neither valid HTML nor operable — the link swallows the click. So
  // the card is an <article> now, the name is the link, and the link's ::after
  // is stretched over the whole card (see members.css) to keep the large target
  // that made the old one worth having. The button sits above that overlay.
  //
  // The two skills are labelled rather than left to colour alone. The previous
  // card put a green tag next to a blue one and expected the reader to work out
  // which way round the trade went.
  function profileCard(profile) {
    var distance = formatDistance(profile.distanceKm);

    return "" +
      "<article class='member-card' data-id='" + escapeHtml(profile.id) + "'>" +
        "<div class='member-card__head'>" +
          avatar(profile) +
          "<div class='member-card__identity'>" +
            "<h2 class='member-card__name'>" +
              "<a class='member-card__link' href='/detail/" + encodeURIComponent(profile.id) + "'>" +
                escapeHtml(profile.firstName) + " " + escapeHtml(profile.lastName) +
              "</a>" +
            "</h2>" +
            "<p class='member-card__place'>" +
              escapeHtml(profile.city) + " " + escapeHtml(profile.zipCode) +
              (distance ? "<span class='member-card__distance'>" + escapeHtml(distance) + "</span>" : "") +
            "</p>" +
          "</div>" +
        "</div>" +
        // A full-width row rather than a pill in the header: the header already
        // holds the name, the place and the distance, and this is the sentence
        // the reader most needs. Absent entirely when there is no overlap, so
        // the cards that do have one stand out by having it at all.
        swapNote(profile.swap, true) +
        "<dl class='member-card__skills'>" +
          "<dt>Teaches</dt>" +
          "<dd><span class='pill pill--teach'>" + escapeHtml(profile.teachSkill) + "</span></dd>" +
          "<dt>Wants</dt>" +
          "<dd><span class='pill pill--learn'>" + escapeHtml(profile.learnSkill) + "</span></dd>" +
        "</dl>" +
        "<div class='member-card__foot'>" +
          contactLine(profile) +
          // Beside the toggle rather than up by the name: it is the other half
          // of the same fact, and in the header it competed for width with the
          // distance — which is the whole point of the page it appears on.
          (profile.mutual ? "<span class='pill pill--mutual'>Mutual</span>" : "") +
          matchButton(profile) +
        "</div>" +
      "</article>";
  }

  // Replaces the contents of a container with the given profiles.
  function renderCards($container, profiles, emptyMessage) {
    $container.empty();
    if (!profiles.length) {
      $container.append("<p class='empty-state'>" + escapeHtml(emptyMessage) + "</p>");
      return;
    }
    $container.append(profiles.map(profileCard).join(""));
  }

  // Adds or removes a match. Resolves to the state the server ended up in.
  function setMatched(profileId, matched) {
    return $.ajax({
      url: "/api/matches/" + encodeURIComponent(profileId),
      method: matched ? "POST" : "DELETE"
    });
  }

  // Wires up every match button inside a container, present and future — the
  // handler is delegated, so a card rendered after this call works too.
  //
  // The button is updated before the request goes out and put back if it fails.
  // Waiting for a round trip to acknowledge a tap on a toggle is the kind of
  // delay people answer by tapping it again.
  function bindMatchToggle($container, onChange) {
    $container.on("click", "[data-match-id]", function(event) {
      event.preventDefault();

      var $button = $(this);
      if ($button.prop("disabled")) {
        return;
      }

      var profileId = $button.attr("data-match-id");
      var wanted = $button.attr("aria-pressed") !== "true";

      function paint(matched) {
        $button
          .attr("aria-pressed", matched ? "true" : "false")
          .toggleClass("match-btn--on", matched)
          .find(".match-btn__label")
          .text(matched ? "Matched" : "Match");
      }

      paint(wanted);
      $button.prop("disabled", true);

      setMatched(profileId, wanted)
        .then(function() {
          $button.prop("disabled", false);
          if (onChange) {
            onChange(Number(profileId), wanted, $button);
          }
        })
        .catch(function(jqXHR) {
          if (redirectedToLogin(jqXHR)) {
            return;
          }
          paint(!wanted);
          $button.prop("disabled", false);
          window.alert(errorMessage(jqXHR, "Could not save that match."));
        });
    });
  }

  // The member area's data now needs a session, so an expired one comes back as
  // a 401 on the first fetch. Sending the member to the login page beats
  // printing "you need to be logged in to do that" onto an empty directory.
  // Returns true when it has taken over, so callers can stop.
  function redirectedToLogin(jqXHR) {
    if (jqXHR && jqXHR.status === 401) {
      window.location.replace("/login");
      return true;
    }
    return false;
  }

  // Pulls a readable message out of a failed jQuery request.
  function errorMessage(jqXHR, fallback) {
    if (jqXHR && jqXHR.responseJSON && jqXHR.responseJSON.message) {
      return jqXHR.responseJSON.message;
    }
    return fallback || "Something went wrong. Please try again.";
  }

  // Fills a <select> with the shared skill list.
  function fillSkillOptions(selector, placeholder) {
    var $select = $(selector);
    var options = ["<option value='' disabled selected>" + escapeHtml(placeholder) + "</option>"];
    SKILLS.forEach(function(skill) {
      options.push("<option value='" + escapeHtml(skill) + "'>" + escapeHtml(skill) + "</option>");
    });
    $select.html(options.join(""));
  }

  // How many mutual matches have arrived since this member last looked at them.
  //
  // Without this, matching was a dead end: you pressed Match, the other person
  // was never told, and the only way to discover they had pressed it back was to
  // open a page you had no reason to open. A count in the nav is the cheapest
  // thing that closes that loop — no notifications, no email, just a number that
  // is only there when it has something to say.
  function paintMatchBadge() {
    var $badge = $("[data-match-badge]");
    if (!$badge.length) {
      return;
    }

    $.get("/api/matches/count")
      .then(function(counts) {
        if (!counts || !counts.unseen) {
          // Kept out of the accessibility tree as well as out of sight: an
          // empty badge announced as part of the link text reads as "Matches
          // blank".
          $badge.prop("hidden", true).text("");
          return;
        }
        $badge
          .text(counts.unseen)
          .attr("aria-label", counts.unseen + " new mutual " +
            (counts.unseen === 1 ? "match" : "matches"))
          .prop("hidden", false);
      })
      .catch(function() {
        // A badge is the least important thing on the page. If it cannot be
        // fetched, it simply does not appear.
      });
  }

  $(document).ready(paintMatchBadge);

  // The navbar toggle was the only thing Bootstrap's JavaScript was needed for,
  // and the pages were loading Bootstrap 3's JS underneath Bootstrap 4's CSS,
  // so the toggle never worked. Six lines here replaces the dependency.
  $(document).on("click", "[data-toggle='collapse']", function(event) {
    event.preventDefault();
    var $toggler = $(this);
    var $target = $($toggler.attr("data-target"));
    var isOpen = $target.toggleClass("show").hasClass("show");
    $toggler.attr("aria-expanded", String(isOpen));
  });

  return {
    SKILLS: SKILLS,
    escapeHtml: escapeHtml,
    avatar: avatar,
    initials: initials,
    avatarTone: avatarTone,
    profileCard: profileCard,
    renderCards: renderCards,
    formatDistance: formatDistance,
    swapNote: swapNote,
    mailto: mailto,
    setMatched: setMatched,
    bindMatchToggle: bindMatchToggle,
    errorMessage: errorMessage,
    redirectedToLogin: redirectedToLogin,
    fillSkillOptions: fillSkillOptions
  };
})();
