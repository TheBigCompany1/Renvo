import { GoogleGenAI } from "@google/genai";
import { generateContentEmbedding } from "./embedding";
import { storage } from "../storage";

let _client: GoogleGenAI;
function getClient() {
  if (!_client) {
    const key = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || process.env.Gemini_API_Key;
    if (!key) {
      throw new Error("API key missing from process.env! Available keys: " + Object.keys(process.env).join(", "));
    }
    _client = new GoogleGenAI({ apiKey: key });
  }
  return _client;
}

export interface PropertyResearchResult {
  propertyData: {
    address: string;
    beds: number;
    baths: number;
    sqft: number;
    lotSize?: string;
    lotSqft?: number;
    yearBuilt?: number;
    propertyType?: string;
    condition?: string;
    currentEstimate: number;
    lastSoldPrice?: number;
    lastSoldDate?: string;
    description: string;
    // Enhanced property data
    schools?: Array<{
      name: string;
      type?: 'elementary' | 'middle' | 'high' | 'private';
      rating: number;
      distance?: string;
    }>;
    walkScores?: {
      walkScore?: number;
      transitScore?: number;
      bikeScore?: number;
    };
    crimeStats?: {
      overallRating?: 'very_low' | 'low' | 'moderate' | 'high' | 'very_high';
      violentCrimeIndex?: number;
      propertyCrimeIndex?: number;
      description?: string;
    };
    hazardRisk?: {
      floodZone?: string;
      floodRisk?: 'minimal' | 'low' | 'moderate' | 'high' | 'very_high';
      fireRisk?: 'minimal' | 'low' | 'moderate' | 'high' | 'very_high';
      earthquakeRisk?: 'minimal' | 'low' | 'moderate' | 'high' | 'very_high';
      insuranceImplications?: string;
    };
    permitHistory?: Array<{
      date?: string;
      type: string;
      description: string;
      value?: number;
      status?: string;
    }>;
    propertyTaxAnnual?: number;
    propertyTaxRate?: number;
    rentalPotential?: {
      estimatedMonthlyRent?: number;
      annualRentalIncome?: number;
      capRate?: number;
      rentToValueRatio?: number;
      marketRentRange?: {
        low?: number;
        high?: number;
      };
    };
  };
  comparables: Array<{
    address: string;
    beds: number;
    baths: number;
    sqft: number;
    price: number;
    pricePsf: number;
    saleDate?: string;
    distanceMiles?: number;
    notes?: string;
  }>;
  neighborhoodContext: {
    name: string;
    description: string;
    medianHomePrice?: number;
    pricePerSqft?: number;
    marketTrend?: string;
    nearbyAmenities?: string[];
  };
  renovationAnalysis: {
    verdict: string;
    reasoning: string;
    bestStrategy: string;
    projects: Array<{
      name: string;
      description: string;
      sqftAdded: number;
      newTotalSqft: number;
      estimatedCost: {
        low: number;
        medium: number;
        high: number;
      };
      costPerSqft: number;
      estimatedValueAdd: {
        low: number;
        medium: number;
        high: number;
      };
      targetSalePrice: number;
      potentialProfit: {
        gross: number;
        net: number;
      };
      roi: number;
      maxPurchasePrice?: number;
      timeline: string;
      feasibility: string;
      risks: string[];
      steps: string[];
      valueDrivers?: string[];
      targetDemographic?: string;
      targetComparables?: any[];
      financialStressTest?: {
        sensitivityTable: Array<{costChange: string; priceChange: string; netProfit: number;}>;
      };
    }>;
    ownerAnalysis?: {
      purchasePrice: number;
      currentEquity: number;
      bestProjectForOwner: string;
      projectedNetProfit: number;
      recommendation: string;
    };
    investorAnalysis?: {
      maxPurchasePriceForProfit: number;
      targetProfit: number;
      breakEvenPrice: number;
      recommendation: string;
    };
    importantConsiderations: string[];
  };
  moduleData?: {
    hbuConclusion: string;
    hbuFilterReasoning: string;
    renovationSpecifications: {
      proposedGlaIncrease: string;
      highValueAdditions: string[];
    };
    yieldArbitrage: Array<{
      strategy: string;
      projectedRoi: string;
      equityDelta: string;
    }>;
    marketHedge2026: string;
    macroThesis: {
      momentumScore: number;
      gentrificationTrend: string;
      sustainabilitySummary: string;
    };
    zoningEnvelope: {
      classification: string;
      far: string;
      maxHeight: string;
      setbacks: { front: string; side: string; rear: string; };
      buildByRight: { adu: boolean; jadu: boolean; sb9: boolean; };
    };
    siteViability: {
      floodZone: string;
      fireRisk: string;
      seismicRisk: string;
      topography: string;
      infrastructure: string;
    };
    marketVelocity: {
      absorptionRate: string;
      averageDOM: number;
    };
    entitlementTimeline: {
      architecturalDrafting: string;
      cityZoningReview: string;
      structuralEngineering: string;
      permitIssuance: string;
    };
    preConstructionBudget: {
      cityImpactFees: number;
      schoolFees: number;
      architecturalDrafting: number;
      engineering: number;
    };
  };
  sources: string[];
  rawAnalysis: string;
}

