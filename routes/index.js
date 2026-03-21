var express = require('express');
var pad = require('pad-number');
var roundTo = require('round-to');
var router = express.Router();
var config = require('../config.js');
var logger = require('../logger');
var fanState = require('../state');

router.get('/*', function(req, res, next) {
  res.setHeader('Last-Modified', (new Date()).toUTCString());
  next();
});

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', {
    fanState: fanState.state.fanState,
    csrfToken: res.locals.csrfToken
  });
});

router.post('/fanStateOff', function(req, res, next) {
  req.app.get('zwiftAdapter').stopPolling();
  fanState.setState(0, 0);
  logger.info('/fanStateOff fanState=0, fanLevel=0');
  res.redirect('/');
});

router.post('/fanStateLevel1', function(req, res, next) {
  req.app.get('zwiftAdapter').stopPolling();
  fanState.setState(1, 1);
  logger.info('/fanStateLevel1 fanState=1, fanLevel=1');
  res.redirect('/');
});

router.post('/fanStateLevel2', function(req, res, next) {
  req.app.get('zwiftAdapter').stopPolling();
  fanState.setState(2, 2);
  logger.info('/fanStateLevel2 fanState=2, fanLevel=2');
  res.redirect('/');
});

router.post('/fanStateLevel3', function(req, res, next) {
  req.app.get('zwiftAdapter').stopPolling();
  fanState.setState(3, 3);
  logger.info('/fanStateLevel3 fanState=3, fanLevel=3');
  res.redirect('/');
});

router.post('/fanStateZwiftSim', function(req, res, next) {
  req.app.get('zwiftAdapter').startPolling();
  fanState.setFanState(4);
  logger.info('/fanStateZwiftSim fanState=4, fanLevel=' + fanState.state.fanLevel);
  res.redirect('/');
});

router.post('/fanStateZwiftWrkt', function(req, res, next) {
  req.app.get('zwiftAdapter').startPolling();
  fanState.setFanState(5);
  logger.info('/fanStateZwiftWrkt fanState=5, fanLevel=' + fanState.state.fanLevel);
  res.redirect('/');
});

/**
 * Calculate fan level based on speed (Zwift simulation mode).
 */
function calcFanLevelBySpeed(speed) {
  if (Number.isNaN(speed)) return null;
  if (speed < config.speedLevel1) return 0;
  if (speed < config.speedLevel2) return 1;
  if (speed < config.speedLevel3) return 2;
  return 3;
}

/**
 * Calculate fan level based on heartrate and power (Zwift workout mode).
 */
function calcFanLevelByPower(speed, heartrate, power) {
  if (Number.isNaN(speed) || Number.isNaN(heartrate) || heartrate <= config.heartrate) return 0;
  if (power < config.powerLevel1) return 0;
  if (power < config.powerLevel2) return 1;
  if (power < config.powerLevel3) return 2;
  return 3;
}

router.get('/getFanLevel', function(req, res, next) {
  var currentFanState = fanState.state.fanState;
  var prevLevel = fanState.state.fanLevel;
  var fanLevel = prevLevel;
  var speed = 0;
  var power = 0;
  var heartrate = 0;

  if (currentFanState === 4 || currentFanState === 5) {
    try {
      var zwiftAdapter = req.app.get('zwiftAdapter');

      if (!zwiftAdapter.isDataFresh()) {
        // Zwift data is stale (no successful poll within 10 s) — safe off
        logger.warn('/getFanLevel: Zwift data is stale, returning fan level 0');
        fanLevel = 0;
        fanState.setFanLevel(fanLevel);
      } else {
        speed = zwiftAdapter.getSpeed();
        power = zwiftAdapter.getPower();
        heartrate = zwiftAdapter.getHeartrate();

        var newLevel = currentFanState === 4
          ? calcFanLevelBySpeed(speed)
          : calcFanLevelByPower(speed, heartrate, power);

        if (newLevel !== null) {
          fanLevel = newLevel;
          fanState.setFanLevel(fanLevel);
        }
      }
    } catch (err) {
      logger.error('/getFanLevel: error reading Zwift data: ' + err);
    }
  }

  // In Zwift modes, always log speed/power/heartrate at info level so they appear in console
  if (currentFanState === 4 || currentFanState === 5) {
    var levelTag = fanLevel !== prevLevel
      ? ' [LEVEL CHANGED ' + prevLevel + ' -> ' + fanLevel + ']'
      : '';
    logger.info('/getFanLevel: state=' + currentFanState + ', fanLevel=' + fanLevel
      + ', spd=' + roundTo(speed, 1) + ', hr=' + heartrate + ', pwr=' + power + levelTag);
  } else if (fanLevel !== prevLevel) {
    logger.info('/getFanLevel: fan level changed ' + prevLevel + ' -> ' + fanLevel
      + ' [state=' + currentFanState + ']');
  }

  var payload = 'FCS' + currentFanState
    + 'FLV' + fanLevel
    + 'PWR' + pad(power, 4)
    + 'HR'  + pad(heartrate, 3)
    + 'SPD' + pad(roundTo(speed, 1), 5);

  // Log the exact payload sent back to the Photon at debug level
  logger.debug('/getFanLevel -> Photon: "' + payload + '"');

  res.send(payload + '\n');
});

module.exports = router;
