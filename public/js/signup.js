$(document).ready(function() {
  var signUpForm = $("form.signup");
  var emailInput = $("input#email-input");
  var passwordInput = $("input#password-input");
  var alertBox = $("#form-alert");

  signUpForm.on("submit", function(event) {
    event.preventDefault();
    alertBox.hide();

    var email = emailInput.val().trim();
    var password = passwordInput.val();

    if (!email || !password) {
      alertBox.text("Please enter both an email and a password.").show();
      return;
    }
    if (password.length < 8) {
      alertBox.text("Your password must be at least 8 characters.").show();
      return;
    }

    var button = signUpForm.find("button[type='submit']").prop("disabled", true);

    $.post("/api/signup", { email: email, password: password })
      .then(function() {
        // Signing up logs the member in, so send them straight to the form
        // where they describe the skills they can share.
        window.location.replace("/application");
      })
      .catch(function(jqXHR) {
        // The old handler put err.responseJSON — a whole Sequelize error
        // object — into the alert, which rendered as "[object Object]".
        alertBox.text(Mutuo.errorMessage(jqXHR, "Could not create your account.")).show();
        button.prop("disabled", false);
      });
  });
});
