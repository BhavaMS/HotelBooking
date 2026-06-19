using HotelBooking.Data;
using HotelBooking.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;

namespace HotelBooking.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize(Roles = "SystemAdmin")]
    [EnableRateLimiting("ApiLimiter")]
    public class AdminController : ControllerBase
    {
        private readonly HotelBookingContext _context;

        public AdminController(HotelBookingContext context)
        {
            _context = context;
        }

        // --- HOTEL MANAGEMENT ---

        [HttpGet("hotels")]
        public async Task<IActionResult> GetHotels()
        {
            var hotels = await _context.Hotels.ToListAsync();
            var hotelDetails = new List<object>();

            foreach (var hotel in hotels)
            {
                var admin = await _context.Users.FindAsync(hotel.HotelAdminId);
                var roomCount = await _context.Rooms.CountAsync(r => r.HotelId == hotel.HotelId);

                hotelDetails.Add(new
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
                    hotel.HotelAdminId,
                    adminName = admin?.UserName ?? "N/A",
                    adminEmail = admin?.Email ?? "N/A",
                    roomsCount = roomCount
                });
            }
            return Ok(hotelDetails);
        }

        public class AddHotelDto
        {
            public string HotelName { get; set; } = string.Empty;
            public string Description { get; set; } = string.Empty;
            public string Address { get; set; } = string.Empty;
            public string City { get; set; } = string.Empty;
            public string State { get; set; } = string.Empty;
            public string Pincode { get; set; } = string.Empty;
            public double Ratings { get; set; } = 5.0;
            public string AdminEmail { get; set; } = string.Empty; // Create hotel admin if not exists, or link existing
            public string AdminName { get; set; } = string.Empty;
            public string AdminPhone { get; set; } = string.Empty;
            public string AdminPassword { get; set; } = string.Empty;
            public string ImageUrl { get; set; } = string.Empty;
        }

        [HttpPost("hotels")]
        public async Task<IActionResult> AddHotel([FromBody] AddHotelDto dto)
        {
            if (string.IsNullOrWhiteSpace(dto.HotelName))
            {
                return BadRequest(new { message = "Hotel name is required" });
            }

            // Find or create HotelAdmin
            var adminUser = await _context.Users.FirstOrDefaultAsync(u => u.Email.ToLower() == dto.AdminEmail.ToLower());
            if (adminUser == null)
            {
                adminUser = new User
                {
                    UserName = dto.AdminName,
                    Email = dto.AdminEmail,
                    PasswordHash = HashPassword(string.IsNullOrWhiteSpace(dto.AdminPassword) ? "admin123" : dto.AdminPassword),
                    Phone = dto.AdminPhone,
                    Role = "HotelAdmin"
                };
                _context.Users.Add(adminUser);
                await _context.SaveChangesAsync();
            }
            else if (adminUser.Role != "HotelAdmin")
            {
                // Upgrade user role to HotelAdmin if they exist but aren't one
                adminUser.Role = "HotelAdmin";
                _context.Users.Update(adminUser);
                await _context.SaveChangesAsync();
            }

            var hotel = new Hotel
            {
                HotelName = dto.HotelName,
                Description = dto.Description,
                Address = dto.Address,
                City = dto.City,
                State = dto.State,
                Pincode = dto.Pincode,
                Ratings = dto.Ratings,
                HotelAdminId = adminUser.UserId,
                ImageUrl = string.IsNullOrWhiteSpace(dto.ImageUrl) ? "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80" : dto.ImageUrl
            };

            _context.Hotels.Add(hotel);
            await _context.SaveChangesAsync();

            // Seed some default amenities for the new hotel
            var defaultAmenities = new[] { "WiFi", "AC", "Parking", "TV", "Hot Water" };
            foreach (var amenityName in defaultAmenities)
            {
                _context.HotelAmenities.Add(new HotelAmenity
                {
                    HotelId = hotel.HotelId,
                    Name = amenityName,
                    IsAvailable = true
                });
            }
            await _context.SaveChangesAsync();

            return Ok(new { message = "Hotel and Hotel Admin added successfully", hotelId = hotel.HotelId, adminId = adminUser.UserId });
        }

        // --- USER MANAGEMENT ---

        [HttpGet("users")]
        public async Task<IActionResult> GetUsers([FromQuery] string? role)
        {
            var query = _context.Users.AsQueryable();
            if (!string.IsNullOrWhiteSpace(role))
            {
                query = query.Where(u => u.Role.ToLower() == role.Trim().ToLower());
            }

            var users = await query.Select(u => new
            {
                u.UserId,
                u.UserName,
                u.Email,
                u.Phone,
                u.Role,
                u.LoyaltyPoints
            }).ToListAsync();

            return Ok(users);
        }

        // --- COUPONS MANAGEMENT ---

        [HttpGet("coupons")]
        public async Task<IActionResult> GetCoupons()
        {
            var coupons = await _context.Coupons.ToListAsync();
            return Ok(coupons);
        }

        [HttpPost("coupons")]
        public async Task<IActionResult> AddCoupon([FromBody] Coupon coupon)
        {
            if (await _context.Coupons.AnyAsync(c => c.Code.ToUpper() == coupon.Code.ToUpper()))
            {
                return BadRequest(new { message = "Coupon code already exists" });
            }

            coupon.Code = coupon.Code.ToUpper();
            _context.Coupons.Add(coupon);
            await _context.SaveChangesAsync();
            return Ok(new { message = "Coupon added successfully", couponId = coupon.CouponId });
        }

        [HttpDelete("coupons/{id}")]
        public async Task<IActionResult> DeleteCoupon(int id)
        {
            var coupon = await _context.Coupons.FindAsync(id);
            if (coupon == null) return NotFound();

            _context.Coupons.Remove(coupon);
            await _context.SaveChangesAsync();
            return Ok(new { message = "Coupon deleted successfully" });
        }

        private static string HashPassword(string password)
        {
            var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(password));
            var builder = new StringBuilder();
            foreach (var b in bytes)
            {
                builder.Append(b.ToString("x2"));
            }
            return builder.ToString();
        }
    }
}
