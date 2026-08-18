import {
  DELIVERY_STATUSES,
  OTP_ALLOWED_STATES,
  TERMINAL_DELIVERY_STATUSES,
} from "./constants";

export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export function isTerminalDeliveryStatus(status: string): boolean {
  return (TERMINAL_DELIVERY_STATUSES as readonly string[]).includes(status);
}

export function isOtpAllowedState(status: string): boolean {
  return (OTP_ALLOWED_STATES as readonly string[]).includes(status);
}

export type PlatformRole =
  | "super_admin"
  | "admin"
  | "operator"
  | "verification_agent"
  | "none";

export type BusinessMemberRole =
  | "business_owner"
  | "business_manager"
  | "business_employee";

export type BusinessMemberStatus = "ACTIVE" | "INVITED" | "SUSPENDED";

export type DriverVerificationStatus =
  | "PENDING"
  | "UNDER_REVIEW"
  | "VERIFIED"
  | "REJECTED"
  | "EXPIRED";

export type DriverAccountStatus =
  | "REGISTERED"
  | "ACTIVE"
  | "SUSPENDED"
  | "BLOCKED"
  | "CLOSED";

export type BusinessAccountStatus =
  | "ACTIVE"
  | "SUSPENDED"
  | "BLOCKED"
  | "CLOSED";

export type IdentityContext = {
  userId: string;
  email: string | null;
  profile: {
    platformRole: PlatformRole;
    fullName: string | null;
    phone: string | null;
    avatarUrl: string | null;
  };
  businessMemberships: Array<{
    membershipId: string;
    businessId: string;
    role: BusinessMemberRole;
    status: BusinessMemberStatus;
    businessAccountStatus?: BusinessAccountStatus | undefined;
  }>;
  driver: null | {
    verificationStatus: DriverVerificationStatus;
    accountStatus: DriverAccountStatus;
  };
};

export type AccessEvaluationReason =
  | "ONBOARDING_REQUIRED"
  | "ACCOUNT_RESTRICTED"
  | "ADMIN_ROLE_REQUIRED"
  | "MFA_REQUIRED";

export type AccessEvaluation = {
  allowed: boolean;
  reason?: AccessEvaluationReason | undefined;
};

export function evaluateBusinessAccess(
  identity: IdentityContext | null,
): AccessEvaluation {
  if (!identity) {
    return { allowed: false, reason: "ONBOARDING_REQUIRED" };
  }
  if (
    !identity.businessMemberships ||
    identity.businessMemberships.length === 0
  ) {
    return { allowed: false, reason: "ONBOARDING_REQUIRED" };
  }
  const activeMembership = identity.businessMemberships.find(
    (m) =>
      m.status === "ACTIVE" &&
      (!m.businessAccountStatus || m.businessAccountStatus === "ACTIVE"),
  );
  if (!activeMembership) {
    return { allowed: false, reason: "ACCOUNT_RESTRICTED" };
  }
  return { allowed: true };
}

export function evaluateDriverAccess(
  identity: IdentityContext | null,
): AccessEvaluation {
  if (!identity || !identity.driver) {
    return { allowed: false, reason: "ONBOARDING_REQUIRED" };
  }
  if (identity.driver.accountStatus === "REGISTERED") {
    return { allowed: false, reason: "ONBOARDING_REQUIRED" };
  }
  if (identity.driver.accountStatus === "ACTIVE") {
    return { allowed: true };
  }
  return { allowed: false, reason: "ACCOUNT_RESTRICTED" };
}

export function evaluateAdminAccess(
  identity: IdentityContext | null,
  aalLevel: string = "aal1",
): AccessEvaluation {
  if (!identity) {
    return { allowed: false, reason: "ADMIN_ROLE_REQUIRED" };
  }
  const allowedRoles: PlatformRole[] = [
    "super_admin",
    "admin",
    "operator",
    "verification_agent",
  ];
  if (!allowedRoles.includes(identity.profile.platformRole)) {
    return { allowed: false, reason: "ADMIN_ROLE_REQUIRED" };
  }
  if (aalLevel !== "aal2") {
    return { allowed: false, reason: "MFA_REQUIRED" };
  }
  return { allowed: true };
}
