import { sql } from "drizzle-orm";
import { pgTable, text, varchar, jsonb, timestamp, decimal, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { legitimateEmailValidator } from "./email-validation";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const analysisReports = pgTable("analysis_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyUrl: text("property_url"), // Optional - used when input is Redfin URL
  propertyAddress: text("property_address"), // Optional - used when input is plain address
  inputType: text("input_type").notNull().default("url"), // "url" or "address"
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  failureReason: text("failure_reason"), // Human-readable error message when status is 'failed'
  dataSource: text("data_source"), // 'redfin_scraper', 'deep_research', 'manual' - indicates where data came from
  propertyData: jsonb("property_data"),
  geoData: jsonb("geo_data"), // Geocoded location data (lat, lng, formatted address)
  imagery: jsonb("imagery"), // Street View + Satellite image URLs
  visionAnalysis: jsonb("vision_analysis"), // Gemini visual analysis results
  mapsContext: jsonb("maps_context"), // Google Maps grounding context (POIs, neighborhood data)
  renovationProjects: jsonb("renovation_projects"),
  comparableProperties: jsonb("comparable_properties"),
  contractors: jsonb("contractors"),
  financialSummary: jsonb("financial_summary"),
  validationSummary: jsonb("validation_summary"),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const emailSignups = pgTable("email_signups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull(),
  signupSource: text("signup_source").notNull(), // e.g., "analysis_form", "homepage", "newsletter"
  reportId: varchar("report_id").references(() => analysisReports.id), // Optional link to specific report
  createdAt: timestamp("created_at").defaultNow(),
});

// Types for the analysis data structures
export const locationSchema = z.object({
  address: z.string(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
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
});

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
  source: z.string().optional(), // 'web_search', 'api', 'fallback'
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
  // Enhanced details for better breakdown
  sqftAdded: z.number().nonnegative().optional(), // Square footage being added
  costPerSqft: z.number().nonnegative().optional(), // Cost per square foot for this project
  valuePerSqft: z.number().nonnegative().optional(), // Value add per square foot
  detailedDescription: z.string().optional(), // More specific description with sqft details
  contractors: z.array(contractorSchema).optional(), // Project-specific contractors
  
  // Computed fields for accuracy validation
  newTotalSqft: z.number().nonnegative().optional(), // Computed total sqft after renovation
  postRenovationValue: z.number().nonnegative().optional(), // Computed value after renovation
  marketPricePsfUsed: z.number().nonnegative().optional(), // Market price per sqft used for calculations
  costPerSqftUsed: z.number().nonnegative().optional(), // Construction cost per sqft used
  
  // Additional computed fields for frontend display
  corrected: z.boolean().optional(), // Whether this project was corrected
  computedCost: z.number().optional(), // Computed cost for display
  computedValue: z.number().optional(), // Computed value for display  
  pricePsfUsed: z.number().optional(), // Price per sqft used in calculations
  
  // ROI-based ranking and star ratings
  starRating: z.number().min(1).max(5).optional(), // 1-5 star rating based on ROI
  rank: z.number().optional(), // Rank among all renovation projects (1 = best ROI)
  
  // Pricing sources and validation
  pricingSources: z.object({
    constructionCost: z.string(), // Source of construction cost data
    marketPpsf: z.string(), // Source of market price per sqft data
    modelVersion: z.string().optional(), // Version of pricing model used
    region: z.string().optional(), // Market region for pricing context
    pricingStrategy: z.string().optional(), // Pricing strategy used
    confidence: z.number().optional(), // Confidence score (0-1)
    dataFreshness: z.enum(['current', 'recent', 'stale', 'static']).optional(), // Data freshness indicator
    methodology: z.string().optional(), // Methodology used for pricing
  }).optional(),
  
  validation: z.object({
    costDeltaPct: z.number(), // Percentage difference from AI estimate
    valueDeltaPct: z.number(), // Percentage difference from AI estimate  
    corrected: z.boolean(), // Whether values were corrected from AI output
    warnings: z.array(z.string()).optional(), // Validation warnings
    recommendations: z.array(z.string()).optional(), // Validation recommendations
    confidence: z.number().optional(), // Validation confidence score
    pricingAccuracy: z.enum(['high', 'medium', 'low']).optional(), // Pricing accuracy level
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
  source: z.string().optional(), // 'web_search', 'api', 'fallback'
  sourceUrl: z.string().optional(),
  // Enhanced comparable matching fields
  yearBuilt: z.number().optional(),
  propertyType: z.string().optional(), // 'single_family', 'condo', 'townhouse', 'multi_family'
  condition: z.string().optional(), // 'excellent', 'good', 'fair', 'needs_work'
  comparabilityScore: z.number().min(0).max(100).optional(), // Weighted match score 0-100
  saleRecencyDays: z.number().optional(), // Days since sale for weighting
});

export const financialSummarySchema = z.object({
  currentValue: z.number().nonnegative(),
  totalRenovationCost: z.number().nonnegative(),
  totalValueAdd: z.number(),
  afterRepairValue: z.number().nonnegative(),
  totalROI: z.number(),
  avgPricePsf: z.number().nonnegative(),
  postRenovationSqft: z.number().nonnegative().optional(), // Total sqft after all renovations
  // Sanity check metadata - original values before capping
  originalTotalValueAdd: z.number().optional(), // Original value before cap applied
  originalAfterRepairValue: z.number().optional(), // Original ARV before cap applied
  originalTotalROI: z.number().optional(), // Original ROI before cap applied
  sanityCheckApplied: z.boolean().optional(), // Whether any caps were applied
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
    // Make URL and address optional but require at least one
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

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertEmailSignupSchema = createInsertSchema(emailSignups).pick({
  email: true,
  signupSource: true,
  reportId: true,
}).extend({
  email: legitimateEmailValidator,
  reportId: z.string().uuid().optional(), // Optional UUID for report linking
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertEmailSignup = z.infer<typeof insertEmailSignupSchema>;
export type EmailSignup = typeof emailSignups.$inferSelect;
