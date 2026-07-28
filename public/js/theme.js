// Which theme the page is in, and the button that changes it.
//
// Loaded from <head> without defer, on purpose. The stored preference has to be
// on <html> before the body paints, or a visitor who chose light gets a frame of
// dark first — the flash this file exists to prevent. It is small, it has no
// dependencies, and it does not touch the DOM beyond the root element until the
// document is ready, so blocking on it costs a parse rather than a render.
//
// Dark is the default and lives unqualified on :root in stylesheets/base.css, so
// a visitor who has never chosen — and a visitor with JavaScript turned off —
// gets dark rather than nothing.
(function() {
  "use strict";

  var KEY = "mutuo-theme";
  var DARK = "dark";
  var LIGHT = "light";

  // Private browsing modes throw on access rather than returning null, and a
  // theme is not worth breaking a page over.
  function stored() {
    try {
      var value = window.localStorage.getItem(KEY);
      return value === LIGHT || value === DARK ? value : null;
    } catch (err) {
      return null;
    }
  }

  function remember(theme) {
    try {
      window.localStorage.setItem(KEY, theme);
    } catch (err) {
      // Nothing to do: the theme still applies for this page.
    }
  }

  // Deliberately not consulting prefers-color-scheme. Dark is the default here
  // rather than a guess at what the visitor's system wants, and light is
  // something they ask for.
  function current() {
    return document.documentElement.getAttribute("data-theme") === LIGHT
      ? LIGHT
      : DARK;
  }

  function apply(theme) {
    if (theme === LIGHT) {
      document.documentElement.setAttribute("data-theme", LIGHT);
    } else {
      // Removed rather than set to "dark", so the default in the stylesheet is
      // what applies and there is only one way to express it.
      document.documentElement.removeAttribute("data-theme");
    }

    // The button offers the theme you are not in, and says so.
    var next = theme === LIGHT ? "dark" : "light";
    var buttons = document.querySelectorAll("[data-theme-toggle]");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute("aria-label", "Switch to " + next + " theme");
      buttons[i].setAttribute("title", "Switch to " + next + " theme");
    }
  }

  // Before anything renders.
  apply(stored() || DARK);

  document.addEventListener("DOMContentLoaded", function() {
    // Again once the buttons exist, so their labels are right. The root element
    // already has the attribute, so this repaints nothing.
    apply(current());

    document.addEventListener("click", function(event) {
      var button = event.target.closest && event.target.closest("[data-theme-toggle]");
      if (!button) {
        return;
      }
      var next = current() === LIGHT ? DARK : LIGHT;
      apply(next);
      remember(next);
    });
  });
})();
