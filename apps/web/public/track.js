/**
 * Behavioral tracker for public landing pages.
 * FADP-compliant: no IP stored, first-party UUID cookie only.
 * Fires only after visitor accepts the consent banner (__tc=1 cookie).
 * Batches events and POSTs to /api/track every 5s or on page unload.
 *
 * Injected by the public page renderer as:
 *   <script src="/track.js" data-tenant="<tenantSlug>" defer></script>
 */
(function () {
  "use strict";

  // ─── Config ────────────────────────────────────────────────────────────────

  var ENDPOINT = "/api/track";
  var BATCH_INTERVAL = 5000; // ms
  var COOKIE_AID = "__tid"; // anonymous tracker id
  var COOKIE_CONSENT = "__tc"; // consent flag set by banner

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function getCookie(name) {
    var m = document.cookie.match("(^|;)\\s*" + name + "\\s*=\\s*([^;]+)");
    return m ? m[2] : null;
  }

  function setCookie(name, value, days) {
    var expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = name + "=" + value + "; expires=" + expires + "; path=/; SameSite=Lax";
  }

  function uuidv4() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  // ─── Consent gate ──────────────────────────────────────────────────────────
  // Do NOT track unless consent cookie is set. The consent banner sets __tc=1.

  function hasConsent() {
    return getCookie(COOKIE_CONSENT) === "1";
  }

  // ─── Anonymous ID ─────────────────────────────────────────────────────────
  // Persists for 365 days in a first-party cookie. Not linked to an identity
  // until the contact submits a form (server-side link).

  function getAnonymousId() {
    var aid = getCookie(COOKIE_AID);
    if (!aid) {
      aid = uuidv4();
      setCookie(COOKIE_AID, aid, 365);
    }
    return aid;
  }

  // ─── Event queue ──────────────────────────────────────────────────────────

  var queue = [];
  var tenantSlug = "";
  var anonymousId = "";
  var activeForms = {};

  function push(type, props) {
    if (!hasConsent()) return;
    // Include experiment variant_id in every event if an A/B test is running.
    var extraProps = {};
    if (window.__variantId) extraProps.variant_id = window.__variantId;
    queue.push({
      type: type,
      pageUrl: location.href.slice(0, 2000),
      referrer: document.referrer.slice(0, 2000) || undefined,
      properties: Object.assign({}, extraProps, props || {}),
    });
  }

  // ─── Flush ────────────────────────────────────────────────────────────────

  function flush() {
    if (!queue.length || !tenantSlug || !anonymousId) return;
    var batch = queue.splice(0, queue.length);
    var payload = JSON.stringify({ t: tenantSlug, aid: anonymousId, events: batch });

    // Use sendBeacon on unload (guaranteed delivery); fetch otherwise.
    if (typeof navigator.sendBeacon === "function" && document.visibilityState === "hidden") {
      navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: "application/json" }));
    } else {
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(function () {}); // best-effort
    }
  }

  // ─── Scroll tracking ──────────────────────────────────────────────────────

  var fired50 = false;
  var fired90 = false;

  function onScroll() {
    var scrolled = window.scrollY + window.innerHeight;
    var total = document.documentElement.scrollHeight;
    if (!total) return;
    var pct = (scrolled / total) * 100;
    if (!fired50 && pct >= 50) {
      fired50 = true;
      push("scroll_50");
    }
    if (!fired90 && pct >= 90) {
      fired90 = true;
      push("scroll_90");
    }
  }

  // ─── Time on page ─────────────────────────────────────────────────────────

  var time30Fired = false;

  function scheduleTime30() {
    setTimeout(function () {
      if (!time30Fired) {
        time30Fired = true;
        push("time_30s");
      }
    }, 30000);
  }

  // ─── CTA click tracking ───────────────────────────────────────────────────

  function onBodyClick(e) {
    var el = e.target;
    // Walk up to find a link or button with data-track="cta"
    while (el && el !== document.body) {
      if (el.dataset && el.dataset.track === "cta") {
        push("cta_click", { label: el.innerText ? el.innerText.slice(0, 80) : undefined });
        return;
      }
      el = el.parentElement;
    }
  }

  // ─── Form view tracking ───────────────────────────────────────────────────

  function trackFormViews() {
    var forms = document.querySelectorAll("form");
    forms.forEach(function (form) {
      var fired = false;
      form.addEventListener(
        "focusin",
        function () {
          if (!fired) {
            fired = true;
            push("form_view", { form_slug: form.getAttribute("data-form-slug") || undefined });
          }
        },
        { once: true },
      );
    });
  }

  // ─── Init ─────────────────────────────────────────────────────────────────

  function init() {
    // Get tenant slug from the script tag's data-tenant attribute.
    var scripts = document.querySelectorAll("script[data-tenant]");
    var scriptEl = scripts[scripts.length - 1];
    if (!scriptEl) return;
    tenantSlug = scriptEl.getAttribute("data-tenant") || "";
    if (!tenantSlug) return;

    if (!hasConsent()) {
      // Wait for consent: listen for the custom event dispatched by the banner.
      document.addEventListener(
        "__tc_accepted",
        function () {
          anonymousId = getAnonymousId();
          startTracking();
        },
        { once: true },
      );
      return;
    }

    anonymousId = getAnonymousId();
    startTracking();
  }

  // ─── Form submit tracking ─────────────────────────────────────────────────
  // Listens for the __form_submit custom event dispatched by lead-form.tsx.
  // Used to count conversions in A/B experiments.

  function listenFormSubmit() {
    window.addEventListener("__form_start", function (e) {
      var detail = e && e.detail ? e.detail : {};
      if (detail.formSlug) activeForms[detail.formSlug] = true;
      push("form_start", {
        form_slug: detail.formSlug || undefined,
        field_name: detail.fieldName || undefined,
      });
    });

    window.addEventListener("__form_step_view", function (e) {
      var detail = e && e.detail ? e.detail : {};
      push("form_step_view", {
        form_slug: detail.formSlug || undefined,
        step_index: detail.stepIndex,
        step_title: detail.stepTitle || undefined,
      });
    });

    window.addEventListener("__form_step_complete", function (e) {
      var detail = e && e.detail ? e.detail : {};
      push("form_step_complete", {
        form_slug: detail.formSlug || undefined,
        step_index: detail.stepIndex,
        step_title: detail.stepTitle || undefined,
      });
    });

    window.addEventListener("__form_submit", function (e) {
      var detail = e && e.detail ? e.detail : {};
      if (detail.formSlug) delete activeForms[detail.formSlug];
      push("form_submit", { form_slug: detail.formSlug || undefined });
    });

    window.addEventListener("pagehide", function () {
      Object.keys(activeForms).forEach(function (formSlug) {
        push("form_abandon", { form_slug: formSlug });
      });
      activeForms = {};
    });
  }

  function startTracking() {
    push("page_view");
    scheduleTime30();
    window.addEventListener("scroll", onScroll, { passive: true });
    document.body.addEventListener("click", onBodyClick, { capture: false });
    trackFormViews();
    listenFormSubmit();
    // Flush on interval + page hide.
    setInterval(flush, BATCH_INTERVAL);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") flush();
    });
    window.addEventListener("pagehide", flush);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
