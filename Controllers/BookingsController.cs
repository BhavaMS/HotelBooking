using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authorization;
using HotelBooking.Data;
using HotelBooking.Models;
using System;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.RateLimiting;

namespace HotelBooking.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [EnableRateLimiting("ApiLimiter")]
    public class BookingsController : ControllerBase
    {
        private readonly HotelBookingContext _context;

        public BookingsController(HotelBookingContext context)
        {
            _context = context;
        }

        public class CreateBookingDto
        {
            public int RoomTypeId { get; set; }
            public DateTime CheckIn { get; set; }
            public DateTime CheckOut { get; set; }
            public string GuestName { get; set; } = string.Empty;
            public string GuestEmail { get; set; } = string.Empty;
            public string GuestPhone { get; set; } = string.Empty;
            public string PaymentMethod { get; set; } = string.Empty; // "Online Payment" or "Offline Payment"
            public string? CouponCode { get; set; }
            public bool ClaimLoyaltyPoints { get; set; }
        }

        [HttpPost]
        public async Task<IActionResult> CreateBooking([FromBody] CreateBookingDto dto)
        {
            // 1. Validate dates
            if (dto.CheckIn.Date < DateTime.Today)
            {
                return BadRequest(new { message = "Check-in date cannot be in the past" });
            }
            if (dto.CheckOut.Date <= dto.CheckIn.Date)
            {
                return BadRequest(new { message = "Check-out date must be after Check-in date" });
            }

            // 2. Fetch RoomType
            var roomType = await _context.RoomTypes.FindAsync(dto.RoomTypeId);
            if (roomType == null)
            {
                return BadRequest(new { message = "Invalid Room Type selected" });
            }

            // 3. Find available rooms of this type
            var allRooms = await _context.Rooms
                .Where(r => r.HotelId == roomType.HotelId && r.RoomTypeId == roomType.RoomTypeId && r.Status == "Available")
                .ToListAsync();

            var checkInDate = dto.CheckIn.Date;
            var checkOutDate = dto.CheckOut.Date;

            // Find room IDs that are booked during this range
            var bookedRoomIds = await _context.Bookings
                .Where(b => b.CheckIn < checkOutDate && b.CheckOut > checkInDate && b.BookingStatus != "Cancelled")
                .Select(b => b.RoomId)
                .ToListAsync();

            var availableRoom = allRooms.FirstOrDefault(r => !bookedRoomIds.Contains(r.RoomId));
            if (availableRoom == null)
            {
                return BadRequest(new { message = "No rooms are available for the selected dates in this category" });
            }

            // 4. Calculate pricing
            int days = (checkOutDate - checkInDate).Days;
            decimal baseAmount = roomType.Price * days;
            decimal totalAmount = baseAmount;
            decimal discountAmount = 0;

            // 5. Check authentication
            User? user = null;
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
            if (userIdClaim != null && int.TryParse(userIdClaim.Value, out int loggedInUserId))
            {
                user = await _context.Users.FindAsync(loggedInUserId);
            }

            // 6. Path handling
            string paymentStatus = "Pending";
            string bookingStatus = "Pending";
            string bookingState = "Reserved";

            if (dto.PaymentMethod == "Online Payment")
            {
                // Coupons only allowed on Online Payment
                if (!string.IsNullOrWhiteSpace(dto.CouponCode))
                {
                    var coupon = await _context.Coupons.FirstOrDefaultAsync(c => c.Code.ToUpper() == dto.CouponCode.ToUpper() && c.IsActive);
                    if (coupon != null && coupon.ExpiryDate > DateTime.UtcNow)
                    {
                        if (coupon.DiscountType == "Percentage")
                        {
                            discountAmount = baseAmount * (coupon.DiscountValue / 100m);
                        }
                        else if (coupon.DiscountType == "FixedAmount")
                        {
                            discountAmount = coupon.DiscountValue;
                        }
                        totalAmount = Math.Max(0, totalAmount - discountAmount);
                    }
                    else
                    {
                        return BadRequest(new { message = "Invalid or expired discount coupon" });
                    }
                }

                // Loyalty Points claim
                if (dto.ClaimLoyaltyPoints && user != null)
                {
                    decimal loyaltyDiscount = user.LoyaltyPoints; // 1 point = $1
                    if (loyaltyDiscount > 0)
                    {
                        if (loyaltyDiscount >= totalAmount)
                        {
                            user.LoyaltyPoints -= (int)totalAmount;
                            discountAmount += totalAmount;
                            totalAmount = 0;
                        }
                        else
                        {
                            totalAmount -= loyaltyDiscount;
                            discountAmount += loyaltyDiscount;
                            user.LoyaltyPoints = 0;
                        }
                    }
                }

                paymentStatus = "Paid";
                bookingStatus = "Confirmed";
                bookingState = "Booked";

                // Earn loyalty points (10% of final paid amount, rounded)
                if (user != null && totalAmount > 0)
                {
                    user.LoyaltyPoints += (int)Math.Round(totalAmount * 0.10m);
                }
            }
            else
            {
                // Reserve Path (Offline Payment)
                if (!string.IsNullOrWhiteSpace(dto.CouponCode))
                {
                    return BadRequest(new { message = "Coupons can only be applied to online transactions" });
                }
                if (dto.ClaimLoyaltyPoints)
                {
                    return BadRequest(new { message = "Loyalty rewards can only be claimed for online transactions" });
                }
                dto.PaymentMethod = "Offline Payment";
            }

            // 7. Save Booking
            var reservationNumber = "RES" + DateTime.UtcNow.ToString("yyyyMMdd") + new Random().Next(1000, 9999);
            var booking = new Booking
            {
                UserId = user?.UserId ?? 0, // 0 indicates guest booking if not logged in
                RoomId = availableRoom.RoomId,
                CheckIn = checkInDate,
                CheckOut = checkOutDate,
                TotalAmount = totalAmount,
                BookingStatus = bookingStatus,
                BookingState = bookingState,
                GuestName = dto.GuestName,
                GuestEmail = dto.GuestEmail,
                GuestPhone = dto.GuestPhone,
                ReservationNumber = reservationNumber
            };

            _context.Bookings.Add(booking);
            await _context.SaveChangesAsync();

            // 8. Save Payment
            var payment = new Payment
            {
                BookingId = booking.BookingId,
                Amount = totalAmount,
                PaymentMethod = dto.PaymentMethod,
                PaymentStatus = paymentStatus,
                PaymentDate = DateTime.UtcNow
            };
            _context.Payments.Add(payment);

            if (user != null)
            {
                _context.Users.Update(user);
            }

            await _context.SaveChangesAsync();

            // 9. Simulate Email Confirmation
            var emailText = $@"
========================================
EMAIL RESERVATION CONFIRMATION
========================================
To: {booking.GuestEmail}
Subject: Booking Confirmation - {reservationNumber}

Dear {booking.GuestName},

Thank you for choosing us! Your booking is confirmed.
Reservation Number: {reservationNumber}
Check-In: {booking.CheckIn:yyyy-MM-dd}
Check-Out: {booking.CheckOut:yyyy-MM-dd}
Room No: {availableRoom.RoomNo}
Total Amount: ${booking.TotalAmount:F2}
Payment Status: {paymentStatus} ({dto.PaymentMethod})

We look forward to welcoming you!
========================================";

            System.Console.WriteLine(emailText);

            return Ok(new
            {
                message = "Booking created successfully",
                bookingId = booking.BookingId,
                reservationNumber,
                roomNo = availableRoom.RoomNo,
                totalAmount,
                discountAmount,
                bookingStatus,
                bookingState,
                emailPreview = emailText
            });
        }

        [HttpGet("history")]
        public async Task<IActionResult> GetHistory()
        {
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
            if (userIdClaim == null || !int.TryParse(userIdClaim.Value, out int userId))
            {
                return Unauthorized(new { message = "You must be logged in to view booking history" });
            }

            var bookings = await _context.Bookings
                .Where(b => b.UserId == userId)
                .OrderByDescending(b => b.CheckIn)
                .ToListAsync();

            var result = new List<object>();

            foreach (var b in bookings)
            {
                var room = await _context.Rooms.FindAsync(b.RoomId);
                var hotel = room != null ? await _context.Hotels.FindAsync(room.HotelId) : null;
                var roomType = room != null ? await _context.RoomTypes.FindAsync(room.RoomTypeId) : null;
                var payment = await _context.Payments.FirstOrDefaultAsync(p => p.BookingId == b.BookingId);

                result.Add(new
                {
                    b.BookingId,
                    b.ReservationNumber,
                    b.CheckIn,
                    b.CheckOut,
                    b.TotalAmount,
                    b.BookingStatus,
                    b.BookingState,
                    guestName = b.GuestName,
                    hotelName = hotel?.HotelName ?? "Unknown Hotel",
                    hotelImageUrl = hotel?.ImageUrl ?? "",
                    city = hotel?.City ?? "",
                    roomNo = room?.RoomNo ?? "N/A",
                    roomTypeName = roomType?.Name ?? "N/A",
                    roomTypeId = roomType?.RoomTypeId ?? 0,
                    paymentMethod = payment?.PaymentMethod ?? "Offline",
                    paymentStatus = payment?.PaymentStatus ?? "Pending"
                });
            }

            return Ok(result);
        }

        [HttpPost("{bookingId}/rebook")]
        public async Task<IActionResult> Rebook(int bookingId, [FromBody] RebookDto dto)
        {
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
            if (userIdClaim == null || !int.TryParse(userIdClaim.Value, out int userId))
            {
                return Unauthorized(new { message = "You must be logged in to rebook" });
            }

            var pastBooking = await _context.Bookings.FindAsync(bookingId);
            if (pastBooking == null || pastBooking.UserId != userId)
            {
                return NotFound(new { message = "Booking not found or not owned by you" });
            }

            var pastRoom = await _context.Rooms.FindAsync(pastBooking.RoomId);
            if (pastRoom == null)
            {
                return BadRequest(new { message = "Past room details are no longer valid" });
            }

            // Create a new booking request using past info
            var newBookingDto = new CreateBookingDto
            {
                RoomTypeId = pastRoom.RoomTypeId,
                CheckIn = dto.CheckIn,
                CheckOut = dto.CheckOut,
                GuestName = pastBooking.GuestName,
                GuestEmail = pastBooking.GuestEmail,
                GuestPhone = pastBooking.GuestPhone,
                PaymentMethod = dto.PaymentMethod,
                CouponCode = dto.CouponCode,
                ClaimLoyaltyPoints = dto.ClaimLoyaltyPoints
            };

            return await CreateBooking(newBookingDto);
        }

        public class RebookDto
        {
            public DateTime CheckIn { get; set; }
            public DateTime CheckOut { get; set; }
            public string PaymentMethod { get; set; } = "Offline Payment"; // Defaults
            public string? CouponCode { get; set; }
            public bool ClaimLoyaltyPoints { get; set; }
        }

        [HttpPost("{bookingId}/cancel")]
        public async Task<IActionResult> CancelBooking(int bookingId)
        {
            var booking = await _context.Bookings.FindAsync(bookingId);
            if (booking == null)
            {
                return NotFound(new { message = "Booking not found" });
            }

            // Check authorization: Must be user who booked, or admin
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
            var roleClaim = User.FindFirst(ClaimTypes.Role);
            
            bool isAuthorized = false;
            if (roleClaim != null && (roleClaim.Value == "SystemAdmin" || roleClaim.Value == "HotelAdmin"))
            {
                isAuthorized = true;
            }
            else if (userIdClaim != null && int.TryParse(userIdClaim.Value, out int userId) && booking.UserId == userId)
            {
                isAuthorized = true;
            }

            if (!isAuthorized)
            {
                return Forbid();
            }

            if (booking.BookingStatus == "Cancelled")
            {
                return BadRequest(new { message = "Booking is already cancelled" });
            }

            booking.BookingStatus = "Cancelled";
            booking.BookingState = "Cancelled";
            _context.Bookings.Update(booking);

            var payment = await _context.Payments.FirstOrDefaultAsync(p => p.BookingId == booking.BookingId);
            if (payment != null)
            {
                if (payment.PaymentStatus == "Paid")
                {
                    payment.PaymentStatus = "Refunded";
                    _context.Payments.Update(payment);

                    // Refund loyalty points if used (simplified: if they claimed points and paid less, they get a full refund of points)
                    var user = await _context.Users.FindAsync(booking.UserId);
                    if (user != null)
                    {
                        // Earned points deduction
                        var earned = (int)Math.Round(payment.Amount * 0.10m);
                        user.LoyaltyPoints = Math.Max(0, user.LoyaltyPoints - earned);
                        _context.Users.Update(user);
                    }
                }
            }

            await _context.SaveChangesAsync();
            return Ok(new { message = "Booking successfully cancelled" });
        }
    }
}
