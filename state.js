/**
 * state.js — shared fan state module
 *
 * Holds fanState and fanLevel in a plain object and persists them to
 * fanstate.json on every change. Using a dedicated module avoids the
 * need to monkey-patch app.set / read app.settings internals.
 *
 * Atomic write strategy: write to a .tmp file first, then rename.
 * rename(2) is atomic on POSIX, so a crash mid-write can never leave
 * a corrupt state file.
 */

var fs   = require('fs');
var path = require('path');
var logger = require('./logger');

var STATE_FILE = path.join(__dirname, 'fanstate.json');
var TMP_FILE   = STATE_FILE + '.tmp';

var state = {
    fanState: 0,
    fanLevel: 0
};

/**
 * Load persisted state from disk.
 * Called once at startup; returns the state object for chaining.
 */
function load() {
    try {
        var data = fs.readFileSync(STATE_FILE, 'utf8');
        var saved = JSON.parse(data);
        state.fanState = Number.isInteger(saved.fanState) ? saved.fanState : 0;
        state.fanLevel = Number.isInteger(saved.fanLevel) ? saved.fanLevel : 0;
        logger.info('state: restored fanState=' + state.fanState + ', fanLevel=' + state.fanLevel);
    } catch (e) {
        // File missing or corrupt — start from defaults (0/0)
        logger.info('state: no saved state found, starting with defaults (fanState=0, fanLevel=0)');
    }
    return state;
}

/**
 * Persist current state to disk atomically.
 */
function save() {
    try {
        fs.writeFileSync(TMP_FILE, JSON.stringify({ fanState: state.fanState, fanLevel: state.fanLevel }), 'utf8');
        fs.renameSync(TMP_FILE, STATE_FILE);
    } catch (e) {
        logger.error('state: failed to save state: ' + e.message);
    }
}

/**
 * Set fanState and persist.
 */
function setFanState(value) {
    state.fanState = value;
    save();
}

/**
 * Set fanLevel and persist.
 */
function setFanLevel(value) {
    state.fanLevel = value;
    save();
}

/**
 * Set both fanState and fanLevel in one write.
 */
function setState(fanState, fanLevel) {
    state.fanState = fanState;
    state.fanLevel = fanLevel;
    save();
}

module.exports = { state, load, save, setFanState, setFanLevel, setState };
