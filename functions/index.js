/**
 * Firebase Cloud Functions for St Marks Prayer Room Booking
 * 
 * AUTOMATIC MODE - INLET/Paxton Net2 Integration
 * 
 * These functions handle:
 * 1. Booking creation → Create time-bounded Net2 credential via INLET API
 * 2. Booking update → Update credential window or revoke + re-issue
 * 3. Booking cancellation → Revoke credential
 * 4. Email notifications via Firestore Trigger Email extension
 * 
 * PREREQUISITES:
 * 1. Net2 server: Enable LocalAPI in Configuration Utility → Security
 * 2. Net2 server: Install TLS certificate via https://localhost:8443/setup.html
 * 3. INLET Cloud Access Hub: Map resourceId 'prayer_room' to your Net2 door
 * 4. Firebase: Upgrade to Blaze plan for Cloud Functions
 * 5. Firebase: Install Trigger Email extension
 * 6. Set environment secrets: firebase functions:secrets:set INLET_API_KEY
 * 
 * DEPLOYMENT:
 * cd functions
 * npm install
 * firebase deploy --only functions
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// INLET API Configuration
// Store these as Firebase secrets: firebase functions:secrets:set INLET_API_KEY
const INLET_API_BASE_URL = 'https://api.inlet.io/v1'; // Replace with actual INLET API URL
const INLET_API_KEY = process.env.INLET_API_KEY;

// Resource mapping (Firestore resourceId → INLET lock/door ID)
const RESOURCE_MAPPING = {
    'prayer_room': 'YOUR_INLET_LOCK_ID' // Replace with actual INLET lock ID
};

/**
 * Triggered when a new booking is created in Firestore
 * Creates time-bounded access credential via INLET API
 */
exports.onBookingCreated = functions.firestore
    .document('bookings/{bookingId}')
    .onCreate(async (snap, context) => {
        const booking = snap.data();
        const bookingId = context.params.bookingId;
        
        console.log(`Processing new booking: ${bookingId}`, booking);
        
        // Only process if status is 'pending' (automatic mode)
        if (booking.status !== 'pending') {
            console.log('Booking not in pending status, skipping automatic processing');
            return null;
        }
        
        try {
            // Validate slot is still free (transaction)
            const isSlotFree = await validateSlotFree(booking.date, booking.time, bookingId);
            if (!isSlotFree) {
                await snap.ref.update({
                    status: 'conflict',
                    error: 'Time slot is no longer available'
                });
                return null;
            }
            
            // Calculate start and end times
            const startTime = parseBookingDateTime(booking.date, booking.time);
            const endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // 1 hour duration
            
            // Create credential via INLET API
            const credential = await createInletCredential({
                resourceId: booking.resourceId || 'prayer_room',
                startTime: startTime.toISOString(),
                endTime: endTime.toISOString(),
                userName: booking.name || booking.hostName,
                userEmail: booking.email || booking.hostEmail
            });
            
            // Update booking with credential details
            await snap.ref.update({
                status: 'confirmed',
                inlet: {
                    credentialId: credential.id,
                    code: credential.accessCode,
                    issuedAt: admin.firestore.FieldValue.serverTimestamp()
                }
            });
            
            // Queue confirmation email
            await queueConfirmationEmail(booking, credential);
            
            console.log(`Booking ${bookingId} confirmed with credential ${credential.id}`);
            return { success: true, credentialId: credential.id };
            
        } catch (error) {
            console.error(`Error processing booking ${bookingId}:`, error);
            await snap.ref.update({
                status: 'error',
                error: error.message
            });
            return { success: false, error: error.message };
        }
    });

/**
 * Triggered when a booking is updated
 * Handles time changes (update credential) or cancellations (revoke credential)
 */
exports.onBookingUpdated = functions.firestore
    .document('bookings/{bookingId}')
    .onUpdate(async (change, context) => {
        const before = change.before.data();
        const after = change.after.data();
        const bookingId = context.params.bookingId;
        
        console.log(`Booking updated: ${bookingId}`, { before, after });
        
        // Check if booking was cancelled
        if (after.status === 'cancelled' && before.status !== 'cancelled') {
            return await handleBookingCancellation(bookingId, before);
        }
        
        // Check if time was changed
        if (before.date !== after.date || before.time !== after.time) {
            return await handleTimeChange(bookingId, before, after);
        }
        
        return null;
    });

/**
 * Triggered when a booking is deleted
 * Revokes any associated credentials
 */
exports.onBookingDeleted = functions.firestore
    .document('bookings/{bookingId}')
    .onDelete(async (snap, context) => {
        const booking = snap.data();
        const bookingId = context.params.bookingId;
        
        console.log(`Booking deleted: ${bookingId}`);
        
        if (booking.inlet && booking.inlet.credentialId) {
            await revokeInletCredential(booking.inlet.credentialId);
        }
        
        return null;
    });

// ===== INLET API FUNCTIONS =====

/**
 * Create a time-bounded credential via INLET API
 */
async function createInletCredential({ resourceId, startTime, endTime, userName, userEmail }) {
    const lockId = RESOURCE_MAPPING[resourceId];
    if (!lockId) {
        throw new Error(`No INLET lock mapping for resource: ${resourceId}`);
    }
    
    // TODO: Replace with actual INLET API call
    // This is a placeholder showing the expected API structure
    
    /*
    const response = await fetch(`${INLET_API_BASE_URL}/credentials`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${INLET_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            lockId: lockId,
            startTime: startTime,
            endTime: endTime,
            user: {
                name: userName,
                email: userEmail
            },
            type: 'time_bounded'
        })
    });
    
    if (!response.ok) {
        throw new Error(`INLET API error: ${response.status}`);
    }
    
    return await response.json();
    */
    
    // Placeholder return for testing
    console.log('INLET API PLACEHOLDER: Would create credential for', { lockId, startTime, endTime, userName });
    return {
        id: 'inlet_cred_' + Date.now(),
        accessCode: Math.floor(1000 + Math.random() * 9000).toString(),
        lockId: lockId,
        startTime: startTime,
        endTime: endTime
    };
}

