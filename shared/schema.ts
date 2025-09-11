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
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

// Types for the analysis data structures
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
});

export const comparablePropertySchema = z.object({
  address: z.string(),
  price: z.number(),
  beds: z.number(),
  baths: z.number(),
  sqft: z.number(),
  dateSold: z.string(),
  pricePsf: z.number(),
});

export const contractorSchema = z.object({
  name: z.string(),
  specialty: z.string(),
  rating: z.number(),
  reviewCount: z.number(),
  experience: z.string(),
  contact: z.string().optional(),
});

export const financialSummarySchema = z.object({
  currentValue: z.number(),
  totalRenovationCost: z.number(),
  totalValueAdd: z.number(),
  afterRepairValue: z.number(),
  totalROI: z.number(),
  avgPricePsf: z.number(),
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

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
