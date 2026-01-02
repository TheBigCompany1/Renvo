import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertAnalysisReportSchema, insertEmailSignupSchema, type AnalysisReport, type EmailSignup, type ComparableProperty } from "@shared/schema";
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
      const validatedData = insertAnalysisReportSchema.parse(req.body);
      
      // Determine input type and validate accordingly
      if (validatedData.inputType === 'url' && validatedData.propertyUrl) {
        // Secure URL validation to prevent SSRF
        try {
          const parsedUrl = new URL(validatedData.propertyUrl);
          const allowedHosts = ['redfin.com', 'www.redfin.com', 'redf.in'];
          if (!allowedHosts.includes(parsedUrl.hostname.toLowerCase())) {
            return res.status(400).json({ 
              message: "Invalid URL. Please provide a valid Redfin property URL (www.redfin.com or redf.in)." 
            });
          }
          if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
            return res.status(400).json({ message: "Invalid URL protocol" });
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

      const report = await storage.createAnalysisReport(validatedData);
      
      // Start async processing
      processAnalysisReport(report.id);
      
      res.json({ reportId: report.id, status: 'pending' });
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

  // Async processing function
  async function processAnalysisReport(reportId: string) {
    try {
      const report = await storage.getAnalysisReport(reportId);
      if (!report) return;

      // Update status to processing
      await storage.updateAnalysisReportStatus(reportId, 'processing');

      let propertyData;

      // Branch based on input type
      if (report.inputType === 'url' && report.propertyUrl) {
        // URL provided: Use ONLY the Redfin scraper - NO Deep Research fallback
        // This ensures accurate data from the actual listing
        console.log('Using Redfin scraper for property data from URL');
        try {
          propertyData = await scrapeRedfinProperty(report.propertyUrl);
          console.log('✅ Redfin scraper succeeded');
          
          // Mark data source as redfin_scraper
          await storage.updateAnalysisReportData(reportId, { 
            dataSource: 'redfin_scraper'
          });
          
          // Store geocoded data
          try {
            const { geocodeAddress } = await import('./services/gemini-enhanced');
            const geoData = await geocodeAddress(propertyData.address);
            await storage.updateAnalysisReportData(reportId, { geoData });
          } catch (geoError) {
            console.log('Geocoding failed, continuing without coordinates');
          }
          
        } catch (scraperError) {
          // Scraper failed - fail gracefully with clear guidance
          console.error('Redfin scraper failed:', scraperError);
          const scraperErrorMessage = (scraperError as Error).message;
          
          await storage.updateAnalysisReportData(reportId, { 
            status: 'failed',
            failureReason: `We couldn't access this Redfin listing. ${scraperErrorMessage.includes('403') || scraperErrorMessage.includes('blocked') ? 'The page may be temporarily unavailable.' : 'Please check the URL and try again, or enter the property address directly.'}`,
            dataSource: undefined
          });
          throw scraperError;
        }
      } else if (report.inputType === 'address' && report.propertyAddress) {
        // Step 1b: NEW ARCHITECTURE - Find Redfin URL → Scrape → Analyze
        console.log('🔍 Starting URL discovery for address:', report.propertyAddress);
        
        // Import services
        const { findRedfinUrl } = await import('./services/deep-research');
        
        // Step 1b.1: Use AI to find the Redfin URL for this address
        console.log('Step 1b.1: Searching for Redfin listing URL...');
        const urlResult = await findRedfinUrl(report.propertyAddress);
        
        if (urlResult.found && urlResult.redfinUrl) {
          // Step 1b.2: Use the Redfin scraper for accurate data
          console.log(`✅ Found Redfin URL: ${urlResult.redfinUrl}`);
          console.log('Step 1b.2: Scraping Redfin for accurate property data...');
          
          // Store the discovered URL in the report object for later use
          report.propertyUrl = urlResult.redfinUrl;
          
          try {
            propertyData = await scrapeRedfinProperty(urlResult.redfinUrl);
            console.log('✅ Redfin scraper succeeded with accurate data');
            console.log(`📊 Property: ${propertyData.beds}bd/${propertyData.baths}ba, ${propertyData.sqft} sqft`);
            console.log(`💰 Price: $${propertyData.price?.toLocaleString() || 'Unknown'}`);
            console.log(`📸 Images: ${propertyData.images?.length || 0}`);
            
            // Store the discovered URL and mark data source in database
            await storage.updateAnalysisReportData(reportId, { 
              propertyUrl: urlResult.redfinUrl,
              dataSource: 'redfin_scraper_via_url_discovery'
            });
            
            // Store geocoded data
            try {
              const { geocodeAddress } = await import('./services/gemini-enhanced');
              const geoData = await geocodeAddress(propertyData.address);
              await storage.updateAnalysisReportData(reportId, { geoData });
            } catch (geoError) {
              console.log('Geocoding failed, using placeholder coordinates');
            }
            
          } catch (scraperError) {
            // Scraper failed even with the discovered URL
            console.error('Redfin scraper failed for discovered URL:', scraperError);
            await storage.updateAnalysisReportData(reportId, { 
              status: 'failed',
              failureReason: "We couldn't find this property when searching the web. Please paste the Redfin listing URL directly or try a different address.",
              dataSource: undefined
            });
            throw new Error("We couldn't find this property when searching the web. Please paste the Redfin listing URL directly or try a different address.");
          }
        } else {
          // Could not find a Redfin URL - fail gracefully with clear guidance
          console.log('❌ Could not find Redfin URL for address');
          await storage.updateAnalysisReportData(reportId, { 
            status: 'failed',
            failureReason: "We couldn't find this property when searching the web. Please paste the Redfin listing URL directly or try a different address.",
            dataSource: undefined
          });
          throw new Error("We couldn't find this property when searching the web. Please paste the Redfin listing URL directly or try a different address.");
        }
        
        console.log('✅ Address-to-URL workflow completed successfully');
      } else {
        throw new Error('Invalid report: missing both propertyUrl and propertyAddress');
      }
      
      await storage.updateAnalysisReportData(reportId, { propertyData });

      // Step 2: Extract location from property data using new location service
      const location = await extractLocationFromProperty(propertyData.address, report.propertyUrl ?? undefined);
      
      // Update property data with location
      const updatedPropertyData = {
        ...propertyData,
        location
      };
      await storage.updateAnalysisReportData(reportId, { propertyData: updatedPropertyData });
      
      console.log(`Extracted location: ${location.city}, ${location.state} ${location.zip}`);

      // Step 3: Find comparable properties using location-based approach
      let comparableProperties: ComparableProperty[] = [];
      try {
        console.log(`Finding location-based comparables for ${location.city}, ${location.state}`);
        comparableProperties = await findLocationBasedComparables(updatedPropertyData, location);
        
        if (comparableProperties.length === 0 && report.propertyUrl) {
          console.log('Location-based comparables returned empty, falling back to scraper method');
          comparableProperties = await findComparableProperties(updatedPropertyData, report.propertyUrl);
        } else if (comparableProperties.length === 0) {
          console.log('No comparables found for address-based input (scraper fallback skipped)');
          comparableProperties = []; // Return empty array for address inputs without URL
        }
      } catch (error) {
        console.log('Location-based comparables failed:', error);
        if (report.propertyUrl) {
          console.log('Falling back to scraper method');
          comparableProperties = await findComparableProperties(updatedPropertyData, report.propertyUrl);
        } else {
          console.log('Skipping scraper fallback for address-only input');
          comparableProperties = [];
        }
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

      // Mark as completed with data source
      await storage.updateAnalysisReportData(reportId, { 
        status: 'completed',
        dataSource: report.inputType === 'url' ? 'redfin_scraper' : 'deep_research',
        failureReason: null as any, // Clear any previous failure reason
        completedAt: new Date()
      });

    } catch (error) {
      console.error("Error processing analysis report:", error);
      
      // Extract user-friendly error message
      let failureReason = "An unexpected error occurred while processing your request.";
      
      if (error instanceof Error) {
        if (error.message.includes('SCRAPE_FAILED')) {
          // Extract the user-friendly part of the scraping error
          failureReason = "We couldn't retrieve property data from Redfin. This may be due to Redfin blocking automated requests. Please try entering the property address manually instead.";
        } else if (error.message.includes('fetch')) {
          failureReason = "Unable to connect to the property data source. Please check your internet connection and try again.";
        } else if (error.message.includes('timeout')) {
          failureReason = "The request took too long to complete. Please try again.";
        } else {
          // Use a sanitized version of the error message
          failureReason = error.message.replace(/SCRAPE_FAILED:|Error:/gi, '').trim() || failureReason;
        }
      }
      
      // Update with failure status and reason
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
