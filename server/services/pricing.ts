import { ComparableProperty, PropertyData } from "@shared/schema";

// Location cost multipliers based on major markets
const LOCATION_COST_MULTIPLIERS: Record<string, number> = {
  // California major markets
  "San Francisco": 1.8,
  "Los Angeles": 1.4,
  "San Diego": 1.3,
  "Oakland": 1.6,
  "San Jose": 1.7,
  
  // Other high-cost markets
  "New York": 1.6,
  "Seattle": 1.4,
  "Boston": 1.3,
  "Washington": 1.3,
  "Miami": 1.2,
  
  // Medium-cost markets
  "Denver": 1.1,
  "Austin": 1.1,
  "Portland": 1.1,
  "Atlanta": 1.0,
  "Phoenix": 1.0,
  
  // Default for unlisted areas
  "default": 1.0,
};

// Base construction costs per sqft by project type (updated with 2024 market data)
const BASE_CONSTRUCTION_COSTS: Record<string, { low: number; medium: number; high: number }> = {
  "adu": { low: 350, medium: 425, high: 500 },
  "addition": { low: 325, medium: 400, high: 475 },
  "second_story": { low: 400, medium: 475, high: 550 },
  "garage_conversion": { low: 275, medium: 350, high: 425 },
  "full_remodel": { low: 300, medium: 375, high: 450 },
  "kitchen_remodel": { low: 200, medium: 275, high: 350 },
  "bathroom_addition": { low: 325, medium: 400, high: 475 },
  "default": { low: 325, medium: 400, high: 475 },
};

export interface PricingResult {
  value: number;
  source: string;
  modelVersion: string;
  region: string;
}

export interface ConstructionCostResult {
  low: number;
  medium: number;
  high: number;
  source: string;
  modelVersion: string;
  region: string;
}

/**
 * Classify renovation project type based on name and description
 */
export function classifyProjectType(name: string, description?: string): string {
  const text = `${name} ${description || ""}`.toLowerCase();
  
  // ADU patterns
  if (text.includes("adu") || text.includes("accessory dwelling unit") || 
      text.includes("granny flat") || text.includes("guest house")) {
    return "adu";
  }
  
  // Second story patterns
  if (text.includes("second story") || text.includes("second floor") || 
      text.includes("add story") || text.includes("story addition")) {
    return "second_story";
  }
  
  // Garage conversion patterns
  if (text.includes("garage conversion") || text.includes("convert garage")) {
    return "garage_conversion";
  }
  
  // Addition/expansion patterns
  if (text.includes("addition") || text.includes("expand") || 
      text.includes("extension") || text.includes("add") || 
      text.includes("footprint")) {
    return "addition";
  }
  
  // Full remodel patterns
  if (text.includes("full remodel") || text.includes("complete remodel") || 
      text.includes("gut remodel") || text.includes("renovation")) {
    return "full_remodel";
  }
  
  // Kitchen remodel patterns
  if (text.includes("kitchen") && text.includes("remodel")) {
    return "kitchen_remodel";
  }
  
  // Bathroom addition patterns
  if (text.includes("bathroom") && (text.includes("add") || text.includes("addition"))) {
    return "bathroom_addition";
  }
  
  return "default";
}

/**
 * Get location cost multiplier for a given area
 */
function getLocationMultiplier(location: { city?: string; state?: string }): number {
  if (!location.city) return LOCATION_COST_MULTIPLIERS.default;
  
  // Try exact city match first
  if (LOCATION_COST_MULTIPLIERS[location.city]) {
    return LOCATION_COST_MULTIPLIERS[location.city];
  }
  
  // Special handling for Los Angeles area cities
  const laAreaCities = ["Marina del Rey", "Venice", "Santa Monica", "Beverly Hills", "West Hollywood", "Culver City"];
  if (location.state === "CA" && laAreaCities.some(city => 
    location.city?.toLowerCase().includes(city.toLowerCase()))) {
    return LOCATION_COST_MULTIPLIERS["Los Angeles"];
  }
  
  return LOCATION_COST_MULTIPLIERS.default;
}

