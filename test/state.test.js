/**
 * test/state.test.js
 * Tests for the fan state persistence module (state.js).
 *
 * We redirect fs calls to a temp directory so tests never touch the real
 * fanstate.json. We save the original fs methods before mocking them.
 */
'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// Create a temp dir once for this test file
const tmpDir     = fs.mkdtempSync(path.join(os.tmpdir(), 'fancontrol-state-test-'));
const STATE_FILE = path.join(tmpDir, 'fanstate.json');
const TMP_FILE   = STATE_FILE + '.tmp';

// Save originals BEFORE any mocking
const realWriteFileSync = fs.writeFileSync.bind(fs);
const realRenameSync    = fs.renameSync.bind(fs);
const realReadFileSync  = fs.readFileSync.bind(fs);
const realExistsSync    = fs.existsSync.bind(fs);

let fanState;

beforeAll(() => {
    jest.spyOn(fs, 'writeFileSync').mockImplementation((filePath, data, enc) => {
        const redirected = filePath.endsWith('fanstate.json.tmp') ? TMP_FILE
                         : filePath.endsWith('fanstate.json')     ? STATE_FILE
                         : filePath;
        realWriteFileSync(redirected, data, enc);
    });

    jest.spyOn(fs, 'renameSync').mockImplementation((src, dest) => {
        const rSrc  = src.endsWith('fanstate.json.tmp')  ? TMP_FILE   : src;
        const rDest = dest.endsWith('fanstate.json')     ? STATE_FILE : dest;
        realRenameSync(rSrc, rDest);
    });

    jest.spyOn(fs, 'readFileSync').mockImplementation((filePath, enc) => {
        const redirected = filePath.endsWith('fanstate.json') ? STATE_FILE : filePath;
        return realReadFileSync(redirected, enc);
    });

    jest.spyOn(fs, 'existsSync').mockImplementation((filePath) => {
        const redirected = filePath.endsWith('fanstate.json') ? STATE_FILE : filePath;
        return realExistsSync(redirected);
    });

    fanState = require('../state');
});

afterEach(() => {
    fanState.setState(0, 0);
    [STATE_FILE, TMP_FILE].forEach(f => { try { fs.unlinkSync(f); } catch (_) {} });
});

afterAll(() => {
    jest.restoreAllMocks();
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
});

describe('state module', () => {
    describe('initial state', () => {
        test('starts with fanState=0 and fanLevel=0', () => {
            expect(fanState.state.fanState).toBe(0);
            expect(fanState.state.fanLevel).toBe(0);
        });
    });

    describe('setFanState()', () => {
        test('updates fanState in memory', () => {
            fanState.setFanState(4);
            expect(fanState.state.fanState).toBe(4);
        });

        test('persists fanState to disk', () => {
            fanState.setFanState(5);
            const saved = JSON.parse(realReadFileSync(STATE_FILE, 'utf8'));
            expect(saved.fanState).toBe(5);
        });
    });

    describe('setFanLevel()', () => {
        test('updates fanLevel in memory', () => {
            fanState.setFanLevel(3);
            expect(fanState.state.fanLevel).toBe(3);
        });

        test('persists fanLevel to disk', () => {
            fanState.setFanLevel(2);
            const saved = JSON.parse(realReadFileSync(STATE_FILE, 'utf8'));
            expect(saved.fanLevel).toBe(2);
        });
    });

    describe('setState()', () => {
        test('updates both fanState and fanLevel in memory', () => {
            fanState.setState(3, 3);
            expect(fanState.state.fanState).toBe(3);
            expect(fanState.state.fanLevel).toBe(3);
        });

        test('persists both values to disk in one write', () => {
            fanState.setState(4, 2);
            const saved = JSON.parse(realReadFileSync(STATE_FILE, 'utf8'));
            expect(saved.fanState).toBe(4);
            expect(saved.fanLevel).toBe(2);
        });
    });

    describe('load()', () => {
        test('restores persisted state from disk', () => {
            realWriteFileSync(STATE_FILE, JSON.stringify({ fanState: 5, fanLevel: 3 }), 'utf8');
            fanState.load();
            expect(fanState.state.fanState).toBe(5);
            expect(fanState.state.fanLevel).toBe(3);
        });

        test('defaults to 0/0 when state file is missing', () => {
            try { fs.unlinkSync(STATE_FILE); } catch (_) {}
            fanState.load();
            expect(fanState.state.fanState).toBe(0);
            expect(fanState.state.fanLevel).toBe(0);
        });

        test('defaults to 0/0 when state file is corrupt JSON', () => {
            realWriteFileSync(STATE_FILE, 'not-valid-json', 'utf8');
            fanState.load();
            expect(fanState.state.fanState).toBe(0);
            expect(fanState.state.fanLevel).toBe(0);
        });

        test('defaults to 0/0 when state file has non-integer values', () => {
            realWriteFileSync(STATE_FILE, JSON.stringify({ fanState: 'bad', fanLevel: null }), 'utf8');
            fanState.load();
            expect(fanState.state.fanState).toBe(0);
            expect(fanState.state.fanLevel).toBe(0);
        });
    });
});
