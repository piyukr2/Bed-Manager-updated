const BedRequest = require('../models/BedRequest');
const Bed = require('../models/Bed');
const Alert = require('../models/Alert');

/**
 * Check and expire reservations that have exceeded their TTL
 * Runs every minute
 */
async function checkAndExpireReservations(io) {
  try {
    const now = new Date();

    // Find all approved requests with expired reservations
    const expiredRequests = await BedRequest.find({
      status: 'approved',
      reservationTTL: { $lte: now }
    }).populate('assignedBed.bedId');

    if (expiredRequests.length === 0) {
      return;
    }

    console.log(`🕐 Found ${expiredRequests.length} expired reservation(s)`);

    for (const request of expiredRequests) {
      try {
        // Release the reserved bed
        if (request.assignedBed && request.assignedBed.bedId) {
          const bed = await Bed.findById(request.assignedBed.bedId);

          if (bed && bed.status === 'reserved') {
            bed.status = 'available';
            bed.notes = `Reservation expired at ${now.toLocaleString()}. Previously reserved for request ${request.requestId}`;
            await bed.save();

            // Emit socket event for bed update
            if (io) {
              io.emit('bed-updated', bed);
              io.to(`ward-${bed.ward}`).emit('ward-bed-updated', bed);
            }

            console.log(`✅ Released bed ${bed.bedNumber} from expired reservation`);
          }
        }

        // Update request status
        request.status = 'expired';
        await request.save();

        // Create alert
        await Alert.create({
          type: 'warning',
          message: `Reservation expired: Request ${request.requestId} for patient ${request.patientDetails.name}. Bed ${request.assignedBed?.bedNumber} released.`,
          priority: 3,
          ward: request.assignedBed?.ward || 'All'
        });

        // Emit socket event for expired request
        if (io) {
          io.emit('bed-request-expired', request);
        }

        console.log(`⏰ Expired request ${request.requestId}`);
      } catch (error) {
        console.error(`Error expiring request ${request.requestId}:`, error);
      }
    }

    return expiredRequests.length;
  } catch (error) {
    console.error('Error in reservation expiry job:', error);
    return 0;
  }
}

/**
 * Start the reservation expiry checker
 * Runs every 60 seconds
 */
function startReservationExpiryJob(io) {
  console.log('🕐 Starting reservation expiry job (runs every 60 seconds)');

  // Run immediately on start
  checkAndExpireReservations(io);

  // Then run every minute
  const intervalId = setInterval(() => {
    checkAndExpireReservations(io);
  }, 60 * 1000); // 60 seconds

  return intervalId;
}

module.exports = {
  checkAndExpireReservations,
  startReservationExpiryJob
};
