using Microsoft.EntityFrameworkCore;
using HotelBooking.Models;
using System;
using System.Security.Cryptography;
using System.Text;

namespace HotelBooking.Data
{
    public class HotelBookingContext : DbContext
    {
        public HotelBookingContext(DbContextOptions<HotelBookingContext> options) : base(options)
        {
        }

        public DbSet<User> Users { get; set; } = null!;
        public DbSet<Hotel> Hotels { get; set; } = null!;
        public DbSet<RoomType> RoomTypes { get; set; } = null!;
        public DbSet<Room> Rooms { get; set; } = null!;
        public DbSet<Booking> Bookings { get; set; } = null!;
        public DbSet<Payment> Payments { get; set; } = null!;
        public DbSet<Coupon> Coupons { get; set; } = null!;
        public DbSet<HotelAmenity> HotelAmenities { get; set; } = null!;

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // Configure Unique constraint for email and coupon code
            modelBuilder.Entity<User>().HasIndex(u => u.Email).IsUnique();
            modelBuilder.Entity<Coupon>().HasIndex(c => c.Code).IsUnique();

            // Seed initial data
            var adminPasswordHash = HashPassword("admin123");
            var hotelAdminPasswordHash = HashPassword("admin123");
            var customerPasswordHash = HashPassword("cust123");

            modelBuilder.Entity<User>().HasData(
                new User { UserId = 1, UserName = "System Admin", Email = "admin@hotel.com", PasswordHash = adminPasswordHash, Phone = "1234567890", Role = "SystemAdmin", LoyaltyPoints = 0 },
                new User { UserId = 2, UserName = "Grand Plaza Admin", Email = "hadmin1@hotel.com", PasswordHash = hotelAdminPasswordHash, Phone = "2345678901", Role = "HotelAdmin", LoyaltyPoints = 0 },
                new User { UserId = 3, UserName = "Seaside Admin", Email = "hadmin2@hotel.com", PasswordHash = hotelAdminPasswordHash, Phone = "3456789012", Role = "HotelAdmin", LoyaltyPoints = 0 },
                new User { UserId = 4, UserName = "John Doe", Email = "customer@hotel.com", PasswordHash = customerPasswordHash, Phone = "4567890123", Role = "Customer", LoyaltyPoints = 150 }
            );

            modelBuilder.Entity<Hotel>().HasData(
                new Hotel { HotelId = 1, HotelName = "Grand Plaza Hotel", Description = "A luxurious 5-star hotel in the heart of NYC with breathtaking city views.", Address = "768 5th Ave", City = "New York", State = "NY", Pincode = "10019", Ratings = 4.8, HotelAdminId = 2, ImageUrl = "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80" },
                new Hotel { HotelId = 2, HotelName = "Seaside Resort & Spa", Description = "Escape to paradise. Located right on the Miami beach with world class spa services.", Address = "4441 Collins Ave", City = "Miami", State = "FL", Pincode = "33140", Ratings = 4.5, HotelAdminId = 3, ImageUrl = "https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=1200&q=80" }
            );

            modelBuilder.Entity<RoomType>().HasData(
                new RoomType { RoomTypeId = 1, HotelId = 1, Name = "Deluxe Room", Price = 180.00m, Capacity = 2, Description = "King bed, skyline view, work desk", Amenities = "AC, TV, WiFi, Mini Bar, Coffee Maker" },
                new RoomType { RoomTypeId = 2, HotelId = 1, Name = "Executive Suite", Price = 350.00m, Capacity = 3, Description = "Master bedroom, living area, panoramic city views", Amenities = "AC, TV, WiFi, Mini Bar, Coffee Maker, Jacuzzi, Balcony" },
                new RoomType { RoomTypeId = 3, HotelId = 2, Name = "Oceanfront Double", Price = 220.00m, Capacity = 4, Description = "Two Queen beds, ocean breeze balcony", Amenities = "AC, TV, WiFi, Mini Bar, Balcony" },
                new RoomType { RoomTypeId = 4, HotelId = 2, Name = "Presidential Suite", Price = 600.00m, Capacity = 4, Description = "Ultra luxury suite, private pool access, dining area", Amenities = "AC, TV, WiFi, Mini Bar, Kitchenette, Private Pool, Butler Service" }
            );

            modelBuilder.Entity<Room>().HasData(
                new Room { RoomId = 1, HotelId = 1, RoomTypeId = 1, RoomNo = "101", Status = "Available" },
                new Room { RoomId = 2, HotelId = 1, RoomTypeId = 1, RoomNo = "102", Status = "Available" },
                new Room { RoomId = 3, HotelId = 1, RoomTypeId = 2, RoomNo = "201", Status = "Available" },
                new Room { RoomId = 4, HotelId = 1, RoomTypeId = 2, RoomNo = "202", Status = "Available" },
                new Room { RoomId = 5, HotelId = 2, RoomTypeId = 3, RoomNo = "101A", Status = "Available" },
                new Room { RoomId = 6, HotelId = 2, RoomTypeId = 3, RoomNo = "102A", Status = "Available" },
                new Room { RoomId = 7, HotelId = 2, RoomTypeId = 4, RoomNo = "501", Status = "Available" }
            );

            modelBuilder.Entity<HotelAmenity>().HasData(
                new HotelAmenity { AmenityId = 1, HotelId = 1, Name = "AC", IsAvailable = true },
                new HotelAmenity { AmenityId = 2, HotelId = 1, Name = "WiFi", IsAvailable = true },
                new HotelAmenity { AmenityId = 3, HotelId = 1, Name = "Parking", IsAvailable = true },
                new HotelAmenity { AmenityId = 4, HotelId = 1, Name = "Swimming Pool", IsAvailable = true },
                new HotelAmenity { AmenityId = 5, HotelId = 1, Name = "Gym", IsAvailable = true },
                new HotelAmenity { AmenityId = 6, HotelId = 2, Name = "AC", IsAvailable = true },
                new HotelAmenity { AmenityId = 7, HotelId = 2, Name = "WiFi", IsAvailable = true },
                new HotelAmenity { AmenityId = 8, HotelId = 2, Name = "Parking", IsAvailable = true },
                new HotelAmenity { AmenityId = 9, HotelId = 2, Name = "Spa", IsAvailable = true },
                new HotelAmenity { AmenityId = 10, HotelId = 2, Name = "Private Beach Access", IsAvailable = true }
            );

            modelBuilder.Entity<Coupon>().HasData(
                new Coupon { CouponId = 1, Code = "WELCOME10", DiscountType = "Percentage", DiscountValue = 10.00m, ExpiryDate = DateTime.UtcNow.AddMonths(6), IsActive = true },
                new Coupon { CouponId = 2, Code = "SAVE50", DiscountType = "FixedAmount", DiscountValue = 50.00m, ExpiryDate = DateTime.UtcNow.AddMonths(6), IsActive = true }
            );
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
