// Guards page routes: an anonymous visitor gets sent to the login page.
module.exports = function(req, res, next) {
  if (req.user) {
    return next();
  }

  return res.redirect("/login");
};
