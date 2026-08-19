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

// 1. Business Creation Schema
export const businessCreationSchema = z.object({
  legalName: z
    .string()
    .trim()
    .min(2, "Legal name must be at least 2 characters"),
  brandName: z
    .string()
    .trim()
    .min(2, "Brand name must be at least 2 characters"),
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
  pickupInstructions: z.string().trim().optional(),
});

export type BusinessLocationInput = z.infer<typeof businessLocationSchema>;

// 3. Business Member Schema (N:M Scope Support)
export const businessMemberSchema = z.object({
  businessId: z.string().uuid("Invalid business ID"),
  userId: z.string().uuid("Invalid user ID"),
  role: z.enum(["business_manager", "business_employee"]),
  locationIds: z.array(z.string().uuid()).default([]),
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
    .min(2, "Brand name must be at least 2 characters"),
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

// 5. Vehicle Registration Schema (Separated step)
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

// 6. Driver Document Types & Commit Schema
export const driverDocumentTypeSchema = z.enum([
  "NATIONAL_ID",
  "DRIVER_LICENSE",
  "VEHICLE_REGISTRATION",
  "CRIMINAL_RECORD",
  "INSURANCE",
]);

export type DriverDocumentType = z.infer<typeof driverDocumentTypeSchema>;

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
