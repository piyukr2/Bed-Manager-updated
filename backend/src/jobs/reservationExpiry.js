/**
 * Reservation expiry logic has been retired.
 * These no-op exports remain only to avoid breaking old imports.
 */

async function checkAndExpireReservations() {
  return 0;
}

function startReservationExpiryJob() {
  return null;
}

module.exports = {
  checkAndExpireReservations,
  startReservationExpiryJob
};
