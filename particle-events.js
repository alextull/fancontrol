/**
 * particle-events.js
 *
 * Subscribes to the Particle Cloud SSE event stream for this device and
 * forwards any "fancontrol/log" events to the Winston logger.
 *
 * Required environment variables (set in .env):
 *   PARTICLE_DEVICE_ID    — the Photon device ID (24-char hex string)
 *   PARTICLE_ACCESS_TOKEN — a Particle access token with read:devices scope
 *
 * If either variable is missing the module does nothing (opt-in feature).
 *
 * Event format published by the Photon:
 *   name:    "fancontrol/log"
 *   payload: plain-text log message, e.g. "fan level changed 0 -> 2"
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

    var url = 'https://api.particle.io/v1/devices/' + deviceId + '/events/fancontrol'
            + '?access_token=' + token;

    connect(url);
}

function connect(url) {
    logger.info('particle-events: connecting to Particle event stream...');

    var es = new EventSource(url);

    es.addEventListener('fancontrol/log', function(e) {
        try {
            // Particle wraps the payload in a JSON envelope: { data, ttl, published_at, coreid }
            var envelope = JSON.parse(e.data);
            var msg = envelope.data || e.data;
            logger.info(PREFIX + msg);
        } catch (_) {
            // Fallback: log raw data if JSON parse fails
            logger.info(PREFIX + e.data);
        }
    });

    es.addEventListener('fancontrol/warn', function(e) {
        try {
            var envelope = JSON.parse(e.data);
            logger.warn(PREFIX + (envelope.data || e.data));
        } catch (_) {
            logger.warn(PREFIX + e.data);
        }
    });

    es.addEventListener('fancontrol/error', function(e) {
        try {
            var envelope = JSON.parse(e.data);
            logger.error(PREFIX + (envelope.data || e.data));
        } catch (_) {
            logger.error(PREFIX + e.data);
        }
    });

    es.onerror = function(err) {
        logger.warn('particle-events: SSE connection error — reconnecting in ' + (RECONNECT_DELAY_MS / 1000) + 's');
        es.close();
        setTimeout(function() { connect(url); }, RECONNECT_DELAY_MS);
    };

    es.onopen = function() {
        logger.info('particle-events: connected — listening for Photon log events');
    };
}

module.exports = { start };
