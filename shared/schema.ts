import { sql } from "drizzle-orm";
import { pgTable, text, varchar, jsonb, timestamp, decimal, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const analysisReports = pgTable("analysis_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  propertyUrl: text("property_url").notNull(),
  status: text("status").notNull().default("pending"), // pending, processing, completed, failed
  propertyData: jsonb("property_data"),
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
  
  // Pricing sources and validation
  pricingSources: z.object({
    constructionCost: z.string(), // Source of construction cost data
    marketPpsf: z.string(), // Source of market price per sqft data
    modelVersion: z.string().optional(), // Version of pricing model used
    region: z.string().optional(), // Market region for pricing context
  }).optional(),
  
  validation: z.object({
    costDeltaPct: z.number(), // Percentage difference from AI estimate
    valueDeltaPct: z.number(), // Percentage difference from AI estimate  
    corrected: z.boolean(), // Whether values were corrected from AI output
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
});

export const financialSummarySchema = z.object({
  currentValue: z.number().nonnegative(),
  totalRenovationCost: z.number().nonnegative(),
  totalValueAdd: z.number(),
  afterRepairValue: z.number().nonnegative(),
  totalROI: z.number(),
  avgPricePsf: z.number().nonnegative(),
  postRenovationSqft: z.number().nonnegative().optional(), // Total sqft after all renovations
});

export const insertAnalysisReportSchema = createInsertSchema(analysisReports).pick({
  propertyUrl: true,
});

export type InsertAnalysisReport = z.infer<typeof insertAnalysisReportSchema>;
export type AnalysisReport = typeof analysisReports.$inferSelect;
export type PropertyData = z.infer<typeof propertyDataSchema>;
export type RenovationProject = z.infer<typeof renovationProjectSchema>;
export type ComparableProperty = z.infer<typeof comparablePropertySchema>;
export type Contractor = z.infer<typeof contractorSchema>;
export type FinancialSummary = z.infer<typeof financialSummarySchema>;

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export const insertEmailSignupSchema = createInsertSchema(emailSignups).pick({
  email: true,
  signupSource: true,
  reportId: true,
}).extend({
  email: z.string().trim().toLowerCase().email("Please enter a valid email address"),
  reportId: z.string().uuid().optional(), // Optional UUID for report linking
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type InsertEmailSignup = z.infer<typeof insertEmailSignupSchema>;
export type EmailSignup = typeof emailSignups.$inferSelect;
