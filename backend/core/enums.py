"""Common enum-like constants used by the API."""


class UserRole:
    ADMIN = "admin"
    OPERATIONS_MANAGER = "operations_manager"
    CLEANER = "cleaner"
    RIDER = "rider"
    MAINTENANCE = "maintenance"
    LAUNDRY = "laundry"
    CLIENT = "client"
    # Legacy aliases
    MANAGER = "admin"
    OPS_MANAGER = "operations_manager"


ALL_ROLES = ["admin", "operations_manager", "cleaner", "rider", "maintenance", "laundry", "client"]
INTERNAL_ROLES = ["admin", "operations_manager", "cleaner", "rider", "maintenance", "laundry"]
OPS_ROLES = {"admin", "operations_manager"}


class StructureType:
    APARTMENT = "apartment"
    GUESTHOUSE = "guesthouse"
    HOTEL = "hotel"
    OFFICE = "office"
    OTHER = "other"


class StructureService:
    CLEANING = "cleaning"
    PRIVATE_LAUNDRY = "private_laundry"
    RENTAL_LAUNDRY = "rental_laundry"
    CONSUMABLES = "consumables"
    MAINTENANCE = "maintenance"
    OTHER = "other"


class EventType:
    BOOKING = "booking"
    CLEANING = "cleaning"
    DELIVERY = "delivery"
    PICKUP = "pickup"
    MAINTENANCE = "maintenance"


class EventStatus:
    PENDING = "pending"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class AutomationRule:
    CHECKOUT_CLEANING = "checkout_cleaning"
    CHECKOUT_LINEN = "checkout_linen"
    CHECKOUT_CONSUMABLES = "checkout_consumables"
    CHECKOUT_MAINTENANCE = "checkout_maintenance"
    CHECKIN_DELIVERY = "checkin_delivery"
    STOCK_REFILL = "stock_refill"
    FIXED_SCHEDULE = "fixed_schedule"
