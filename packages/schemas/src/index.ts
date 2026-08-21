import { z } from "zod";

export const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().min(1),
});

export type LocationInput = z.infer<typeof locationSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2),
  phone: z.string().optional(),
});

export type SignupInput = z.infer<typeof signupSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const mfaVerifySchema = z.object({
  code: z.string().length(6).regex(/^\d+$/, "Code must be 6 digits"),
});

export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>;

// Phase 3: B2B Onboarding, Locations, Members & Driver Verification Schemas

export const uuidV4Schema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    "Must be a valid UUID v4",
  );

// 1. Business Creation Schema (brandName optional, Section 16)
export const businessCreationSchema = z.object({
  legalName: z
    .string()
    .trim()
    .min(2, "Legal name must be at least 2 characters"),
  brandName: z
    .string()
    .trim()
    .min(2, "Brand name must be at least 2 characters")
    .optional()
    .nullable(),
  taxId: z.string().trim().min(3, "Tax ID must be at least 3 characters"),
});

export type BusinessCreationInput = z.infer<typeof businessCreationSchema>;

// 2. Business Location Schema (Separated Branch Creation)
export const businessLocationSchema = z.object({
  businessId: z.string().uuid("Invalid business ID"),
  name: z.string().trim().min(2, "Branch name must be at least 2 characters"),
  addressText: z
    .string()
    .trim()
    .min(5, "Branch address must be at least 5 characters"),
  latitude: z.number().min(-90).max(90, "Latitude must be between -90 and 90"),
  longitude: z
    .number()
    .min(-180)
    .max(180, "Longitude must be between -180 and 180"),
  phone: z.string().trim().optional().nullable(),
  pickupInstructions: z.string().trim().optional(),
});

export type BusinessLocationInput = z.infer<typeof businessLocationSchema>;

// 3. Business Member Schema (N:M Scope Support, Section 19)
export const businessMemberSchema = z.object({
  businessId: z.string().uuid("Invalid business ID"),
  userId: z.string().uuid("Invalid user ID"),
  role: z.enum([
    "business_manager",
    "business_employee",
    "manager",
    "employee",
  ]),
  locationIds: z
    .array(z.string().uuid())
    .min(1, "At least one location is required"),
});

export type BusinessMemberInput = z.infer<typeof businessMemberSchema>;

// Legacy composite schema compatibility
export const businessOnboardingSchema = z.object({
  legalName: z
    .string()
    .trim()
    .min(2, "Legal name must be at least 2 characters"),
  brandName: z
    .string()
    .trim()
    .min(2, "Brand name must be at least 2 characters")
    .optional()
    .nullable(),
  taxId: z.string().trim().min(3, "Tax ID must be at least 3 characters"),
  branchName: z
    .string()
    .trim()
    .min(2, "Branch name must be at least 2 characters")
    .optional(),
  branchAddress: z
    .string()
    .trim()
    .min(5, "Branch address must be at least 5 characters")
    .optional(),
  branchLatitude: z.number().min(-90).max(90).optional(),
  branchLongitude: z.number().min(-180).max(180).optional(),
  pickupInstructions: z.string().trim().optional(),
});

export type BusinessOnboardingInput = z.infer<typeof businessOnboardingSchema>;

// 4. Driver Onboarding Schema (Personal info only - separated from vehicle)
export const driverOnboardingSchema = z.object({
  nationalIdNumber: z
    .string()
    .trim()
    .min(5, "National ID must be at least 5 characters"),
  licenseNumber: z
    .string()
    .trim()
    .min(5, "Driver license must be at least 5 characters"),
});

export type DriverOnboardingInput = z.infer<typeof driverOnboardingSchema>;

// 5. Vehicle Registration Schema (Separated step, Section 24)
export const vehicleRegistrationSchema = z.object({
  make: z.string().trim().min(2, "Vehicle make must be at least 2 characters"),
  model: z.string().trim().min(1, "Vehicle model is required"),
  year: z
    .number()
    .int()
    .min(1980)
    .max(new Date().getFullYear() + 1, "Invalid vehicle year"),
  color: z.string().trim().min(2, "Vehicle color is required"),
  licensePlate: z
    .string()
    .trim()
    .min(3, "License plate must be at least 3 characters"),
});

export type VehicleRegistrationInput = z.infer<
  typeof vehicleRegistrationSchema
>;

