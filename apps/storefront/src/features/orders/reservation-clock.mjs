/** @param {string} expiresAt @param {string} serverTime @param {number} elapsedMs */
export function reservationSecondsLeft(expiresAt, serverTime, elapsedMs) {
    const duration = Date.parse(expiresAt) - Date.parse(serverTime);
    return Number.isFinite(duration) && Number.isFinite(elapsedMs)
        ? Math.max(0, Math.ceil((duration - Math.max(0, elapsedMs)) / 1000))
        : 0;
}
