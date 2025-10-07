import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertAnalysisReportSchema, insertEmailSignupSchema, type AnalysisReport, type EmailSignup } from "@shared/schema";
import { scrapeRedfinProperty, scrapeZillowProperty, findComparableProperties, getDynamicComparableProperties } from "./services/scraper";
import { processRenovationAnalysis } from "./services/renovation-analyzer";
import { generateContractorRecommendations } from "./services/openai";
import { extractLocationFromProperty } from "./services/location-service";
import { findLocationBasedComparables } from "./services/location-comparables";
import { findLocationBasedContractors } from "./services/location-contractors";

export async function registerRoutes(app: Express): Promise<Server> {
  // Create new analysis report
  app.post("/api/reports", async (req, res) => {
    try {
      const { propertyUrl } = insertAnalysisReportSchema.parse(req.body);
      
      // Secure URL validation to prevent SSRF
      try {
        const parsedUrl = new URL(propertyUrl);
        const allowedHosts = ['redfin.com', 'www.redfin.com', 'redf.in', 'zillow.com', 'www.zillow.com', 'goo.gl'];
        if (!allowedHosts.includes(parsedUrl.hostname.toLowerCase())) {
          return res.status(400).json({ 
            message: "Invalid URL. Please provide a valid Redfin or Zillow property URL." 
          });
        }
        if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
          return res.status(400).json({ message: "Invalid URL protocol" });
        }
      } catch (urlError) {
        return res.status(400).json({ message: "Invalid URL format" });
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

  // Create new email signup
  app.post("/api/email-signups", async (req, res) => {
    try {
      const validatedData = insertEmailSignupSchema.parse(req.body);
      
      const emailSignup = await storage.createEmailSignup(validatedData);
      
      res.json(emailSignup);
    } catch (error) {
      console.error("Error creating email signup:", error);
      
      // Handle Zod validation errors
      if (error instanceof Error && 'issues' in error) {
        return res.status(400).json({ 
          message: "Invalid email signup data. Please check your input.",
          errors: (error as any).issues
        });
      }
      
      res.status(500).json({ 
        message: "Failed to create email signup. Please try again." 
      });
    }
  });

  // Get all email signups
  app.get("/api/email-signups", async (req, res) => {
    try {
      const emailSignups = await storage.getEmailSignups();
      res.json(emailSignups);
    } catch (error) {
      console.error("Error fetching email signups:", error);
      res.status(500).json({ 
        message: "Failed to retrieve email signups. Please try again." 
      });
    }
  });

  // Get email signups by source
  app.get("/api/email-signups/by-source/:source", async (req, res) => {
    try {
      const { source } = req.params;
      const emailSignups = await storage.getEmailSignupsBySource(source);
      res.json(emailSignups);
    } catch (error) {
      console.error("Error fetching email signups by source:", error);
      res.status(500).json({ 
        message: "Failed to retrieve email signups. Please try again." 
      });
    }
  });

  // Get analytics summary
  app.get("/api/analytics/summary", async (req, res) => {
    try {
      // Get all email signups and analysis reports for analytics
      const [emailSignups, allReports] = await Promise.all([
        storage.getEmailSignups(),
        storage.getAllAnalysisReports()
      ]);

      // Calculate analytics
      const totalEmailSignups = emailSignups.length;
      const totalReports = allReports.length;
      const completedReports = allReports.filter((r: AnalysisReport) => r.status === 'completed').length;
      
      // Group by signup source
      const signupsBySource = emailSignups.reduce((acc: Record<string, number>, signup: EmailSignup) => {
        acc[signup.signupSource] = (acc[signup.signupSource] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Get popular URLs (top 10)
      const urlCounts = allReports.reduce((acc: Record<string, number>, report: AnalysisReport) => {
        acc[report.propertyUrl] = (acc[report.propertyUrl] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      const popularUrls = Object.entries(urlCounts)
        .sort(([,a], [,b]) => (b as number) - (a as number))
        .slice(0, 10)
        .map(([url, count]) => ({ url, count }));

      // Calculate time-based metrics
      const now = new Date();
      const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const reportsLast7Days = allReports.filter((r: AnalysisReport) => r.createdAt && new Date(r.createdAt) >= last7Days).length;
      const reportsLast30Days = allReports.filter((r: AnalysisReport) => r.createdAt && new Date(r.createdAt) >= last30Days).length;
      const emailsLast7Days = emailSignups.filter((e: EmailSignup) => e.createdAt && new Date(e.createdAt) >= last7Days).length;
      const emailsLast30Days = emailSignups.filter((e: EmailSignup) => e.createdAt && new Date(e.createdAt) >= last30Days).length;

      const analytics = {
        totalEmailSignups,
        totalReports,
        completedReports,
        signupsBySource,
        popularUrls,
        timeBasedMetrics: {
          reportsLast7Days,
          reportsLast30Days,
          emailsLast7Days,
          emailsLast30Days
        },
        conversionRate: totalEmailSignups > 0 ? (totalReports / totalEmailSignups * 100).toFixed(1) : '0'
      };

      res.json(analytics);
    } catch (error) {
      console.error("Error fetching analytics:", error);
      res.status(500).json({ 
        message: "Failed to retrieve analytics. Please try again." 
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

      // Step 1: Extract property data - detect platform and use appropriate scraper
      let propertyData;
      const url = report.propertyUrl.toLowerCase();
      const isZillow = url.includes('zillow.com') || url.includes('goo.gl');
      
      if (isZillow) {
        console.log('Detected Zillow URL, using Zillow scraper');
        propertyData = await scrapeZillowProperty(report.propertyUrl);
      } else {
        console.log('Detected Redfin URL, using Redfin scraper');
        propertyData = await scrapeRedfinProperty(report.propertyUrl);
      }
      
      await storage.updateAnalysisReportData(reportId, { propertyData });

      // Step 2: Extract location from property data using new location service
      const location = await extractLocationFromProperty(propertyData.address, report.propertyUrl);
      
      // Update property data with location
      const updatedPropertyData = {
        ...propertyData,
        location
      };
      await storage.updateAnalysisReportData(reportId, { propertyData: updatedPropertyData });
      
      console.log(`Extracted location: ${location.city}, ${location.state} ${location.zip}`);

      // Step 3: Find comparable properties using location-based approach
      let comparableProperties;
      try {
        console.log(`Finding location-based comparables for ${location.city}, ${location.state}`);
        comparableProperties = await findLocationBasedComparables(updatedPropertyData, location);
        
        if (comparableProperties.length === 0) {
          console.log('Location-based comparables returned empty, falling back to scraper method');
          comparableProperties = await findComparableProperties(updatedPropertyData, report.propertyUrl);
        }
      } catch (error) {
        console.log('Location-based comparables failed, falling back to scraper method:', error);
        comparableProperties = await findComparableProperties(updatedPropertyData, report.propertyUrl);
      }
      await storage.updateAnalysisReportData(reportId, { comparableProperties });

      // Step 4: Analyze renovations and calculate financials with validation
      const { projects, financialSummary, validationSummary } = await processRenovationAnalysis(
        updatedPropertyData, 
        comparableProperties, 
        location
      );
      await storage.updateAnalysisReportData(reportId, { 
        renovationProjects: projects,
        financialSummary,
        validationSummary 
      });

      // Step 5: Generate project-specific contractor recommendations
      const projectsWithContractors = await Promise.all(
        projects.map(async (project) => {
          let projectContractors;
          try {
            console.log(`Finding contractors for ${project.name} in ${location.city}, ${location.state}`);
            projectContractors = await findLocationBasedContractors(location, project.name);
            
            if (projectContractors.length === 0) {
              console.log(`Location-based contractors returned empty for ${project.name}, falling back to AI generation`);
              const locationQuery = `${location.city || 'Unknown'}, ${location.state || 'Unknown'}`;
              projectContractors = await generateContractorRecommendations(locationQuery, project.name);
            }
          } catch (error) {
            console.log(`Location-based contractors failed for ${project.name}, falling back to AI generation:`, error);
            const locationQuery = `${location.city || 'Unknown'}, ${location.state || 'Unknown'}`;
            projectContractors = await generateContractorRecommendations(locationQuery, project.name);
          }
          
          return {
            ...project,
            contractors: projectContractors
          };
        })
      );

      // Update with projects that now include contractors
      await storage.updateAnalysisReportData(reportId, { 
        renovationProjects: projectsWithContractors,
        contractors: [] // Keep empty for backward compatibility
      });

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

  // Test endpoint for RAG pricing system with 90066 (Marina del Rey)
  app.get("/api/test/rag-90066", async (req, res) => {
    try {
      const { testRAGPricing90066, quickRAGTest90066 } = await import("./services/test-rag-90066");
      
      // Allow choosing between quick or full test
      const testType = req.query.type === 'full' ? 'full' : 'quick';
      
      if (testType === 'quick') {
        // Capture console output for quick test
        let output = '';
        const originalLog = console.log;
        console.log = (...args) => {
          output += args.join(' ') + '\n';
          originalLog(...args);
        };
        
        try {
          await quickRAGTest90066();
          console.log = originalLog;
          res.json({ 
            testType: 'quick',
            success: true,
            output: output,
            message: 'Quick RAG test completed for Marina del Rey (90066)'
          });
        } catch (error) {
          console.log = originalLog;
          throw error;
        }
      } else {
        // Full comprehensive test
        const results = await testRAGPricing90066();
        res.json({
          testType: 'full',
          success: true,
          ...results,
          message: 'Comprehensive RAG test completed for Marina del Rey (90066)'
        });
      }
    } catch (error) {
      console.error("Error in RAG 90066 test:", error);
      res.status(500).json({ 
        error: "RAG 90066 test failed", 
        message: error instanceof Error ? error.message : String(error)
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
