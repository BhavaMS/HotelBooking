using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using HotelBooking.Data;
using HotelBooking.Models;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.RateLimiting;

namespace HotelBooking.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [EnableRateLimiting("ApiLimiter")]
    public class HotelsController : ControllerBase
    {
        private readonly HotelBookingContext _context;

        public HotelsController(HotelBookingContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<IActionResult> Search([FromQuery] string? city, [FromQuery] DateTime? checkIn, [FromQuery] DateTime? checkOut, [FromQuery] decimal? minPrice, [FromQuery] decimal? maxPrice, [FromQuery] double? minRating, [FromQuery] string? amenities)
        {
            var hotelsQuery = _context.Hotels.AsQueryable();

            // Filter by City
            if (!string.IsNullOrWhiteSpace(city))
            {
                var cityLower = city.Trim().ToLower();
                hotelsQuery = hotelsQuery.Where(h => h.City.ToLower().Contains(cityLower) || h.State.ToLower().Contains(cityLower));
            }

            // Filter by Minimum Rating
            if (minRating.HasValue)
            {
                hotelsQuery = hotelsQuery.Where(h => h.Ratings >= minRating.Value);
            }

            var hotels = await hotelsQuery.ToListAsync();
            var result = new List<object>();

            foreach (var hotel in hotels)
            {
                // Get RoomTypes for this hotel
                var roomTypesQuery = _context.RoomTypes.Where(rt => rt.HotelId == hotel.HotelId);
                
                if (minPrice.HasValue)
                    roomTypesQuery = roomTypesQuery.Where(rt => rt.Price >= minPrice.Value);
                if (maxPrice.HasValue)
                    roomTypesQuery = roomTypesQuery.Where(rt => rt.Price <= maxPrice.Value);

                var roomTypes = await roomTypesQuery.ToListAsync();
                if (!roomTypes.Any()) continue; // Skip hotel if no room types match price filter

                // Filter by Hotel Amenities
                var hotelAmenities = await _context.HotelAmenities
                    .Where(ha => ha.HotelId == hotel.HotelId && ha.IsAvailable)
                    .Select(ha => ha.Name.ToLower())
                    .ToListAsync();

                if (!string.IsNullOrWhiteSpace(amenities))
                {
                    var filterAmenities = amenities.Split(',').Select(a => a.Trim().ToLower());
                    bool matchesAmenities = filterAmenities.All(a => hotelAmenities.Contains(a));
                    if (!matchesAmenities) continue; // Skip hotel if it doesn't have all selected amenities
                }

                // Filter by date availability if dates are provided
                bool isAvailable = true;
                var roomTypeDetails = new List<object>();

                foreach (var rt in roomTypes)
                {
                    // Find all rooms of this type
                    var allRooms = await _context.Rooms
                        .Where(r => r.HotelId == hotel.HotelId && r.RoomTypeId == rt.RoomTypeId && r.Status == "Available")
                        .ToListAsync();

                    int totalRooms = allRooms.Count;
                    int availableCount = totalRooms;

                    if (checkIn.HasValue && checkOut.HasValue)
                    {
                        var checkInDate = checkIn.Value.Date;
                        var checkOutDate = checkOut.Value.Date;

                        // Find room IDs that are booked during this range
                        var bookedRoomIds = await _context.Bookings
                            .Where(b => b.CheckIn < checkOutDate && b.CheckOut > checkInDate && b.BookingStatus != "Cancelled")
                            .Select(b => b.RoomId)
                            .ToListAsync();

                        // Available rooms are those whose ID is not in booked list
                        var availableRooms = allRooms.Where(r => !bookedRoomIds.Contains(r.RoomId)).ToList();
                        availableCount = availableRooms.Count;
                    }

                    roomTypeDetails.Add(new
                    {
                        rt.RoomTypeId,
                        rt.Name,
                        rt.Price,
                        rt.Capacity,
                        rt.Description,
                        rt.Amenities,
                        totalRooms,
                        availableRoomsCount = availableCount
                    });
                }

                // If checkIn/checkOut provided, ensure at least one room is available overall
                if (checkIn.HasValue && checkOut.HasValue)
                {
                    var totalAvailableRooms = roomTypeDetails.Sum(rt => (int)((dynamic)rt).availableRoomsCount);
                    if (totalAvailableRooms == 0)
                    {
                        isAvailable = false;
                    }
                }

                if (isAvailable)
                {
                    result.Add(new
                    {
                        hotel.HotelId,
                        hotel.HotelName,
                        hotel.Description,
                        hotel.Address,
                        hotel.City,
                        hotel.State,
                        hotel.Pincode,
                        hotel.Ratings,
                        hotel.ImageUrl,
                        amenities = hotelAmenities,
                        roomTypes = roomTypeDetails
                    });
                }
            }

            return Ok(result);
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> GetDetails(int id, [FromQuery] DateTime? checkIn, [FromQuery] DateTime? checkOut)
        {
            var hotel = await _context.Hotels.FindAsync(id);
            if (hotel == null)
            {
                return NotFound(new { message = "Hotel not found" });
            }

            var amenities = await _context.HotelAmenities
                .Where(ha => ha.HotelId == id && ha.IsAvailable)
                .Select(ha => ha.Name)
                .ToListAsync();

            var roomTypes = await _context.RoomTypes.Where(rt => rt.HotelId == id).ToListAsync();
            var roomDetails = new List<object>();

            foreach (var rt in roomTypes)
            {
                var allRooms = await _context.Rooms
                    .Where(r => r.HotelId == id && r.RoomTypeId == rt.RoomTypeId && r.Status == "Available")
                    .ToListAsync();

                int totalRooms = allRooms.Count;
                int availableCount = totalRooms;

                if (checkIn.HasValue && checkOut.HasValue)
                {
                    var checkInDate = checkIn.Value.Date;
                    var checkOutDate = checkOut.Value.Date;

                    var bookedRoomIds = await _context.Bookings
                        .Where(b => b.CheckIn < checkOutDate && b.CheckOut > checkInDate && b.BookingStatus != "Cancelled")
                        .Select(b => b.RoomId)
                        .ToListAsync();

                    availableCount = allRooms.Count(r => !bookedRoomIds.Contains(r.RoomId));
                }

                roomDetails.Add(new
                {
                    rt.RoomTypeId,
                    rt.Name,
                    rt.Price,
                    rt.Capacity,
                    rt.Description,
                    rt.Amenities,
                    totalRooms,
                    availableRoomsCount = availableCount
                });
            }

            return Ok(new
            {
                hotel.HotelId,
                hotel.HotelName,
                hotel.Description,
                hotel.Address,
                hotel.City,
                hotel.State,
                hotel.Pincode,
                hotel.Ratings,
                hotel.ImageUrl,
                amenities,
                roomTypes = roomDetails
            });
        }

        [HttpGet("featured")]
        public async Task<IActionResult> GetFeatured()
        {
            var featuredHotels = await _context.Hotels.OrderByDescending(h => h.Ratings).Take(3).ToListAsync();
            var result = new List<object>();

            foreach (var hotel in featuredHotels)
            {
                var minPrice = await _context.RoomTypes
                    .Where(rt => rt.HotelId == hotel.HotelId)
                    .Select(rt => (decimal?)rt.Price)
                    .MinAsync() ?? 0;

                var amenities = await _context.HotelAmenities
                    .Where(ha => ha.HotelId == hotel.HotelId && ha.IsAvailable)
                    .Select(ha => ha.Name)
                    .Take(4)
                    .ToListAsync();

                result.Add(new
                {
                    hotel.HotelId,
                    hotel.HotelName,
                    hotel.Description,
                    hotel.Ratings,
                    hotel.ImageUrl,
                    hotel.City,
                    priceFrom = minPrice,
                    amenities
                });
            }

            return Ok(new
            {
                hotels = result,
                offers = new[]
                {
                    new { code = "WELCOME10", title = "Welcome Offer", description = "Get 10% off on your first online booking!", discount = "10% OFF" },
                    new { code = "SAVE50", title = "Summer Special", description = "Save $50 flat on bookings over $200!", discount = "$50 OFF" },
                }
            });
        }
    }
}
