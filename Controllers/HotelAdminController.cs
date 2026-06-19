using HotelBooking.Data;
using HotelBooking.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;

namespace HotelBooking.Controllers
{
    [ApiController]
    [Route("api/hotel-admin")]
    [Authorize(Roles = "HotelAdmin")]   
    [EnableRateLimiting("ApiLimiter")]
    public class HotelAdminController : ControllerBase
    {
        private readonly HotelBookingContext _context;

        public HotelAdminController(HotelBookingContext context)
        {
            _context = context;
        }

        private async Task<Hotel?> GetAdminHotelAsync()
        {
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
            if (userIdClaim == null || !int.TryParse(userIdClaim.Value, out int userId))
            {
                return null;
            }
            return await _context.Hotels.FirstOrDefaultAsync(h => h.HotelAdminId == userId);
        }

        // --- ROOMS MANAGEMENT ---

        [HttpGet("rooms")]
        public async Task<IActionResult> GetRooms()
        {
            var hotel = await GetAdminHotelAsync();
            if (hotel == null)
            {
                return BadRequest(new { message = "No hotel assigned to this administrator account." });
            }

            var rooms = await _context.Rooms
                .Where(r => r.HotelId == hotel.HotelId)
                .ToListAsync();

            var roomDetails = new List<object>();
            foreach (var room in rooms)
            {
                var roomType = await _context.RoomTypes.FindAsync(room.RoomTypeId);
                roomDetails.Add(new
                {
                    room.RoomId,
                    room.RoomNo,
                    room.Status,
                    roomTypeId = room.RoomTypeId,
                    roomTypeName = roomType?.Name ?? "N/A",
                    price = roomType?.Price ?? 0,
                    capacity = roomType?.Capacity ?? 0
                });
            }

            // Also return RoomTypes list so the client can select RoomType when adding rooms
            var roomTypes = await _context.RoomTypes
                .Where(rt => rt.HotelId == hotel.HotelId)
                .Select(rt => new { rt.RoomTypeId, rt.Name, rt.Price, rt.Capacity })
                .ToListAsync();

            return Ok(new
            {
                hotelId = hotel.HotelId,
                hotelName = hotel.HotelName,
                rooms = roomDetails,
                roomTypes
            });
        }

        public class AddRoomDto
        {
            public string RoomNo { get; set; } = string.Empty;
            public int RoomTypeId { get; set; }
            public string Status { get; set; } = "Available";
        }

        [HttpPost("rooms")]
        public async Task<IActionResult> AddRoom([FromBody] AddRoomDto dto)
        {
            var hotel = await GetAdminHotelAsync();
            if (hotel == null) return BadRequest(new { message = "No hotel assigned to this admin." });

            // Validate RoomType belongs to this hotel
            var roomTypeExists = await _context.RoomTypes.AnyAsync(rt => rt.RoomTypeId == dto.RoomTypeId && rt.HotelId == hotel.HotelId);
            if (!roomTypeExists)
            {
                return BadRequest(new { message = "Invalid Room Type selected for this hotel." });
            }

            if (await _context.Rooms.AnyAsync(r => r.HotelId == hotel.HotelId && r.RoomNo.ToLower() == dto.RoomNo.ToLower()))
            {
                return BadRequest(new { message = $"Room number '{dto.RoomNo}' already exists in this hotel." });
            }

            var room = new Room
            {
                HotelId = hotel.HotelId,
                RoomTypeId = dto.RoomTypeId,
                RoomNo = dto.RoomNo,
                Status = dto.Status
            };

            _context.Rooms.Add(room);
            await _context.SaveChangesAsync();

            return Ok(new { message = "Room added successfully", roomId = room.RoomId });
        }

        [HttpPut("rooms/{id}/status")]
        public async Task<IActionResult> UpdateRoomStatus(int id, [FromBody] string status)
        {
            var hotel = await GetAdminHotelAsync();
            if (hotel == null) return BadRequest();

            var room = await _context.Rooms.FirstOrDefaultAsync(r => r.RoomId == id && r.HotelId == hotel.HotelId);
            if (room == null) return NotFound();

            if (status != "Available" && status != "Maintenance")
            {
                return BadRequest(new { message = "Invalid status. Allowed values: Available, Maintenance" });
            }

            room.Status = status;
            _context.Rooms.Update(room);
            await _context.SaveChangesAsync();

            return Ok(new { message = "Room status updated successfully" });
        }

        // --- ROOM TYPE MANAGEMENT (Bonus) ---
        public class AddRoomTypeDto
        {
            public string Name { get; set; } = string.Empty;
            public decimal Price { get; set; }
            public int Capacity { get; set; }
            public string Description { get; set; } = string.Empty;
            public string Amenities { get; set; } = string.Empty;
        }

