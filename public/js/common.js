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

  // One member card. The card itself is the link — a whole target rather than a
  // button in the corner of one — and every interpolated value is escaped.
  //
  // The two skills are labelled rather than left to colour alone. The previous
  // card put a green tag next to a blue one and expected the reader to work out
  // which way round the trade went.
  function profileCard(profile) {
    return "" +
      "<a class='member-card' data-id='" + escapeHtml(profile.id) + "' href='/detail/" +
        encodeURIComponent(profile.id) + "'>" +
        "<div class='member-card__head'>" +
          avatar(profile) +
          "<div class='member-card__identity'>" +
            "<h2 class='member-card__name'>" +
              escapeHtml(profile.firstName) + " " + escapeHtml(profile.lastName) +
            "</h2>" +
            "<p class='member-card__place'>" +
              escapeHtml(profile.city) + " " + escapeHtml(profile.zipCode) +
            "</p>" +
          "</div>" +
        "</div>" +
        "<dl class='member-card__skills'>" +
          "<dt>Teaches</dt>" +
          "<dd><span class='pill pill--teach'>" + escapeHtml(profile.teachSkill) + "</span></dd>" +
          "<dt>Wants</dt>" +
          "<dd><span class='pill pill--learn'>" + escapeHtml(profile.learnSkill) + "</span></dd>" +
        "</dl>" +
        "<p class='member-card__email'>" + escapeHtml(profile.email) + "</p>" +
      "</a>";
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
    errorMessage: errorMessage,
    redirectedToLogin: redirectedToLogin,
    fillSkillOptions: fillSkillOptions
  };
})();
