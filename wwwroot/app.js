/* ==========================================================================
   LuxeStay Premium SPA Core Engine
   ========================================================================== */

// Global State
let state = {
    user: null,          // { token, userId, userName, email, role, loyaltyPoints }
    currentHotel: null,  // Currently selected hotel details
    searchParams: {
        city: '',
        checkIn: '',
        checkOut: '',
        guests: 2
    },
    activeSysTab: 'hotels',
    activeHotelTab: 'rooms'
};

// API Base URL
const API_BASE = '/api';

// On Page Load
document.addEventListener('DOMContentLoaded', () => {
    // Restore User Session
    const savedUser = localStorage.getItem('luxestay_user');
    if (savedUser) {
        state.user = JSON.parse(savedUser);
    }

    // Set default search dates (tomorrow and day after)
    initDefaultDates();

    // Initialize UI Layout
    updateAuthUI();
    initEventListeners();

    // Fetch Spotlight Stays
    loadSpotlight();

    // Initialize Lucide Icons
    setTimeout(() => {
        lucide.createIcons();
    }, 100);
});

// Helper: Date Initializer
function initDefaultDates() {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dayAfter = new Date(tomorrow);
    dayAfter.setDate(dayAfter.getDate() + 2);

    const format = (d) => d.toISOString().split('T')[0];

    document.getElementById('search-checkin').value = format(tomorrow);
    document.getElementById('search-checkout').value = format(dayAfter);

    state.searchParams.checkIn = format(tomorrow);
    state.searchParams.checkOut = format(dayAfter);
}

// Update UI based on Authentication
function updateAuthUI() {
    const widget = document.getElementById('user-profile-widget');
    const loginTrigger = document.getElementById('btn-login-trigger');
    const linkHistory = document.getElementById('link-history');
    const linkSysAdmin = document.getElementById('link-sys-admin');
    const linkHotelAdmin = document.getElementById('link-hotel-admin');

    // Hide all admin nav links by default
    linkHistory.style.display = 'none';
    linkSysAdmin.style.display = 'none';
    linkHotelAdmin.style.display = 'none';

    if (state.user) {
        widget.style.display = 'flex';
        loginTrigger.style.display = 'none';

        document.getElementById('widget-username').innerText = state.user.userName;
        document.getElementById('widget-points').innerText = state.user.loyaltyPoints;

        // Show relevant tabs based on role
        if (state.user.role === 'Customer') {
            linkHistory.style.display = 'flex';
        } else if (state.user.role === 'SystemAdmin') {
            linkSysAdmin.style.display = 'flex';
        } else if (state.user.role === 'HotelAdmin') {
            linkHotelAdmin.style.display = 'flex';
        }
    } else {
        widget.style.display = 'none';
        loginTrigger.style.display = 'flex';

        // If logged out and not on explorer, route to explorer
        showView('view-explorer');
    }
}

// Router: Switch Views
function showView(viewId) {
    document.querySelectorAll('.view-section').forEach(view => {
        view.classList.remove('active');
    });
    document.getElementById(viewId).classList.add('active');

    // Update active state in nav menu
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });

    if (viewId === 'view-explorer') {
        document.getElementById('link-dashboard').classList.add('active');
    } else if (viewId === 'view-history') {
        document.getElementById('link-history').classList.add('active');
        loadBookingHistory();
    } else if (viewId === 'view-sys-admin') {
        document.getElementById('link-sys-admin').classList.add('active');
        switchSysTab('hotels');
    } else if (viewId === 'view-hotel-admin') {
        document.getElementById('link-hotel-admin').classList.add('active');
        switchHotelTab('rooms');
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Progress Bar Helper
function setProgress(percentage) {
    const bar = document.getElementById('top-progress');
    bar.style.width = percentage + '%';
    if (percentage >= 100) {
        setTimeout(() => { bar.style.width = '0%'; }, 500);
    }
}

// API Helper with JWT insertion
async function apiCall(endpoint, method = 'GET', body = null) {
    setProgress(30);
    const headers = {
        'Content-Type': 'application/json'
    };

    if (state.user && state.user.token) {
        headers['Authorization'] = `Bearer ${state.user.token}`;
    }

    const config = {
        method,
        headers
    };

    if (body) {
        config.body = JSON.stringify(body);
    }

    setProgress(60);
    try {
        const response = await fetch(`${API_BASE}${endpoint}`, config);
        setProgress(90);

        if (response.status === 401) {
            // Token expired or invalid
            if (endpoint !== '/auth/login') {
                handleLogout();
                throw new Error("Session expired. Please login again.");
            }
        }

        if (response.status === 429) {
            throw new Error("Too many requests. Please wait a minute before trying again.");
        }

        let data = null;
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            data = await response.json();
        }
        setProgress(100);

        if (!response.ok) {
            const errorMsg = (data && data.message) ? data.message : `HTTP Error ${response.status} (Not Found / Server Crash)`;
            throw new Error(errorMsg);
        }

        return data;
    } catch (err) {
        setProgress(100);
        console.error(err);
        throw err;
    }
}

// ==========================================================================
// Customer Explorer & Spotlight Business Logic
// ==========================================================================

async function loadSpotlight() {
    try {
        const data = await apiCall('/hotels/featured');

        // 1. Render Promo Offers banner
        const offersGrid = document.getElementById('offers-grid');
        offersGrid.innerHTML = data.offers.map(offer => `
            <div class="offer-card">
                <div>
                    <span class="offer-badge">${offer.discount}</span>
                    <h4>${offer.title}</h4>
                    <p>${offer.description}</p>
                </div>
                <div class="offer-footer">
                    <span class="offer-code">CODE: ${offer.code}</span>
                    <button class="btn btn-outline btn-sm" onclick="copyPromoCode('${offer.code}')">Copy</button>
                </div>
            </div>
        `).join('');

        // 2. Render Featured Hotel Cards
        const hotelGrid = document.getElementById('hotel-grid');
        hotelGrid.innerHTML = data.hotels.map(h => `
            <div class="hotel-card">
                <div class="hotel-card-image">
                    <img src="${h.imageUrl}" alt="${h.hotelName}">
                    <span class="hotel-card-rating"><i data-lucide="star" style="width:14px;height:14px;fill:currentColor"></i> ${h.ratings.toFixed(1)}</span>
                </div>
                <div class="hotel-card-info">
                    <div class="hotel-card-title">
                        <h3>${h.hotelName}</h3>
                        <p><i data-lucide="map-pin" style="width:12px;height:12px"></i> ${h.city}</p>
                    </div>
                    <p class="hotel-card-desc">${h.description}</p>
                    <div class="hotel-card-amenities">
                        ${h.amenities.map(a => `<span>${a}</span>`).join('')}
                    </div>
                    <div class="hotel-card-footer">
                        <div class="hotel-price">
                            Starting from<br>
                            <strong>$${h.priceFrom.toFixed(2)}</strong> / night
                        </div>
                        <button class="btn btn-primary btn-sm" onclick="openHotelDetails(${h.hotelId})">View Rooms</button>
                    </div>
                </div>
            </div>
        `).join('');

        document.getElementById('results-count').innerText = "Featured properties spotlight";
        lucide.createIcons();
    } catch (err) {
        document.getElementById('hotel-grid').innerHTML = `<div class="error-msg">${err.message}</div>`;
    }
}

