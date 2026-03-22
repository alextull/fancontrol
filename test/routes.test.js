/**
 * test/routes.test.js
 * Integration tests for the Express routes (routes/index.js) using Supertest.
 *
 * The ZwiftAdapter is mocked so no real Zwift API calls are made.
 * The fan state module is used directly so we can control state between tests.
 */
'use strict';

const request = require('supertest');

// ── Mock zwift-mobile-api before anything loads config/app ──────────────────
jest.mock('zwift-mobile-api', () => {
    return jest.fn().mockImplementation(() => ({
        getWorld: () => ({ riderStatus: jest.fn().mockResolvedValue({ speed: 0, heartrate: 0, power: 0 }) })
    }));
});

// ── Mock particle-events so no SSE connection is attempted ──────────────────
jest.mock('../particle-events', () => ({ start: jest.fn() }));

const app      = require('../app');
const fanState = require('../state');

// Helper: extract a CSRF token from a GET / response
async function getCsrfToken() {
    const res = await request(app).get('/');
    const match = res.headers['set-cookie']
        .join(';')
        .match(/csrfToken=([^;]+)/);
    return match ? match[1] : null;
}

// Helper: get the ZwiftAdapter mock instance attached to the app
function getAdapter() {
    return app.get('zwiftAdapter');
}

