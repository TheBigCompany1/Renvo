import { sql } from "drizzle-orm";
import { pgTable, text, varchar, jsonb, timestamp, decimal, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export * from "./models/auth";

export const analysisReports = pgTable("analysis_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  propertyUrl: text("property_url"),
  propertyAddress: text("property_address"),
  inputType: text("input_type").notNull().default("url"),
  status: text("status").notNull().default("pending"),
  failureReason: text("failure_reason"),
  dataSource: text("data_source"),
  propertyData: jsonb("property_data"),
  geoData: jsonb("geo_data"),
  imagery: jsonb("imagery"),
  visionAnalysis: jsonb("vision_analysis"),
  mapsContext: jsonb("maps_context"),
  renovationProjects: jsonb("renovation_projects"),
  comparableProperties: jsonb("comparable_properties"),
  contractors: jsonb("contractors"),
  financialSummary: jsonb("financial_summary"),
  validationSummary: jsonb("validation_summary"),
  stripeSessionId: text("stripe_session_id"),
  paymentStatus: text("payment_status").default("unpaid"),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const locationSchema = z.object({
  address: z.string(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export const schoolRatingSchema = z.object({
  name: z.string(),
  type: z.enum(['elementary', 'middle', 'high', 'private']).optional(),
  rating: z.number().min(1).max(10),
  distance: z.string().optional(),
});

export const walkScoresSchema = z.object({
  walkScore: z.number().min(0).max(100).optional(),
  transitScore: z.number().min(0).max(100).optional(),
  bikeScore: z.number().min(0).max(100).optional(),
});

export const crimeStatsSchema = z.object({
  overallRating: z.enum(['very_low', 'low', 'moderate', 'high', 'very_high']).optional(),
  violentCrimeIndex: z.number().optional(),
  propertyCrimeIndex: z.number().optional(),
  description: z.string().optional(),
});

export const hazardRiskSchema = z.object({
  floodZone: z.string().optional(),
  floodRisk: z.enum(['minimal', 'low', 'moderate', 'high', 'very_high']).optional(),
  fireRisk: z.enum(['minimal', 'low', 'moderate', 'high', 'very_high']).optional(),
  earthquakeRisk: z.enum(['minimal', 'low', 'moderate', 'high', 'very_high']).optional(),
  insuranceImplications: z.string().optional(),
});

export const permitSchema = z.object({
  date: z.string().optional(),
  type: z.string(),
  description: z.string(),
  value: z.number().optional(),
  status: z.string().optional(),
});

export const rentalPotentialSchema = z.object({
  estimatedMonthlyRent: z.number().optional(),
  annualRentalIncome: z.number().optional(),
  capRate: z.number().optional(),
  rentToValueRatio: z.number().optional(),
  marketRentRange: z.object({
    low: z.number().optional(),
    high: z.number().optional(),
  }).optional(),
});

export const propertyDataSchema = z.object({
  address: z.string(),
  price: z.number().optional(),
  beds: z.number(),
  baths: z.number(),
  sqft: z.number(),
  yearBuilt: z.number().optional(),
  lotSize: z.string().optional(),
  description: z.string().optional(),
  images: z.array(z.string()).optional(),
  location: locationSchema.optional(),
  redfinEstimate: z.number().optional(),
  lastSoldPrice: z.number().optional(),
  lastSoldDate: z.string().optional(),
  priceHistory: z.array(z.object({
    date: z.string().optional(),
    price: z.number().optional(),
    event: z.string().optional(),
  })).optional(),
  schools: z.array(schoolRatingSchema).optional(),
  walkScores: walkScoresSchema.optional(),
  crimeStats: crimeStatsSchema.optional(),
  hazardRisk: hazardRiskSchema.optional(),
  permitHistory: z.array(permitSchema).optional(),
  propertyTaxAnnual: z.number().optional(),
  propertyTaxRate: z.number().optional(),
  rentalPotential: rentalPotentialSchema.optional(),
});

export type SchoolRating = z.infer<typeof schoolRatingSchema>;
export type WalkScores = z.infer<typeof walkScoresSchema>;
export type CrimeStats = z.infer<typeof crimeStatsSchema>;
export type HazardRisk = z.infer<typeof hazardRiskSchema>;
export type Permit = z.infer<typeof permitSchema>;
export type RentalPotential = z.infer<typeof rentalPotentialSchema>;

export const contractorSchema = z.object({
  name: z.string(),
  specialty: z.string(),
  rating: z.number(),
  reviewCount: z.number(),
  experience: z.string(),
  contact: z.string().optional(),
  website: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  distanceMiles: z.number().optional(),
  source: z.string().optional(),
});

export const renovationProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  costRangeLow: z.number(),
  costRangeHigh: z.number(),
  valueAdd: z.number(),
  roi: z.number(),
  timeline: z.string(),
  priority: z.number(),
  sqftAdded: z.number().nonnegative().optional(),
  costPerSqft: z.number().nonnegative().optional(),
  valuePerSqft: z.number().nonnegative().optional(),
  detailedDescription: z.string().optional(),
  contractors: z.array(contractorSchema).optional(),
  newTotalSqft: z.number().nonnegative().optional(),
  postRenovationValue: z.number().nonnegative().optional(),
  marketPricePsfUsed: z.number().nonnegative().optional(),
  costPerSqftUsed: z.number().nonnegative().optional(),
  corrected: z.boolean().optional(),
  computedCost: z.number().optional(),
  computedValue: z.number().optional(),
  pricePsfUsed: z.number().optional(),
  starRating: z.number().min(1).max(5).optional(),
  rank: z.number().optional(),
  pricingSources: z.object({
    constructionCost: z.string(),
    marketPpsf: z.string(),
    modelVersion: z.string().optional(),
    region: z.string().optional(),
    pricingStrategy: z.string().optional(),
    confidence: z.number().optional(),
    dataFreshness: z.enum(['current', 'recent', 'stale', 'static']).optional(),
    methodology: z.string().optional(),
  }).optional(),
  validation: z.object({
    costDeltaPct: z.number(),
    valueDeltaPct: z.number(),
    corrected: z.boolean(),
    warnings: z.array(z.string()).optional(),
    recommendations: z.array(z.string()).optional(),
    confidence: z.number().optional(),
    pricingAccuracy: z.enum(['high', 'medium', 'low']).optional(),
  }).optional(),
});

export const comparablePropertySchema = z.object({
  address: z.string(),
  price: z.number(),
  beds: z.number(),
  baths: z.number(),
  sqft: z.number(),
  dateSold: z.string(),
  pricePsf: z.number(),
  distanceMiles: z.number().optional(),
  source: z.string().optional(),
  sourceUrl: z.string().optional(),
  yearBuilt: z.number().optional(),
  propertyType: z.string().optional(),
  condition: z.string().optional(),
  comparabilityScore: z.number().min(0).max(100).optional(),
  saleRecencyDays: z.number().optional(),
});

export const financialSummarySchema = z.object({
  currentValue: z.number().nonnegative(),
  totalRenovationCost: z.number().nonnegative(),
  totalValueAdd: z.number(),
  afterRepairValue: z.number().nonnegative(),
  totalROI: z.number(),
  avgPricePsf: z.number().nonnegative(),
  postRenovationSqft: z.number().nonnegative().optional(),
  originalTotalValueAdd: z.number().optional(),
  originalAfterRepairValue: z.number().optional(),
  originalTotalROI: z.number().optional(),
  sanityCheckApplied: z.boolean().optional(),
});

export const geoDataSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  formattedAddress: z.string(),
  placeId: z.string().optional(),
  addressComponents: z.record(z.string()).optional(),
});

export const imagerySchema = z.object({
  streetViewUrl: z.string().optional(),
  satelliteUrl: z.string().optional(),
  streetViewMetadata: z.record(z.any()).optional(),
  satelliteMetadata: z.record(z.any()).optional(),
});

export const visionAnalysisSchema = z.object({
  propertyCondition: z.string().optional(),
  architecturalStyle: z.string().optional(),
  visibleFeatures: z.array(z.string()).optional(),
  estimatedSize: z.string().optional(),
  renovationOpportunities: z.array(z.string()).optional(),
  lotAnalysis: z.string().optional(),
  confidence: z.number().optional(),
});

export const mapsContextSchema = z.object({
  nearbyPOIs: z.array(z.object({
    name: z.string(),
    type: z.string(),
    distanceMiles: z.number().optional(),
  })).optional(),
  neighborhoodInsights: z.string().optional(),
  areaRating: z.number().optional(),
  demographics: z.record(z.any()).optional(),
});

export const insertAnalysisReportSchema = createInsertSchema(analysisReports)
  .pick({
    propertyUrl: true,
    propertyAddress: true,
    inputType: true,
  })
  .extend({
    propertyUrl: z.string().url().optional(),
    propertyAddress: z.string().min(5).optional(),
    inputType: z.enum(["url", "address"]),
  })
  .refine(
    (data) => data.propertyUrl || data.propertyAddress,
    { message: "Either propertyUrl or propertyAddress must be provided" }
  );

export type InsertAnalysisReport = z.infer<typeof insertAnalysisReportSchema>;
export type AnalysisReport = typeof analysisReports.$inferSelect;
export type PropertyData = z.infer<typeof propertyDataSchema>;
export type RenovationProject = z.infer<typeof renovationProjectSchema>;
export type ComparableProperty = z.infer<typeof comparablePropertySchema>;
export type Contractor = z.infer<typeof contractorSchema>;
export type FinancialSummary = z.infer<typeof financialSummarySchema>;
export type GeoData = z.infer<typeof geoDataSchema>;
export type Imagery = z.infer<typeof imagerySchema>;
export type VisionAnalysis = z.infer<typeof visionAnalysisSchema>;
export type MapsContext = z.infer<typeof mapsContextSchema>;
