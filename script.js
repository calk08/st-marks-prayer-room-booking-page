// The Furnace Prayer Room - Booking Page JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Initialize components
    initEmailJS();
    initCookieBanner();
    initSmoothScrolling();
    initHeaderScroll();
    
    // Wait for Firebase to be ready before initializing calendar
    if (window.firebaseReady) {
        initCalendar();
    } else {
        window.addEventListener('firebase-ready', () => {
            initCalendar();
        });
        // Fallback: if Firebase doesn't load in 3 seconds, use localStorage
        setTimeout(() => {
            if (!window.firebaseReady) {
                console.warn('Firebase not ready, using localStorage fallback');
                initCalendar();
            }
        }, 3000);
    }
});

// ===== CALENDAR BOOKING SYSTEM =====
let currentWeekStart = getMonday(new Date());
let selectedSlot = null;

// Prayer room opening hours (7:30 AM - 9 PM)
const openingHour = 8;
const closingHour = 21;

// Bookings storage - loaded from Firestore or localStorage
let bookedSlots = [];

// Storage key for localStorage (fallback)
const BOOKINGS_STORAGE_KEY = 'furnace_prayer_room_bookings';

// Firestore collection name
const FIRESTORE_COLLECTION = 'bookings';

// Real-time listener unsubscribe function
let unsubscribeFirestore = null;

// Load bookings from Firestore with real-time updates
async function loadBookings() {
    // Check if Firebase is available
    if (window.firebaseReady && window.firebaseDB) {
        try {
            const bookingsRef = window.firebaseCollection(window.firebaseDB, FIRESTORE_COLLECTION);
            const q = window.firebaseQuery(bookingsRef, window.firebaseOrderBy('createdAt', 'desc'));
            
            // Set up real-time listener
            unsubscribeFirestore = window.firebaseOnSnapshot(q, (snapshot) => {
                bookedSlots = [];
                snapshot.forEach((doc) => {
                    bookedSlots.push({ id: doc.id, ...doc.data() });
                });
                console.log('Bookings synced from Firestore:', bookedSlots.length, 'bookings');
                
                // Also save to localStorage as cache
                saveBookingsToLocalStorage();
                
                // Re-render calendar with updated bookings
                renderCalendar();
            }, (error) => {
                console.error('Firestore listener error:', error);
                // Fallback to localStorage
                loadFromLocalStorage();
            });
            
            return;
        } catch (e) {
            console.error('Error setting up Firestore:', e);
        }
    }
    
    // Fallback to localStorage
    loadFromLocalStorage();
}

// Load from localStorage (fallback)
function loadFromLocalStorage() {
    const storedBookings = localStorage.getItem(BOOKINGS_STORAGE_KEY);
    
    if (storedBookings) {
        try {
            bookedSlots = JSON.parse(storedBookings);
            console.log('Bookings loaded from localStorage:', bookedSlots.length, 'bookings');
            return;
        } catch (e) {
            console.error('Error parsing stored bookings:', e);
        }
    }
    
    // If no localStorage data, try to load from JSON file
    loadFromJsonFile();
}

// Load from JSON file (initial data)
async function loadFromJsonFile() {
    try {
        const response = await fetch('bookings.json');
        if (response.ok) {
            const data = await response.json();
            bookedSlots = data.bookings || [];
            saveBookingsToLocalStorage();
            console.log('Bookings loaded from JSON file:', bookedSlots.length, 'bookings');
        }
    } catch (e) {
        console.log('No existing bookings file found, starting fresh');
        bookedSlots = [];
    }
}

// Save booking to Firestore
async function saveBookingToFirestore(booking) {
    if (window.firebaseReady && window.firebaseDB) {
        try {
            const bookingsRef = window.firebaseCollection(window.firebaseDB, FIRESTORE_COLLECTION);
            const docRef = await window.firebaseAddDoc(bookingsRef, booking);
            console.log('Booking saved to Firestore with ID:', docRef.id);
            return docRef.id;
        } catch (e) {
            console.error('Error saving to Firestore:', e);
            throw e;
        }
    }
    throw new Error('Firebase not available');
}

