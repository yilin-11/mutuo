// Guards API routes. Unlike the page guard this answers with JSON, because a
// redirect to an HTML login page is useless to an AJAX caller.
module.exports = function(req, res, next) {
  if (req.user) {
    return next();
  }

  return res.status(401).json({ message: "You need to be logged in to do that." });
};
