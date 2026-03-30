import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { eq } from "drizzle-orm";
import { insertAnalysisReportSchema, type AnalysisReport, users } from "@shared/schema";
import { researchProperty, convertToPropertyData, convertToRenovationProjects, convertToComparables } from "./services/gemini-research";
import { extractLocationFromProperty } from "./services/location-service";
import { getStripeClient, getStripePublishableKey } from "./stripeClient";
import { chatWithReport } from "./services/chat";
import { generateContentEmbedding } from "./services/embedding";
import { knowledgeBase } from "@shared/schema";

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
      const userId = req.user.id;
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
      const userId = req.user.id;
      await storage.updateUserTosAccepted(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error accepting TOS:", error);
      res.status(500).json({ message: "Failed to accept terms" });
    }
  });

  app.post("/api/checkout", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
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
        const session = await stripe.checkout.sessions.create({
          customer: customerId,
          client_reference_id: userId.toString(),
          payment_method_types: ['card'],
          line_items: [{
            price_data: {
              currency: 'usd',
              product: 'prod_UCPjR7VIdg4yee',
              unit_amount: 2999,
              recurring: { interval: 'month' },
            },
            quantity: 1
          }],
          mode: 'subscription',
          success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${baseUrl}/pricing`,
          metadata: { userId: userId.toString(), priceType: 'subscription' },
        });

        return res.json({ url: session.url });
      }

      let unitAmount: number;
      let stripeProductId: string;
      let credits: number;

      if (priceType === 'first_report') {
        unitAmount = 399;
        stripeProductId = 'prod_UCPh4TRetQNkoY';
        credits = 1;
      } else if (priceType === 'bundle') {
        unitAmount = 3499;
        stripeProductId = 'prod_UCPjHeRdc8u3Ko';
        credits = 5;
      } else {
        unitAmount = 999;
        stripeProductId = 'prod_UCPiqYNFIWvEcV';
        credits = 1;
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        client_reference_id: userId.toString(),
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product: stripeProductId,
            unit_amount: unitAmount,
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${baseUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/pricing`,
        metadata: {
          userId: userId.toString(),
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

      const userId = req.user.id;
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

  app.post("/api/test-reports", async (req: any, res) => {
    try {
      const validatedData = insertAnalysisReportSchema.parse({ inputType: "address", propertyAddress: "123 Main St" });
      const report = await storage.createAnalysisReport(validatedData, undefined);
      processAnalysisReport(report.id);
      res.json({ reportId: report.id });
    } catch (e) { res.status(500).send((e as Error).stack); }
  });

  app.post("/api/reports", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      console.log('Processing /api/reports request for user:', userId);
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const userIsAdmin = isAdmin(user.email) || user.isAdmin === true;

      const hasCredits = (user.reportCredits || 0) > 0;
      const hasSubscription = user.subscriptionStatus === 'active';

      // STRICT ENFORCEMENT: Everyone must accept TOS, even admins or manually provisioned accounts
      if (!user.tosAcceptedAt) {
        return res.status(403).json({ message: "Please accept the Terms of Service before generating a report." });
      }

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

      console.log('Creating report in database...');
      const report = await storage.createAnalysisReport({
        propertyUrl: validatedData.propertyUrl,
        propertyAddress: validatedData.propertyAddress,
        inputType: validatedData.inputType,
      }, userId);
      
      if (validatedData.userType || validatedData.targetBudget) {
        await storage.updateAnalysisReportData(report.id, {
          moduleData: {
            userType: validatedData.userType,
            targetBudget: validatedData.targetBudget
          }
        });
      }
      
      console.log('Report created:', report.id);

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

  app.post("/api/reports/:id/chat", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { message, history } = req.body;
      const userId = req.user.id;

      if (!message) {
        return res.status(400).json({ message: "Message is required" });
      }

      const report = await storage.getAnalysisReport(id);

      if (!report) {
        return res.status(404).json({ message: "Report not found" });
      }

      // Verify the user owns the report or is an admin
      const user = await storage.getUser(userId);
      const userIsAdmin = isAdmin(user?.email);
      if (report.userId !== userId && !userIsAdmin) {
        return res.status(403).json({ message: "Unauthorized access to report" });
      }

      if (report.status !== 'completed') {
        return res.status(400).json({ message: "Cannot chat about an incomplete report" });
      }

      const reply = await chatWithReport(report, message, history);
      res.json({ reply });

    } catch (error) {
      console.error("Error in report chat:", error);
      res.status(500).json({ message: "Failed to process chat message" });
    }
  });

  app.get("/api/user/reports", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const reports = await storage.getUserReports(userId);
      res.json(reports);
    } catch (error) {
      console.error("Error fetching user reports:", error);
      res.status(500).json({ message: "Failed to fetch reports" });
    }
  });

  app.post("/api/stripe/create-portal", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
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

      const userType = (report.moduleData as any)?.userType;
      const targetBudget = (report.moduleData as any)?.targetBudget;
      
      if (userType) console.log(`Configuring strategy for User Type: ${userType}`);
      if (targetBudget) console.log(`Configuring strategy for Budget Ceiling: $${targetBudget}`);

      const research = await researchProperty(addressOrUrl, userType, targetBudget);

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

      const projectsWithContractors = renovationProjects;

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
        moduleData: research.moduleData,
        imagery,
        mapsContext,
        dataSource: 'gemini_research',
        status: 'completed',
        failureReason: null as any,
        completedAt: new Date()
      });

      console.log('\nAnalysis complete and saved!');

      // Phase 4 RAG: Fire and Forget the Agentic Auditor verification gate asynchronously.
      verifyAndIngestReport(reportId).catch(e => console.error("Agentic Auditor ingestion failed:", e.message));

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

  app.get("/api/admin/users", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!isAdmin(user?.email) && user?.isAdmin !== true) {
        return res.status(403).json({ message: "Forbidden: Super Admin Access Only" });
      }
      const allUsers = await storage.getAllUsers();
      res.json(allUsers);
    } catch (error) {
      console.error("Admin Users Route Error:", error);
      res.status(500).json({ message: "Failed to fetch administrative records." });
    }
  });

  app.post("/api/admin/users", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const adminUser = await storage.getUser(userId);
      if (!isAdmin(adminUser?.email) && adminUser?.isAdmin !== true) {
        return res.status(403).json({ message: "Forbidden: Super Admin Access Only" });
      }
      
      const { username, password, email, isAdmin: newIsAdmin, reportCredits } = req.body;
      const { hashPassword } = await import('./auth');
      const hashedPassword = await hashPassword(password);
      
      const [newUser] = await db.insert(users).values({
        username,
        email,
        password: hashedPassword,
        isAdmin: newIsAdmin || false,
        reportCredits: reportCredits || 0,
        totalReportsGenerated: 0,
        subscriptionStatus: "none"
      }).returning();
      
      res.json(newUser);
    } catch (error: any) {
      console.error("Admin Create User Error:", error);
      res.status(400).json({ message: error.message || "Failed to create user" });
    }
  });

  app.patch("/api/admin/users/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const adminUser = await storage.getUser(userId);
      if (!isAdmin(adminUser?.email) && adminUser?.isAdmin !== true) {
          return res.status(403).json({ message: "Forbidden: Super Admin Access Only" });
      }
      
      const { isAdmin: updateIsAdmin, reportCredits, password } = req.body;
      const updates: any = {};
      
      if (typeof updateIsAdmin === 'boolean') updates.isAdmin = updateIsAdmin;
      if (typeof reportCredits === 'number') updates.reportCredits = reportCredits;
      if (password) {
        const { hashPassword } = await import('./auth');
        updates.password = await hashPassword(password);
      }
      
      const [updatedUser] = await db.update(users)
        .set(updates)
        .where(eq(users.id, req.params.id))
        .returning();
        
      res.json(updatedUser);
    } catch (error: any) {
      console.error("Admin Update User Error:", error);
      res.status(400).json({ message: error.message || "Failed to update user" });
    }
  });

  app.delete("/api/admin/users/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const adminUser = await storage.getUser(userId);
      if (!isAdmin(adminUser?.email) && adminUser?.isAdmin !== true) {
          return res.status(403).json({ message: "Forbidden: Super Admin Access Only" });
      }
      
      const targetUserId = req.params.id;
      if (targetUserId === userId) {
        return res.status(400).json({ message: "Cannot delete your own admin account." });
      }

      await storage.deleteUser(targetUserId);
      res.json({ success: true, message: "User hard-deleted from database." });
    } catch (error: any) {
      console.error("Admin Delete User Error:", error);
      res.status(400).json({ message: error.message || "Failed to delete user" });
    }
  });

  // Phase 4 RAG: Manual Admin Semantic Ingestion Gateway
  app.post("/api/admin/knowledge/ingest", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const adminUser = await storage.getUser(userId);
      if (!isAdmin(adminUser?.email) && adminUser?.isAdmin !== true) {
        return res.status(403).json({ message: "Forbidden: Super Admin Access Only" });
      }

      const { sourceType, title, content, metadata } = req.body;
      if (!sourceType || !title || !content) {
        return res.status(400).json({ message: "Missing required vector payload arguments." });
      }

      // Encode the text into 768 dimensions using Gemini
      const embeddingFloatArray = await generateContentEmbedding(content);

      // Save directly into the semantic storage structure as 'admin_approved'
      const entry = await storage.createKnowledgeEntry({
        sourceType,
        title,
        content,
        metadata: metadata || {},
        verificationStatus: 'admin_approved',
        embedding: `[${embeddingFloatArray.join(',')}]`,
      });

      res.status(201).json({ success: true, entryId: entry.id });
    } catch (error: any) {
      console.error("RAG Embedding Error:", error);
      res.status(500).json({ message: "Failed to construct the embedding vector space.", error: error.message });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

// Phase 4 RAG: Agentic Auditor Async Pipeline
async function verifyAndIngestReport(reportId: string): Promise<void> {
  const report = await storage.getAnalysisReport(reportId);
  if (!report || report.status !== 'completed' || !report.propertyData) return;

  // The Agentic Auditor evaluates the logic confidence of the report. We rely on the 
  // embedded validationSummary.verdict to act as the internal Quality Gate.
  const validation = report.validationSummary as any;
  const isHighConfidence = validation?.verdict === 'Strong Investment' || validation?.verdict === 'Strong' || validation?.verdict?.includes('Strong');

  if (isHighConfidence) {
    console.log(`[RAG Auditor] Vectorizing Report ${reportId} for Semantic Context`);
    
    // Construct a condensed textual representation of the property logic.
    const propertyFacts = report.propertyData as any;
    const sqft = propertyFacts.sqft || 0;
    const price = propertyFacts.price || propertyFacts.lastSoldPrice || 0;
    const pricePerSqft = sqft > 0 ? (price / sqft).toFixed(2) : 0;
    
    // We bind the textual memory that the LLM will scan contextually.
    const memoryString = `Verified Property Record: ${propertyFacts.address}. ` +
      `Layout: ${propertyFacts.beds} beds, ${propertyFacts.baths} baths, ${sqft} sqft. ` +
      `Valuation: Extracted Price $${price.toLocaleString()} ($${pricePerSqft}/sqft). ` +
      `AI Verification Strategy: ${validation?.bestStrategy || 'Unknown'}.`;

    const docEmbedding = await generateContentEmbedding(memoryString);
    
    await storage.createKnowledgeEntry({
      sourceType: 'property_meta',
      title: propertyFacts.address,
      content: memoryString,
      metadata: { reportId, type: 'agentic_audit', confidence: validation?.confidence || 1.0 },
      verificationStatus: 'agent_verified',
      embedding: `[${docEmbedding.join(',')}]`,
    });
    console.log(`[RAG Auditor] Report ${reportId} mapped efficiently into 768-D space.`);
  } else {
    console.log(`[RAG Auditor] Report ${reportId} rejected by Quality Gate (Low confidence).`);
  }
}
