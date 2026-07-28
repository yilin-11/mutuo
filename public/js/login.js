$(document).ready(function() {
  var loginForm = $("form.login");
  var emailInput = $("input#email-input");
  var passwordInput = $("input#password-input");
  var alertBox = $("#form-alert");

  // A visitor sent a link to the demo has no account and no reason to make one,
  // and Mutuo shows nothing at all until someone is logged in. The server says
  // whether this deployment is a demo and which account to offer; anywhere else
  // it answers null and this block does nothing. See config/demo.js.
  $.get("/api/demo")
    .then(function(data) {
      var account = data && data.account;
      if (!account) {
        return;
      }

      $("#demo-email").text(account.email);
      $("#demo-password").text(account.password);
      $("#demo-hint").show();

      // Filling the form rather than logging straight in, so the visitor sees
      // what they are signing in as and lands on a page they asked for.
      $("#demo-fill").on("click", function() {
        emailInput.val(account.email);
        passwordInput.val(account.password);
        loginForm.find("button[type='submit']").focus();
      });
    })
    .catch(function() {
      // Not worth telling anyone about: the login form is perfectly usable
      // without the hint, and a visitor with their own account never wanted it.
    });

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
