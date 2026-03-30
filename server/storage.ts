import {
  type User,
  type AnalysisReport,
  type InsertAnalysisReport,
  type PropertyData,
  type RenovationProject,
  type ComparableProperty,
  type Contractor,
  type FinancialSummary,
  type GeoData,
  type Imagery,
  type VisionAnalysis,
  type MapsContext,
  type InsertKnowledgeEntry,
  type KnowledgeEntry,
  users,
  analysisReports,
  knowledgeBase,
} from "@shared/schema";
import { eq, and, gte, or, sql, desc } from "drizzle-orm";
import { db } from "./db";

import session from "express-session";
import createMemoryStore from "memorystore";
import connectPgSimple from "connect-pg-simple";

const MemoryStore = createMemoryStore(session);
const PgSession = connectPgSimple(session);

export interface IStorage {
  sessionStore: session.Store;
  getUser(id: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  updateUserCredits(userId: string, credits: number): Promise<void>;
  updateUserStripeCustomerId(userId: string, customerId: string): Promise<void>;
  updateUserSubscription(userId: string, subscriptionId: string, status: string): Promise<void>;
  updateUserTosAccepted(userId: string): Promise<void>;
  incrementUserReportCount(userId: string): Promise<void>;

  createAnalysisReport(report: InsertAnalysisReport, userId?: string): Promise<AnalysisReport>;
  getAnalysisReport(id: string): Promise<AnalysisReport | undefined>;
  getAllAnalysisReports(): Promise<AnalysisReport[]>;
  getUserReports(userId: string): Promise<AnalysisReport[]>;
  updateAnalysisReportStatus(id: string, status: string): Promise<void>;
  updateAnalysisReportPayment(id: string, stripeSessionId: string, paymentStatus: string): Promise<void>;
  updateAnalysisReportData(
    id: string,
    data: {
      propertyData?: PropertyData;
      propertyUrl?: string;
      geoData?: GeoData;
      imagery?: Imagery;
      visionAnalysis?: VisionAnalysis;
      mapsContext?: MapsContext;
      renovationProjects?: RenovationProject[];
      comparableProperties?: ComparableProperty[];
      contractors?: Contractor[];
      financialSummary?: FinancialSummary;
      validationSummary?: any;
      moduleData?: any;
      status?: string;
      failureReason?: string;
      dataSource?: string;
      completedAt?: Date;
    }
  ): Promise<void>;

  findCachedReport(address: string, maxAgeDays?: number): Promise<AnalysisReport | undefined>;

  // Phase 4 RAG Database Handlers
  createKnowledgeEntry(entry: InsertKnowledgeEntry): Promise<KnowledgeEntry>;
  findSimilarKnowledge(embeddingArray: number[], limit?: number, typeScope?: string): Promise<KnowledgeEntry[]>;
}

export class PostgresStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PgSession({
      conObject: {
        connectionString: process.env.DATABASE_URL,
      },
      createTableIfMissing: false,
      tableName: 'sessions', // Must match the table defined in shared/models/auth.ts
    });
  }

  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async getAllUsers(): Promise<User[]> {
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async updateUserCredits(userId: string, credits: number): Promise<void> {
    await db.update(users)
      .set({ reportCredits: credits, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async updateUserStripeCustomerId(userId: string, customerId: string): Promise<void> {
    await db.update(users)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async updateUserSubscription(userId: string, subscriptionId: string, status: string): Promise<void> {
    await db.update(users)
      .set({ subscriptionId, subscriptionStatus: status, updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async updateUserTosAccepted(userId: string): Promise<void> {
    await db.update(users)
      .set({ tosAcceptedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, userId));
  }

  async incrementUserReportCount(userId: string): Promise<void> {
    await db.update(users)
      .set({
        totalReportsGenerated: sql`${users.totalReportsGenerated} + 1`,
        updatedAt: new Date()
      })
      .where(eq(users.id, userId));
  }

  async createAnalysisReport(insertReport: InsertAnalysisReport, userId?: string): Promise<AnalysisReport> {
    const result = await db.insert(analysisReports).values({
      ...insertReport,
      userId: userId || null,
    }).returning();
    return result[0];
  }

  async getAnalysisReport(id: string): Promise<AnalysisReport | undefined> {
    const result = await db.select().from(analysisReports).where(eq(analysisReports.id, id));
    return result[0];
  }

  async getAllAnalysisReports(): Promise<AnalysisReport[]> {
    return await db.select().from(analysisReports);
  }

  async getUserReports(userId: string): Promise<AnalysisReport[]> {
    return await db.select().from(analysisReports)
      .where(eq(analysisReports.userId, userId))
      .orderBy(desc(analysisReports.createdAt));
  }

  async updateAnalysisReportStatus(id: string, status: string): Promise<void> {
    await db.update(analysisReports)
      .set({ status })
      .where(eq(analysisReports.id, id));
  }

  async updateAnalysisReportPayment(id: string, stripeSessionId: string, paymentStatus: string): Promise<void> {
    await db.update(analysisReports)
      .set({ stripeSessionId, paymentStatus })
      .where(eq(analysisReports.id, id));
  }

  async updateAnalysisReportData(
    id: string,
    data: {
      propertyData?: PropertyData;
      propertyUrl?: string;
      geoData?: GeoData;
      imagery?: Imagery;
      visionAnalysis?: VisionAnalysis;
      mapsContext?: MapsContext;
      renovationProjects?: RenovationProject[];
      comparableProperties?: ComparableProperty[];
      contractors?: Contractor[];
      financialSummary?: FinancialSummary;
      validationSummary?: any;
      moduleData?: any;
      status?: string;
      failureReason?: string;
      dataSource?: string;
      completedAt?: Date;
    }
  ): Promise<void> {
    await db.update(analysisReports)
      .set(data)
      .where(eq(analysisReports.id, id));
  }

  async findCachedReport(address: string, maxAgeDays: number = 30): Promise<AnalysisReport | undefined> {
    const normalizedAddress = address.toLowerCase().trim();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

    const results = await db.select()
      .from(analysisReports)
      .where(
        and(
          eq(analysisReports.status, 'completed'),
          gte(analysisReports.completedAt, cutoffDate),
          or(
            sql`LOWER(${analysisReports.propertyAddress}) LIKE ${'%' + normalizedAddress + '%'}`,
            sql`LOWER(${analysisReports.propertyData}->>'address') LIKE ${'%' + normalizedAddress + '%'}`
          )
        )
      )
      .limit(1);

    return results[0];
  }

  // Phase 4 RAG Data Injection Models
  async createKnowledgeEntry(insertKnowledge: InsertKnowledgeEntry): Promise<KnowledgeEntry> {
    const result = await db.insert(knowledgeBase).values(insertKnowledge).returning();
    return result[0];
  }

  async findSimilarKnowledge(embeddingArray: number[], limit: number = 3, typeScope?: string): Promise<KnowledgeEntry[]> {
    // We convert the Float Array to a PostgreSQL compatible Vector string.
    const vectorString = `[${embeddingArray.join(',')}]`;
    
    // Constructing raw cosine search explicitly bounded against the custom text "embedding" dimension.
    // `<=>` signifies Cosine distance within `pgvector`.
    
    let baseQuery = db.select()
      .from(knowledgeBase);
    
    if (typeScope) {
      baseQuery = baseQuery.where(eq(knowledgeBase.sourceType, typeScope)) as any;
    }

    // Applying strict semantic thresholds and order logic utilizing Drizzle raw injections.
    const results = await baseQuery
      .orderBy(sql`${knowledgeBase.embedding}::vector(768) <=> ${vectorString}::vector(768)`)
      .limit(limit);
      
    return results;
  }
}

export const storage = new PostgresStorage();
