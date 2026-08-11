import {
  DELIVERY_STATUSES,
  OTP_ALLOWED_STATES,
  TERMINAL_DELIVERY_STATUSES,
} from "./constants.js";

export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export function isTerminalDeliveryStatus(status: string): boolean {
  return (TERMINAL_DELIVERY_STATUSES as readonly string[]).includes(status);
}

export function isOtpAllowedState(status: string): boolean {
  return (OTP_ALLOWED_STATES as readonly string[]).includes(status);
}