// Save bookings to localStorage (cache/fallback)
function saveBookingsToLocalStorage() {
    try {
        localStorage.setItem(BOOKINGS_STORAGE_KEY, JSON.stringify(bookedSlots));
    } catch (e) {
        console.error('Error saving to localStorage:', e);
    }
}

// Save bookings to storage (called after new booking)
function saveBookingsToStorage() {
    // Save to localStorage as backup
    saveBookingsToLocalStorage();
    // Note: Firestore save is handled separately in handleBookingSubmit
}

// Generate unique ID for bookings
function generateBookingId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Generate 4-digit access code
function generateAccessCode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

// EmailJS Configuration - Replace with your actual credentials
const EMAILJS_PUBLIC_KEY = '4n8zIP7jHqlUF6kLM'; // Replace with your EmailJS public key
const EMAILJS_SERVICE_ID = 'service_6ogxkdt'; // Replace with your EmailJS service ID
const EMAILJS_TEMPLATE_ID = 'template_k5skv7n'; // Replace with your EmailJS template ID

// Initialize EmailJS
function initEmailJS() {
    if (typeof emailjs !== 'undefined') {
        emailjs.init({
            publicKey: EMAILJS_PUBLIC_KEY
        });
        console.log('EmailJS initialized with public key:', EMAILJS_PUBLIC_KEY);
    } else {
        console.error('EmailJS SDK not loaded - check if script is included in HTML');
    }
}

// Send booking confirmation email
async function sendConfirmationEmail(booking) {
    console.log('Attempting to send email to:', booking.email);
    
    if (typeof emailjs === 'undefined') {
        console.error('EmailJS not available - SDK not loaded');
        return false;
    }
    
    const templateParams = {
        to_name: booking.name,
        to_email: booking.email,
        access_code: booking.accessCode,
        booking_date: new Date(booking.date).toLocaleDateString('en-GB', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }),
        booking_time: formatTimeDisplay(booking.time),
        reply_to: 'thomas.hart@stmarkscoventry.org'
    };
    
    console.log('Email template params:', templateParams);
    
    try {
        const response = await emailjs.send(
            EMAILJS_SERVICE_ID,
            EMAILJS_TEMPLATE_ID,
            templateParams
        );
        console.log('Email sent successfully! Response:', response);
        return true;
    } catch (error) {
        console.error('Failed to send email. Error:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        return false;
    }
}

// Format time for display (e.g., "14:00" -> "2:00 PM")
function formatTimeDisplay(timeStr) {
    const hour = parseInt(timeStr.split(':')[0]);
    const displayHour = hour > 12 ? hour - 12 : hour;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const endHour = hour + 1 > 12 ? hour + 1 - 12 : hour + 1;
    const endAmpm = (hour + 1) >= 12 ? 'PM' : 'AM';
    return `${displayHour}:00 ${ampm} - ${endHour}:00 ${endAmpm}`;
}

function getMonday(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
}

function formatDate(date) {
    return date.toISOString().split('T')[0];
}

function getMonthYear(date) {
    const options = { month: 'long', year: 'numeric' };
    return date.toLocaleDateString('en-GB', options);
}