beforeEach(() => {
    // Reset to off state before each test
    fanState.setState(0, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// Fan level calculation logic
// ─────────────────────────────────────────────────────────────────────────────

describe('Fan level calculation — Zwift Simulation mode (state 4)', () => {
    beforeEach(() => {
        fanState.setFanState(4);
    });

    const cases = [
        { speed: 0,    expected: 0, label: 'speed=0 → level 0' },
        { speed: 9,    expected: 0, label: 'speed just below level1 threshold → level 0' },
        { speed: 10,   expected: 1, label: 'speed at level1 threshold → level 1' },
        { speed: 20,   expected: 1, label: 'speed between level1 and level2 → level 1' },
        { speed: 30,   expected: 2, label: 'speed at level2 threshold → level 2' },
        { speed: 39,   expected: 2, label: 'speed just below level3 threshold → level 2' },
        { speed: 40,   expected: 3, label: 'speed at level3 threshold → level 3' },
        { speed: 100,  expected: 3, label: 'speed well above level3 → level 3' },
    ];

    test.each(cases)('$label', async ({ speed, expected }) => {
        const adapter = getAdapter();
        jest.spyOn(adapter, 'isDataFresh').mockReturnValue(true);
        jest.spyOn(adapter, 'getSpeed').mockReturnValue(speed);
        jest.spyOn(adapter, 'getPower').mockReturnValue(0);
        jest.spyOn(adapter, 'getHeartrate').mockReturnValue(0);

        const res = await request(app).get('/getFanLevel');

        expect(res.status).toBe(200);
        expect(res.text).toContain('FLV' + expected);
    });
});

describe('Fan level calculation — Zwift Workout mode (state 5)', () => {
    beforeEach(() => {
        fanState.setFanState(5);
    });

    const cases = [
        // Heartrate at or below threshold → always level 0
        { hr: 125, power: 300, expected: 0, label: 'hr at threshold → level 0 regardless of power' },
        { hr: 100, power: 300, expected: 0, label: 'hr below threshold → level 0 regardless of power' },
        // Heartrate above threshold, power determines level
        { hr: 126, power: 0,   expected: 0, label: 'hr above threshold, power=0 → level 0' },
        { hr: 126, power: 149, expected: 0, label: 'hr above threshold, power just below level1 → level 0' },
        { hr: 126, power: 150, expected: 1, label: 'hr above threshold, power at level1 → level 1' },
        { hr: 126, power: 194, expected: 1, label: 'hr above threshold, power just below level2 → level 1' },
        { hr: 126, power: 195, expected: 2, label: 'hr above threshold, power at level2 → level 2' },
        { hr: 126, power: 264, expected: 2, label: 'hr above threshold, power just below level3 → level 2' },
        { hr: 126, power: 265, expected: 3, label: 'hr above threshold, power at level3 → level 3' },
        { hr: 200, power: 400, expected: 3, label: 'hr well above threshold, high power → level 3' },
    ];

    test.each(cases)('$label', async ({ hr, power, expected }) => {
        const adapter = getAdapter();
        jest.spyOn(adapter, 'isDataFresh').mockReturnValue(true);
        jest.spyOn(adapter, 'getSpeed').mockReturnValue(30);
        jest.spyOn(adapter, 'getPower').mockReturnValue(power);
        jest.spyOn(adapter, 'getHeartrate').mockReturnValue(hr);

        const res = await request(app).get('/getFanLevel');

        expect(res.status).toBe(200);
        expect(res.text).toContain('FLV' + expected);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// /getFanLevel endpoint
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /getFanLevel', () => {
    test('returns 200 with correct payload format in off state', async () => {
        fanState.setState(0, 0);
        const res = await request(app).get('/getFanLevel');
        expect(res.status).toBe(200);
        expect(res.text).toMatch(/^FCS0FLV0PWR\d{4}HR\d{3}SPD[\d.]+\n$/);
    });

    test('returns FCS matching current fan state', async () => {
        fanState.setState(2, 2);
        const res = await request(app).get('/getFanLevel');
        expect(res.text).toContain('FCS2');
        expect(res.text).toContain('FLV2');
    });

    test('returns fan level 0 when Zwift data is stale (state 4)', async () => {
        fanState.setState(4, 3); // previously level 3
        const adapter = getAdapter();
        jest.spyOn(adapter, 'isDataFresh').mockReturnValue(false);

        const res = await request(app).get('/getFanLevel');

        expect(res.text).toContain('FLV0');
    });

    test('returns 403 when PHOTON_SECRET is set and header is missing', async () => {
        process.env.PHOTON_SECRET = 'supersecret';
        const res = await request(app).get('/getFanLevel');
        expect(res.status).toBe(403);
        delete process.env.PHOTON_SECRET;
    });

    test('returns 200 when PHOTON_SECRET is set and correct header is provided', async () => {
        process.env.PHOTON_SECRET = 'supersecret';
        fanState.setState(0, 0);
        const res = await request(app)
            .get('/getFanLevel')
            .set('X-Photon-Secret', 'supersecret');
        expect(res.status).toBe(200);
        delete process.env.PHOTON_SECRET;
    });

    test('payload contains PWR, HR, SPD fields with correct padding', async () => {
        fanState.setFanState(4);
        const adapter = getAdapter();
        jest.spyOn(adapter, 'isDataFresh').mockReturnValue(true);
        jest.spyOn(adapter, 'getSpeed').mockReturnValue(27.3);
        jest.spyOn(adapter, 'getPower').mockReturnValue(95);
        jest.spyOn(adapter, 'getHeartrate').mockReturnValue(110);

        const res = await request(app).get('/getFanLevel');

        expect(res.text).toContain('PWR0095');
        expect(res.text).toContain('HR110');
        expect(res.text).toContain('SPD027.3');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fan state POST routes
// ─────────────────────────────────────────────────────────────────────────────

describe('POST fan state routes', () => {
    test('POST /fanStateOff sets state to 0 and redirects', async () => {
        const token = await getCsrfToken();
        const res = await request(app)
            .post('/fanStateOff')
            .set('Cookie', `csrfToken=${token}`)
            .send(`_csrf=${token}`);
        expect(res.status).toBe(302);
        expect(fanState.state.fanState).toBe(0);
        expect(fanState.state.fanLevel).toBe(0);
    });

    test('POST /fanStateLevel1 sets state to 1 and redirects', async () => {
        const token = await getCsrfToken();
        const res = await request(app)
            .post('/fanStateLevel1')
            .set('Cookie', `csrfToken=${token}`)
            .send(`_csrf=${token}`);
        expect(res.status).toBe(302);
        expect(fanState.state.fanState).toBe(1);
        expect(fanState.state.fanLevel).toBe(1);
    });

    test('POST /fanStateLevel2 sets state to 2 and redirects', async () => {
        const token = await getCsrfToken();
        const res = await request(app)
            .post('/fanStateLevel2')
            .set('Cookie', `csrfToken=${token}`)
            .send(`_csrf=${token}`);
        expect(res.status).toBe(302);
        expect(fanState.state.fanState).toBe(2);
        expect(fanState.state.fanLevel).toBe(2);
    });

    test('POST /fanStateLevel3 sets state to 3 and redirects', async () => {
        const token = await getCsrfToken();
        const res = await request(app)
            .post('/fanStateLevel3')
            .set('Cookie', `csrfToken=${token}`)
            .send(`_csrf=${token}`);
        expect(res.status).toBe(302);
        expect(fanState.state.fanState).toBe(3);
        expect(fanState.state.fanLevel).toBe(3);
    });

    test('POST /fanStateZwiftSim sets state to 4 and redirects', async () => {
        const token = await getCsrfToken();
        const res = await request(app)
            .post('/fanStateZwiftSim')
            .set('Cookie', `csrfToken=${token}`)
            .send(`_csrf=${token}`);
        expect(res.status).toBe(302);
        expect(fanState.state.fanState).toBe(4);
    });

    test('POST /fanStateZwiftWrkt sets state to 5 and redirects', async () => {
        const token = await getCsrfToken();
        const res = await request(app)
            .post('/fanStateZwiftWrkt')
            .set('Cookie', `csrfToken=${token}`)
            .send(`_csrf=${token}`);
        expect(res.status).toBe(302);
        expect(fanState.state.fanState).toBe(5);
    });

    test('POST without CSRF token returns 403', async () => {
        const res = await request(app)
            .post('/fanStateOff')
            .send('');
        expect(res.status).toBe(403);
    });

    test('POST with mismatched CSRF token returns 403', async () => {
        const token = await getCsrfToken();
        const res = await request(app)
            .post('/fanStateOff')
            .set('Cookie', `csrfToken=${token}`)
            .send('_csrf=wrongtoken');
        expect(res.status).toBe(403);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Home page
// ─────────────────────────────────────────────────────────────────────────────

describe('GET /', () => {
    test('returns 200 and renders the index page', async () => {
        const res = await request(app).get('/');
        expect(res.status).toBe(200);
        expect(res.text).toContain('Fan Control');
    });

    test('sets a csrfToken cookie', async () => {
        const res = await request(app).get('/');
        const cookies = res.headers['set-cookie'] || [];
        expect(cookies.some(c => c.startsWith('csrfToken='))).toBe(true);
    });
});