export async function researchProperty(addressOrUrl: string, userType?: string, targetBudget?: number, investmentGoal?: string): Promise<PropertyResearchResult> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔬 GEMINI RESEARCH - Starting property analysis`);
  console.log(`📍 Input: ${addressOrUrl}`);
  
  // Phase 4 RAG: Execute the Agentic Contextual Search prior to prompt initialization
  let ragContextBlock = "";
  try {
    const queryVector = await generateContentEmbedding(addressOrUrl);
    const contextualRecords = await storage.findSimilarKnowledge(queryVector, 5);
    
    if (contextualRecords && contextualRecords.length > 0) {
      console.log(`[RAG Engine] Successfully retrieved ${contextualRecords.length} High-Trust verification vectors.`);
      ragContextBlock = `\n### CRITICAL HIGH-TRUST VERIFIED CONTEXT (RAG MEMORY) ###\nThe following explicit data blocks have been verified by administrators or cross-referenced analytically. You MUST favor this data strongly when computing logic matrices regarding Costs, Permits, and Zoning parameters.\n\n` + 
      contextualRecords.map((rec, i) => `[Vector Record ${i+1}] (Trust Level: ${rec.verificationStatus}, Type: ${rec.sourceType})\nTitle: ${rec.title}\nContent:\n${rec.content}\n`).join("\n");
    } else {
      console.log(`[RAG Engine] No direct high-trust vectors triggered for this contextual boundary.`);
    }
  } catch (err: any) {
    console.error("[RAG Engine] Vector retrieval bypassed due to database exception:", err.message);
  }

  console.log(`${'='.repeat(60)}\n`);

  const startTime = Date.now();

  const prompt = `You are an expert real estate investment analyst. Research and analyze this property for renovation potential.

Property: ${addressOrUrl}
${ragContextBlock}

RESEARCH TASKS:
1. Find the property's current details (beds, baths, sqft, lot size, year built, current estimated value, last sale price/date)
2. DO NOT list "comparables" at the root level anymore. INSTEAD, for EACH of your 3 specific Renovation Strategies, find 3-5 specific "ARV Target Comparables" that exactly match the FUTURE beds/baths/sqft of that specific strategy, and nest them securely inside the "targetComparables" key of that strategy's object in the "projects" array.
3. Analyze the neighborhood and market trends
4. Provide a comprehensive renovation investment analysis
5. Research ENHANCED PROPERTY DATA (important for buyers):
   - Nearby school ratings (GreatSchools scores 1-10)
   - Walk Score, Transit Score, Bike Score (0-100)
   - Crime statistics for the area
   - Flood zone and natural hazard risks
   - Permit history (any recent work done on the property)
   - Annual property taxes
   - Rental income potential (if investor were to rent it out)
6. Research DEEP TECHNICAL PROOF (crucial for module rendering):
   - Highest and Best Use (HBU) conclusion
   - Zoning envelope details (FAR, Max Height, Setbacks, ADU/SB-9 rights)
   - Site physical viability (Topography, infrastructure, seismic)
   - Market Velocity (Absorption rate, Avg DOM for similar props)
   - Pre-construction entitment timeline & soft cost budgets
   - Deep Strategic Verdict (HBU filter reasoning, exact proposed GLA increases, comparative yield arbitrage ROI across 3 paths (Cosmetic vs Hold vs HBU), and a 2026 market hedge defense)

For the renovation analysis, consider:
- Current condition vs. potential (is this a fixer or already renovated?)
- Lot size potential (can you expand, add ADU, lot split?)
- Most profitable renovation strategies for this specific property
- Realistic cost estimates for Los Angeles market ($400-600/sqft for additions)
- Target sale price based on comparable renovated properties
- Net profit after closing costs (typically 5-6% of sale price)
- Timeline and permit considerations

IMPORTANT: Provide AT LEAST 2-3 different renovation opportunities, ranked by ROI. For example:
1. Major expansion (adding square footage)
2. ADU addition (for rental income potential)
3. Cosmetic renovation (kitchen/bath updates)

Be specific with numbers. Use real comparable sales from the area. Calculate actual profit potential.

${userType === 'owner' ? `### IDENTITY CONSTRAINT: OWNER
The user is the current Property Owner. Focus your renovation strategy entirely on maximizing their property value based on the historical price they bought it at (which you must find via grounding search). Calculate their equity and ROI aggressively based on holding the asset.` : ''}
${userType === 'investor' ? `### IDENTITY CONSTRAINT: INVESTOR
The user is a Potential Investor exploring an acquisition. Focus your renovation analysis on determining the maximum ideal purchase price they should target to ensure the renovations are highly profitable. Output specific acquisition caps.` : ''}
${targetBudget ? `### FINANCIAL CONSTRAINT: MAX RENOVATION BUDGET
The user has a strict maximum renovation budget ceiling of $${targetBudget.toLocaleString()}. DO NOT suggest any renovation project whose estimated total cost exceeds this budget. Limit your generated strategies to those feasible within this financial threshold.` : ''}
${investmentGoal ? `### TACTICAL CONSTRAINT: PRIMARY STRATEGY GOAL
The overarching strategy goal for this asset is explicitly: [${investmentGoal}]. Calibrate your generated renovation projects strictly to maximize systemic outcomes aligning with this exact hold strategy over others.` : ''}

CRITICAL INSTRUCTION FOR STRATEGIC VERDICT:
You EXACTLY MUST generate the keys "hbuFilterReasoning", "renovationSpecifications" (including "proposedGlaIncrease" string and "highValueAdditions" array), the 3-scenario "yieldArbitrage" array showing precise ROI % for Cosmetic/Hold/Expansion, and the "marketHedge2026" narrative DIRECTLY inside the top-level "moduleData" payload format block. Failure to output these properties breaks the client application dashboard.

CRITICAL JSON SCHEMA CHECK:
Before outputting the final JSON, verify that your "moduleData" object contains ALL 11 of these exact Root Keys:
1. "hbuConclusion"
2. "hbuFilterReasoning"
3. "renovationSpecifications" (Object)
4. "yieldArbitrage" (Array of 3 objects)
5. "marketHedge2026"
6. "macroThesis"
7. "zoningEnvelope"
8. "siteViability"
9. "marketVelocity"
10. "entitlementTimeline"
11. "preConstructionBudget"
Do NOT omit ANY of these keys under any circumstances.

Respond with a JSON object in this exact format:
\`\`\`json
{
  "propertyData": {
    "address": "Full address with ZIP",
    "beds": 2,
    "baths": 2,
    "sqft": 1200,
    "lotSize": "5,600 sq ft",
    "lotSqft": 5600,
    "yearBuilt": 1940,
    "propertyType": "Single Family",
    "condition": "Recently remodeled | Fixer | Original condition",
    "currentEstimate": 1700000,
    "lastSoldPrice": 1550000,
    "lastSoldDate": "January 2024",
    "description": "Brief description of current state",
    "schools": [
      {"name": "Mar Vista Elementary", "type": "elementary", "rating": 7, "distance": "0.3 mi"},
      {"name": "Mark Twain Middle School", "type": "middle", "rating": 6, "distance": "0.8 mi"}
    ],
    "walkScores": {"walkScore": 72, "transitScore": 45, "bikeScore": 68},
    "crimeStats": {"overallRating": "low", "description": "Safe neighborhood with low crime rates"},
    "hazardRisk": {"floodZone": "Zone X", "floodRisk": "minimal", "fireRisk": "low", "earthquakeRisk": "moderate", "insuranceImplications": "Standard insurance rates apply"},
    "permitHistory": [
      {"date": "2022", "type": "Renovation", "description": "Kitchen remodel", "value": 45000, "status": "Completed"}
    ],
    "propertyTaxAnnual": 15500,
    "propertyTaxRate": 1.12,
    "rentalPotential": {"estimatedMonthlyRent": 4500, "annualRentalIncome": 54000, "capRate": 3.2, "marketRentRange": {"low": 4000, "high": 5000}}
  },

  "neighborhoodContext": {
    "name": "Mar Vista",
    "description": "Walkable, near beach, rising market",
    "medianHomePrice": 1500000,
    "pricePerSqft": 900,
    "marketTrend": "Appreciating 5-8% annually",
    "nearbyAmenities": ["Abbot Kinney", "Beach", "Shopping"]
  },
  "renovationAnalysis": {
    "verdict": "Strong Investment | Marginal | Poor Investment",
    "reasoning": "Explanation of why this is/isn't a good investment",
    "bestStrategy": "Major expansion | ADU addition | Cosmetic flip | Hold",
    "projects": [
      {
        "name": "Major Expansion to 3000 sqft",
        "description": "A comprehensive, highly detailed strategic narrative detailing exactly what this expansion entails. It should cover the architectural additions, layout changes, and why this specific neighborhood supports a 3000 sqft home. This must read like an expert investor's detailed thesis, explaining exactly where the value is unlocked and how the design fits the market.",
        "sqftAdded": 1800,
        "newTotalSqft": 3000,
        "estimatedCost": {
          "low": 800000,
          "medium": 900000,
          "high": 1100000
        },
        "costPerSqft": 500,
        "estimatedValueAdd": {
          "low": 1300000,
          "medium": 1600000,
          "high": 1800000
        },
        "targetSalePrice": 3300000,
        "potentialProfit": {
          "gross": 700000,
          "net": 500000
        },
        "roi": 55,
        "maxPurchasePrice": 2200000,
        "timeline": "18-24 months including permits",
        "feasibility": "High - deep lot provides expansion room",
        "risks": ["Permit delays", "Construction cost overruns", "Market changes"],
        "steps": ["Architectural plans", "Permit application", "Construction", "Finishing"],
        "valueDrivers": ["Modernizes 1960s layout", "Creates open concept flow", "Adds highly-demanded 4th bedroom"],
        "targetDemographic": "Growing families and upgrading professionals",
        "targetComparables": [
          {
            "address": "123 Target ARV St, Los Angeles",
            "beds": 4,
            "baths": 3,
            "sqft": 3000,
            "price": 3500000,
            "pricePsf": 1166,
            "saleDate": "2024",
            "distanceMiles": 0.2
          }
        ],
        "financialStressTest": {
          "sensitivityTable": [
            {"costChange": "-10%", "priceChange": "-5%", "netProfit": 450000},
            {"costChange": "0%", "priceChange": "0%", "netProfit": 500000},
            {"costChange": "+10%", "priceChange": "+5%", "netProfit": 550000}
          ]
        }
      },
      {
        "name": "ADU Addition (400 sqft)",
        "description": "A detailed strategic breakdown of the ADU construction plan, including placement, target renter demographics, and how the detached structure impacts the primary residence's lot utilization and overall resale appeal.",
        "sqftAdded": 400,
        "newTotalSqft": 1600,
        "estimatedCost": {
          "low": 150000,
          "medium": 200000,
          "high": 250000
        },
        "costPerSqft": 500,
        "estimatedValueAdd": {
          "low": 200000,
          "medium": 300000,
          "high": 400000
        },
        "targetSalePrice": 2000000,
        "potentialProfit": {
          "gross": 100000,
          "net": 50000
        },
        "roi": 25,
        "maxPurchasePrice": 1650000,
        "timeline": "8-12 months",
        "feasibility": "Medium - requires sufficient lot space",
        "risks": ["Permit complexity", "Utility connections"],
        "steps": ["Design", "Permits", "Construction", "Finishing"],
        "valueDrivers": ["Creates passive rental income stream", "Maximizes unused backyard space", "Increases multi-generational housing appeal"],
        "targetDemographic": "House hackers and investors"
      }
    ],
    "ownerAnalysis": {
      "purchasePrice": 1550000,
      "currentEquity": 150000,
      "bestProjectForOwner": "Major Expansion",
      "projectedNetProfit": 500000,
      "recommendation": "If you bought at $1.55M, the expansion yields $500K net profit"
    },
    "investorAnalysis": {
      "maxPurchasePriceForProfit": 2200000,
      "targetProfit": 300000,
      "breakEvenPrice": 2500000,
      "recommendation": "Purchase under $2.2M for 15%+ profit margin after renovation"
    },
    "importantConsiderations": [
      "LA permitting takes 6-12 months",
      "5-6% closing costs on sale",
      "Holding costs during construction"
    ]
  },
  "moduleData": {
    "hbuConclusion": "Luxury Estate Expansion + Detached ADU",
    "hbuFilterReasoning": "In a market with a lack of new supply for high-square-footage homes, creating a compound captures a buyer pool that a standard 3BR home cannot, outperforming a standard Lot Split or Cosmetic flip.",
    "renovationSpecifications": {
      "proposedGlaIncrease": "Expand primary residence by 1,500 sq ft to create a 4,500 sq ft main house plus a 1,000 sq ft ADU",
      "highValueAdditions": [
        "Chef's Kitchen with Indoor/Outdoor flow",
        "Primary Suite Wing",
        "Resort-style pool house"
      ]
    },
    "yieldArbitrage": [
      {"strategy": "Cosmetic Flip", "projectedRoi": "15%", "equityDelta": "+$180,000"},
      {"strategy": "Hold & Rent", "projectedRoi": "3.4% Cap", "equityDelta": "N/A"},
      {"strategy": "HBU Compound (Expansion + ADU)", "projectedRoi": "64%", "equityDelta": "+$2.3M"}
    ],
    "marketHedge2026": "By adding density (ADU) and luxury square footage, you create immediate equity that far outpaces the slow-growth market... manufacturing appreciation rather than waiting for it.",
    "macroThesis": {
      "momentumScore": 8,
      "gentrificationTrend": "Accelerating",
      "sustainabilitySummary": "High demand for $3M+ homes due to tech expansion"
    },
    "zoningEnvelope": {
      "classification": "R1-1",
      "far": "45%",
      "maxHeight": "30ft",
      "setbacks": {"front": "20ft", "side": "5ft", "rear": "15ft"},
      "buildByRight": {"adu": true, "jadu": true, "sb9": false}
    },
    "siteViability": {
      "floodZone": "X",
      "fireRisk": "Low",
      "seismicRisk": "High",
      "topography": "Flat",
      "infrastructure": "Sewer/Water Mains Connected, 200A Electrical Upgrade Required"
    },
    "marketVelocity": {
      "absorptionRate": "25%",
      "averageDOM": 14
    },
    "entitlementTimeline": {
      "architecturalDrafting": "4 weeks",
      "cityZoningReview": "8 weeks",
      "structuralEngineering": "4 weeks",
      "permitIssuance": "16 weeks total"
    },
    "preConstructionBudget": {
      "cityImpactFees": 12000,
      "schoolFees": 4500,
      "architecturalDrafting": 15000,
      "engineering": 8000
    }
  },
  "sources": ["Redfin", "Zillow", "Public records", "MLS data"]
}
\`\`\`

Be thorough and use real data from your search. 

CRITICAL DATA INTEGRITY RULES:
- Only return data you can verify from actual sources (Redfin, Zillow, public records, MLS)
- Do NOT make up or estimate property prices, sqft, or sale data
- If you cannot find verified property data, set "dataNotFound": true in the response
- All comparable sales must be real properties with verifiable sale prices
- Cost estimates for renovations can use industry standards but must be labeled as estimates`;

  try {
    const client = getClient();
    console.log('🌐 Sending request to Gemini with Google Search grounding...');

    const response = await client.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`⏱️ Research completed in ${elapsed}s`);

    let responseText = '';
    if (typeof response.text === 'string') {
      responseText = response.text;
    } else if ((response as any).response?.candidates?.[0]?.content?.parts?.[0]?.text) {
      responseText = (response as any).response.candidates[0].content.parts[0].text;
    } else if ((response as any).candidates?.[0]?.content?.parts?.[0]?.text) {
      responseText = (response as any).candidates[0].content.parts[0].text;
    }

    console.log(`\n📝 Response length: ${responseText.length} characters`);

    const groundingMetadata = (response as any).candidates?.[0]?.groundingMetadata;
    if (groundingMetadata) {
      console.log('\n📚 GROUNDING SOURCES:');
      if (groundingMetadata.groundingChunks) {
        const chunks = groundingMetadata.groundingChunks;
        console.log(`  Found ${chunks.length} grounding sources`);
        chunks.slice(0, 5).forEach((chunk: any, i: number) => {
          if (chunk.web?.uri) {
            console.log(`  ${i + 1}. ${chunk.web.uri}`);
          }
        });
      }
      if (groundingMetadata.webSearchQueries) {
        console.log('\n🔍 Search queries used:');
        groundingMetadata.webSearchQueries.forEach((query: string, i: number) => {
          console.log(`  ${i + 1}. ${query}`);
        });
      }
    }

    console.log('Creates response text:', responseText);
    const parsed = parseJsonFromResponse(responseText);

    if (!parsed) {
      throw new Error('Failed to parse JSON from Gemini response');
    }

    // Validate critical fields - fail if data wasn't found
    if (parsed.dataNotFound === true) {
      throw new Error('PROPERTY_NOT_FOUND: Could not find verified data for this property. Please check the address and try again.');
    }

    // Validate required property data fields
    if (!parsed.propertyData || !parsed.propertyData.address) {
      throw new Error('INVALID_DATA: Property address not found in research results');
    }

    if (!parsed.propertyData.sqft || parsed.propertyData.sqft <= 0) {
      throw new Error('INVALID_DATA: Property square footage not found - cannot provide accurate analysis');
    }

    if (!parsed.propertyData.currentEstimate || parsed.propertyData.currentEstimate <= 0) {
      throw new Error('INVALID_DATA: Could not determine property value - cannot provide accurate analysis');
    }

    // Validate minimum 2 renovation projects - fail if not provided
    if (!parsed.renovationAnalysis?.projects || parsed.renovationAnalysis.projects.length < 2) {
      throw new Error('INVALID_DATA: At least 2 renovation opportunities are required for analysis. Please try a different property.');
    }

    const sources = extractSources(groundingMetadata);

    console.log('\n✅ Successfully parsed property research data');
    console.log(`📊 Property: ${parsed.propertyData?.address}`);
    console.log(`💰 Estimated value: $${parsed.propertyData?.currentEstimate?.toLocaleString()}`);
    console.log(`🏠 Comparables found: ${parsed.comparables?.length || 0}`);
    console.log(`🔨 Renovation projects: ${parsed.renovationAnalysis?.projects?.length || 0}`);
    console.log(`📈 Verdict: ${parsed.renovationAnalysis?.verdict}`);

    return {
      propertyData: parsed.propertyData,
      comparables: parsed.comparables || [],
      neighborhoodContext: parsed.neighborhoodContext || {},
      renovationAnalysis: parsed.renovationAnalysis || {},
      moduleData: parsed.moduleData,
      sources,
      rawAnalysis: responseText
    } as PropertyResearchResult;

  } catch (error) {
    console.error('❌ Gemini research failed:', error);
    throw new Error(`Property research failed: ${(error as Error).message}`);
  }
}

