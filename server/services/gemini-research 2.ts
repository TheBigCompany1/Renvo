import { GoogleGenAI } from "@google/genai";

const client = new GoogleGenAI({ 
  apiKey: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "" 
});

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
  sources: string[];
  rawAnalysis: string;
}

export async function researchProperty(addressOrUrl: string): Promise<PropertyResearchResult> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔬 GEMINI RESEARCH - Starting property analysis`);
  console.log(`📍 Input: ${addressOrUrl}`);
  console.log(`${'='.repeat(60)}\n`);

  const startTime = Date.now();

  const prompt = `You are an expert real estate investment analyst. Research and analyze this property for renovation potential.

Property: ${addressOrUrl}

RESEARCH TASKS:
1. Find the property's current details (beds, baths, sqft, lot size, year built, current estimated value, last sale price/date)
2. Find 3-5 comparable sales in the same neighborhood (recently sold properties with similar characteristics)
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
  "comparables": [
    {
      "address": "123 Example St, Los Angeles, CA 90066",
      "beds": 4,
      "baths": 3,
      "sqft": 3200,
      "price": 3500000,
      "pricePsf": 1094,
      "saleDate": "2024",
      "distanceMiles": 0.1,
      "notes": "Same block, expanded to 3200 sqft"
    }
  ],
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
        "description": "Add 1800 sqft via second story and rear addition",
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
        "steps": ["Architectural plans", "Permit application", "Construction", "Finishing"]
      },
      {
        "name": "ADU Addition (400 sqft)",
        "description": "Build detached ADU for rental income or resale value",
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
        "steps": ["Design", "Permits", "Construction", "Finishing"]
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
