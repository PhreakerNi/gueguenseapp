export const QUOTE_STATUSES = [
  "DRAFT",
  "QUOTED",
  "CONSUMED",
  "EXPIRED",
  "CANCELED",
] as const;

export const DELIVERY_STATUSES = [
  "SEARCHING_DRIVER",
  "DRIVER_ASSIGNED",
  "TO_PICKUP",
  "ARRIVED_PICKUP",
  "PICKED_UP",
  "TO_DROPOFF",
  "ARRIVED_DROPOFF",
  "DELIVERED",
  "RETURN_REQUIRED",
  "RETURNING",
  "RETURNED",
  "CANCELED",
  "FAILED",
] as const;

export const TERMINAL_DELIVERY_STATUSES = [
  "DELIVERED",
  "RETURNED",
  "CANCELED",
  "FAILED",
] as const;

export const OTP_ALLOWED_STATES = [
  "PICKED_UP",
  "TO_DROPOFF",
  "ARRIVED_DROPOFF",
] as const;

export const INCIDENT_STATUSES = [
  "OPEN",
  "UNDER_INVESTIGATION",
  "RESOLVED_CONTINUE",
  "RESOLVED_RETURN",
  "RESOLVED_HANDOFF",
  "CLOSED",
] as const;

export const INCIDENT_TYPES = [
  "VEHICLE_BREAKDOWN",
  "ACCIDENT",
  "GPS_LOST",
  "NETWORK_LOST",
  "PACKAGE_DAMAGED",
  "BUSINESS_CLOSED",
  "PACKAGE_NOT_READY",
  "CUSTOMER_UNREACHABLE",
  "RECIPIENT_REFUSED",
  "ADDRESS_PROBLEM",
  "PAYMENT_PROBLEM",
  "CASH_MISMATCH",
  "SAFETY_ISSUE",
  "OTHER",
] as const;

export const OFFER_STATUSES = [
  "OPEN",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
  "CANCELED",
] as const;

export const DRIVER_VERIFICATION_STATUSES = [
  "PENDING",
  "UNDER_REVIEW",
  "VERIFIED",
  "REJECTED",
  "EXPIRED",
] as const;

export const DRIVER_ACCOUNT_STATUSES = [
  "REGISTERED",
  "ACTIVE",
  "SUSPENDED",
  "BLOCKED",
  "CLOSED",
] as const;

export const DRIVER_OPERATIONAL_STATES = [
  "OFFLINE",
  "AVAILABLE",
  "OFFERED",
  "BUSY",
  "PAUSED",
] as const;

export const BUSINESS_VERIFICATION_STATUSES = [
  "NOT_REQUIRED",
  "PENDING",
  "UNDER_REVIEW",
  "VERIFIED",
  "REJECTED",
] as const;

export const BUSINESS_ACCOUNT_STATUSES = [
  "ACTIVE",
  "SUSPENDED",
  "BLOCKED",
  "CLOSED",
] as const;

export const BUSINESS_MEMBER_ROLES = [
  "business_owner",
  "business_manager",
  "business_employee",
] as const;

export const PLATFORM_ROLES = [
  "super_admin",
  "admin",
  "operator",
  "verification_agent",
  "none",
] as const;

export const PRICING_ADJUSTMENT_TYPES = [
  "WAITING_FEE",
  "RETURN_FEE",
  "CANCEL_FEE",
  "DISCOUNT",
  "SUBSIDY",
  "MANUAL_ADJUSTMENT",
] as const;

export const HANDOFF_STATUSES = [
  "INITIATED",
  "CONFIRMED_FROM",
  "CONFIRMED_TO",
  "COMPLETED",
  "ABORTED",
] as const;

export const PAYOUT_STATUSES = [
  "REQUESTED",
  "UNDER_REVIEW",
  "APPROVED",
  "PROCESSING",
  "PAID",
  "REJECTED",
  "FAILED",
] as const;

export const PAYMENT_STATUSES = [
  "PENDING",
  "AUTHORIZED",
  "CAPTURED",
  "FAILED",
  "REFUNDED",
] as const;

export const CASH_SETTLEMENT_STATUSES = [
  "PENDING",
  "UNDER_REVIEW",
  "SETTLED",
  "DISCREPANCY",
  "REJECTED",
] as const;

export const NOTIFICATION_STATUSES = [
  "QUEUED",
  "SENDING",
  "DELIVERED",
  "FAILED_RETRYABLE",
  "FAILED_PERMANENT",
] as const;
