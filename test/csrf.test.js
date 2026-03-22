/**
 * test/csrf.test.js
 * Tests for the double-submit cookie CSRF middleware (csrf.js).
 */
'use strict';

const csrf = require('../csrf');

// Helper: build a minimal mock req/res/next for Express middleware testing
function makeReq(method, cookies = {}, body = {}) {
    return { method, cookies, body, secure: false };
}

function makeRes() {
    const res = {
        _cookies: {},
        locals: {},
        cookie(name, value, opts) { this._cookies[name] = value; },
        status(code) { this._status = code; return this; },
        send(msg) { this._body = msg; return this; }
    };
    return res;
}

describe('CSRF middleware', () => {
    describe('safe methods (GET, HEAD, OPTIONS)', () => {
        test.each(['GET', 'HEAD', 'OPTIONS'])('%s sets a csrfToken cookie and res.locals.csrfToken', (method) => {
            const req = makeReq(method);
            const res = makeRes();
            const next = jest.fn();

            csrf(req, res, next);

            expect(next).toHaveBeenCalledTimes(1);
            expect(res._cookies['csrfToken']).toBeDefined();
            expect(typeof res._cookies['csrfToken']).toBe('string');
            expect(res._cookies['csrfToken'].length).toBeGreaterThan(0);
            expect(res.locals.csrfToken).toBe(res._cookies['csrfToken']);
        });

        test('generates a different token on each GET', () => {
            const tokens = new Set();
            for (let i = 0; i < 10; i++) {
                const req = makeReq('GET');
                const res = makeRes();
                csrf(req, res, jest.fn());
                tokens.add(res._cookies['csrfToken']);
            }
            expect(tokens.size).toBe(10);
        });
    });

    describe('mutating methods (POST)', () => {
        test('passes when cookie and body token match', () => {
            const token = 'abc123validtoken';
            const req = makeReq('POST', { csrfToken: token }, { _csrf: token });
            const res = makeRes();
            const next = jest.fn();

            csrf(req, res, next);

            expect(next).toHaveBeenCalledTimes(1);
            expect(next.mock.calls[0][0]).toBeUndefined(); // no error passed
        });

        test('calls next(err) with 403 when body token is missing', () => {
            const req = makeReq('POST', { csrfToken: 'sometoken' }, {});
            const res = makeRes();
            const next = jest.fn();

            csrf(req, res, next);

            expect(next).toHaveBeenCalledTimes(1);
            const err = next.mock.calls[0][0];
            expect(err).toBeInstanceOf(Error);
            expect(err.status).toBe(403);
        });

        test('calls next(err) with 403 when cookie token is missing', () => {
            const req = makeReq('POST', {}, { _csrf: 'sometoken' });
            const res = makeRes();
            const next = jest.fn();

            csrf(req, res, next);

            expect(next).toHaveBeenCalledTimes(1);
            const err = next.mock.calls[0][0];
            expect(err.status).toBe(403);
        });

        test('calls next(err) with 403 when tokens do not match', () => {
            const req = makeReq('POST', { csrfToken: 'token-a' }, { _csrf: 'token-b' });
            const res = makeRes();
            const next = jest.fn();

            csrf(req, res, next);

            expect(next).toHaveBeenCalledTimes(1);
            const err = next.mock.calls[0][0];
            expect(err.status).toBe(403);
        });

        test('calls next(err) with 403 when tokens differ only in length', () => {
            const req = makeReq('POST', { csrfToken: 'short' }, { _csrf: 'short-but-longer' });
            const res = makeRes();
            const next = jest.fn();

            csrf(req, res, next);

            const err = next.mock.calls[0][0];
            expect(err.status).toBe(403);
        });
    });
});
