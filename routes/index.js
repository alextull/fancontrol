var express = require('express');
var pad = require('pad-number');
var roundTo = require('round-to');
var router = express.Router();
var config = require('../config.js');
var logger = require('../logger');

// set DEBUG=express:* & npm start

router.get('/*', function(req, res, next) {
  res.setHeader('Last-Modified', (new Date()).toUTCString());
  next();
});

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { fanState: req.app.get('fanState') });
});

router.post('/fanStateOff', function(req, res, next) {
  req.app.get('zwiftAdapter').stopPolling();
  req.app.set('fanState', 0);
  req.app.set('fanLevel', 0);
  res.render('index', { fanState: 0 });
  logger.debug("/fanStateOff fanState: " + req.app.get('fanState') + ", fanLevel: [" + req.app.get('fanLevel') + "]");
});

router.post('/fanStateLevel1', function(req, res, next) {
  req.app.get('zwiftAdapter').stopPolling();
  req.app.set('fanState', 1);
  req.app.set('fanLevel', 1);
  res.render('index', { fanState: 1 });
  logger.debug("/fanStateLevel1 fanState: " + req.app.get('fanState') + ", fanLevel: [" + req.app.get('fanLevel') + "]");
});

router.post('/fanStateLevel2', function(req, res, next) {
  req.app.get('zwiftAdapter').stopPolling();
  req.app.set('fanState', 2);
  req.app.set('fanLevel', 2);
  res.render('index', { fanState: 2 });
  logger.debug("/fanStateLevel2 fanState: " + req.app.get('fanState') + ", fanLevel: [" + req.app.get('fanLevel') + "]");
});

router.post('/fanStateLevel3', function(req, res, next) {
  req.app.get('zwiftAdapter').stopPolling();
  req.app.set('fanState', 3);
  req.app.set('fanLevel', 3);
  res.render('index', { fanState: 3 });
  logger.debug("/fanStateLevel3 fanState: " + req.app.get('fanState') + ", fanLevel: [" + req.app.get('fanLevel') + "]");
});

router.post('/fanStateZwiftSim', function(req, res, next) {
  req.app.get('zwiftAdapter').startPolling();
  req.app.set('fanState', 4);
  res.render('index', { fanState: 4 });
  logger.debug("/fanStateZwiftSim fanState: " + req.app.get('fanState') + ", fanLevel: [" + req.app.get('fanLevel') + "]");
});

router.post('/fanStateZwiftWrkt', function(req, res, next) {
  req.app.get('zwiftAdapter').startPolling();
  req.app.set('fanState', 5);
  res.render('index', { fanState: 5 });
  logger.debug("/fanStateZwiftWrkt fanState: " + req.app.get('fanState') + ", fanLevel: [" + req.app.get('fanLevel') + "]");
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
  var fanState = req.app.get('fanState');
  var fanLevel = req.app.get('fanLevel');
  var speed = 0;
  var power = 0;
  var heartrate = 0;

  logger.debug("/getFanLevel fanState: " + fanState + ", fanLevel: [" + fanLevel + "]");

  if (fanState === 4 || fanState === 5) {
    try {
      var zwiftAdapter = req.app.get('zwiftAdapter');
      speed = zwiftAdapter.getSpeed();
      power = zwiftAdapter.getPower();
      heartrate = zwiftAdapter.getHeartrate();

      var newLevel = fanState === 4
        ? calcFanLevelBySpeed(speed)
        : calcFanLevelByPower(speed, heartrate, power);

      if (newLevel !== null) {
        fanLevel = newLevel;
        req.app.set('fanLevel', fanLevel);
      }

      logger.debug("/getFanLevel fanState: " + fanState + ", fanLevel: [" + fanLevel + "], hr: " + heartrate + ", speed: " + speed + ", power: " + power);
    } catch (err) {
      logger.error(err);
    }
  }

  res.send(
    'FCS' + fanState
    + 'FLV' + fanLevel
    + 'PWR' + pad(power, 4)
    + 'HR' + pad(heartrate, 3)
    + 'SPD' + pad(roundTo(speed, 1), 5)
  );
});

module.exports = router;
