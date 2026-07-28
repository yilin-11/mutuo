// The profile form: create or edit the logged-in member's own profile.
$(document).ready(function() {
  var form = $("#profile-form");
  var alertBox = $("#form-alert");

  Mutuo.fillSkillOptions("#teachSkill", "Select a skill you can share");
  Mutuo.fillSkillOptions("#learnSkill", "Select a skill you want to learn");

  function showError(message) {
    alertBox.text(message).show();
    $("html, body").animate({ scrollTop: 0 }, 200);
  }

  // Prefill the form when the member already has a profile, so opening this
  // page a second time edits the existing one instead of looking empty.
  $.get("/api/profiles/me")
    .then(function(profile) {
      if (!profile) {
        return;
      }
      $("#firstName").val(profile.firstName);
      $("#lastName").val(profile.lastName);
      $("#city").val(profile.city);
      $("#zipCode").val(profile.zipCode);
      $("#teachSkill").val(profile.teachSkill);
      $("#learnSkill").val(profile.learnSkill);
      $("#bio").val(profile.bio);
      $("#form-title").text("Update your profile");
      $("#submit").text("Save changes");
    })
    .catch(function() {
      // Not fatal: the member can still fill the form in from scratch.
    });

  // A real submit handler on the form. The old version hung this off an
  // <a href="/members"> styled as a button, so the browser navigated away
  // before the AJAX request could finish and nothing was ever saved.
  form.on("submit", function(event) {
    event.preventDefault();
    alertBox.hide();

    var profile = {
      firstName: $("#firstName").val().trim(),
      lastName: $("#lastName").val().trim(),
      city: $("#city").val().trim(),
      zipCode: $("#zipCode").val().trim(),
      teachSkill: $("#teachSkill").val() || "",
      learnSkill: $("#learnSkill").val() || "",
      bio: $("#bio").val().trim()
    };

    var missing = Object.keys(profile).filter(function(key) {
      return !profile[key];
    });
    if (missing.length) {
      showError("Please fill in every field before submitting.");
      return;
    }

    var submitButton = $("#submit");
    var originalLabel = submitButton.text();
    submitButton.prop("disabled", true).text("Saving...");

    // The server owns the profile's identity: it takes the member from the
    // session. The old code invented a random User_ID in the browser, which
    // meant a member could never find or edit their own profile again.
    $.ajax({ url: "/api/profiles", method: "POST", data: profile })
      .then(function() {
        window.location.replace("/members");
      })
      .catch(function(jqXHR) {
        showError(Mutuo.errorMessage(jqXHR, "Could not save your profile."));
        submitButton.prop("disabled", false).text(originalLabel);
      });
  });
});
