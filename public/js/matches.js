// The members you have matched with. Matching is one-directional — see
// models/match.js — so this is your own list, and the ones who have added you
// back are the ones carrying a "Mutual" pill.
$(document).ready(function() {
  var container = $("#member_cards");
  var summary = $("#match-summary");

  var profiles = [];

  function describe() {
    if (!profiles.length) {
      summary.text("");
      return;
    }

    var mutual = profiles.filter(function(profile) {
      return profile.mutual;
    }).length;

    summary.text(
      profiles.length + (profiles.length === 1 ? " match" : " matches") + " · " +
      mutual + " mutual"
    );
  }

  function render() {
    Mutuo.renderCards(
      container,
      profiles,
      "No matches yet. Find someone on the browse page and press Match."
    );
    describe();
  }

  $.get("/api/matches")
    .then(function(data) {
      profiles = data;
      render();

      // Drawn, so they have been seen — this is what clears the count in the
      // nav. After rendering rather than before, so a member who never gets a
      // page keeps their badge. Failure is ignored: a badge that stays up one
      // visit too long is a much smaller problem than an error over a page that
      // loaded perfectly well.
      $.post("/api/matches/seen").then(function() {
        $("[data-match-badge]").prop("hidden", true).text("");
      }).catch(function() {});
    })
    .catch(function(jqXHR) {
      if (Mutuo.redirectedToLogin(jqXHR)) {
        return;
      }
      container.html(
        "<p class='empty-state'>" +
          Mutuo.escapeHtml(Mutuo.errorMessage(jqXHR, "Could not load your matches.")) +
        "</p>"
      );
    });

  // Unmatching on this page removes the card: it is a list of your matches, and
  // one that is no longer a match does not belong on it. The whole list is
  // re-rendered rather than the card plucked out, so the count above it and the
  // empty state both follow from the same data.
  Mutuo.bindMatchToggle(container, function(profileId, matched) {
    if (matched) {
      return;
    }
    profiles = profiles.filter(function(profile) {
      return profile.id !== profileId;
    });
    render();
  });
});
