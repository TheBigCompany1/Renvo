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
  type InsertEmailSignup
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  createAnalysisReport(report: InsertAnalysisReport): Promise<AnalysisReport>;
  getAnalysisReport(id: string): Promise<AnalysisReport | undefined>;
  updateAnalysisReportStatus(id: string, status: string): Promise<void>;
  updateAnalysisReportData(
    id: string, 
    data: {
      propertyData?: PropertyData;
      renovationProjects?: RenovationProject[];
      comparableProperties?: ComparableProperty[];
      contractors?: Contractor[];
      financialSummary?: FinancialSummary;
      validationSummary?: any;
      status?: string;
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
      ...insertReport,
      status: "pending",
      propertyData: null,
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
      renovationProjects?: RenovationProject[];
      comparableProperties?: ComparableProperty[];
      contractors?: Contractor[];
      financialSummary?: FinancialSummary;
      validationSummary?: any;
      status?: string;
      completedAt?: Date;
    }
  ): Promise<void> {
    const report = this.analysisReports.get(id);
    if (report) {
      if (data.propertyData) report.propertyData = data.propertyData;
      if (data.renovationProjects) report.renovationProjects = data.renovationProjects;
      if (data.comparableProperties) report.comparableProperties = data.comparableProperties;
      if (data.contractors) report.contractors = data.contractors;
      if (data.financialSummary) report.financialSummary = data.financialSummary;
      if (data.validationSummary) report.validationSummary = data.validationSummary;
      if (data.status) report.status = data.status;
      if (data.completedAt) report.completedAt = data.completedAt;
      this.analysisReports.set(id, report);
    }
  }

  async createEmailSignup(insertEmailSignup: InsertEmailSignup): Promise<EmailSignup> {
    const id = randomUUID();
    const emailSignup: EmailSignup = {
      id,
      ...insertEmailSignup,
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

export const storage = new MemStorage();
