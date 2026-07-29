// Great-circle distance between two coordinates, in kilometres.
//
// The member directory sorts by how far away someone is, and every profile
// carries a postal code's worth of precision at best — so this is a haversine
// over a spherical earth rather than anything that models the ellipsoid. The
// error is well under a percent, which is nothing next to "somewhere in this
// postcode".
var EARTH_RADIUS_KM = 6371;

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function usable(value) {
  return typeof value === "number" && isFinite(value);
}

/**
 * Distance in kilometres between two { lat, lng } points, or null when either
 * point is missing a coordinate. Null rather than Infinity: "we do not know how
 * far away this is" is not the same as "very far", and the callers sort the two
 * differently.
 *
 * @param {{lat: number, lng: number}} from
 * @param {{lat: number, lng: number}} to
 * @returns {number|null} Kilometres, rounded to one decimal place.
 */
module.exports = function distanceKm(from, to) {
  if (!from || !to) {
    return null;
  }
  if (!usable(from.lat) || !usable(from.lng) || !usable(to.lat) || !usable(to.lng)) {
    return null;
  }

  var dLat = toRadians(to.lat - from.lat);
  var dLng = toRadians(to.lng - from.lng);
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  // atan2 rather than asin: asin loses precision for antipodal points, where
  // the argument approaches 1 and the derivative blows up.
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(EARTH_RADIUS_KM * c * 10) / 10;
};
