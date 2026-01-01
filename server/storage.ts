import { 
  type User, 
  type InsertUser, 
  type AnalysisReport, 
  type InsertAnalysisReport,
  type PropertyData,
  type RenovationProject,
  type ComparableProperty,
  type Contractor,
  type FinancialSummary,
  type EmailSignup,
  type InsertEmailSignup,
  type GeoData,
  type Imagery,
  type VisionAnalysis,
  type MapsContext,
  users,
  analysisReports,
  emailSignups
} from "@shared/schema";
import { randomUUID } from "crypto";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  createAnalysisReport(report: InsertAnalysisReport): Promise<AnalysisReport>;
  getAnalysisReport(id: string): Promise<AnalysisReport | undefined>;
  getAllAnalysisReports(): Promise<AnalysisReport[]>;
  updateAnalysisReportStatus(id: string, status: string): Promise<void>;
  updateAnalysisReportData(
    id: string, 
    data: {
      propertyData?: PropertyData;
      geoData?: GeoData;
      imagery?: Imagery;
      visionAnalysis?: VisionAnalysis;
      mapsContext?: MapsContext;
      renovationProjects?: RenovationProject[];
      comparableProperties?: ComparableProperty[];
      contractors?: Contractor[];
      financialSummary?: FinancialSummary;
      validationSummary?: any;
      status?: string;
      failureReason?: string;
      dataSource?: string;
      completedAt?: Date;
    }
  ): Promise<void>;
  
  createEmailSignup(emailSignup: InsertEmailSignup): Promise<EmailSignup>;
  getEmailSignups(): Promise<EmailSignup[]>;
  getEmailSignupsBySource(source: string): Promise<EmailSignup[]>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private analysisReports: Map<string, AnalysisReport>;
  private emailSignups: Map<string, EmailSignup>;

  constructor() {
    this.users = new Map();
    this.analysisReports = new Map();
    this.emailSignups = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async createAnalysisReport(insertReport: InsertAnalysisReport): Promise<AnalysisReport> {
    const id = randomUUID();
    const report: AnalysisReport = {
      id,
      propertyUrl: insertReport.propertyUrl || null,
      propertyAddress: insertReport.propertyAddress || null,
      inputType: insertReport.inputType,
      status: "pending",
      failureReason: null,
      dataSource: null,
      propertyData: null,
      geoData: null,
      imagery: null,
      visionAnalysis: null,
      mapsContext: null,
      renovationProjects: null,
      comparableProperties: null,
      contractors: null,
      financialSummary: null,
      validationSummary: null,
      createdAt: new Date(),
      completedAt: null,
    };
    this.analysisReports.set(id, report);
    return report;
  }

  async getAnalysisReport(id: string): Promise<AnalysisReport | undefined> {
    return this.analysisReports.get(id);
  }

  async getAllAnalysisReports(): Promise<AnalysisReport[]> {
    return Array.from(this.analysisReports.values());
  }

  async updateAnalysisReportStatus(id: string, status: string): Promise<void> {
    const report = this.analysisReports.get(id);
    if (report) {
      report.status = status;
      this.analysisReports.set(id, report);
    }
  }

  async updateAnalysisReportData(
    id: string, 
    data: {
      propertyData?: PropertyData;
      geoData?: GeoData;
      imagery?: Imagery;
      visionAnalysis?: VisionAnalysis;
      mapsContext?: MapsContext;
      renovationProjects?: RenovationProject[];
      comparableProperties?: ComparableProperty[];
      contractors?: Contractor[];
      financialSummary?: FinancialSummary;
      validationSummary?: any;
      status?: string;
      failureReason?: string;
      dataSource?: string;
      completedAt?: Date;
    }
  ): Promise<void> {
    const report = this.analysisReports.get(id);
    if (report) {
      if (data.propertyData) report.propertyData = data.propertyData;
      if (data.geoData) report.geoData = data.geoData;
      if (data.imagery) report.imagery = data.imagery;
      if (data.visionAnalysis) report.visionAnalysis = data.visionAnalysis;
      if (data.mapsContext) report.mapsContext = data.mapsContext;
      if (data.renovationProjects) report.renovationProjects = data.renovationProjects;
      if (data.comparableProperties) report.comparableProperties = data.comparableProperties;
      if (data.contractors) report.contractors = data.contractors;
      if (data.financialSummary) report.financialSummary = data.financialSummary;
      if (data.validationSummary) report.validationSummary = data.validationSummary;
      if (data.status) report.status = data.status;
      if ('failureReason' in data) (report as any).failureReason = data.failureReason;
      if ('dataSource' in data) (report as any).dataSource = data.dataSource;
      if (data.completedAt) report.completedAt = data.completedAt;
      this.analysisReports.set(id, report);
    }
  }

  async createEmailSignup(insertEmailSignup: InsertEmailSignup): Promise<EmailSignup> {
    const id = randomUUID();
    const emailSignup: EmailSignup = {
      id,
      ...insertEmailSignup,
      reportId: insertEmailSignup.reportId || null,
      createdAt: new Date(),
    };
    this.emailSignups.set(id, emailSignup);
    return emailSignup;
  }

  async getEmailSignups(): Promise<EmailSignup[]> {
    return Array.from(this.emailSignups.values());
  }

  async getEmailSignupsBySource(source: string): Promise<EmailSignup[]> {
    return Array.from(this.emailSignups.values()).filter(
      (signup) => signup.signupSource === source
    );
  }
}

