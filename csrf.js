/**
 * Lightweight CSRF protection using the double-submit cookie pattern.
 *
 * How it works:
 *  1. On every GET request a random token is generated and set as a
 *     cookie (csrfToken, SameSite=Strict, HttpOnly=false so JS/forms can read it).
 *  2. Every state-changing POST must include that same token in the
 *     request body field `_csrf`.
 *  3. The middleware compares the body value against the cookie value.
 *     A mismatch (or missing token) results in a 403.
 *
 * Because the cookie is SameSite=Strict, cross-origin requests from a
 * different site cannot set or read it, so the attacker cannot forge a
 * matching pair.
 */

var crypto = require('crypto');

var COOKIE_NAME = 'csrfToken';
var FIELD_NAME  = '_csrf';
var TOKEN_BYTES = 24; // 192-bit → 32-char base64url string

/**
 * Generate a cryptographically random token.
 */
function generateToken() {
    return crypto.randomBytes(TOKEN_BYTES).toString('base64url');
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function safeCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    if (a.length !== b.length) {
        // Still run timingSafeEqual on equal-length buffers to avoid
        // leaking length information via short-circuit.
        crypto.timingSafeEqual(Buffer.alloc(1), Buffer.alloc(1));
        return false;
    }
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Express middleware.
 *
 * - On GET/HEAD/OPTIONS: issues a fresh CSRF cookie and exposes the token
 *   as res.locals.csrfToken so Jade templates can embed it.
 * - On POST/PUT/PATCH/DELETE: validates the submitted token against the cookie.
 */
function csrfMiddleware(req, res, next) {
    var safeMethods = ['GET', 'HEAD', 'OPTIONS'];

    if (safeMethods.indexOf(req.method) !== -1) {
        // Issue / refresh the token
        var token = generateToken();
        res.cookie(COOKIE_NAME, token, {
            httpOnly: false,   // must be readable by the form hidden field
            sameSite: 'Strict',
            secure: req.secure // set Secure flag when served over HTTPS
        });
        res.locals.csrfToken = token;
        return next();
    }

    // Validate on mutating methods
    var cookieToken = req.cookies && req.cookies[COOKIE_NAME];
    var bodyToken   = req.body   && req.body[FIELD_NAME];

    if (!cookieToken || !bodyToken || !safeCompare(cookieToken, bodyToken)) {
        var err = new Error('Invalid or missing CSRF token');
        err.status = 403;
        return next(err);
    }

    next();
}

module.exports = csrfMiddleware;
