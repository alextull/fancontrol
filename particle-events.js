/**
 * particle-events.js
 *
 * Subscribes to the Particle Cloud SSE event stream and forwards any
 * "fancontrol/*" events to the Winston logger.
 *
 * Required environment variables (set in .env):
 *   PARTICLE_DEVICE_ID    — the Photon device ID (24-char hex string)
 *   PARTICLE_ACCESS_TOKEN — an API user token for the product
 *   PARTICLE_PRODUCT_ID   — the product ID or slug (e.g. my-fancontrol-43693)
 *                           visible in the Particle console URL:
 *                           console.particle.io/{product-slug}/devices
 *
 * If PARTICLE_DEVICE_ID or PARTICLE_ACCESS_TOKEN is missing the module does
 * nothing (opt-in feature).
 *
 * Why /v1/products/:product/events/ instead of /v1/devices/:id/events/?
 *   The per-device SSE endpoint (/v1/devices/:id/events/) is restricted to
 *   full Particle user tokens.  API user tokens (created in the Particle
 *   console under "API Users") receive the error:
 *     "API users are not allowed to call this endpoint"
 *   The global /v1/events/ endpoint also returns 403 for API user tokens.
 *   The product event stream (/v1/products/:product/events/:prefix) is the
 *   correct endpoint for API user tokens scoped to a product.
 *   We filter client-side by coreid so we only process events from our Photon.
 *
 * Why a custom fetch wrapper?
 *   eventsource v4 uses the Fetch API internally and does not expose a
 *   `headers` constructor option.  The only supported extension point is a
 *   custom `fetch` function passed as `eventSourceInitDict.fetch`.  We use
 *   this to inject the Authorization header on every request (including
 *   reconnects) without leaking the token in the URL.
 *
 * Event format published by the Photon:
 *   name:    "fancontrol/log" | "fancontrol/warn" | "fancontrol/error"
 *   payload: JSON envelope { data, ttl, published_at, coreid }
 *            where data is a plain-text log message, e.g.
 *            "fan level changed 0 -> 2"
 */

var EventSource = require('eventsource').EventSource;
var logger = require('./logger');

var RECONNECT_DELAY_MS = 5000;   // wait before reconnecting after an error
var PREFIX = '[PHOTON] ';

function start() {
    var deviceId  = process.env.PARTICLE_DEVICE_ID;
    var token     = process.env.PARTICLE_ACCESS_TOKEN;
    var productId = process.env.PARTICLE_PRODUCT_ID;

    if (!deviceId || !token) {
        logger.info('particle-events: PARTICLE_DEVICE_ID or PARTICLE_ACCESS_TOKEN not set — Photon log forwarding disabled');
        return;
    }

    var url;
    if (productId) {
        // Product event stream — works with API user tokens scoped to the product
        url = 'https://api.particle.io/v1/products/' + productId + '/events/fancontrol';
    } else {
        // Fallback: global event stream — requires a full user token (not API user token)
        url = 'https://api.particle.io/v1/events/fancontrol';
        logger.warn('particle-events: PARTICLE_PRODUCT_ID not set — falling back to global event stream (requires full user token, not API user token)');
    }

    connect(url, token, deviceId);
}

function connect(url, token, deviceId) {
    logger.info('particle-events: connecting to Particle event stream...');

    // eventsource v4 uses the Fetch API internally and does not accept a
    // `headers` option directly.  We inject the Authorization header by
    // supplying a custom fetch wrapper via the `fetch` init option.
    function authorizedFetch(input, init) {
        var headers = new Headers(init && init.headers);
        headers.set('Authorization', 'Bearer ' + token);
        return fetch(input, Object.assign({}, init, { headers: headers }));
    }

    var es = new EventSource(url, { fetch: authorizedFetch });

    function handleEvent(level, e) {
        try {
            // Particle wraps the payload in a JSON envelope:
            // { data, ttl, published_at, coreid }
            var envelope = JSON.parse(e.data);

            // Filter: only process events from our own device
            if (envelope.coreid && envelope.coreid !== deviceId) {
                return;
            }

            var msg = envelope.data || e.data;
            logger[level](PREFIX + msg);
        } catch (_) {
            // Fallback: log raw data if JSON parse fails
            logger[level](PREFIX + e.data);
        }
    }

    es.addEventListener('fancontrol/log',   function(e) { handleEvent('info',  e); });
    es.addEventListener('fancontrol/warn',  function(e) { handleEvent('warn',  e); });
    es.addEventListener('fancontrol/error', function(e) { handleEvent('error', e); });

    es.onerror = function(err) {
        var detail = '';
        if (err) {
            if (err.status)  detail += ' status=' + err.status;
            if (err.message) detail += ' message=' + err.message;
            if (err.type)    detail += ' type=' + err.type;
        }
        logger.warn('particle-events: SSE connection error' + (detail || ' (no detail)') + ' — reconnecting in ' + (RECONNECT_DELAY_MS / 1000) + 's');
        es.close();
        setTimeout(function() { connect(url, token, deviceId); }, RECONNECT_DELAY_MS);
    };

    es.onopen = function() {
        logger.info('particle-events: connected — listening for Photon log events');
    };
}

module.exports = { start };
