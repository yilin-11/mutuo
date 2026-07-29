// Turns the postal code on a profile into coordinates to store alongside it.
//
// Why store them rather than look them up when the directory is drawn: sorting
// members by distance needs a coordinate for every one of them, and the geocoder
// is serialised at roughly one lookup a second (see config/geocode.js). Fifty
// members would be the better part of a minute of page load, and would overrun
// the queue's depth limit several times over besides. A postal code changes only when a member edits their
// profile, so the lookup belongs on the write, where it happens once.
var geocode = require("./geocode");

/**
 * Resolves to { latitude, longitude }, or nulls when the postal code cannot be
 * placed. Never rejects: a member's profile must save whether or not a
 * third-party geocoder is reachable, and an unplaced profile simply sorts to
 * the end of the directory instead of by distance.
 *
 * @param {string} zipCode
 * @param {string} [city]
 * @returns {Promise<{latitude: number|null, longitude: number|null}>}
 */
module.exports = function locate(zipCode, city) {
  // The test suite must not depend on a third-party service being reachable, or
  // on its rate limit: every profile it saves would otherwise spend a second in
  // the geocoder's queue. Tests that care about distance write coordinates
  // directly instead.
  if (process.env.NODE_ENV === "test") {
    return Promise.resolve({ latitude: null, longitude: null });
  }

  return geocode(zipCode, city)
    .then(function(location) {
      if (!location) {
        return { latitude: null, longitude: null };
      }
      return { latitude: location.lat, longitude: location.lng };
    })
    .catch(function() {
      // Unreachable, timed out, or the queue was full. Not worth failing a save
      // the member did successfully make.
      return { latitude: null, longitude: null };
    });
};
