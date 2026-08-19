import {
  AUTH_ERROR_CODES,
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

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

export function normalizeAuthError(error: unknown): AuthErrorCode {
  if (!error) return "AUTH_INVALID_CREDENTIALS";
  const msg =
    typeof error === "string"
      ? error
      : (error as { message?: string }).message || "";
  const lower = msg.toLowerCase();

  if (
    lower.includes("invalid login credentials") ||
    lower.includes("invalid credential") ||
    lower.includes("wrong password")
  ) {
    return "AUTH_INVALID_CREDENTIALS";
  }
  if (lower.includes("email not confirmed") || lower.includes("unconfirmed")) {
    return "AUTH_EMAIL_NOT_CONFIRMED";
  }
  if (
    lower.includes("already registered") ||
    lower.includes("user already exists")
  ) {
    return "AUTH_USER_ALREADY_EXISTS";
  }
  if (
    lower.includes("password should be") ||
    lower.includes("weak password") ||
    lower.includes("short")
  ) {
    return "AUTH_WEAK_PASSWORD";
  }
  if (
    lower.includes("jwt expired") ||
    lower.includes("session expired") ||
    lower.includes("token is expired")
  ) {
    return "AUTH_SESSION_EXPIRED";
  }
  if (
    lower.includes("recovery") ||
    lower.includes("reset password") ||
    lower.includes("invalid link")
  ) {
    return "AUTH_PASSWORD_RECOVERY_INVALID";
  }
  if (lower.includes("mfa required") || lower.includes("aal2 required")) {
    return "AUTH_MFA_REQUIRED";
  }
  if (
    lower.includes("invalid code") ||
    lower.includes("mfa challenge") ||
    lower.includes("totp")
  ) {
    return "AUTH_MFA_INVALID";
  }
  if (lower.includes("role") || lower.includes("admin")) {
    return "AUTH_ADMIN_ROLE_REQUIRED";
  }
  if (
    lower.includes("restricted") ||
    lower.includes("suspended") ||
    lower.includes("blocked")
  ) {
    return "AUTH_ACCOUNT_RESTRICTED";
  }
  if (lower.includes("onboarding") || lower.includes("not completed")) {
    return "AUTH_ONBOARDING_REQUIRED";
  }
  if (
    lower.includes("network") ||
    lower.includes("fetch failed") ||
    lower.includes("connection")
  ) {
    return "AUTH_NETWORK_ERROR";
  }
  return "AUTH_INVALID_CREDENTIALS";
}

export function getAuthErrorMessage(code: AuthErrorCode): string {
  switch (code) {
    case "AUTH_INVALID_CREDENTIALS":
      return "Credenciales inválidas. Verifica tu correo y contraseña.";
    case "AUTH_EMAIL_NOT_CONFIRMED":
      return "Correo electrónico no confirmado. Revisa tu bandeja de entrada.";
    case "AUTH_USER_ALREADY_EXISTS":
      return "Ya existe una cuenta registrada con este correo electrónico.";
    case "AUTH_WEAK_PASSWORD":
      return "La contraseña no cumple con los requisitos mínimos de seguridad (al menos 8 caracteres).";
    case "AUTH_SESSION_EXPIRED":
      return "Tu sesión ha expirado. Por favor inicia sesión nuevamente.";
    case "AUTH_PASSWORD_RECOVERY_INVALID":
      return "El enlace de recuperación es inválido o ha expirado.";
    case "AUTH_MFA_REQUIRED":
      return "Se requiere autenticación de dos factores (MFA) para continuar.";
    case "AUTH_MFA_INVALID":
      return "Código de autenticación inválido o expirado.";
    case "AUTH_ADMIN_ROLE_REQUIRED":
      return "Acceso denegado: Esta cuenta no posee permisos administrativos.";
    case "AUTH_ACCOUNT_RESTRICTED":
      return "Tu cuenta se encuentra restringida o suspendida. Contacta a soporte.";
    case "AUTH_ONBOARDING_REQUIRED":
      return "Registro incompleto. Por favor completa el proceso de registro.";
    case "AUTH_NETWORK_ERROR":
      return "Error de conexión con el servidor. Revisa tu conexión a internet.";
    default:
      return "Ocurrió un error inesperado en la autenticación.";
  }
}

export function canResetPassword(
  hasSession: boolean,
  isPasswordRecovery: boolean,
): boolean {
  return hasSession && isPasswordRecovery === true;
}

export function validateRecoveryTokens(
  type: string | undefined,
  accessToken: string | undefined,
  refreshToken: string | undefined,
): boolean {
  if (type === "recovery") {
    return Boolean(accessToken && refreshToken);
  }
  return false;
}

export class DeepLinkDeduplicator {
  private processed = new Set<string>();

  shouldProcess(url: string | null | undefined): boolean {
    if (!url) return false;
    if (this.processed.has(url)) return false;
    this.processed.add(url);
    return true;
  }

  has(url: string): boolean {
    return this.processed.has(url);
  }

  clear(): void {
    this.processed.clear();
  }
}

export function shouldProcessDeepLink(
  processedSet: Set<string>,
  url: string | null | undefined,
): boolean {
  if (!url) return false;
  if (processedSet.has(url)) return false;
  processedSet.add(url);
  return true;
}
