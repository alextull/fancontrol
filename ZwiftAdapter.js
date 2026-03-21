const ZwiftAccount = require("zwift-mobile-api");
var logger = require('./logger');

// If Zwift data is older than this, /getFanLevel will treat it as stale
// and return fan level 0 (safe off) rather than acting on outdated values.
const STALE_THRESHOLD_MS = 10000; // 10 seconds

class ZwiftAdapter {
    constructor(username, password, playerId) {
        logger.debug("ZwiftAdapter.constructor()");
        this.account = new ZwiftAccount(username, password);
        this.playerId = playerId;
        this.speed = 0;
        this.power = 0;
        this.heartrate = 0;
        this.lastUpdated = null;  // null until first successful poll
        this._interval = null;
    }

    startPolling() {
        if (this._interval) return; // already polling
        logger.debug("ZwiftAdapter: starting poll interval");
        this._poll();
        this._interval = setInterval(() => this._poll(), 2000);
    }

    stopPolling() {
        if (!this._interval) return;
        logger.debug("ZwiftAdapter: stopping poll interval");
        clearInterval(this._interval);
        this._interval = null;
        this.lastUpdated = null;  // reset staleness on stop
    }

    _poll() {
        this.account.getWorld(1).riderStatus(this.playerId)
            .then(status => {
                this.updateSpeed(status.speed / 1000000, status.heartrate, status.power);
            })
            .catch(error => {
                const statusCode = error && error.response && error.response.status;
                if (statusCode === 404) {
                    logger.debug("ZwiftAdapter: player " + this.playerId + " is not currently riding (404)");
                } else if (statusCode === 403) {
                    logger.warn("ZwiftAdapter: riderStatus returned 403 Forbidden — Zwift has restricted access to this endpoint. Stopping polling.");
                    this.stopPolling();
                } else if (statusCode === 401) {
                    logger.warn("ZwiftAdapter: riderStatus returned 401 Unauthorized — check Zwift credentials.");
                } else {
                    logger.error("ZwiftAdapter: riderStatus error: " + error);
                }
            });
    }

    /**
     * Returns true if the last successful data update is within STALE_THRESHOLD_MS.
     */
    isDataFresh() {
        if (this.lastUpdated === null) return false;
        return (Date.now() - this.lastUpdated) < STALE_THRESHOLD_MS;
    }

    getSpeed() {
        return this.speed;
    }

    getPower() {
        return this.power;
    }

    getHeartrate() {
        return this.heartrate;
    }

    updateSpeed(spd, hr, pwr) {
        logger.debug('updateSpeed() new speed: ' + spd + ' hr: ' + hr + ' pwr: ' + pwr);
        this.speed = spd;
        this.heartrate = hr;
        this.power = pwr;
        this.lastUpdated = Date.now();
    }
}

module.exports = ZwiftAdapter;
