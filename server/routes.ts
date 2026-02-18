import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertAnalysisReportSchema, type AnalysisReport } from "@shared/schema";
import { researchProperty, convertToPropertyData, convertToRenovationProjects, convertToComparables } from "./services/gemini-research";
import { generateContractorRecommendations } from "./services/gemini";
import { extractLocationFromProperty } from "./services/location-service";
import { findLocationBasedContractors } from "./services/location-contractors";
import { getStripeClient, getStripePublishableKey } from "./stripeClient";

const ADMIN_EMAILS = ['alexkingsm@gmail.com'];

function isAuthenticated(req: any, res: any, next: any) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: "Not authenticated" });
}

function isAdmin(email: string | null | undefined): boolean {
  return !!email && ADMIN_EMAILS.includes(email.toLowerCase());
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/stripe/publishable-key", async (_req, res) => {
    try {
      const key = await getStripePublishableKey();
      res.json({ publishableKey: key });
    } catch (error) {
      res.status(500).json({ message: "Stripe not configured" });
    }
  });

  app.get("/api/user/status", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      res.json({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
        reportCredits: user.reportCredits,
        totalReportsGenerated: user.totalReportsGenerated,
        subscriptionStatus: user.subscriptionStatus,
        tosAcceptedAt: user.tosAcceptedAt,
        isFirstReport: user.totalReportsGenerated === 0,
        isAdmin: isAdmin(user.email),
      });
    } catch (error) {
      console.error("Error fetching user status:", error);
      res.status(500).json({ message: "Failed to fetch user status" });
    }
  });

  app.post("/api/user/accept-tos", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      await storage.updateUserTosAccepted(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error accepting TOS:", error);
      res.status(500).json({ message: "Failed to accept terms" });
    }
  });

  app.post("/api/checkout", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { priceType, reportAddress, tosAccepted } = req.body;

      if (!user.tosAcceptedAt && !tosAccepted) {
        return res.status(403).json({ message: "Please accept the Terms of Service before purchasing." });
      }

      if (tosAccepted && !user.tosAcceptedAt) {
        await storage.updateUserTosAccepted(userId);
      }

      const stripe = await getStripeClient();

      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email || undefined,
          metadata: { userId },
        });
        customerId = customer.id;
        await storage.updateUserStripeCustomerId(userId, customerId);
      }

      const baseUrl = `${req.protocol}://${req.get('host')}`;

      if (priceType === 'subscription') {
        const prices = await stripe.prices.list({
          active: true,
          recurring: { interval: 'month' },
          limit: 10,
        });
        const subscriptionPrice = prices.data.find(p => p.unit_amount === 2999);

        if (!subscriptionPrice) {
          return res.status(400).json({ message: "Subscription price not found. Please run the seed script." });
        }

        const session = await stripe.checkout.sessions.create({
          customer: customerId,
          payment_method_types: ['card'],
          line_items: [{ price: subscriptionPrice.id, quantity: 1 }],
          mode: 'subscription',
          success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${baseUrl}/pricing`,
          metadata: { userId, priceType: 'subscription' },
        });

        return res.json({ url: session.url });
      }

      let unitAmount: number;
      let productName: string;
      let credits: number;

      if (priceType === 'first_report') {
        unitAmount = 399;
        productName = 'First Property Analysis';
        credits = 1;
      } else if (priceType === 'bundle') {
        unitAmount = 3499;
        productName = '5-Report Bundle';
        credits = 5;
      } else {
        unitAmount = 999;
        productName = 'Property Analysis Report';
        credits = 1;
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: { name: productName },
            unit_amount: unitAmount,
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/pricing`,
        metadata: {
          userId,
          priceType,
          credits: credits.toString(),
          reportAddress: reportAddress || '',
        },
      });

      res.json({ url: session.url });
    } catch (error) {
      console.error("Error creating checkout session:", error);
      res.status(500).json({ message: "Failed to create checkout session" });
    }
  });

  app.get("/api/checkout/verify", isAuthenticated, async (req: any, res) => {
    try {
      const { session_id } = req.query;
      if (!session_id) {
        return res.status(400).json({ message: "Missing session_id" });
      }

      const userId = req.user.claims.sub;
      const stripe = await getStripeClient();
      const session = await stripe.checkout.sessions.retrieve(session_id as string);

      if (session.payment_status !== 'paid') {
        return res.json({ success: false, message: "Payment not completed" });
      }

      if (session.metadata?.userId !== userId) {
        return res.status(403).json({ message: "Session does not belong to this user" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const priceType = session.metadata?.priceType;

      if (priceType === 'subscription') {
        const subscriptionId = typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id;
        if (subscriptionId) {
          await storage.updateUserSubscription(userId, subscriptionId, 'active');
        }
        return res.json({ success: true, type: 'subscription' });
      }

      const creditsToAdd = parseInt(session.metadata?.credits || '1', 10);
      const newCredits = (user.reportCredits || 0) + creditsToAdd;
      await storage.updateUserCredits(userId, newCredits);

      const reportAddress = session.metadata?.reportAddress;

      res.json({
        success: true,
        type: 'credits',
        credits: newCredits,
        reportAddress: reportAddress || null,
      });
    } catch (error) {
      console.error("Error verifying checkout:", error);
      res.status(500).json({ message: "Failed to verify payment" });
    }
  });

  app.post("/api/reports", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const userIsAdmin = isAdmin(user.email);

      if (!userIsAdmin && !user.tosAcceptedAt) {
        return res.status(403).json({ message: "Please accept the Terms of Service before generating a report." });
      }

      const hasCredits = (user.reportCredits || 0) > 0;
      const hasSubscription = user.subscriptionStatus === 'active';

      if (!userIsAdmin && !hasCredits && !hasSubscription) {
        return res.status(402).json({ message: "Please purchase a report or subscribe to generate analyses." });
      }

      const validatedData = insertAnalysisReportSchema.parse(req.body);

      if (validatedData.inputType === 'url' && validatedData.propertyUrl) {
        try {
          const parsedUrl = new URL(validatedData.propertyUrl);
          if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
            return res.status(400).json({ message: "Invalid URL protocol" });
          }
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
        if (validatedData.propertyAddress.trim().length < 10) {
          return res.status(400).json({
            message: "Please provide a complete address (street, city, state, zip)"
          });
        }
      } else {
        return res.status(400).json({
          message: "Please provide either a property URL or a property address"
        });
      }

      const addressToCheck = validatedData.propertyAddress || validatedData.propertyUrl || '';
      if (addressToCheck) {
        const cachedReport = await storage.findCachedReport(addressToCheck, 30);
        if (cachedReport) {
          console.log(`Found cached report for "${addressToCheck}" - returning existing report ${cachedReport.id}`);
          return res.json({
            reportId: cachedReport.id,
            status: cachedReport.status,
            cached: true,
            cachedAt: cachedReport.completedAt
          });
        }
      }

      if (!userIsAdmin && !hasSubscription && hasCredits) {
        await storage.updateUserCredits(userId, (user.reportCredits || 0) - 1);
      }
      await storage.incrementUserReportCount(userId);

      const report = await storage.createAnalysisReport(validatedData, userId);

      processAnalysisReport(report.id);

      res.json({ reportId: report.id, status: 'pending', cached: false });
    } catch (error) {
      console.error("Error creating analysis report:", error);

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

  app.get("/api/user/reports", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const reports = await storage.getUserReports(userId);
      res.json(reports);
    } catch (error) {
      console.error("Error fetching user reports:", error);
      res.status(500).json({ message: "Failed to fetch reports" });
    }
  });

  app.post("/api/stripe/create-portal", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user?.stripeCustomerId) {
        return res.status(400).json({ message: "No Stripe customer found" });
      }

      const stripe = await getStripeClient();
      const session = await stripe.billingPortal.sessions.create({
        customer: user.stripeCustomerId,
        return_url: `${req.protocol}://${req.get('host')}/dashboard`,
      });

      res.json({ url: session.url });
    } catch (error) {
      console.error("Error creating portal session:", error);
      res.status(500).json({ message: "Failed to create billing portal" });
    }
  });

  async function processAnalysisReport(reportId: string) {
    try {
      const report = await storage.getAnalysisReport(reportId);
      if (!report) return;

      await storage.updateAnalysisReportStatus(reportId, 'processing');

      const addressOrUrl = report.inputType === 'url' && report.propertyUrl
        ? report.propertyUrl
        : report.propertyAddress;

      if (!addressOrUrl) {
        throw new Error('Invalid report: missing both propertyUrl and propertyAddress');
      }

      console.log('\nStarting Gemini-powered property analysis');
      console.log(`Input: ${addressOrUrl}`);

      const research = await researchProperty(addressOrUrl);

      const propertyData = convertToPropertyData(research);
      const renovationProjects = convertToRenovationProjects(research);
      const comparableProperties = convertToComparables(research);

      console.log(`\nGemini research complete:`);
      console.log(`  Property: ${propertyData.address}`);
      console.log(`  Estimated: $${propertyData.price?.toLocaleString()}`);
      console.log(`  Comparables: ${comparableProperties.length}`);
      console.log(`  Renovation projects: ${renovationProjects.length}`);

      const location = await extractLocationFromProperty(propertyData.address, report.propertyUrl ?? undefined);

      const updatedPropertyData = {
        ...propertyData,
        location
      };

      let imagery: { streetViewUrl?: string; satelliteUrl?: string } | undefined;
      try {
        const { generateImageryUrls } = await import('./services/gemini-enhanced');
        if (location.lat && location.lng) {
          imagery = await generateImageryUrls(location.lat, location.lng, propertyData.address);
          console.log(`Generated Street View and Satellite imagery URLs`);
        }
      } catch (imgError) {
        console.log('Imagery generation failed, continuing without images');
      }

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

      const mapsContext = {
        neighborhoodInsights: `${research.neighborhoodContext.name}: ${research.neighborhoodContext.description}. ${research.neighborhoodContext.marketTrend || ''}`.trim(),
        nearbyPOIs: research.neighborhoodContext.nearbyAmenities?.map((amenity: string) => ({
          name: amenity,
          type: 'amenity',
        })),
      };

      const validationSummary = {
        verdict: research.renovationAnalysis.verdict,
        reasoning: research.renovationAnalysis.reasoning,
        bestStrategy: research.renovationAnalysis.bestStrategy,
        importantConsiderations: research.renovationAnalysis.importantConsiderations,
        ownerAnalysis: research.renovationAnalysis.ownerAnalysis,
        investorAnalysis: research.renovationAnalysis.investorAnalysis,
        sources: research.sources,
      };

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

      console.log('\nAnalysis complete and saved!');

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

      if (newApiData.error) {
        console.log('Places API (New) error:', newApiData.error.message, '- trying legacy API');

        const legacyUrl = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
        legacyUrl.searchParams.append('input', input);
        legacyUrl.searchParams.append('types', 'address');
        legacyUrl.searchParams.append('components', 'country:us');
        legacyUrl.searchParams.append('key', apiKey);

        const legacyResponse = await fetch(legacyUrl.toString());
        const legacyData = await legacyResponse.json();

        if (legacyData.status === 'OK' && legacyData.predictions?.length > 0) {
          return res.json({ predictions: legacyData.predictions });
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
