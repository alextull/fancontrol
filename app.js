var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var mlogger = require('morgan');
var cookieParser = require('cookie-parser');
var config = require('./config');
var ZwiftAdapter = require('./ZwiftAdapter');
var logger = require('./logger');
var csrf = require('./csrf');
var fanState = require('./state');
var particleEvents = require('./particle-events');

var index = require('./routes/index');

var app = express();

// set favicon
app.use(favicon(path.join(__dirname, 'public', './images/favicon.ico')));

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

// Morgan HTTP request logger — skip the high-frequency Photon poll (/getFanLevel)
// to avoid log spam; that route has its own dedicated logger below.
app.use(mlogger('dev', {
  skip: function(req) { return req.path === '/getFanLevel'; }
}));

// Dedicated logger for Photon poll requests: logs IP, status and latency at debug level.
app.use('/getFanLevel', function(req, res, next) {
  var start = Date.now();
  res.on('finish', function() {
    logger.debug('[PHOTON] GET /getFanLevel ' + res.statusCode + ' ' + (Date.now() - start) + 'ms from ' + req.ip);
  });
  next();
});

// S4: Shared-secret authentication for the Photon-only /getFanLevel endpoint.
// The Photon must send the header: X-Photon-Secret: <value of PHOTON_SECRET env var>
// If PHOTON_SECRET is not set, the check is skipped (dev/test convenience).
app.use('/getFanLevel', function(req, res, next) {
  var secret = process.env.PHOTON_SECRET;
  if (!secret) return next(); // not configured — skip check
  if (req.headers['x-photon-secret'] !== secret) {
    logger.warn('[PHOTON] /getFanLevel rejected: missing or invalid X-Photon-Secret from ' + req.ip);
    return res.status(403).send('Forbidden');
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// CSRF protection — must come after cookieParser and body parsers,
// and before any route that handles POST requests.
// The /getFanLevel route is a Photon-only GET endpoint and is exempt.
app.use(csrf);

app.use('/', index);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  var err = new Error('Not Found');
  err.status = 404;
  next(err);
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

// Load persisted fan state (defaults to 0/0 on first run)
fanState.load();

app.set('zwiftAdapter', new ZwiftAdapter(config.username, config.password, config.playerId));

// Start Particle Cloud event forwarding (opt-in — requires PARTICLE_DEVICE_ID
// and PARTICLE_ACCESS_TOKEN in .env; does nothing if either is missing).
particleEvents.start();

logger.info("FanControl app starting");
module.exports = app;