async function initCalendar() {
    // Load bookings first, then render
    await loadBookings();
    renderCalendar();
    
    document.getElementById('prev-week').addEventListener('click', () => {
        currentWeekStart.setDate(currentWeekStart.getDate() - 7);
        renderCalendar();
    });
    
    document.getElementById('next-week').addEventListener('click', () => {
        currentWeekStart.setDate(currentWeekStart.getDate() + 7);
        renderCalendar();
    });

    // Booking form submission
    document.getElementById('booking-form').addEventListener('submit', handleBookingSubmit);
}

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    const monthDisplay = document.getElementById('calendar-month');
    
    grid.innerHTML = '';
    
    // Update month display
    monthDisplay.textContent = getMonthYear(currentWeekStart);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const now = new Date();
    
    // Create header row - Time column
    const headerCorner = document.createElement('div');
    headerCorner.className = 'calendar-header-cell';
    headerCorner.innerHTML = '<span class="day-name">Time</span>';
    grid.appendChild(headerCorner);
    
    // Day headers
    const days = [];
    for (let i = 0; i < 7; i++) {
        const day = new Date(currentWeekStart);
        day.setDate(currentWeekStart.getDate() + i);
        days.push(day);
        
        const dayCell = document.createElement('div');
        dayCell.className = 'calendar-header-cell';
        
        const dayDate = new Date(day);
        dayDate.setHours(0, 0, 0, 0);
        
        if (dayDate.getTime() === today.getTime()) {
            dayCell.classList.add('today');
        }
        
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        dayCell.innerHTML = `
            <div class="day-name">${dayNames[day.getDay()]}</div>
            <div class="day-number">${day.getDate()}</div>
        `;
        grid.appendChild(dayCell);
    }
    
    // Time slots (9 AM to 9 PM)
    for (let hour = openingHour; hour < closingHour; hour++) {
        // Time label
        const timeCell = document.createElement('div');
        timeCell.className = 'calendar-time-cell';
        const displayHour = hour > 12 ? hour - 12 : hour;
        const ampm = hour >= 12 ? 'PM' : 'AM';
        timeCell.textContent = `${displayHour}:00 ${ampm}`;
        grid.appendChild(timeCell);
        
        // Slots for each day
        for (let i = 0; i < 7; i++) {
            const day = days[i];
            const slotCell = document.createElement('div');
            slotCell.className = 'calendar-slot';
            
            const dateStr = formatDate(day);
            const timeStr = `${hour.toString().padStart(2, '0')}:00`;
            
            slotCell.dataset.date = dateStr;
            slotCell.dataset.time = timeStr;
            
            // Check if slot is in the past (with 4 hour lead time)
            const slotDateTime = new Date(day);
            slotDateTime.setHours(hour, 0, 0, 0);
            const leadTime = new Date(now.getTime() + (4 * 60 * 60 * 1000));
            
            if (slotDateTime < leadTime) {
                slotCell.classList.add('unavailable');
                slotCell.title = 'This slot is no longer available';
            } 
            // Check if booked
            else if (isSlotBooked(dateStr, timeStr)) {
                const booking = getBookingForSlot(dateStr, timeStr);
                slotCell.classList.add('booked');
                
                // Display first name on the slot
                if (booking && booking.name) {
                    const firstName = booking.name.split(' ')[0];
                    const nameLabel = document.createElement('span');
                    nameLabel.className = 'slot-name';
                    nameLabel.textContent = firstName;
                    slotCell.appendChild(nameLabel);
                    slotCell.title = `Booked by ${booking.name}`;
                } else {
                    slotCell.title = 'This slot is already booked';
                }
            } 
            // Available
            else {
                slotCell.classList.add('available');
                slotCell.title = `Book ${displayHour}:00 ${ampm}`;
                slotCell.addEventListener('click', () => selectSlot(slotCell, dateStr, timeStr, day, hour));
            }
            
            grid.appendChild(slotCell);
        }
    }
}

function isSlotBooked(date, time) {
    return bookedSlots.some(slot => slot.date === date && slot.time === time);
}

function getBookingForSlot(date, time) {
    return bookedSlots.find(slot => slot.date === date && slot.time === time);
}

function selectSlot(cell, date, time, day, hour) {
    // Remove previous selection
    const previousSelected = document.querySelector('.calendar-slot.selected');
    if (previousSelected) {
        previousSelected.classList.remove('selected');
    }
    
    // Select new slot
    cell.classList.add('selected');
    selectedSlot = { date, time, day, hour };
    
    // Show booking modal
    showBookingModal(day, hour);
}

