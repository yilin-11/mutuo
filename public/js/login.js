$(document).ready(function() {
  var loginForm = $("form.login");
  var emailInput = $("input#email-input");
  var passwordInput = $("input#password-input");
  var alertBox = $("#form-alert");

  loginForm.on("submit", function(event) {
    event.preventDefault();
    alertBox.hide();

    var email = emailInput.val().trim();
    var password = passwordInput.val();

    if (!email || !password) {
      alertBox.text("Please enter both your email and password.").show();
      return;
    }

    var button = loginForm.find("button[type='submit']").prop("disabled", true);

    $.post("/api/login", { email: email, password: password })
      .then(function() {
        // No need to stash the email anywhere: the session identifies the
        // member, and /api/user_data can be asked at any time. The old code
        // kept it in sessionStorage and every profile save depended on it.
        window.location.replace("/members");
      })
      .catch(function(jqXHR) {
        // A failed login used to be logged to the console only, so the form
        // just sat there with no explanation.
        alertBox.text(Mutuo.errorMessage(jqXHR, "Could not log you in.")).show();
        passwordInput.val("");
        button.prop("disabled", false);
      });
  });
});
