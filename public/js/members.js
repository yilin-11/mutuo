// The member directory, with search over city, postal code and skills.
$(document).ready(function() {
  var container = $("#member_cards");
  var searchInput = $("#myInput");

  // Kept in memory so filtering is a re-render from data rather than hiding
  // DOM nodes by index. The old version walked the card list and the filter
  // list in parallel, which broke as soon as anything was already hidden.
  var allProfiles = [];

  $.get("/api/user_data").then(function(user) {
    if (user && user.email) {
      $(".member-name").text(user.email);
    }
  });

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

  function applyFilter() {
    // Read the value from the input, not from the event target. The old search
    // button handler read event.target.value — a button has no value, so
    // clicking Search always filtered on the empty string.
    var term = searchInput.val().trim().toUpperCase();
    var filtered = term
      ? allProfiles.filter(function(profile) {
        return matches(profile, term);
      })
      : allProfiles;

    Mutuo.renderCards(
      container,
      filtered,
      term ? "No members match “" + searchInput.val().trim() + "”." :
        "No members yet — be the first to add a profile."
    );
  }

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
        "<p class='no-results'>" +
          Mutuo.escapeHtml(Mutuo.errorMessage(jqXHR, "Could not load members.")) +
        "</p>"
      );
    });

  searchInput.on("input", applyFilter);

  // The search control lives in a <form>, so without preventDefault the button
  // submitted the page and reloaded away the results.
  $("#search-form").on("submit", function(event) {
    event.preventDefault();
    applyFilter();
  });
});
