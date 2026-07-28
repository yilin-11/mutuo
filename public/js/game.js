// "Random match": deals one random member card, for when you cannot decide who
// to reach out to.
$(document).ready(function() {
  var container = $("#member_cards");
  var button = $("#randomBtn");
  var status = $("#match-status");

  var profiles = null;
  var lastShownId = null;

  function pickRandom(list) {
    // Math.floor(Math.random() * length) — the old version added 1, so it could
    // pick an index one past the end and then crashed dereferencing undefined.
    var candidates = list;
    if (list.length > 1 && lastShownId !== null) {
      // Avoid dealing the same member twice in a row.
      candidates = list.filter(function(profile) {
        return profile.id !== lastShownId;
      });
    }
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  function showMatch() {
    var match = pickRandom(profiles);
    lastShownId = match.id;

    container.html(Mutuo.profileCard(match));
    // The slide-in animation lives on this class (see game.css).
    container.children(".portfolio-container").addClass("animate");
    status.text("");
    button.text("Match me with someone else");
  }

  function loadThenShow() {
    if (profiles) {
      showMatch();
      return;
    }

    button.prop("disabled", true);
    status.text("Finding someone...");

    $.get("/api/profiles")
      .then(function(data) {
        profiles = data;
        button.prop("disabled", false);
        if (!profiles.length) {
          container.empty();
          status.text("There are no member profiles yet. Add yours first!");
          return;
        }
        showMatch();
      })
      .catch(function(jqXHR) {
        if (Mutuo.redirectedToLogin(jqXHR)) {
          return;
        }
        button.prop("disabled", false);
        status.text(Mutuo.errorMessage(jqXHR, "Could not load members."));
      });
  }

  // The old handler called setTimeout(randomCardGenerator(), 5000), which
  // invoked the function immediately and scheduled its return value — and then
  // tried $("#randomBtn").setAttribute(...), a DOM method that does not exist
  // on a jQuery object, so it threw on every click.
  $("#match-form").on("submit", function(event) {
    event.preventDefault();
    loadThenShow();
  });
});
