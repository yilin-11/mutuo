// A single member's profile, plus a map of roughly where they are.
$(document).ready(function() {
  // The id is the last path segment of /detail/:id.
  var segments = window.location.pathname.split("/").filter(Boolean);
  var id = segments[segments.length - 1];

  function showNotFound(message) {
    $("#profile-body").html(
      "<p class='empty-state'>" + Mutuo.escapeHtml(message) + "</p>"
    );
    $("#map-section").hide();
  }

  // Draws the map with OpenStreetMap's own tiles, which need no access token.
  // The previous version shipped a Mapbox token and a MapQuest API key in this
  // file, both readable by anyone who opened the page source.
  function renderMap(location) {
    var map = L.map("mapid").setView([location.lat, location.lng], 12);

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      attribution: "&copy; <a href='https://www.openstreetmap.org/copyright'>OpenStreetMap</a> contributors"
    }).addTo(map);

    // A circle rather than a pin: members share a postal code, not an address,
    // and a precise marker would imply more precision than we have.
    L.circle([location.lat, location.lng], {
      color: "#2f6f4f",
      fillColor: "#4c9a72",
      fillOpacity: 0.35,
      radius: 2000
    }).addTo(map);
  }

  // The coordinates are resolved once when a profile is saved and stored on it,
  // so the usual path draws the map without asking the geocoder anything. The
  // fallback covers a profile saved before that column existed, or one whose
  // postal code the geocoder could not place at the time.
  function placeOnMap(profile) {
    if (typeof profile.latitude === "number" && typeof profile.longitude === "number") {
      renderMap({ lat: profile.latitude, lng: profile.longitude });
      return Promise.resolve();
    }

    // The map is a nice-to-have. If the geocoder is unreachable or does not
    // know the postal code, hide the section rather than breaking the page.
    return $.get("/api/geocode", { zip: profile.zipCode, city: profile.city })
      .then(renderMap)
      .catch(function() {
        $("#map-section").hide();
      });
  }

  $.get("/api/profiles/" + encodeURIComponent(id))
    .then(function(profile) {
      var fullName = profile.firstName + " " + profile.lastName;

      document.title = fullName + " · Mutuo";
      $(".userName").text(fullName);
      $("#teachSkill").text(profile.teachSkill);
      $("#learnSkill").text(profile.learnSkill);
      $("#bio").text(profile.bio);

      var place = profile.city + " " + profile.zipCode;
      var distance = Mutuo.formatDistance(profile.distanceKm);
      $("#location").text(distance ? place + " · " + distance : place);

      // The avatar is drawn rather than fetched, so this sets a tone class and
      // the initials instead of a src. See Mutuo.avatar in common.js.
      $("#avatar")
        .addClass("tone-" + Mutuo.avatarTone(profile))
        .text(Mutuo.initials(profile));

      // Escaping matters here too: the email goes into an href attribute.
      $("#contactEmail")
        .text(profile.email)
        .attr("href", Mutuo.mailto(profile.email));

      // The long form of what the card says in three words. Directly under the
      // two skills, which is what it is about.
      $("#swap-note").html(Mutuo.swapNote(profile.swap));

      // Nothing to offer on your own profile: you cannot match with yourself,
      // and the server refuses it anyway.
      if (!profile.isOwn) {
        var $action = $("#match-action");
        $action.html(
          (profile.mutual ? "<span class='pill pill--mutual'>Mutual</span>" : "") +
          "<button type='button' class='btn match-btn" +
            (profile.matched ? " match-btn--on" : "") +
            "' data-match-id='" + Mutuo.escapeHtml(profile.id) +
            "' aria-pressed='" + (profile.matched ? "true" : "false") + "'>" +
            "<span class='match-btn__label'>" +
              (profile.matched ? "Matched" : "Match") +
            "</span>" +
          "</button>"
        );
        $action.prop("hidden", false);
        Mutuo.bindMatchToggle($action);
      }

      return placeOnMap(profile);
    })
    .catch(function(jqXHR) {
      if (Mutuo.redirectedToLogin(jqXHR)) {
        return;
      }
      showNotFound(Mutuo.errorMessage(jqXHR, "We could not load that member's profile."));
    });
});
