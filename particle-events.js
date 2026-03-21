/**
 * particle-events.js
 *
 * Subscribes to the Particle Cloud SSE event stream and forwards any
 * "fancontrol/*" events to the Winston logger.
 *
 * Required environment variables (set in .env):
 *   PARTICLE_DEVICE_ID    — the Photon device ID (24-char hex string)
 *   PARTICLE_ACCESS_TOKEN — a Particle access token (user token or API user
 *                           token with at least the devices:get scope)
 *
 * If either variable is missing the module does nothing (opt-in feature).
 *
 * Why /v1/events/ instead of /v1/devices/:id/events/?
 *   The per-device SSE endpoint (/v1/devices/:id/events/) is restricted to
 *   full Particle user tokens.  API user tokens (created in the Particle
 *   console under "API Users") receive the error:
 *     "API users are not allowed to call this endpoint"
 *   The global event stream (/v1/events/:prefix) works with both token types.
 *   We filter server-side by the "fancontrol" prefix and client-side by the
 *   device's coreid so we only process events from our own Photon.
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
    var deviceId = process.env.PARTICLE_DEVICE_ID;
    var token    = process.env.PARTICLE_ACCESS_TOKEN;

    if (!deviceId || !token) {
        logger.info('particle-events: PARTICLE_DEVICE_ID or PARTICLE_ACCESS_TOKEN not set — Photon log forwarding disabled');
        return;
    }

    // Use the global event stream filtered by the "fancontrol" prefix.
    // This endpoint is accessible to both full user tokens and API user tokens,
    // unlike the per-device endpoint (/v1/devices/:id/events/).
    // The token is passed in the Authorization header (not the query string)
    // to avoid leaking it in server logs and URLs.
    var url = 'https://api.particle.io/v1/events/fancontrol';

    connect(url, token, deviceId);
}

function connect(url, token, deviceId) {
    logger.info('particle-events: connecting to Particle event stream...');

    var es = new EventSource(url, {
        headers: { 'Authorization': 'Bearer ' + token }
    });

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
