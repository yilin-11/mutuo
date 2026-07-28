// Postal code -> coordinates, using OpenStreetMap's Nominatim service.
//
// This replaces the previous approach of calling MapQuest from the browser with
// an API key hardcoded in a public script. Keeping the lookup on the server
// means no key ships to visitors, and one cache serves everyone.
var NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

// Nominatim's usage policy requires an identifying User-Agent and asks for at
// most one request per second. Set MUTUO_CONTACT to your own contact address
// before running this anywhere public.
var CONTACT = process.env.MUTUO_CONTACT || "mutuo-app (https://github.com/yilin-11/mutuo)";
var MIN_INTERVAL_MS = 1100;
var TIMEOUT_MS = 8000;
// Lookups are serialised one per MIN_INTERVAL_MS, so a caller joining a queue
// of N waits roughly N * 1.1 seconds — and TIMEOUT_MS only bounds the fetch,
// not the wait before it. Past this depth we refuse rather than promise a
// result minutes away.
var MAX_QUEUE_DEPTH = 12;
// The cache is keyed by whatever was asked for, so without a ceiling it grows
// once per distinct query and never shrinks. Oldest entries are evicted first.
var MAX_CACHE_ENTRIES = 500;

var cache = new Map();
// A promise chain that serialises outgoing lookups, one at a time.
var queue = Promise.resolve();
var queueDepth = 0;
var lastRequestAt = 0;

function remember(key, location) {
  // Map iterates in insertion order, so the first key is the oldest.
  if (cache.size >= MAX_CACHE_ENTRIES) {
    cache.delete(cache.keys().next().value);
  }
  cache.set(key, location);
}

function wait(ms) {
  return new Promise(function(resolve) {
    setTimeout(resolve, ms);
  });
}

// A free-form query rather than Nominatim's structured `postalcode` + `city`
// parameters: combining those two returns no results at all, and a postal code
// on its own is globally ambiguous (a bare "10001" resolves to Algeria, not
// New York). Pairing the code with the city disambiguates the country.
function search(query) {
  var params = new URLSearchParams({
    q: query,
    format: "json",
    limit: "1"
  });

  // AbortSignal.timeout keeps a slow geocoder from holding the request open.
  return fetch(NOMINATIM_URL + "?" + params.toString(), {
    headers: {
      "User-Agent": CONTACT,
      "Accept": "application/json"
    },
    signal: AbortSignal.timeout(TIMEOUT_MS)
  })
    .then(function(response) {
      if (!response.ok) {
        throw new Error("Geocoder responded with " + response.status);
      }
      return response.json();
    })
    .then(function(results) {
      if (!Array.isArray(results) || !results.length) {
        return null;
      }
      return {
        lat: Number(results[0].lat),
        lng: Number(results[0].lon),
        label: results[0].display_name
      };
    });
}

function fetchLocation(postalCode, city) {
  if (!city) {
    return search(postalCode);
  }
  // Fall back to the postal code alone if the pair finds nothing — better an
  // approximate pin than no map.
  return search(postalCode + ", " + city).then(function(location) {
    return location || search(postalCode);
  });
}

/**
 * Resolves to { lat, lng, label }, or null when the postal code is unknown.
 * Results are cached in memory for the lifetime of the process.
 */
module.exports = function geocode(postalCode, city) {
  var key = String(postalCode).toLowerCase() + "|" + String(city || "").toLowerCase();
  if (cache.has(key)) {
    return Promise.resolve(cache.get(key));
  }

  if (queueDepth >= MAX_QUEUE_DEPTH) {
    var busy = new Error("Too many geocode lookups are already queued.");
    busy.code = "GEOCODER_BUSY";
    return Promise.reject(busy);
  }

  queueDepth += 1;
  queue = queue
    .then(function() {
      var sinceLast = Date.now() - lastRequestAt;
      return sinceLast < MIN_INTERVAL_MS ? wait(MIN_INTERVAL_MS - sinceLast) : null;
    })
    .then(function() {
      lastRequestAt = Date.now();
      return fetchLocation(postalCode, city);
    })
    .then(function(location) {
      remember(key, location);
      return location;
    });

  // Keep one failed lookup from poisoning every request queued behind it, and
  // free the slot whichever way this lookup ends.
  var result = queue;
  queue = queue.catch(function() {});
  return result.finally(function() {
    queueDepth -= 1;
  });
};
