using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;
using System.Text.Json.Serialization;

namespace HotelBooking.Models
{
    public class User
    {
        [Key]
        public int UserId { get; set; }
        [Required]
        public string UserName { get; set; } = string.Empty;
        [Required]
        public string Email { get; set; } = string.Empty;
        [Required]
        [JsonIgnore]
        public string PasswordHash { get; set; } = string.Empty;
        [Required]
        public string Phone { get; set; } = string.Empty;
        [Required]
        public string Role { get; set; } = string.Empty; // "Customer", "HotelAdmin", "SystemAdmin"
        public int LoyaltyPoints { get; set; } = 0;
    }

    public class Hotel
    {
        [Key]
        public int HotelId { get; set; }
        [Required]
        public string HotelName { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        [Required]
        public string Address { get; set; } = string.Empty;
        [Required]
        public string City { get; set; } = string.Empty;
        [Required]
        public string State { get; set; } = string.Empty;
        [Required]
        public string Pincode { get; set; } = string.Empty;
        [Range(1.0, 5.0)]
        public double Ratings { get; set; } = 5.0;
        public int HotelAdminId { get; set; }
        public string ImageUrl { get; set; } = string.Empty;
    }

    public class RoomType
    {
        [Key]
        public int RoomTypeId { get; set; }
        public int HotelId { get; set; }
        [Required]
        public string Name { get; set; } = string.Empty;
        [Column(TypeName = "decimal(18,2)")]
        public decimal Price { get; set; }
        public int Capacity { get; set; }
        public string Description { get; set; } = string.Empty; // details about layout, bed configuration, luxury, view
        public string Amenities { get; set; } = string.Empty; // comma-separated e.g. "AC, TV, WiFi"
    }

    public class Room
    {
        [Key]
        public int RoomId { get; set; }
        public int HotelId { get; set; }
        public int RoomTypeId { get; set; }
        [Required]
        public string RoomNo { get; set; } = string.Empty;
        public string Status { get; set; } = "Available"; // "Available", "Maintenance"
    }

    public class Booking
    {
        [Key]
        public int BookingId { get; set; }
        public int UserId { get; set; }
        public int RoomId { get; set; }
        [Required]
        public DateTime CheckIn { get; set; }
        [Required]
        public DateTime CheckOut { get; set; }
        [Column(TypeName = "decimal(18,2)")]
        public decimal TotalAmount { get; set; }
        public string BookingStatus { get; set; } = "Pending"; // "Pending", "Confirmed", "Cancelled"
        public string BookingState { get; set; } = "Reserved"; // "Reserved", "Completed", "Cancelled"
        public string GuestName { get; set; } = string.Empty;
        public string GuestEmail { get; set; } = string.Empty;
        public string GuestPhone { get; set; } = string.Empty;
        public string ReservationNumber { get; set; } = string.Empty;
    }

    public class Payment
    {
        [Key]
        public int PaymentId { get; set; }
        public int BookingId { get; set; }
        [Column(TypeName = "decimal(18,2)")]
        public decimal Amount { get; set; }
        public string PaymentMethod { get; set; } = string.Empty; // "Online Payment", "Offline Payment"
        public string PaymentStatus { get; set; } = "Pending"; // "Paid", "Pending", "Refunded"
        public DateTime PaymentDate { get; set; } = DateTime.UtcNow;
    }

    public class Coupon
    {
        [Key]
        public int CouponId { get; set; }
        [Required]
        public string Code { get; set; } = string.Empty;
        public string DiscountType { get; set; } = "Percentage"; // "Percentage", "FixedAmount"
        [Column(TypeName = "decimal(18,2)")]
        public decimal DiscountValue { get; set; }
        public DateTime ExpiryDate { get; set; }
        public bool IsActive { get; set; } = true;
    }

    public class HotelAmenity
    {
        [Key]
        public int AmenityId { get; set; }
        public int HotelId { get; set; }
        [Required]
        public string Name { get; set; } = string.Empty;
        public bool IsAvailable { get; set; } = true;
    }
}