function showBookingModal(day, hour) {
    const modal = document.getElementById('booking-confirm-modal');
    const details = document.getElementById('booking-details');
    
    const displayHour = hour > 12 ? hour - 12 : hour;
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const endHour = hour + 1 > 12 ? hour + 1 - 12 : hour + 1;
    const endAmpm = (hour + 1) >= 12 ? 'PM' : 'AM';
    
    const dateStr = day.toLocaleDateString('en-GB', { 
        weekday: 'long', 
        day: 'numeric', 
        month: 'long',
        year: 'numeric'
    });
    
    details.innerHTML = `
        <p><strong>Prayer Room 1hr</strong></p>
        <p>${dateStr}</p>
        <p class="slot-time">${displayHour}:00 ${ampm} - ${endHour}:00 ${endAmpm}</p>
    `;
    
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeBookingModal() {
    const modal = document.getElementById('booking-confirm-modal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
    
    // Deselect slot
    const selected = document.querySelector('.calendar-slot.selected');
    if (selected) {
        selected.classList.remove('selected');
    }
    selectedSlot = null;
}

async function handleBookingSubmit(e) {
    e.preventDefault();
    
    if (!selectedSlot) return;
    
    const name = document.getElementById('booking-name').value;
    const email = document.getElementById('booking-email').value;
    const phone = document.getElementById('booking-phone').value;
    
    // Generate 4-digit access code
    const accessCode = generateAccessCode();
    
    // Create booking object for Firestore (only name and time)
    const firestoreBooking = {
        date: selectedSlot.date,
        time: selectedSlot.time,
        name: name
    };
    
    // Full booking object for local use (email, access code, etc.)
    const newBooking = {
        date: selectedSlot.date,
        time: selectedSlot.time,
        name: name,
        email: email,
        phone: phone || '',
        accessCode: accessCode,
        createdAt: new Date().toISOString()
    };
    
    // Show loading state
    const modal = document.getElementById('booking-confirm-modal');
    const submitBtn = modal.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.textContent;
    submitBtn.textContent = 'Processing...';
    submitBtn.disabled = true;
    
    try {
        // Try to save to Firestore first (only name and time)
        if (window.firebaseReady && window.firebaseDB) {
            const firestoreId = await saveBookingToFirestore(firestoreBooking);
            newBooking.id = firestoreId;
            console.log('Booking saved to Firestore:', firestoreBooking);
        } else {
            // Fallback to local storage only
            newBooking.id = generateBookingId();
            bookedSlots.push(newBooking);
            saveBookingsToStorage();
            console.log('Booking saved to localStorage:', newBooking);
        }
    } catch (error) {
        console.error('Error saving booking:', error);
        // Fallback to local storage
        newBooking.id = generateBookingId();
        bookedSlots.push(newBooking);
        saveBookingsToStorage();
        console.log('Fallback: Booking saved to localStorage:', newBooking);
    }
    
    // Send confirmation email
    const emailSent = await sendConfirmationEmail(newBooking);
    
    // Show success message
    modal.querySelector('.modal-content').innerHTML = `
        <div style="text-align: center; padding: 20px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 16px;">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
            <h3 style="margin-bottom: 12px; color: #10b981;">Booking Confirmed!</h3>
            <p style="color: #6b7280; margin-bottom: 8px;">Thank you, ${name}!</p>
            <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
                <p style="color: #6b7280; margin-bottom: 8px;">Your access code is:</p>
                <p style="font-size: 2rem; font-weight: 700; color: #4f46e5; letter-spacing: 8px;">${accessCode}</p>
            </div>
            <p style="color: #6b7280; margin-bottom: 8px; font-size: 0.875rem;">
                ${emailSent 
                    ? `A confirmation email has been sent to <strong>${email}</strong>` 
                    : `Please save this code - you'll need it to access the prayer room.`
                }
            </p>
            <p style="color: #9ca3af; font-size: 0.75rem; margin-bottom: 20px;">Use this code on the door keypad to enter.</p>
            <button class="modal-btn" onclick="location.reload()">Close</button>
        </div>
    `;
    
    // Re-render calendar to show the new booking (only needed for localStorage fallback)
    // Firestore real-time listener will auto-update
    if (!window.firebaseReady) {
        renderCalendar();
    }
}

// Cookie Banner Management
function initCookieBanner() {
    const cookieBanner = document.getElementById('cookie-banner');
    const cookiesAccepted = localStorage.getItem('cookiesAccepted');
    
    if (!cookiesAccepted) {
        // Show cookie banner after a short delay
        setTimeout(() => {
            cookieBanner.classList.add('active');
        }, 1000);
    }
}

function acceptCookies() {
    const cookieBanner = document.getElementById('cookie-banner');
    localStorage.setItem('cookiesAccepted', 'true');
    cookieBanner.classList.remove('active');
}

function showCookiePreferences() {
    // For now, just accept cookies - in a real implementation, 
    // this would open a cookie preferences modal
    alert('Cookie preferences would be displayed here. For now, essential cookies are used.');
}

// Booking Policy Modal
function showBookingPolicy() {
    const modal = document.getElementById('booking-policy-modal');
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    const modal = document.getElementById('booking-policy-modal');
    modal.classList.remove('active');
    document.body.style.overflow = '';
    
    // Redirect to booking page after closing modal
    window.open('https://stmarkscoventry.setmore.com/book?step=time-slot&products=e6166692-705b-4278-b9cd-105bff30580a&type=service&staff=22otwvUE2ZgTpH4zOZ133b738O9DemLC&staffSelected=true', '_blank');
}

// Close modals when clicking outside
document.addEventListener('click', function(event) {
    const policyModal = document.getElementById('booking-policy-modal');
    const bookingModal = document.getElementById('booking-confirm-modal');
    
    if (event.target === policyModal) {
        closeModal();
    }
    if (event.target === bookingModal) {
        closeBookingModal();
    }
});

// Close modal with Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        const policyModal = document.getElementById('booking-policy-modal');
        const bookingModal = document.getElementById('booking-confirm-modal');
        
        if (policyModal && policyModal.classList.contains('active')) {
            closeModal();
        }
        if (bookingModal && bookingModal.classList.contains('active')) {
            closeBookingModal();
        }
    }
});

// Smooth Scrolling for Navigation
function initSmoothScrolling() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetElement = document.querySelector(targetId);
            
            if (targetElement) {
                const headerHeight = document.querySelector('.header').offsetHeight;
                const targetPosition = targetElement.getBoundingClientRect().top + window.pageYOffset - headerHeight - 20;
                
                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });
            }
        });
    });
}

// Header Scroll Effect
function initHeaderScroll() {
    const header = document.querySelector('.header');
    let lastScrollY = window.scrollY;
    
    window.addEventListener('scroll', () => {
        const currentScrollY = window.scrollY;
        
        // Add shadow when scrolled
        if (currentScrollY > 10) {
            header.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.1)';
        } else {
            header.style.boxShadow = 'none';
        }
        
        lastScrollY = currentScrollY;
    });
}

// Opening Hours - Dynamic Status
function updateOpeningStatus() {
    const now = new Date();
    const hours = now.getHours();
    
    const statusElement = document.querySelector('.status');
    
    if (!statusElement) return;
    
    if (hours >= openingHour && hours < closingHour) {
        statusElement.innerHTML = `<span class="open-badge" style="color: #10b981; font-weight: 600;">Open</span> · Closes at ${closingHour > 12 ? closingHour - 12 : closingHour}PM`;
    } else {
        statusElement.innerHTML = `<span class="open-badge" style="color: #ef4444; font-weight: 600;">Closed</span> · Opens at ${openingHour}AM`;
    }
}

// Call on page load and update every minute
updateOpeningStatus();
setInterval(updateOpeningStatus, 60000);

// Gallery - Show All Photos
document.querySelector('.show-all-btn')?.addEventListener('click', function() {
    window.open('https://stmarkscoventry.setmore.com/gallery', '_blank');
});

// Review Button
document.querySelector('.review-btn')?.addEventListener('click', function() {
    alert('Review submission would be available here. Please visit the official page to leave a review.');
});

// Intersection Observer for Animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, observerOptions);

// Add fade-in animation to sections
document.querySelectorAll('.section').forEach(section => {
    section.style.opacity = '0';
    section.style.transform = 'translateY(20px)';
    section.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    observer.observe(section);
});

// Mobile Navigation Toggle (for future enhancement)
function toggleMobileNav() {
    const navMenu = document.querySelector('.nav-menu');
    navMenu.classList.toggle('active');
}

// Utility: Format Time
function formatTime(hour) {
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour > 12 ? hour - 12 : hour;
    return `${displayHour}${suffix}`;
}

// Console welcome message
console.log('%cThe Furnace Prayer Room', 'font-size: 24px; font-weight: bold; color: #4f46e5;');
console.log('%cBook your prayer room slot at St. Marks Coventry', 'font-size: 14px; color: #6b7280;');