/**
 * Revoke a credential via INLET API
 */
async function revokeInletCredential(credentialId) {
    console.log(`Revoking INLET credential: ${credentialId}`);
    
    // TODO: Replace with actual INLET API call
    /*
    const response = await fetch(`${INLET_API_BASE_URL}/credentials/${credentialId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${INLET_API_KEY}`
        }
    });
    
    if (!response.ok) {
        throw new Error(`INLET API error: ${response.status}`);
    }
    */
    
    console.log('INLET API PLACEHOLDER: Would revoke credential', credentialId);
    return { success: true };
}

/**
 * Update a credential's time window via INLET API
 */
async function updateInletCredential(credentialId, { startTime, endTime }) {
    console.log(`Updating INLET credential: ${credentialId}`, { startTime, endTime });
    
    // TODO: Replace with actual INLET API call
    // Some systems may require revoke + re-create instead of update
    
    console.log('INLET API PLACEHOLDER: Would update credential', credentialId);
    return { success: true };
}

// ===== HELPER FUNCTIONS =====

/**
 * Validate that a time slot is still free
 */
async function validateSlotFree(date, time, excludeBookingId) {
    const snapshot = await db.collection('bookings')
        .where('date', '==', date)
        .where('time', '==', time)
        .where('status', 'in', ['confirmed', 'pending'])
        .get();
    
    for (const doc of snapshot.docs) {
        if (doc.id !== excludeBookingId) {
            return false; // Slot taken by another booking
        }
    }
    return true;
}

/**
 * Parse booking date and time into a Date object
 */
function parseBookingDateTime(dateStr, timeStr) {
    // dateStr format: "2026-01-16"
    // timeStr format: "14:00"
    const [year, month, day] = dateStr.split('-').map(Number);
    const [hour, minute] = timeStr.split(':').map(Number);
    return new Date(year, month - 1, day, hour, minute);
}

/**
 * Handle booking cancellation
 */
async function handleBookingCancellation(bookingId, booking) {
    console.log(`Handling cancellation for booking: ${bookingId}`);
    
    if (booking.inlet && booking.inlet.credentialId) {
        await revokeInletCredential(booking.inlet.credentialId);
    }
    
    // Queue cancellation email
    await queueCancellationEmail(booking);
    
    return { success: true };
}

/**
 * Handle time change for a booking
 */
async function handleTimeChange(bookingId, before, after) {
    console.log(`Handling time change for booking: ${bookingId}`);
    
    if (before.inlet && before.inlet.credentialId) {
        // Option 1: Update existing credential
        // await updateInletCredential(before.inlet.credentialId, { ... });
        
        // Option 2: Revoke and re-create (more reliable)
        await revokeInletCredential(before.inlet.credentialId);
        
        const startTime = parseBookingDateTime(after.date, after.time);
        const endTime = new Date(startTime.getTime() + 60 * 60 * 1000);
        
        const newCredential = await createInletCredential({
            resourceId: after.resourceId || 'prayer_room',
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            userName: after.name || after.hostName,
            userEmail: after.email || after.hostEmail
        });
        
        await db.collection('bookings').doc(bookingId).update({
            inlet: {
                credentialId: newCredential.id,
                code: newCredential.accessCode,
                issuedAt: admin.firestore.FieldValue.serverTimestamp()
            }
        });
        
        // Queue update email
        await queueUpdateEmail(after, newCredential);
    }
    
    return { success: true };
}

// ===== EMAIL FUNCTIONS =====
// Uses Firestore Trigger Email extension

/**
 * Queue confirmation email via Firestore mail collection
 */
async function queueConfirmationEmail(booking, credential) {
    const bookingDate = parseBookingDateTime(booking.date, booking.time);
    
    await db.collection('mail').add({
        to: booking.email || booking.hostEmail,
        template: {
            name: 'booking-confirmation',
            data: {
                userName: booking.name || booking.hostName,
                bookingDate: bookingDate.toLocaleDateString('en-GB', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                }),
                bookingTime: bookingDate.toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit'
                }),
                accessCode: credential.accessCode,
                bookingType: booking.isClass ? `Class: ${booking.className}` : 'Individual Booking'
            }
        }
    });
    
    console.log('Confirmation email queued');
}

/**
 * Queue cancellation email
 */
async function queueCancellationEmail(booking) {
    await db.collection('mail').add({
        to: booking.email || booking.hostEmail,
        template: {
            name: 'booking-cancellation',
            data: {
                userName: booking.name || booking.hostName,
                bookingDate: booking.date,
                bookingTime: booking.time
            }
        }
    });
    
    console.log('Cancellation email queued');
}

/**
 * Queue booking update email
 */
async function queueUpdateEmail(booking, credential) {
    const bookingDate = parseBookingDateTime(booking.date, booking.time);
    
    await db.collection('mail').add({
        to: booking.email || booking.hostEmail,
        template: {
            name: 'booking-update',
            data: {
                userName: booking.name || booking.hostName,
                bookingDate: bookingDate.toLocaleDateString('en-GB', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                }),
                bookingTime: bookingDate.toLocaleTimeString('en-GB', {
                    hour: '2-digit',
                    minute: '2-digit'
                }),
                accessCode: credential.accessCode
            }
        }
    });
    
    console.log('Update email queued');
}