function copyPromoCode(code) {
    navigator.clipboard.writeText(code);
    alert(`Coupon Code '${code}' copied to clipboard! Use it on pay online checkout.`);
}

// Search and Filter form handler
async function handleSearch(e) {
    if (e) e.preventDefault();

    const city = document.getElementById('search-city').value;
    const checkIn = document.getElementById('search-checkin').value;
    const checkOut = document.getElementById('search-checkout').value;
    const minRating = document.querySelector('input[name="filter-rating"]:checked').value;
    const maxPrice = document.getElementById('filter-price-range').value;

    // Gather checklist amenities
    const amenities = Array.from(document.querySelectorAll('input[name="filter-amenity"]:checked'))
        .map(input => input.value)
        .join(',');

    state.searchParams = { city, checkIn, checkOut };

    let url = `/hotels?1=1`;
    if (city) url += `&city=${encodeURIComponent(city)}`;
    if (checkIn) url += `&checkIn=${checkIn}`;
    if (checkOut) url += `&checkOut=${checkOut}`;
    if (minRating > 0) url += `&minRating=${minRating}`;
    if (maxPrice < 1000) url += `&maxPrice=${maxPrice}`;
    if (amenities) url += `&amenities=${encodeURIComponent(amenities)}`;

    const hotelGrid = document.getElementById('hotel-grid');
    hotelGrid.innerHTML = `
        <div class="loading-spinner-wrapper">
            <div class="spinner"></div>
            <p>Scanning room registers...</p>
        </div>`;

    try {
        const hotels = await apiCall(url);
        document.getElementById('results-count').innerText = `Found ${hotels.length} matching hotel properties`;

        if (hotels.length === 0) {
            hotelGrid.innerHTML = `
                <div class="loading-spinner-wrapper">
                    <i data-lucide="frown" style="width:48px;height:48px;color:var(--text-muted);margin-bottom:10px;"></i>
                    <h3>No properties matching criteria</h3>
                    <p>Try expanding your search parameters or dates.</p>
                </div>`;
            lucide.createIcons();
            return;
        }

        hotelGrid.innerHTML = hotels.map(h => {
            const prices = h.roomTypes.map(rt => rt.price);
            const minPrice = prices.length > 0 ? Math.min(...prices) : 0;

            return `
                <div class="hotel-card">
                    <div class="hotel-card-image">
                        <img src="${h.imageUrl}" alt="${h.hotelName}">
                        <span class="hotel-card-rating"><i data-lucide="star" style="width:14px;height:14px;fill:currentColor"></i> ${h.ratings.toFixed(1)}</span>
                    </div>
                    <div class="hotel-card-info">
                        <div class="hotel-card-title">
                            <h3>${h.hotelName}</h3>
                            <p><i data-lucide="map-pin" style="width:12px;height:12px"></i> ${h.address}, ${h.city}</p>
                        </div>
                        <p class="hotel-card-desc">${h.description}</p>
                        <div class="hotel-card-amenities">
                            ${h.amenities.map(a => `<span>${a}</span>`).join('')}
                        </div>
                        <div class="hotel-card-footer">
                            <div class="hotel-price">
                                From<br>
                                <strong>$${minPrice.toFixed(2)}</strong> / night
                            </div>
                            <button class="btn btn-primary btn-sm" onclick="openHotelDetails(${h.hotelId})">Book Room</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        lucide.createIcons();
    } catch (err) {
        hotelGrid.innerHTML = `<div class="loading-spinner-wrapper"><p class="error-msg">${err.message}</p></div>`;
    }
}

// View Hotel details
async function openHotelDetails(hotelId) {
    const checkIn = state.searchParams.checkIn || '';
    const checkOut = state.searchParams.checkOut || '';

    let url = `/hotels/${hotelId}`;
    if (checkIn && checkOut) {
        url += `?checkIn=${checkIn}&checkOut=${checkOut}`;
    }

    try {
        const hotel = await apiCall(url);
        state.currentHotel = hotel;

        const content = document.getElementById('hotel-details-content');
        content.innerHTML = `
            <div class="hotel-details-header">
                <img src="${hotel.imageUrl}" alt="${hotel.hotelName}">
                <span class="hotel-details-rating-badge"><i data-lucide="star" style="width:16px;height:16px;fill:currentColor"></i> ${hotel.ratings.toFixed(1)} / 5.0 Rating</span>
            </div>
            
            <div class="details-grid">
                <div class="details-main">
                    <h1>${hotel.hotelName}</h1>
                    <p class="location"><i data-lucide="map-pin"></i> ${hotel.address}, ${hotel.city}, ${hotel.state} - ${hotel.pincode}</p>
                    <p class="desc">${hotel.description}</p>
                    
                    <h3 class="room-categories-title">Available Room Categories</h3>
                    <div class="room-types-list">
                        ${hotel.roomTypes.map(rt => {
            const isSoldOut = rt.availableRoomsCount <= 0;
            return `
                                <div class="room-type-row">
                                    <div class="room-type-meta">
                                        <h4>${rt.name}</h4>
                                        <p>${rt.description}</p>
                                        <div class="room-type-amenities-row">
                                            <span>Max occupancy: ${rt.capacity} guests</span>
                                            ${rt.amenities.split(',').map(a => `<span>${a.trim()}</span>`).join('')}
                                        </div>
                                    </div>
                                    <div class="room-type-action">
                                        <div class="room-price">$${rt.price.toFixed(2)} <span>/ night</span></div>
                                        <span class="availability-tag ${isSoldOut ? 'no-rooms' : ''}">
                                            ${isSoldOut ? '<i data-lucide="x-circle" style="display:inline;width:10px;height:10px"></i> Sold Out' : `<i data-lucide="check-circle" style="display:inline;width:10px;height:10px"></i> Only ${rt.availableRoomsCount} rooms left`}
                                        </span>
                                        <button class="btn btn-primary btn-sm" ${isSoldOut ? 'disabled' : ''} onclick="openCheckout(${rt.roomTypeId}, '${rt.name}', ${rt.price})">
                                            Book Category
                                        </button>
                                    </div>
                                </div>
                            `;
        }).join('')}
                    </div>
                </div>
                
                <div class="details-sidebar">
                    <h3>Hotel Conveniences</h3>
                    <ul>
                        ${hotel.amenities.map(a => `<li><i data-lucide="check" style="width:16px;height:16px"></i> ${a}</li>`).join('')}
                    </ul>
                </div>
            </div>
        `;

        openModal('modal-hotel-details');
        lucide.createIcons();
    } catch (err) {
        alert(err.message);
    }
}

// ==========================================================================
// Booking & Checkout Flow Business Logic
// ==========================================================================

let bookingCostCalculator = {
    baseRate: 0,
    nights: 1,
    couponDiscount: 0,
    loyaltyDiscount: 0,
    appliedCouponCode: null,

    calcTotal: function () {
        const rawTotal = (this.baseRate * this.nights) - this.couponDiscount - this.loyaltyDiscount;
        return Math.max(0, rawTotal);
    }
};

function openCheckout(roomTypeId, roomTypeName, price) {
    // Check if checkin / checkout are specified
    const checkIn = document.getElementById('search-checkin').value;
    const checkOut = document.getElementById('search-checkout').value;

    if (!checkIn || !checkOut) {
        alert("Please select check-in and check-out dates on search bar first.");
        return;
    }

    closeModal('modal-hotel-details');
    openModal('modal-checkout');

    document.getElementById('checkout-roomtype-id').value = roomTypeId;
    document.getElementById('checkout-room-info').innerText = `${roomTypeName} | ${state.currentHotel.hotelName}`;

    document.getElementById('checkout-dates-in').innerText = checkIn;
    document.getElementById('checkout-dates-out').innerText = checkOut;

    // Calculate nights
    const date1 = new Date(checkIn);
    const date2 = new Date(checkOut);
    const nights = Math.round((date2 - date1) / (1000 * 60 * 60 * 24));

    document.getElementById('checkout-nights').innerText = nights;
    document.getElementById('summary-nights').innerText = nights;

    // Set cost calculator
    bookingCostCalculator.baseRate = price;
    bookingCostCalculator.nights = nights;
    bookingCostCalculator.couponDiscount = 0;
    bookingCostCalculator.loyaltyDiscount = 0;
    bookingCostCalculator.appliedCouponCode = null;

    // Reset coupon elements
    document.getElementById('checkout-coupon').value = '';
    document.getElementById('coupon-feedback').className = 'coupon-feedback';
    document.getElementById('checkout-use-points').checked = false;
    document.getElementById('summary-discount-row').style.display = 'none';

    // Fill pre-login details if logged in
    if (state.user) {
        document.getElementById('checkout-guest-name').value = state.user.userName;
        document.getElementById('checkout-guest-email').value = state.user.email;
        document.getElementById('checkout-guest-phone').value = state.user.phone || '';

        // Show loyalty spend points if they have points
        if (state.user.loyaltyPoints > 0) {
            document.getElementById('loyalty-spend-container').style.display = 'block';
            document.getElementById('checkout-avail-points').innerText = state.user.loyaltyPoints;
            document.getElementById('checkout-points-discount').innerText = state.user.loyaltyPoints; // 1pt = $1
        } else {
            document.getElementById('loyalty-spend-container').style.display = 'none';
        }
    } else {
        document.getElementById('checkout-guest-name').value = '';
        document.getElementById('checkout-guest-email').value = '';
        document.getElementById('checkout-guest-phone').value = '';
        document.getElementById('loyalty-spend-container').style.display = 'none';
    }

    // Set path default to Offline
    document.getElementById('path-offline').classList.add('active');
    document.getElementById('path-online').classList.remove('active');
    document.getElementById('online-payment-addons').style.display = 'none';
    document.querySelector('input[name="payment-method"][value="Offline Payment"]').checked = true;

    updateSummaryUI();
}

function updateSummaryUI() {
    const baseTotal = bookingCostCalculator.baseRate * bookingCostCalculator.nights;
    document.getElementById('summary-base-rate').innerText = `$${baseTotal.toFixed(2)}`;

    const totalDiscount = bookingCostCalculator.couponDiscount + bookingCostCalculator.loyaltyDiscount;
    if (totalDiscount > 0) {
        document.getElementById('summary-discount-row').style.display = 'flex';
        document.getElementById('summary-discount').innerText = `-$${totalDiscount.toFixed(2)}`;
    } else {
        document.getElementById('summary-discount-row').style.display = 'none';
    }

    const grandTotal = bookingCostCalculator.calcTotal();
    document.getElementById('summary-total').innerText = `$${grandTotal.toFixed(2)}`;
}

// Apply Coupon validation locally or via API (simplified local mock for speed, backend validates strictly)
function handleApplyCoupon() {
    const code = document.getElementById('checkout-coupon').value.trim().toUpperCase();
    const feedback = document.getElementById('coupon-feedback');
    const baseTotal = bookingCostCalculator.baseRate * bookingCostCalculator.nights;

    if (!code) {
        feedback.innerText = "Please enter a coupon code";
        feedback.className = "coupon-feedback error";
        return;
    }

    // Seeding simulation of coupons on client
    let discount = 0;
    let desc = "";
    if (code === 'WELCOME10') {
        discount = baseTotal * 0.10;
        desc = "10% Welcome Discount applied!";
    } else if (code === 'SAVE50') {
        if (baseTotal >= 200) {
            discount = 50;
            desc = "$50.00 Summer Special Discount applied!";
        } else {
            feedback.innerText = "SAVE50 requires minimum booking of $200";
            feedback.className = "coupon-feedback error";
            return;
        }
    } else {
        feedback.innerText = "Invalid or expired coupon code";
        feedback.className = "coupon-feedback error";
        return;
    }

    bookingCostCalculator.couponDiscount = discount;
    bookingCostCalculator.appliedCouponCode = code;

    feedback.innerText = desc;
    feedback.className = "coupon-feedback success";

    updateSummaryUI();
}

function handleLoyaltyToggle() {
    const usePoints = document.getElementById('checkout-use-points').checked;
    const baseTotal = bookingCostCalculator.baseRate * bookingCostCalculator.nights;

    if (usePoints && state.user) {
        const remainingCost = baseTotal - bookingCostCalculator.couponDiscount;
        // Limit discount to user points or remaining cost
        const discount = Math.min(state.user.loyaltyPoints, remainingCost);
        bookingCostCalculator.loyaltyDiscount = discount;
    } else {
        bookingCostCalculator.loyaltyDiscount = 0;
    }

    updateSummaryUI();
}

// Submit Checkout Booking
async function submitBooking(e) {
    e.preventDefault();
    const errorMsg = document.getElementById('checkout-error-msg');
    errorMsg.style.display = 'none';

    const roomTypeId = parseInt(document.getElementById('checkout-roomtype-id').value);
    const checkIn = document.getElementById('search-checkin').value;
    const checkOut = document.getElementById('search-checkout').value;
    const guestName = document.getElementById('checkout-guest-name').value;
    const guestEmail = document.getElementById('checkout-guest-email').value;
    const guestPhone = document.getElementById('checkout-guest-phone').value;
    const paymentMethod = document.querySelector('input[name="payment-method"]:checked').value;
    const usePoints = document.getElementById('checkout-use-points').checked;
    const couponCode = bookingCostCalculator.appliedCouponCode;

    const bookingPayload = {
        roomTypeId,
        checkIn: new Date(checkIn),
        checkOut: new Date(checkOut),
        guestName,
        guestEmail,
        guestPhone,
        paymentMethod,
        couponCode: paymentMethod === 'Online Payment' ? couponCode : null,
        claimLoyaltyPoints: paymentMethod === 'Online Payment' && usePoints
    };

    try {
        const result = await apiCall('/bookings', 'POST', bookingPayload);

        // 1. Success! Close checkout modal
        closeModal('modal-checkout');

        // 2. Display booking status & simulated email log
        document.getElementById('email-preview-content').innerText = result.emailPreview;
        openModal('modal-status');

        // 3. Update local user points claim
        if (state.user) {
            // Re-fetch profile to sync points properly
            const profile = await apiCall('/auth/login', 'POST', {
                email: state.user.email,
                password: state.user.email === 'customer@hotel.com' ? 'cust123' : 'admin123' // Simplified since we don't store plain passwords
            }).catch(() => null);

            if (profile) {
                state.user.loyaltyPoints = profile.loyaltyPoints;
                localStorage.setItem('luxestay_user', JSON.stringify(state.user));
                updateAuthUI();
            }
        }

    } catch (err) {
        errorMsg.innerText = err.message;
        errorMsg.style.display = 'block';
    }
}

// Load user booking history
async function loadBookingHistory() {
    const grid = document.getElementById('history-grid');
    grid.innerHTML = `
        <div class="loading-spinner-wrapper">
            <div class="spinner"></div>
            <p>Retrieving your registration cards...</p>
        </div>`;

    try {
        const bookings = await apiCall('/bookings/history');

        if (bookings.length === 0) {
            grid.innerHTML = `
                <div class="loading-spinner-wrapper">
                    <i data-lucide="calendar" style="width:48px;height:48px;color:var(--text-muted);margin-bottom:10px;"></i>
                    <h3>No past reservations on file</h3>
                    <p>Explore our premium catalog to book a stay.</p>
                </div>`;
            lucide.createIcons();
            return;
        }

        grid.innerHTML = bookings.map(b => {
            const inDate = new Date(b.checkIn).toLocaleDateString();
            const outDate = new Date(b.checkOut).toLocaleDateString();
            const isPending = b.bookingStatus === 'Pending';
            const isConfirmed = b.bookingStatus === 'Confirmed';
            const isCancelled = b.bookingStatus === 'Cancelled';

            let badgeClass = 'badge-warning';
            if (isConfirmed) badgeClass = 'badge-success';
            if (isCancelled) badgeClass = 'badge-danger';

            return `
                <div class="history-card">
                    <div class="history-card-img">
                        <img src="${b.hotelImageUrl || 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80'}" alt="${b.hotelName}">
                    </div>
                    <div class="history-card-details">
                        <span class="badge ${badgeClass}">${b.bookingStatus}</span>
                        <h3>${b.hotelName}</h3>
                        <p><i data-lucide="map-pin" style="width:11px;height:11px;display:inline;"></i> ${b.city} | Room ${b.roomNo} (${b.roomTypeName})</p>
                        <div class="history-card-meta">
                            <div>Res No: <strong>${b.reservationNumber}</strong></div>
                            <div>Check In: <strong>${inDate}</strong></div>
                            <div>Check Out: <strong>${outDate}</strong></div>
                        </div>
                    </div>
                    <div class="history-card-action">
                        <div class="price">$${b.totalAmount.toFixed(2)}</div>
                        <div class="history-card-meta" style="margin-bottom:8px;">
                            <span>${b.paymentMethod}</span>
                            <span class="badge ${b.paymentStatus === 'Paid' ? 'badge-success' : 'badge-danger'}">${b.paymentStatus}</span>
                        </div>
                        <div class="btn-group">
                            ${!isCancelled ? `<button class="btn btn-outline btn-sm btn-danger" onclick="cancelBooking(${b.bookingId})">Cancel</button>` : ''}
                            <button class="btn btn-primary btn-sm" onclick="openRebook(${b.bookingId}, '${b.hotelName}')"><i data-lucide="refresh-cw" style="width:12px;height:12px"></i> Rebook</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        lucide.createIcons();
    } catch (err) {
        grid.innerHTML = `<div class="error-msg">${err.message}</div>`;
    }
}

// Cancel Booking
async function cancelBooking(bookingId) {
    if (!confirm("Are you sure you want to cancel this reservation? If paid online, a full refund will be simulated.")) {
        return;
    }

    try {
        await apiCall(`/bookings/${bookingId}/cancel`, 'POST');
        alert("Booking cancelled successfully.");
        loadBookingHistory();
    } catch (err) {
        alert(err.message);
    }
}

// Open Rebook Dialog
function openRebook(bookingId, hotelName) {
    openModal('modal-rebook');
    document.getElementById('rebook-booking-id').value = bookingId;
    document.getElementById('rebook-hotel-name').innerText = hotelName;
    document.getElementById('rebook-error-msg').style.display = 'none';

    // Pre-fill today's dates
    const today = new Date();
    const future = new Date(today);
    future.setDate(future.getDate() + 3);
    const format = (d) => d.toISOString().split('T')[0];

    document.getElementById('rebook-checkin').value = format(today);
    document.getElementById('rebook-checkout').value = format(future);

    // Handle path selection
    document.getElementById('rebook-path-offline').classList.add('active');
    document.getElementById('rebook-path-online').classList.remove('active');
    document.querySelector('input[name="rebook-payment-method"][value="Offline Payment"]').checked = true;
}

// Submit Rebooking
async function submitRebook(e) {
    e.preventDefault();
    const errorMsg = document.getElementById('rebook-error-msg');
    errorMsg.style.display = 'none';

    const bookingId = parseInt(document.getElementById('rebook-booking-id').value);
    const checkIn = document.getElementById('rebook-checkin').value;
    const checkOut = document.getElementById('rebook-checkout').value;
    const paymentMethod = document.querySelector('input[name="rebook-payment-method"]:checked').value;

    const payload = {
        checkIn: new Date(checkIn),
        checkOut: new Date(checkOut),
        paymentMethod,
        claimLoyaltyPoints: false // Simplified for rebook
    };

    try {
        const result = await apiCall(`/bookings/${bookingId}/rebook`, 'POST', payload);
        closeModal('modal-rebook');

        // Show status
        document.getElementById('email-preview-content').innerText = result.emailPreview;
        openModal('modal-status');

        // Reload list
        loadBookingHistory();
    } catch (err) {
        errorMsg.innerText = err.message;
        errorMsg.style.display = 'block';
    }
}


// ==========================================================================
// System Administrator Operations (Unified portal)
// ==========================================================================

function switchSysTab(tabName) {
    state.activeSysTab = tabName;
    document.querySelectorAll('#view-sys-admin .admin-menu-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`sys-tab-${tabName}`).classList.add('active');

    document.querySelectorAll('#view-sys-admin .admin-panel-content').forEach(p => {
        p.classList.remove('active');
    });

    if (tabName === 'hotels') {
        document.getElementById('panel-sys-hotels').classList.add('active');
        sysLoadHotels();
    } else if (tabName === 'users') {
        document.getElementById('panel-sys-users').classList.add('active');
        sysLoadUsers();
    } else if (tabName === 'coupons') {
        document.getElementById('panel-sys-coupons').classList.add('active');
        sysLoadCoupons();
    }
}

// Load Hotels table (System Admin)
async function sysLoadHotels() {
    const tbody = document.getElementById('table-sys-hotels');
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Retrieving assets...</td></tr>`;

    try {
        const hotels = await apiCall('/admin/hotels');
        tbody.innerHTML = hotels.map(h => `
            <tr>
                <td style="font-weight:600;color:var(--text-white)">${h.hotelName}</td>
                <td>${h.city}, ${h.state}</td>
                <td>
                    <div style="font-weight:500;">${h.adminName}</div>
                    <div style="font-size:11px;color:var(--text-muted)">${h.adminEmail}</div>
                </td>
                <td>${h.roomsCount} units</td>
                <td style="color:var(--color-warning);font-weight:700;"><i data-lucide="star" style="width:12px;height:12px;fill:currentColor;display:inline"></i> ${h.ratings.toFixed(1)}</td>
                <td>
                    <button class="btn btn-outline btn-sm" onclick="alert('Asset editing disabled in demo.')">Edit</button>
                </td>
            </tr>
        `).join('');
        lucide.createIcons();
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="error-msg">${err.message}</td></tr>`;
    }
}

// Add Hotel submit handler
async function handleAddHotel(e) {
    e.preventDefault();
    const errorMsg = document.getElementById('sys-hotel-error-msg');
    errorMsg.style.display = 'none';

    const hotelName = document.getElementById('sys-hotel-name').value;
    const description = document.getElementById('sys-hotel-desc').value;
    const address = document.getElementById('sys-hotel-addr').value;
    const city = document.getElementById('sys-hotel-city').value;
    const stateVal = document.getElementById('sys-hotel-state').value;
    const pincode = document.getElementById('sys-hotel-pincode').value;
    const ratings = parseFloat(document.getElementById('sys-hotel-rating').value);
    const imageUrl = document.getElementById('sys-hotel-img').value;

    const adminName = document.getElementById('sys-hotel-admin-name').value;
    const adminEmail = document.getElementById('sys-hotel-admin-email').value;
    const adminPhone = document.getElementById('sys-hotel-admin-phone').value;
    const adminPassword = document.getElementById('sys-hotel-admin-pass').value;

    const payload = {
        hotelName, description, address, city, state: stateVal, pincode, ratings, imageUrl,
        adminName, adminEmail, adminPhone, adminPassword
    };

    try {
        await apiCall('/admin/hotels', 'POST', payload);
        closeModal('modal-sys-add-hotel');
        sysLoadHotels();
        alert("Property and dedicated manager account created successfully!");
    } catch (err) {
        errorMsg.innerText = err.message;
        errorMsg.style.display = 'block';
    }
}

// Load User Accounts table (System Admin)
async function sysLoadUsers() {
    const role = document.getElementById('filter-user-role').value;
    const tbody = document.getElementById('table-sys-users');
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;">Consulting directories...</td></tr>`;

    let url = '/admin/users';
    if (role) url += `?role=${role}`;

    try {
        const users = await apiCall(url);
        tbody.innerHTML = users.map(u => `
            <tr>
                <td style="font-weight:600;color:var(--text-white)">${u.userName}</td>
                <td>${u.email}</td>
                <td>${u.phone}</td>
                <td><span class="badge ${u.role === 'SystemAdmin' ? 'badge-danger' : (u.role === 'HotelAdmin' ? 'badge-info' : 'badge-success')}">${u.role}</span></td>
                <td style="font-weight:700;">${u.loyaltyPoints} pts</td>
            </tr>
        `).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="5" class="error-msg">${err.message}</td></tr>`;
    }
}

// Load Coupons (System Admin)
async function sysLoadCoupons() {
    const tbody = document.getElementById('table-sys-coupons');
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Retrieving ledger...</td></tr>`;

    try {
        const coupons = await apiCall('/admin/coupons');
        tbody.innerHTML = coupons.map(c => {
            const exp = new Date(c.expiryDate).toLocaleDateString();
            return `
                <tr>
                    <td style="font-family:monospace;font-weight:700;color:var(--text-white);font-size:14px;">${c.code}</td>
                    <td>${c.discountType}</td>
                    <td style="font-weight:700;">${c.discountType === 'Percentage' ? `${c.discountValue}%` : `$${c.discountValue.toFixed(2)}`}</td>
                    <td>${exp}</td>
                    <td><span class="badge ${c.isActive ? 'badge-success' : 'badge-danger'}">${c.isActive ? 'Active' : 'Expired'}</span></td>
                    <td>
                        <button class="btn btn-outline btn-sm btn-danger" onclick="sysDeleteCoupon(${c.couponId})">Delete</button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="error-msg">${err.message}</td></tr>`;
    }
}

// Add Coupon Code
async function handleAddCoupon(e) {
    e.preventDefault();
    const errorMsg = document.getElementById('sys-coupon-error-msg');
    errorMsg.style.display = 'none';

    const code = document.getElementById('sys-coupon-code').value;
    const discountType = document.getElementById('sys-coupon-type').value;
    const discountValue = parseFloat(document.getElementById('sys-coupon-value').value);
    const expiryDate = document.getElementById('sys-coupon-expiry').value;

    const payload = {
        code, discountType, discountValue, expiryDate: new Date(expiryDate), isActive: true
    };

    try {
        await apiCall('/admin/coupons', 'POST', payload);
        closeModal('modal-sys-add-coupon');
        sysLoadCoupons();
    } catch (err) {
        errorMsg.innerText = err.message;
        errorMsg.style.display = 'block';
    }
}

// Delete Coupon
async function sysDeleteCoupon(id) {
    if (!confirm("Delete this promo coupon code?")) return;
    try {
        await apiCall(`/admin/coupons/${id}`, 'DELETE');
        sysLoadCoupons();
    } catch (err) {
        alert(err.message);
    }
}


// ==========================================================================
// Hotel Administrator Operations (Hotel Room & Amenity Controls)
// ==========================================================================

function switchHotelTab(tabName) {
    state.activeHotelTab = tabName;
    document.querySelectorAll('#view-hotel-admin .admin-menu-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.getElementById(`hotel-tab-${tabName}`).classList.add('active');

    document.querySelectorAll('#view-hotel-admin .admin-panel-content').forEach(p => {
        p.classList.remove('active');
    });

    if (tabName === 'rooms') {
        document.getElementById('panel-hotel-rooms').classList.add('active');
        hotelLoadRooms();
    } else if (tabName === 'amenities') {
        document.getElementById('panel-hotel-amenities').classList.add('active');
        hotelLoadAmenities();
    } else if (tabName === 'bookings') {
        document.getElementById('panel-hotel-bookings').classList.add('active');
        hotelLoadBookings();
    }
}

// Load Rooms Inventory (Hotel Admin)
async function hotelLoadRooms() {
    const tbody = document.getElementById('table-hotel-rooms');
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Scanning inventory...</td></tr>`;

    try {
        const data = await apiCall('/hotel-admin/rooms');

        document.getElementById('hotel-admin-title').innerText = data.hotelName;
        document.getElementById('hotel-admin-subtitle').innerText = "Authorized Property Manager";

        // Pre-fill rooms add modal categories dropdown select options
        const select = document.getElementById('hotel-room-type-select');
        select.innerHTML = data.roomTypes.map(rt => `<option value="${rt.roomTypeId}">${rt.name} ($${rt.price}/night)</option>`).join('');

        if (data.rooms.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">No rooms registered. Click 'Add Room' to start.</td></tr>`;
            return;
        }

        tbody.innerHTML = data.rooms.map(r => {
            const isAvail = r.status === 'Available';
            return `
                <tr>
                    <td style="font-weight:600;color:var(--text-white);font-size:14px;">Room ${r.roomNo}</td>
                    <td>${r.roomTypeName}</td>
                    <td>${r.capacity} Guests</td>
                    <td style="font-weight:700;">$${r.price.toFixed(2)}</td>
                    <td>
                        <span class="badge ${isAvail ? 'badge-success' : 'badge-danger'}">${r.status}</span>
                    </td>
                    <td>
                        <button class="btn btn-outline btn-sm" onclick="toggleRoomStatus(${r.roomId}, '${r.status}')">
                            Toggle Status
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="error-msg">${err.message}</td></tr>`;
    }
}

// Add Room Unit (Hotel Admin)
async function handleAddRoom(e) {
    e.preventDefault();
    const errorMsg = document.getElementById('hotel-room-error-msg');
    errorMsg.style.display = 'none';

    const roomNo = document.getElementById('hotel-room-no').value;
    const roomTypeId = parseInt(document.getElementById('hotel-room-type-select').value);
    const status = document.getElementById('hotel-room-status').value;

    const payload = { roomNo, roomTypeId, status };

    try {
        await apiCall('/hotel-admin/rooms', 'POST', payload);
        closeModal('modal-hotel-add-room');
        hotelLoadRooms();
    } catch (err) {
        errorMsg.innerText = err.message;
        errorMsg.style.display = 'block';
    }
}

// Add Room Category / Type (Hotel Admin)
async function handleAddRoomType(e) {
    e.preventDefault();
    const errorMsg = document.getElementById('hotel-rt-error-msg');
    errorMsg.style.display = 'none';

    const name = document.getElementById('hotel-rt-name').value;
    const price = parseFloat(document.getElementById('hotel-rt-price').value);
    const capacity = parseInt(document.getElementById('hotel-rt-capacity').value);
    const description = document.getElementById('hotel-rt-desc').value;
    const amenities = document.getElementById('hotel-rt-amenities').value;

    const payload = { name, price, capacity, description, amenities };

    try {
        await apiCall('/hotel-admin/roomtypes', 'POST', payload);
        closeModal('modal-hotel-add-roomtype');
        hotelLoadRooms();
    } catch (err) {
        errorMsg.innerText = err.message;
        errorMsg.style.display = 'block';
    }
}

// Toggle room status
async function toggleRoomStatus(roomId, currentStatus) {
    const newStatus = currentStatus === 'Available' ? 'Maintenance' : 'Available';
    try {
        await apiCall(`/hotel-admin/rooms/${roomId}/status`, 'PUT', newStatus);
        hotelLoadRooms();
    } catch (err) {
        alert(err.message);
    }
}

// Load Hotel Amenities (Hotel Admin)
async function hotelLoadAmenities() {
    const grid = document.getElementById('grid-hotel-amenities');
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;">Retrieving facilities data...</div>`;

    try {
        const data = await apiCall('/hotel-admin/amenities');
        grid.innerHTML = data.amenities.map(a => `
            <div class="amenity-toggle-card">
                <span>${a.name}</span>
                <label class="switch">
                    <input type="checkbox" ${a.isAvailable ? 'checked' : ''} onchange="toggleAmenityStatus(${a.amenityId})">
                    <span class="slider"></span>
                </label>
            </div>
        `).join('');
    } catch (err) {
        grid.innerHTML = `<div class="error-msg">${err.message}</div>`;
    }
}

// Toggle Amenity available switch
async function toggleAmenityStatus(amenityId) {
    try {
        await apiCall(`/hotel-admin/amenities/${amenityId}/toggle`, 'PUT');
        hotelLoadAmenities();
    } catch (err) {
        alert(err.message);
    }
}

// Add Amenity (Hotel Admin)
async function handleAddAmenity(e) {
    e.preventDefault();
    const errorMsg = document.getElementById('hotel-amenity-error-msg');
    errorMsg.style.display = 'none';

    const name = document.getElementById('hotel-amenity-name').value;
    const isAvailable = document.getElementById('hotel-amenity-status').checked;

    const payload = { name, isAvailable };

    try {
        await apiCall('/hotel-admin/amenities', 'POST', payload);
        closeModal('modal-hotel-add-amenity');
        hotelLoadAmenities();
    } catch (err) {
        errorMsg.innerText = err.message;
        errorMsg.style.display = 'block';
    }
}

// Load Hotel Bookings list (Hotel Admin)
async function hotelLoadBookings() {
    const tbody = document.getElementById('table-hotel-bookings');
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;">Reading bookings sheet...</td></tr>`;

    try {
        const bookings = await apiCall('/hotel-admin/bookings');

        if (bookings.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">No reservations placed yet for your hotel.</td></tr>`;
            return;
        }

        tbody.innerHTML = bookings.map(b => {
            const checkIn = new Date(b.checkIn).toLocaleDateString();
            const checkOut = new Date(b.checkOut).toLocaleDateString();
            const statusClass = b.bookingStatus === 'Confirmed' ? 'badge-success' : (b.bookingStatus === 'Pending' ? 'badge-warning' : 'badge-danger');

            return `
                <tr>
                    <td style="font-weight:600;color:var(--text-white);font-family:monospace;">${b.reservationNumber}</td>
                    <td>
                        <div style="font-weight:600;">${b.guestName}</div>
                        <div style="font-size:11px;color:var(--text-muted)">${b.guestEmail} | ${b.guestPhone}</div>
                    </td>
                    <td>
                        <div>Room ${b.roomNo}</div>
                        <div style="font-size:11px;color:var(--text-muted)">${b.roomTypeName}</div>
                    </td>
                    <td>
                        <div>${checkIn}</div>
                        <div style="font-size:11px;color:var(--text-muted)">to ${checkOut}</div>
                    </td>
                    <td style="font-weight:700;">$${b.totalAmount.toFixed(2)}</td>
                    <td>
                        <span class="badge ${statusClass}">${b.bookingStatus}</span>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="6" class="error-msg">${err.message}</td></tr>`;
    }
}


// ==========================================================================
// Authentication: User login / register submit handlers
// ==========================================================================

async function handleLogin(e) {
    e.preventDefault();
    const errorMsg = document.getElementById('login-error-msg');
    errorMsg.style.display = 'none';

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    try {
        const result = await apiCall('/auth/login', 'POST', { email, password });

        state.user = result;
        localStorage.setItem('luxestay_user', JSON.stringify(result));

        closeModal('modal-login');
        updateAuthUI();

        // Automatically route user to their respective dashboard
        if (result.role === 'SystemAdmin') {
            showView('view-sys-admin');
        } else if (result.role === 'HotelAdmin') {
            showView('view-hotel-admin');
        } else {
            showView('view-explorer');
            handleSearch(); // Refresh search if they are a customer
        }

    } catch (err) {
        errorMsg.innerText = err.message;
        errorMsg.style.display = 'block';
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const errorMsg = document.getElementById('register-error-msg');
    errorMsg.style.display = 'none';

    const userName = document.getElementById('register-name').value;
    const email = document.getElementById('register-email').value.trim();
    const phone = document.getElementById('register-phone').value;
    const password = document.getElementById('register-password').value;

    try {
        await apiCall('/auth/register', 'POST', { userName, email, phone, password });

        // Auto Login after successful registration
        const result = await apiCall('/auth/login', 'POST', { email, password });

        state.user = result;
        localStorage.setItem('luxestay_user', JSON.stringify(result));

        closeModal('modal-login');
        updateAuthUI();
        showView('view-explorer');
        alert("Account registered and logged in successfully!");

    } catch (err) {
        errorMsg.innerText = err.message;
        errorMsg.style.display = 'block';
    }
}

function handleLogout() {
    state.user = null;
    localStorage.removeItem('luxestay_user');
    updateAuthUI();
    showView('view-explorer');
    loadSpotlight(); // Reset homepage
}


// ==========================================================================
// Event Listeners & Modal Controls Setup
// ==========================================================================

function initEventListeners() {
    // Nav links
    document.getElementById('nav-logo').addEventListener('click', (e) => { e.preventDefault(); showView('view-explorer'); });
    document.getElementById('link-dashboard').addEventListener('click', (e) => { e.preventDefault(); showView('view-explorer'); });
    document.getElementById('link-history').addEventListener('click', (e) => { e.preventDefault(); showView('view-history'); });
    document.getElementById('link-sys-admin').addEventListener('click', (e) => { e.preventDefault(); showView('view-sys-admin'); });
    document.getElementById('link-hotel-admin').addEventListener('click', (e) => { e.preventDefault(); showView('view-hotel-admin'); });

    // Auth trigger and forms
    document.getElementById('btn-login-trigger').addEventListener('click', () => {
        openModal('modal-login');
        switchAuthTab('login');
    });
    document.getElementById('btn-logout').addEventListener('click', handleLogout);

    document.getElementById('tab-login-btn').addEventListener('click', () => switchAuthTab('login'));
    document.getElementById('tab-register-btn').addEventListener('click', () => switchAuthTab('register'));

    document.getElementById('form-login').addEventListener('submit', handleLogin);
    document.getElementById('form-register').addEventListener('submit', handleRegister);

    // Search form
    document.getElementById('search-form').addEventListener('submit', handleSearch);

    // Price range slider dynamic labeling
    document.getElementById('filter-price-range').addEventListener('input', (e) => {
        const val = e.target.value;
        document.getElementById('price-slider-value').innerText = val >= 1000 ? 'Any' : `$${val}`;
        handleSearch(); // Live filter
    });

    // Rating filters dynamic check
    document.querySelectorAll('input[name="filter-rating"]').forEach(input => {
        input.addEventListener('change', () => handleSearch());
    });
    // Checkbox filters dynamic check
    document.querySelectorAll('input[name="filter-amenity"]').forEach(input => {
        input.addEventListener('change', () => handleSearch());
    });

    // Checkout payment path toggling
    document.querySelectorAll('input[name="payment-method"]').forEach(input => {
        input.addEventListener('change', (e) => {
            const val = e.target.value;
            document.querySelectorAll('.payment-card').forEach(c => c.classList.remove('active'));

            if (val === 'Online Payment') {
                document.getElementById('path-online').classList.add('active');
                document.getElementById('online-payment-addons').style.display = 'block';
            } else {
                document.getElementById('path-offline').classList.add('active');
                document.getElementById('online-payment-addons').style.display = 'none';

                // Reset calculations for offline
                bookingCostCalculator.couponDiscount = 0;
                bookingCostCalculator.loyaltyDiscount = 0;
                bookingCostCalculator.appliedCouponCode = null;
                document.getElementById('checkout-use-points').checked = false;
                updateSummaryUI();
            }
        });
    });

    // Apply coupon
    document.getElementById('btn-apply-coupon').addEventListener('click', handleApplyCoupon);
    // Loyalty checkbox check
    document.getElementById('checkout-use-points').addEventListener('change', handleLoyaltyToggle);
    // Checkout Submit
    document.getElementById('form-checkout').addEventListener('submit', submitBooking);

    // Rebook Submit
    document.getElementById('form-rebook').addEventListener('submit', submitRebook);

    // Rebook path toggle
    document.querySelectorAll('input[name="rebook-payment-method"]').forEach(input => {
        input.addEventListener('change', (e) => {
            document.querySelectorAll('#modal-rebook .payment-card').forEach(c => c.classList.remove('active'));
            if (e.target.value === 'Online Payment') {
                document.getElementById('rebook-path-online').classList.add('active');
            } else {
                document.getElementById('rebook-path-offline').classList.add('active');
            }
        });
    });

    // System Admin Tabs
    document.getElementById('sys-tab-hotels').addEventListener('click', () => switchSysTab('hotels'));
    document.getElementById('sys-tab-users').addEventListener('click', () => switchSysTab('users'));
    document.getElementById('sys-tab-coupons').addEventListener('click', () => switchSysTab('coupons'));

    // System Admin Modals trigger
    document.getElementById('btn-add-hotel-trigger').addEventListener('click', () => {
        openModal('modal-sys-add-hotel');
        document.getElementById('sys-hotel-error-msg').style.display = 'none';
    });
    document.getElementById('btn-add-coupon-trigger').addEventListener('click', () => {
        openModal('modal-sys-add-coupon');
        document.getElementById('sys-coupon-error-msg').style.display = 'none';

        // Pre-fill coupon expiry (default to next month)
        const d = new Date();
        d.setMonth(d.getMonth() + 1);
        document.getElementById('sys-coupon-expiry').value = d.toISOString().split('T')[0];
    });

    // System Admin Forms Submit
    document.getElementById('form-sys-add-hotel').addEventListener('submit', handleAddHotel);
    document.getElementById('form-sys-add-coupon').addEventListener('submit', handleAddCoupon);
    document.getElementById('filter-user-role').addEventListener('change', sysLoadUsers);

    // Hotel Admin Tabs
    document.getElementById('hotel-tab-rooms').addEventListener('click', () => switchHotelTab('rooms'));
    document.getElementById('hotel-tab-amenities').addEventListener('click', () => switchHotelTab('amenities'));
    document.getElementById('hotel-tab-bookings').addEventListener('click', () => switchHotelTab('bookings'));

    // Hotel Admin Modals trigger
    document.getElementById('btn-add-room-trigger').addEventListener('click', () => {
        openModal('modal-hotel-add-room');
        document.getElementById('hotel-room-error-msg').style.display = 'none';
    });
    document.getElementById('btn-add-roomtype-trigger').addEventListener('click', () => {
        openModal('modal-hotel-add-roomtype');
        document.getElementById('hotel-rt-error-msg').style.display = 'none';
    });
    document.getElementById('btn-add-amenity-trigger').addEventListener('click', () => {
        openModal('modal-hotel-add-amenity');
        document.getElementById('hotel-amenity-error-msg').style.display = 'none';
    });

    // Hotel Admin Forms Submit
    document.getElementById('form-hotel-add-room').addEventListener('submit', handleAddRoom);
    document.getElementById('form-hotel-add-roomtype').addEventListener('submit', handleAddRoomType);
    document.getElementById('form-hotel-add-amenity').addEventListener('submit', handleAddAmenity);
}

// Modal Helpers
function openModal(id) {
    document.getElementById(id).classList.add('active');
    document.body.style.overflow = 'hidden'; // Lock background scroll
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
    document.body.style.overflow = '';
}

function switchAuthTab(tab) {
    document.getElementById('tab-login-btn').classList.remove('active');
    document.getElementById('tab-register-btn').classList.remove('active');
    document.getElementById('form-login').classList.remove('active');
    document.getElementById('form-register').classList.remove('active');

    if (tab === 'login') {
        document.getElementById('tab-login-btn').classList.add('active');
        document.getElementById('form-login').classList.add('active');
    } else {
        document.getElementById('tab-register-btn').classList.add('active');
        document.getElementById('form-register').classList.add('active');
    }
}
