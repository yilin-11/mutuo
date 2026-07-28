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

  // Generated initial-avatars. The old api.adorable.io service shut down and
  // now redirects to a parked page, so every avatar on the site was broken.
  function avatarUrl(profile) {
    var seed = (profile.firstName || "") + " " + (profile.lastName || "");
    return "https://api.dicebear.com/9.x/initials/svg?radius=50&seed=" +
      encodeURIComponent(seed.trim() || "Mutuo");
  }

  // One member card. Every interpolated value is escaped.
  function profileCard(profile) {
    return "" +
      "<div class='portfolio-container' data-id='" + escapeHtml(profile.id) + "'>" +
        "<div class='portfolio-card'>" +
          "<div class='portfolioContent'>" +
            "<img class='rounded-circle avatarImg' alt='' src='" + escapeHtml(avatarUrl(profile)) + "'>" +
            "<h2 class='portfolioTitle'>" +
              escapeHtml(profile.firstName) + " " + escapeHtml(profile.lastName) +
            "</h2>" +
            "<p class='cardCategory'>" +
              escapeHtml(profile.city) + " " + escapeHtml(profile.zipCode) +
            "</p>" +
            "<h5 class='tag-teach' title='Can teach'>" + escapeHtml(profile.teachSkill) + "</h5> " +
            "<h5 class='tag-learn' title='Wants to learn'>" + escapeHtml(profile.learnSkill) + "</h5>" +
            "<h5 class='emailTag'>" + escapeHtml(profile.email) + "</h5>" +
            "<a class='btn btn-secondary btn-lg btn-block' href='/detail/" +
              encodeURIComponent(profile.id) + "'>Read More</a>" +
          "</div>" +
        "</div>" +
      "</div>";
  }

  // Replaces the contents of a container with the given profiles.
  function renderCards($container, profiles, emptyMessage) {
    $container.empty();
    if (!profiles.length) {
      $container.append("<p class='no-results'>" + escapeHtml(emptyMessage) + "</p>");
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
    avatarUrl: avatarUrl,
    profileCard: profileCard,
    renderCards: renderCards,
    errorMessage: errorMessage,
    redirectedToLogin: redirectedToLogin,
    fillSkillOptions: fillSkillOptions
  };
})();