function parseJsonFromResponse(text: string): any {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]);
    } catch (e) {
      console.log('Failed to parse fenced JSON, trying raw extraction...');
    }
  }

  try {
    const jsonObjMatch = text.match(/\{[\s\S]*"propertyData"[\s\S]*\}/);
    if (jsonObjMatch) {
      return JSON.parse(jsonObjMatch[0]);
    }
  } catch (e) {
    console.log('Failed to parse raw JSON object');
  }

  return null;
}

function extractSources(groundingMetadata: any): string[] {
  const sources: string[] = [];

  if (groundingMetadata?.groundingChunks) {
    for (const chunk of groundingMetadata.groundingChunks) {
      if (chunk.web?.uri) {
        try {
          const url = new URL(chunk.web.uri);
          const domain = url.hostname.replace('www.', '');
          if (!sources.includes(domain)) {
            sources.push(domain);
          }
        } catch {
          sources.push(chunk.web.uri);
        }
      }
    }
  }

  return sources.slice(0, 10);
}

export function convertToPropertyData(research: PropertyResearchResult): any {
  const pd = research.propertyData;
  return {
    address: pd.address,
    price: pd.currentEstimate,
    beds: pd.beds,
    baths: pd.baths,
    sqft: pd.sqft,
    yearBuilt: pd.yearBuilt,
    lotSize: pd.lotSize,
    description: pd.description,
    images: [],
    redfinEstimate: pd.currentEstimate,
    lastSoldPrice: pd.lastSoldPrice,
    lastSoldDate: pd.lastSoldDate,
    // Enhanced property data
    schools: pd.schools,
    walkScores: pd.walkScores,
    crimeStats: pd.crimeStats,
    hazardRisk: pd.hazardRisk,
    permitHistory: pd.permitHistory,
    propertyTaxAnnual: pd.propertyTaxAnnual,
    propertyTaxRate: pd.propertyTaxRate,
    rentalPotential: pd.rentalPotential,
  };
}