// 6. Driver Document Types & Upload Schemas (Section 4, 6, 7)
export const driverDocumentTypeSchema = z.enum([
  "NATIONAL_ID",
  "DRIVER_LICENSE",
  "VEHICLE_REGISTRATION",
  "CRIMINAL_RECORD",
  "INSURANCE",
]);

export type DriverDocumentType = z.infer<typeof driverDocumentTypeSchema>;

export const uploadAuthorizationSchema = z.object({
  document_type: driverDocumentTypeSchema.or(
    z.enum([
      "NATIONAL_ID",
      "DRIVER_LICENSE",
      "VEHICLE_REGISTRATION",
      "CRIMINAL_RECORD",
      "INSURANCE",
    ]),
  ),
  mime_type: z.enum(["image/jpeg", "image/png", "application/pdf"]),
  size_bytes: z.number().int().min(1).max(10485760),
});

export type UploadAuthorizationInput = z.infer<
  typeof uploadAuthorizationSchema
>;

export const driverDocumentCommitSchema = z.object({
  upload_id: z.string().uuid("Invalid upload ID"),
  document_type: driverDocumentTypeSchema,
});

export type DriverDocumentCommitInput = z.infer<
  typeof driverDocumentCommitSchema
>;

// Legacy schema compatibility
export const driverDocumentSubmitSchema = z.object({
  documentType: driverDocumentTypeSchema,
  storagePath: z.string().trim().min(3, "Storage path is required"),
});

export type DriverDocumentSubmitInput = z.infer<
  typeof driverDocumentSubmitSchema
>;

// 7. Admin Verify Driver Schema
export const adminVerifyDriverSchema = z
  .object({
    driverId: z.string().uuid("Invalid driver ID"),
    decision: z.enum(["APPROVE", "REJECT"]),
    rejectionReason: z.string().trim().optional(),
  })
  .refine(
    (data) => {
      if (data.decision === "REJECT") {
        return Boolean(
          data.rejectionReason && data.rejectionReason.length >= 3,
        );
      }
      return true;
    },
    {
      message: "Rejection reason must be at least 3 characters when rejecting",
      path: ["rejectionReason"],
    },
  );

export type AdminVerifyDriverInput = z.infer<typeof adminVerifyDriverSchema>;

// Phase 4: Quote Engine Schemas

export const packageTypeSchema = z.enum([
  "PARCEL",
  "DOCUMENT",
  "FOOD",
  "FRAGILE",
  "BULKY",
]);

export type PackageTypeInput = z.infer<typeof packageTypeSchema>;

export const quoteStatusSchema = z.enum([
  "DRAFT",
  "QUOTED",
  "CONSUMED",
  "EXPIRED",
  "CANCELED",
]);

export type QuoteStatusInput = z.infer<typeof quoteStatusSchema>;

export const createQuoteSchema = z.object({
  location_id: z.string().uuid("Invalid location ID"),
  dropoff_address: z.object({
    address_text: z
      .string()
      .trim()
      .min(3, "Dropoff address must be at least 3 characters"),
    latitude: z
      .number()
      .min(-90)
      .max(90, "Latitude must be between -90 and 90"),
    longitude: z
      .number()
      .min(-180)
      .max(180, "Longitude must be between -180 and 180"),
  }),
  recipient_name: z
    .string()
    .trim()
    .min(2, "Recipient name must be at least 2 characters"),
  recipient_phone: z
    .string()
    .trim()
    .min(8, "Recipient phone must be at least 8 digits")
    .regex(/^\+?[0-9\s\-()]+$/, "Invalid recipient phone format"),
  package_type: packageTypeSchema,
  cash_to_collect: z
    .number()
    .min(0, "Cash to collect must be non-negative")
    .default(0),
});

export type CreateQuoteInput = z.infer<typeof createQuoteSchema>;

export const quoteResponseSchema = z.object({
  quote_id: z.string().uuid(),
  delivery_request_id: z.string().uuid(),
  status: quoteStatusSchema,
  currency: z.literal("NIO"),
  base_amount: z.string(),
  distance_amount: z.string(),
  time_amount: z.string(),
  zone_amount: z.string(),
  demand_amount: z.string(),
  discount_amount: z.string(),
  quoted_total: z.string(),
  route_distance_meters: z.number().int().positive(),
  route_duration_seconds: z.number().int().nonnegative(),
  route_provider: z.literal("GOOGLE_ROUTES"),
  route_calculated_at: z.string(),
  expires_at: z.string(),
  created_at: z.string(),
});

export type QuoteResponse = z.infer<typeof quoteResponseSchema>;
