/**
 * test/zwiftAdapter.test.js
 * Tests for ZwiftAdapter — mocks zwift-mobile-api so no real network calls are made.
 */
'use strict';

// Mock zwift-mobile-api before requiring ZwiftAdapter
const mockRiderStatus = jest.fn();
jest.mock('zwift-mobile-api', () => {
    return jest.fn().mockImplementation(() => ({
        getWorld: () => ({
            riderStatus: mockRiderStatus
        })
    }));
});

const ZwiftAdapter = require('../ZwiftAdapter');

beforeEach(() => {
    jest.useFakeTimers();
    mockRiderStatus.mockReset();
});

afterEach(() => {
    jest.useRealTimers();
});

describe('ZwiftAdapter', () => {
    describe('constructor', () => {
        test('initialises with zero speed, power, heartrate and null lastUpdated', () => {
            const adapter = new ZwiftAdapter('u', 'p', 123);
            expect(adapter.getSpeed()).toBe(0);
            expect(adapter.getPower()).toBe(0);
            expect(adapter.getHeartrate()).toBe(0);
            expect(adapter.isDataFresh()).toBe(false);
        });
    });

    describe('updateSpeed()', () => {
        test('stores speed, heartrate and power', () => {
            const adapter = new ZwiftAdapter('u', 'p', 123);
            adapter.updateSpeed(35.5, 142, 210);
            expect(adapter.getSpeed()).toBe(35.5);
            expect(adapter.getHeartrate()).toBe(142);
            expect(adapter.getPower()).toBe(210);
        });

        test('marks data as fresh after update', () => {
            const adapter = new ZwiftAdapter('u', 'p', 123);
            adapter.updateSpeed(10, 130, 180);
            expect(adapter.isDataFresh()).toBe(true);
        });
    });

    describe('isDataFresh()', () => {
        test('returns false before any update', () => {
            const adapter = new ZwiftAdapter('u', 'p', 123);
            expect(adapter.isDataFresh()).toBe(false);
        });

        test('returns true immediately after update', () => {
            const adapter = new ZwiftAdapter('u', 'p', 123);
            adapter.updateSpeed(20, 140, 200);
            expect(adapter.isDataFresh()).toBe(true);
        });

        test('returns false after stale threshold (10 s) has elapsed', () => {
            const adapter = new ZwiftAdapter('u', 'p', 123);
            adapter.updateSpeed(20, 140, 200);
            jest.advanceTimersByTime(10001);
            expect(adapter.isDataFresh()).toBe(false);
        });

        test('returns true just before stale threshold', () => {
            const adapter = new ZwiftAdapter('u', 'p', 123);
            adapter.updateSpeed(20, 140, 200);
            jest.advanceTimersByTime(9999);
            expect(adapter.isDataFresh()).toBe(true);
        });
    });

    describe('_poll()', () => {
        test('calls updateSpeed with decoded values on success', async () => {
            const adapter = new ZwiftAdapter('u', 'p', 123);
            mockRiderStatus.mockResolvedValue({
                speed: 35000000,  // 35 km/h in Zwift units
                heartrate: 145,
                power: 220
            });

            // _poll() does not return its promise; drain the microtask queue
            adapter._poll();
            await mockRiderStatus.mock.results[0].value;

            expect(adapter.getSpeed()).toBeCloseTo(35);
            expect(adapter.getHeartrate()).toBe(145);
            expect(adapter.getPower()).toBe(220);
            expect(adapter.isDataFresh()).toBe(true);
        });

        test('does not update state on 404 (player not riding)', async () => {
            const adapter = new ZwiftAdapter('u', 'p', 123);
            const err = new Error('Not Found');
            err.response = { status: 404 };
            mockRiderStatus.mockRejectedValue(err);

            adapter._poll();
            await mockRiderStatus.mock.results[0].value.catch(() => {});

            expect(adapter.isDataFresh()).toBe(false);
            expect(adapter.getSpeed()).toBe(0);
        });

        test('stops polling on 403 Forbidden', async () => {
            const adapter = new ZwiftAdapter('u', 'p', 123);
            const stopSpy = jest.spyOn(adapter, 'stopPolling');

            const err = new Error('Forbidden');
            err.response = { status: 403 };
            mockRiderStatus.mockRejectedValue(err);

            // _poll() does not return its promise, so we must wait for the
            // microtask queue to drain after calling it.
            adapter._poll();
            await mockRiderStatus.mock.results[0].value.catch(() => {});

            expect(stopSpy).toHaveBeenCalledTimes(1);
        });

        test('does not update state on 401 Unauthorized', async () => {
            const adapter = new ZwiftAdapter('u', 'p', 123);
            const err = new Error('Unauthorized');
            err.response = { status: 401 };
            mockRiderStatus.mockRejectedValue(err);

            adapter._poll();
            await mockRiderStatus.mock.results[0].value.catch(() => {});

            expect(adapter.isDataFresh()).toBe(false);
        });
    });

    describe('startPolling() / stopPolling()', () => {
        test('startPolling sets an interval', () => {
            const adapter = new ZwiftAdapter('u', 'p', 123);
            mockRiderStatus.mockResolvedValue({ speed: 0, heartrate: 0, power: 0 });
            adapter.startPolling();
            expect(adapter._interval).not.toBeNull();
            adapter.stopPolling();
        });

        test('startPolling is idempotent — calling twice does not create two intervals', () => {
            const adapter = new ZwiftAdapter('u', 'p', 123);
            mockRiderStatus.mockResolvedValue({ speed: 0, heartrate: 0, power: 0 });
            adapter.startPolling();
            const first = adapter._interval;
            adapter.startPolling();
            expect(adapter._interval).toBe(first);
            adapter.stopPolling();
        });

        test('stopPolling clears the interval and resets lastUpdated', () => {
            const adapter = new ZwiftAdapter('u', 'p', 123);
            mockRiderStatus.mockResolvedValue({ speed: 0, heartrate: 0, power: 0 });
            adapter.startPolling();
            adapter.updateSpeed(30, 140, 200); // simulate fresh data
            expect(adapter.isDataFresh()).toBe(true);

            adapter.stopPolling();

            expect(adapter._interval).toBeNull();
            expect(adapter.isDataFresh()).toBe(false); // lastUpdated reset
        });

        test('stopPolling is idempotent — calling twice does not throw', () => {
            const adapter = new ZwiftAdapter('u', 'p', 123);
            expect(() => {
                adapter.stopPolling();
                adapter.stopPolling();
            }).not.toThrow();
        });
    });
});