// PostgreSQL storage implementation using Drizzle
export class PostgresStorage implements IStorage {
  private db;

  constructor() {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    const sql = neon(process.env.DATABASE_URL);
    this.db = drizzle(sql);
  }

  async getUser(id: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.username, username));
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await this.db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async createAnalysisReport(insertReport: InsertAnalysisReport): Promise<AnalysisReport> {
    const result = await this.db.insert(analysisReports).values(insertReport).returning();
    return result[0];
  }

  async getAnalysisReport(id: string): Promise<AnalysisReport | undefined> {
    const result = await this.db.select().from(analysisReports).where(eq(analysisReports.id, id));
    return result[0];
  }

  async getAllAnalysisReports(): Promise<AnalysisReport[]> {
    return await this.db.select().from(analysisReports);
  }

  async updateAnalysisReportStatus(id: string, status: string): Promise<void> {
    await this.db.update(analysisReports)
      .set({ status })
      .where(eq(analysisReports.id, id));
  }

  async updateAnalysisReportData(
    id: string, 
    data: {
      propertyData?: PropertyData;
      geoData?: GeoData;
      imagery?: Imagery;
      visionAnalysis?: VisionAnalysis;
      mapsContext?: MapsContext;
      renovationProjects?: RenovationProject[];
      comparableProperties?: ComparableProperty[];
      contractors?: Contractor[];
      financialSummary?: FinancialSummary;
      validationSummary?: any;
      status?: string;
      failureReason?: string;
      dataSource?: string;
      completedAt?: Date;
    }
  ): Promise<void> {
    await this.db.update(analysisReports)
      .set(data)
      .where(eq(analysisReports.id, id));
  }

  async createEmailSignup(insertEmailSignup: InsertEmailSignup): Promise<EmailSignup> {
    const result = await this.db.insert(emailSignups).values(insertEmailSignup).returning();
    return result[0];
  }

  async getEmailSignups(): Promise<EmailSignup[]> {
    return await this.db.select().from(emailSignups);
  }

  async getEmailSignupsBySource(source: string): Promise<EmailSignup[]> {
    return await this.db.select().from(emailSignups).where(eq(emailSignups.signupSource, source));
  }
}

// Use PostgreSQL storage when DATABASE_URL is available, otherwise fall back to memory
export const storage = process.env.DATABASE_URL ? new PostgresStorage() : new MemStorage();
