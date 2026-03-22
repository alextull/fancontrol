/**
 * test/setup.js
 * Sets up environment variables required by config.js before any test runs.
 * Jest loads this via the globalSetup / setupFiles config.
 */
process.env.ZWIFT_USERNAME   = 'test@example.com';
process.env.ZWIFT_PASSWORD   = 'testpassword';
process.env.ZWIFT_PLAYER_ID  = '12345';
process.env.SPEED_LEVEL1     = '10';
process.env.SPEED_LEVEL2     = '30';
process.env.SPEED_LEVEL3     = '40';
process.env.HEARTRATE        = '125';
process.env.POWER_LEVEL1     = '150';
process.env.POWER_LEVEL2     = '195';
process.env.POWER_LEVEL3     = '265';
process.env.PHOTON_SECRET    = '';   // disabled by default in tests
process.env.LOG_LEVEL        = 'error'; // suppress log output during tests