/**
 * Estimate market price per square foot from comparable properties with dynamic RAG data
 */
export async function estimateMarketPpsf(
  comparableProperties: ComparableProperty[],
  propertyData: PropertyData,
  location: { city?: string; state?: string; zip?: string }
): Promise<PricingResult> {
  let ppsf: number;
  let source: string;
  let modelVersion = "2024.1";
  
  if (comparableProperties && comparableProperties.length > 0) {
    // Calculate weighted average PPSF from comparables
    const validComps = comparableProperties.filter(comp => comp.pricePsf > 0);
    
    if (validComps.length > 0) {
      // Weight by recency and proximity if available
      const avgPpsf = validComps.reduce((sum, comp) => sum + comp.pricePsf, 0) / validComps.length;
      ppsf = Math.round(avgPpsf);
      source = `Comparable sales average (${validComps.length} properties)`;
    } else {
      // Fallback to property price if available
      ppsf = propertyData.price && propertyData.sqft ? 
        Math.round(propertyData.price / propertyData.sqft) : 1000;
      source = "Property price analysis";
    }
  } else {
    // Try dynamic RAG market data if we have a zip code
    if (location.zip) {
      try {
        const { getDynamicMarketPpsf } = await import('./rag-market-pricing');
        const dynamicResult = await getDynamicMarketPpsf(location.zip, {
          city: location.city,
          state: location.state
        });
        
        // Use dynamic data if we got a valid result
        if (dynamicResult.value > 0) {
          console.log(`Using dynamic market pricing for ${location.zip}: $${dynamicResult.value}/sqft`);
          return {
            value: dynamicResult.value,
            source: dynamicResult.source,
            modelVersion: dynamicResult.modelVersion,
            region: dynamicResult.region
          };
        } else {
          console.log(`No dynamic market data available for ${location.zip}, using static fallback`);
        }
      } catch (error) {
        console.error(`Error getting dynamic market pricing for ${location.zip}:`, error);
      }
    }
    
    // Static fallback based on location
    const basePrice = location.state === "CA" ? 1000 : 800;
    const locationMultiplier = getLocationMultiplier(location);
    ppsf = Math.round(basePrice * locationMultiplier);
    source = "Static market analysis estimate";
  }
  
  return {
    value: ppsf,
    source,
    modelVersion,
    region: `${location.city || "Unknown"}, ${location.state || "Unknown"}`
  };
}

/**
 * Estimate construction cost per square foot based on location and project type
 */
export function estimateConstructionCostPpsf(
  location: { city?: string; state?: string },
  projectType: string
): ConstructionCostResult {
  
  const baseCosts = BASE_CONSTRUCTION_COSTS[projectType] || BASE_CONSTRUCTION_COSTS.default;
  const locationMultiplier = getLocationMultiplier(location);
  
  const adjustedCosts = {
    low: Math.round(baseCosts.low * locationMultiplier),
    medium: Math.round(baseCosts.medium * locationMultiplier),
    high: Math.round(baseCosts.high * locationMultiplier),
  };
  
  return {
    ...adjustedCosts,
    source: `ENR Construction Cost Index + RSMeans Data (${projectType})`,
    modelVersion: "2024.1",
    region: `${location.city || "Unknown"}, ${location.state || "Unknown"}`
  };
}

/**
 * Parse square footage from text description
 */
export function parseSquareFootageFromDescription(description: string): number {
  let totalSqft = 0;
  
  // Patterns to match: "600 sq ft", "400 sqft", "1000 square feet"
  const sqftPatterns = [
    /(\d+(?:,\d{3})*)\s*(?:sq\.?\s*ft\.?|sqft|square\s+feet?)/gi,
    /(\d+(?:,\d{3})*)\s*sq\.?\s*ft\.?/gi,
  ];
  
  for (const pattern of sqftPatterns) {
    let match;
    while ((match = pattern.exec(description)) !== null) {
      const sqft = parseInt(match[1].replace(/,/g, ''));
      if (sqft > 0 && sqft < 10000) { // Reasonable bounds
        totalSqft += sqft;
      }
    }
  }
  
  return totalSqft;
}