        [HttpPost("roomtypes")]
        public async Task<IActionResult> AddRoomType([FromBody] AddRoomTypeDto dto)
        {
            var hotel = await GetAdminHotelAsync();
            if (hotel == null) return BadRequest();

            var roomType = new RoomType
            {
                HotelId = hotel.HotelId,
                Name = dto.Name,
                Price = dto.Price,
                Capacity = dto.Capacity,
                Description = dto.Description,
                Amenities = dto.Amenities
            };

            _context.RoomTypes.Add(roomType);
            await _context.SaveChangesAsync();

            return Ok(new { message = "Room type added successfully", roomTypeId = roomType.RoomTypeId });
        }

        // --- AMENITIES MANAGEMENT ---

        [HttpGet("amenities")]
        public async Task<IActionResult> GetAmenities()
        {
            var hotel = await GetAdminHotelAsync();
            if (hotel == null) return BadRequest();

            var amenities = await _context.HotelAmenities
                .Where(ha => ha.HotelId == hotel.HotelId)
                .ToListAsync();

            return Ok(new
            {
                hotelName = hotel.HotelName,
                amenities
            });
        }

        public class AddAmenityDto
        {
            public string Name { get; set; } = string.Empty;
            public bool IsAvailable { get; set; } = true;
        }

        [HttpPost("amenities")]
        public async Task<IActionResult> AddAmenity([FromBody] AddAmenityDto dto)
        {
            var hotel = await GetAdminHotelAsync();
            if (hotel == null) return BadRequest();

            var existing = await _context.HotelAmenities.FirstOrDefaultAsync(ha => ha.HotelId == hotel.HotelId && ha.Name.ToLower() == dto.Name.ToLower());
            if (existing != null)
            {
                existing.IsAvailable = dto.IsAvailable;
                _context.HotelAmenities.Update(existing);
                await _context.SaveChangesAsync();
                return Ok(new { message = "Amenity updated successfully" });
            }

            var amenity = new HotelAmenity
            {
                HotelId = hotel.HotelId,
                Name = dto.Name,
                IsAvailable = dto.IsAvailable
            };

            _context.HotelAmenities.Add(amenity);
            await _context.SaveChangesAsync();

            return Ok(new { message = "Amenity added successfully", amenityId = amenity.AmenityId });
        }

        [HttpPut("amenities/{id}/toggle")]
        public async Task<IActionResult> ToggleAmenity(int id)
        {
            var hotel = await GetAdminHotelAsync();
            if (hotel == null) return BadRequest();

            var amenity = await _context.HotelAmenities.FirstOrDefaultAsync(ha => ha.AmenityId == id && ha.HotelId == hotel.HotelId);
            if (amenity == null) return NotFound();

            amenity.IsAvailable = !amenity.IsAvailable;
            _context.HotelAmenities.Update(amenity);
            await _context.SaveChangesAsync();

            return Ok(new { message = "Amenity status toggled", isAvailable = amenity.IsAvailable });
        }

        // --- BOOKINGS LIST ---

        [HttpGet("bookings")]
        public async Task<IActionResult> GetBookings()
        {
            var hotel = await GetAdminHotelAsync();
            if (hotel == null) return BadRequest();

            // Find rooms belonging to this hotel
            var rooms = await _context.Rooms
                .Where(r => r.HotelId == hotel.HotelId)
                .Select(r => r.RoomId)
                .ToListAsync();

            // Find bookings for these rooms
            var bookings = await _context.Bookings
                .Where(b => rooms.Contains(b.RoomId))
                .OrderByDescending(b => b.CheckIn)
                .ToListAsync();

            var bookingDetails = new List<object>();
            foreach (var b in bookings)
            {
                var room = await _context.Rooms.FindAsync(b.RoomId);
                var roomType = room != null ? await _context.RoomTypes.FindAsync(room.RoomTypeId) : null;
                var payment = await _context.Payments.FirstOrDefaultAsync(p => p.BookingId == b.BookingId);

                bookingDetails.Add(new
                {
                    b.BookingId,
                    b.UserId,
                    b.GuestName,
                    b.GuestEmail,
                    b.GuestPhone,
                    b.ReservationNumber,
                    b.CheckIn,
                    b.CheckOut,
                    b.TotalAmount,
                    b.BookingStatus,
                    b.BookingState,
                    roomNo = room?.RoomNo ?? "N/A",
                    roomTypeName = roomType?.Name ?? "N/A",
                    paymentStatus = payment?.PaymentStatus ?? "Pending",
                    paymentMethod = payment?.PaymentMethod ?? "N/A"
                });
            }

            return Ok(bookingDetails);
        }
    }
}
