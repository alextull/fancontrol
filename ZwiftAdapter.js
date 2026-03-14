const ZwiftAccount = require("zwift-mobile-api");
var logger = require('./logger');

class ZwiftAdapter {
    constructor(username, password, playerId) {
        logger.debug("ZwiftAdapter.constructor()");
        this.account = new ZwiftAccount(username, password);
        this.playerId = playerId;
        this.speed = 0;
        this.power = 0;
        this.heartrate = 0;

        // Start polling Zwift for rider status every 2 seconds
        this._poll();
        this._interval = setInterval(() => this._poll(), 2000);
    }

    _poll() {
        this.account.getWorld(1).riderStatus(this.playerId)
            .then(status => {
                this.updateSpeed(status.speed / 1000000, status.heartrate, status.power);
            })
            .catch(error => {
                logger.error("couldn't resolve promise riderStatus: " + error);
            });
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
    }

    stop() {
        clearInterval(this._interval);
    }
}

module.exports = ZwiftAdapter;