export function convertToRenovationProjects(research: PropertyResearchResult): any[] {
  const projects = research.renovationAnalysis?.projects || [];

  return projects.map((project, index) => ({
    id: `gemini-${index + 1}`,
    name: project.name,
    description: project.description,
    detailedDescription: project.description,
    costRangeLow: project.estimatedCost.low,
    costRangeHigh: project.estimatedCost.high,
    valueAdd: project.estimatedValueAdd.medium,
    roi: project.roi,
    timeline: project.timeline,
    priority: index + 1,
    sqftAdded: project.sqftAdded,
    newTotalSqft: project.newTotalSqft,
    costPerSqft: project.costPerSqft,
    postRenovationValue: project.targetSalePrice,
    feasibility: project.feasibility,
    potential_risks: project.risks,
    roadmap_steps: project.steps,
    value_drivers: project.valueDrivers,
    target_demographic: project.targetDemographic,
    targetComparables: project.targetComparables,
    financialStressTest: project.financialStressTest,
  }));
}

export function convertToComparables(research: PropertyResearchResult): any[] {
  return research.comparables.map(comp => ({
    address: comp.address,
    price: comp.price,
    beds: comp.beds,
    baths: comp.baths,
    sqft: comp.sqft,
    pricePsf: comp.pricePsf,
    saleDate: comp.saleDate,
    distanceFromSubject: comp.distanceMiles ? `${comp.distanceMiles} miles` : undefined,
  }));
}
