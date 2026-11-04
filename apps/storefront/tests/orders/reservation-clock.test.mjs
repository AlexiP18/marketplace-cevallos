import assert from 'node:assert/strict';
import test from 'node:test';
import {reservationSecondsLeft} from '../../src/features/orders/reservation-clock.mjs';

test('the countdown uses server time and elapsed time instead of the browser clock', () => {
    const server = '2026-11-02T10:00:00Z', expires = '2026-11-02T10:45:00Z';
    assert.equal(reservationSecondsLeft(expires, server, 0), 2700);
    assert.equal(reservationSecondsLeft(expires, server, 60500), 2640);
    assert.equal(reservationSecondsLeft(expires, server, 2700000), 0);
    assert.equal(reservationSecondsLeft(expires, server, 3600000), 0);
});

test('invalid timestamps and elapsed time never display NaN or negative countdowns', () => {
    assert.equal(reservationSecondsLeft('invalid', '2026-11-02T10:00:00Z', 0), 0);
    assert.equal(reservationSecondsLeft('2026-11-02T10:45:00Z', '2026-11-02T10:00:00Z', NaN), 0);
});
