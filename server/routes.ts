import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertAnalysisReportSchema } from "@shared/schema";
import { scrapeRedfinProperty, findComparableProperties } from "./services/scraper";
import { processRenovationAnalysis } from "./services/renovation-analyzer";
import { generateContractorRecommendations } from "./services/openai";

export async function registerRoutes(app: Express): Promise<Server> {
  // Create new analysis report
  app.post("/api/reports", async (req, res) => {
    try {
      const { propertyUrl } = insertAnalysisReportSchema.parse(req.body);
      
      // Validate Redfin URL
      if (!propertyUrl.includes('redfin.com')) {
        return res.status(400).json({ 
          message: "Invalid URL. Please provide a valid Redfin property URL." 
        });
      }

      const report = await storage.createAnalysisReport({ propertyUrl });
      
      // Start async processing
      processAnalysisReport(report.id);
      
      res.json({ reportId: report.id, status: 'pending' });
    } catch (error) {
      console.error("Error creating analysis report:", error);
      res.status(500).json({ 
        message: "Failed to create analysis report. Please check your URL and try again." 
      });
    }
  });

  // Get analysis report status and data
  app.get("/api/reports/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const report = await storage.getAnalysisReport(id);
      
      if (!report) {
        return res.status(404).json({ 
          message: "Analysis report not found. Please check the report ID." 
        });
      }
      
      res.json(report);
    } catch (error) {
      console.error("Error fetching analysis report:", error);
      res.status(500).json({ 
        message: "Failed to retrieve analysis report. Please try again." 
      });
    }
  });

  // Async processing function
  async function processAnalysisReport(reportId: string) {
    try {
      const report = await storage.getAnalysisReport(reportId);
      if (!report) return;

      // Update status to processing
      await storage.updateAnalysisReportStatus(reportId, 'processing');

      // Step 1: Extract property data
      const propertyData = await scrapeRedfinProperty(report.propertyUrl);
      await storage.updateAnalysisReportData(reportId, { propertyData });

      // Step 2: Find comparable properties
      const comparableProperties = await findComparableProperties(propertyData);
      await storage.updateAnalysisReportData(reportId, { comparableProperties });

      // Step 3: Analyze renovations and calculate financials
      const { projects, financialSummary } = await processRenovationAnalysis(propertyData, comparableProperties);
      await storage.updateAnalysisReportData(reportId, { 
        renovationProjects: projects,
        financialSummary 
      });

      // Step 4: Get contractor recommendations
      const topProject = projects.length > 0 ? projects[0].name : 'Kitchen Remodel';
      const contractors = await generateContractorRecommendations(propertyData.address, topProject);
      await storage.updateAnalysisReportData(reportId, { contractors });

      // Mark as completed
      await storage.updateAnalysisReportData(reportId, { 
        status: 'completed',
        completedAt: new Date()
      });

    } catch (error) {
      console.error("Error processing analysis report:", error);
      await storage.updateAnalysisReportStatus(reportId, 'failed');
    }
  }

  const httpServer = createServer(app);
  return httpServer;
}
