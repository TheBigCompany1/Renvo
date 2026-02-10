import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertAnalysisReportSchema, insertEmailSignupSchema, type AnalysisReport, type EmailSignup, type ComparableProperty } from "@shared/schema";
import { researchProperty, convertToPropertyData, convertToRenovationProjects, convertToComparables } from "./services/gemini-research";
import { generateContractorRecommendations } from "./services/gemini";
import { extractLocationFromProperty } from "./services/location-service";
import { findLocationBasedContractors } from "./services/location-contractors";

export async function registerRoutes(app: Express): Promise<Server> {
  // Create new analysis report
  app.post("/api/reports", async (req, res) => {
    try {
      const validatedData = insertAnalysisReportSchema.parse(req.body);
      
      // Determine input type and validate accordingly
      if (validatedData.inputType === 'url' && validatedData.propertyUrl) {
        // Strict URL validation to prevent SSRF - only allow known real estate sites
        try {
          const parsedUrl = new URL(validatedData.propertyUrl);
          if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
            return res.status(400).json({ message: "Invalid URL protocol" });
          }
          // Only accept URLs from trusted real estate websites
          const allowedHosts = ['redfin.com', 'www.redfin.com', 'redf.in', 'zillow.com', 'www.zillow.com', 'realtor.com', 'www.realtor.com'];
          const hostname = parsedUrl.hostname.toLowerCase();
          const isAllowedHost = allowedHosts.some(host => hostname === host || hostname.endsWith('.' + host.replace('www.', '')));
          if (!isAllowedHost) {
            return res.status(400).json({ 
              message: "Please provide a property URL from Redfin, Zillow, or Realtor.com. Or enter the property address directly." 
            });
          }
        } catch (urlError) {
          return res.status(400).json({ message: "Invalid URL format" });
        }
      } else if (validatedData.inputType === 'address' && validatedData.propertyAddress) {
        // Address validation - basic check
        if (validatedData.propertyAddress.trim().length < 10) {
          return res.status(400).json({ 
            message: "Please provide a complete address (street, city, state, zip)" 
          });
        }
      } else {
        return res.status(400).json({ 
          message: "Please provide either a Redfin URL or a property address" 
        });
      }

      // Check for cached report (30 days) before creating a new one
      const addressToCheck = validatedData.propertyAddress || validatedData.propertyUrl || '';
      if (addressToCheck) {
        const cachedReport = await storage.findCachedReport(addressToCheck, 30);
        if (cachedReport) {
          console.log(`📦 Found cached report for "${addressToCheck}" - returning existing report ${cachedReport.id}`);
          return res.json({ 
            reportId: cachedReport.id, 
            status: cachedReport.status,
            cached: true,
            cachedAt: cachedReport.completedAt
          });
        }
      }

      const report = await storage.createAnalysisReport(validatedData);
      
      // Start async processing
      processAnalysisReport(report.id);
      
      res.json({ reportId: report.id, status: 'pending', cached: false });
    } catch (error) {
      console.error("Error creating analysis report:", error);
      
      // Handle Zod validation errors
      if (error instanceof Error && 'issues' in error) {
        return res.status(400).json({ 
          message: "Invalid input data. Please check your input.",
          errors: (error as any).issues
        });
      }
      
      res.status(500).json({ 
        message: "Failed to create analysis report. Please check your input and try again." 
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

      // Get popular URLs (top 10) - filter out null URLs from address-based reports
      const urlCounts = allReports
        .filter((report: AnalysisReport) => report.propertyUrl !== null)
        .reduce((acc: Record<string, number>, report: AnalysisReport) => {
          if (report.propertyUrl) {
            acc[report.propertyUrl] = (acc[report.propertyUrl] || 0) + 1;
          }
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

  // Async processing function - SIMPLIFIED with Gemini + Google Search grounding
  async function processAnalysisReport(reportId: string) {
    try {
      const report = await storage.getAnalysisReport(reportId);
      if (!report) return;

      // Update status to processing
      await storage.updateAnalysisReportStatus(reportId, 'processing');

      // Determine the input to research
      const addressOrUrl = report.inputType === 'url' && report.propertyUrl 
        ? report.propertyUrl 
        : report.propertyAddress;
      
      if (!addressOrUrl) {
        throw new Error('Invalid report: missing both propertyUrl and propertyAddress');
      }

      console.log('\n🚀 Starting Gemini-powered property analysis');
      console.log(`📍 Input: ${addressOrUrl}`);

      // Step 1: Use Gemini with Google Search grounding for complete analysis
      // This single call gets property data, comps, and renovation recommendations
      const research = await researchProperty(addressOrUrl);
      
      // Convert research results to our standard formats
      const propertyData = convertToPropertyData(research);
      const renovationProjects = convertToRenovationProjects(research);
      const comparableProperties = convertToComparables(research);

      console.log(`\n✅ Gemini research complete:`);
      console.log(`  📊 Property: ${propertyData.address}`);
      console.log(`  💰 Estimated: $${propertyData.price?.toLocaleString()}`);
      console.log(`  🏠 Comparables: ${comparableProperties.length}`);
      console.log(`  🔨 Renovation projects: ${renovationProjects.length}`);
      console.log(`  📈 Verdict: ${research.renovationAnalysis?.verdict}`);

      // Step 2: Extract location for contractor lookup
      const location = await extractLocationFromProperty(propertyData.address, report.propertyUrl ?? undefined);
      
      const updatedPropertyData = {
        ...propertyData,
        location
      };

      // Step 3: Get Street View and Satellite imagery
      let imagery: { streetViewUrl?: string; satelliteUrl?: string } | undefined;
      try {
        const { generateImageryUrls } = await import('./services/gemini-enhanced');
        if (location.lat && location.lng) {
          imagery = await generateImageryUrls(location.lat, location.lng);
          console.log(`📸 Generated Street View and Satellite imagery URLs`);
        }
      } catch (imgError) {
        console.log('Imagery generation failed, continuing without images');
      }

      // Step 4: Generate contractor recommendations for each project
      const projectsWithContractors = await Promise.all(
        renovationProjects.map(async (project: any) => {
          let projectContractors;
          try {
            console.log(`Finding contractors for ${project.name} in ${location.city}, ${location.state}`);
            projectContractors = await findLocationBasedContractors(location, project.name);
            
            if (projectContractors.length === 0) {
              const locationQuery = `${location.city || 'Unknown'}, ${location.state || 'Unknown'}`;
              projectContractors = await generateContractorRecommendations(locationQuery, project.name);
            }
          } catch (error) {
            console.log(`Contractor lookup failed for ${project.name}, using AI generation`);
            const locationQuery = `${location.city || 'Unknown'}, ${location.state || 'Unknown'}`;
            projectContractors = await generateContractorRecommendations(locationQuery, project.name);
          }
          
          return {
            ...project,
            contractors: projectContractors
          };
        })
      );

      // Step 5: Create financial summary from research (matching expected schema)
      const currentValue = propertyData.price || research.propertyData.currentEstimate || 0;
      const totalRenovationCost = renovationProjects.reduce((sum: number, p: any) => sum + ((p.costRangeLow + p.costRangeHigh) / 2 || 0), 0);
      const totalValueAdd = renovationProjects.reduce((sum: number, p: any) => sum + (p.valueAdd || 0), 0);
      const afterRepairValue = currentValue + totalValueAdd;
      const totalROI = totalRenovationCost > 0 ? ((totalValueAdd - totalRenovationCost) / totalRenovationCost) * 100 : 0;
      const avgPricePsf = research.neighborhoodContext.pricePerSqft || 0;

      const financialSummary = {
        currentValue,
        totalRenovationCost,
        totalValueAdd,
        afterRepairValue,
        totalROI,
        avgPricePsf,
      };

      // Convert neighborhood context to maps context format
      const mapsContext = {
        neighborhoodInsights: `${research.neighborhoodContext.name}: ${research.neighborhoodContext.description}. ${research.neighborhoodContext.marketTrend || ''}`.trim(),
        nearbyPOIs: research.neighborhoodContext.nearbyAmenities?.map((amenity: string) => ({
          name: amenity,
          type: 'amenity',
        })),
      };

      // Create validation summary with owner and investor analysis
      const validationSummary = {
        verdict: research.renovationAnalysis.verdict,
        reasoning: research.renovationAnalysis.reasoning,
        bestStrategy: research.renovationAnalysis.bestStrategy,
        importantConsiderations: research.renovationAnalysis.importantConsiderations,
        ownerAnalysis: research.renovationAnalysis.ownerAnalysis,
        investorAnalysis: research.renovationAnalysis.investorAnalysis,
        sources: research.sources,
      };

      // Save all data
      await storage.updateAnalysisReportData(reportId, { 
        propertyData: updatedPropertyData,
        comparableProperties,
        renovationProjects: projectsWithContractors,
        financialSummary,
        validationSummary,
        imagery,
        mapsContext,
        dataSource: 'gemini_research',
        status: 'completed',
        failureReason: null as any,
        completedAt: new Date()
      });

      console.log('\n✅ Analysis complete and saved!');

    } catch (error) {
      console.error("Error processing analysis report:", error);
      
      let failureReason = "An unexpected error occurred while processing your request.";
      
      if (error instanceof Error) {
        if (error.message.includes('Failed to parse')) {
          failureReason = "We couldn't find enough information about this property. Please try a different address or provide more details.";
        } else if (error.message.includes('fetch')) {
          failureReason = "Unable to connect to the research service. Please check your internet connection and try again.";
        } else {
          failureReason = error.message;
        }
      }
      
      await storage.updateAnalysisReportData(reportId, { 
        status: 'failed',
        failureReason: failureReason
      });
    }
  }

  // Address autocomplete endpoint using Google Places API
  app.get("/api/address-autocomplete", async (req, res) => {
    try {
      const { input } = req.query;
      
      if (!input || typeof input !== 'string' || input.length < 3) {
        return res.json({ predictions: [] });
      }

      const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        console.error('No Google API key available for Places API');
        return res.json({ predictions: [] });
      }

      // Try the new Places API first
      console.log('Trying Places API (New) for:', input);
      const newApiUrl = 'https://places.googleapis.com/v1/places:autocomplete';
      const requestBody = {
        input: input,
        includedPrimaryTypes: ['street_address', 'subpremise'],
        includedRegionCodes: ['us']
      };

      const newApiResponse = await fetch(newApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat'
        },
        body: JSON.stringify(requestBody)
      });

      const newApiData = await newApiResponse.json();

      if (newApiData.suggestions && newApiData.suggestions.length > 0) {
        console.log('Places API (New) returned', newApiData.suggestions.length, 'suggestions');
        const predictions = newApiData.suggestions.map((suggestion: any) => ({
          description: suggestion.placePrediction?.text?.text || '',
          place_id: suggestion.placePrediction?.placeId || '',
          structured_formatting: {
            main_text: suggestion.placePrediction?.structuredFormat?.mainText?.text || '',
            secondary_text: suggestion.placePrediction?.structuredFormat?.secondaryText?.text || ''
          }
        }));
        return res.json({ predictions });
      }

      // If new API returns error, try legacy API
      if (newApiData.error) {
        console.log('Places API (New) error:', newApiData.error.message, '- trying legacy API');
        
        // Try legacy Places API
        const legacyUrl = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
        legacyUrl.searchParams.append('input', input);
        legacyUrl.searchParams.append('types', 'address');
        legacyUrl.searchParams.append('components', 'country:us');
        legacyUrl.searchParams.append('key', apiKey);

        const legacyResponse = await fetch(legacyUrl.toString());
        const legacyData = await legacyResponse.json();

        if (legacyData.status === 'OK' && legacyData.predictions?.length > 0) {
          console.log('Legacy Places API returned', legacyData.predictions.length, 'predictions');
          return res.json({ predictions: legacyData.predictions });
        }

        if (legacyData.status === 'REQUEST_DENIED') {
          console.error('Places API request denied:', legacyData.error_message);
          return res.json({ predictions: [], error: 'API access denied - Places API may need to be enabled' });
        }
      }

      res.json({ predictions: [] });
    } catch (error) {
      console.error("Error in address autocomplete:", error);
      res.json({ predictions: [] });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
