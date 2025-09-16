import { ComparableProperty, PropertyData } from "@shared/schema";
import { PricingResult, ConstructionCostResult, classifyProjectType, estimateConstructionCostPpsf } from "./pricing";

// Enhanced interfaces for aggregated pricing
export interface AggregatedPricingResult {
  construction: {
    low: number;
    medium: number;
    high: number;
    confidence: number;
    source: string;
    dataFreshness: 'current' | 'recent' | 'stale' | 'static';
    methodology: string;
  };
  market: {
    ppsf: number;
    confidence: number;
    source: string;
    dataFreshness: 'current' | 'recent' | 'stale' | 'static';
    methodology: string;
  };
  overall: {
    confidence: number;
    strategy: string;
    rationale: string;
    crossValidationStatus: 'validated' | 'caution' | 'conflict' | 'unknown';
  };
  metadata: {
    zipCode: string;
    projectType: string;
    region: string;
    timestamp: Date;
    fallbacksUsed: string[];
    dataSourcesQueried: string[];
  };
}

export interface DataSourceResult {
  available: boolean;
  confidence: number;
  freshness: 'current' | 'recent' | 'stale' | 'static';
  source: string;
  data?: any;
  error?: string;
}

interface ConfidenceFactors {
  sourceAuthority: number;    // 0-0.3 based on data source reliability
  dataFreshness: number;      // 0-0.2 based on how recent data is
  sampleSize: number;         // 0-0.2 based on number of data points
  crossValidation: number;    // 0-0.3 based on consistency across sources
}

/**
 * Main aggregator function that combines multiple pricing data sources
 */
export async function getAggregatedPricing(
  zipCode: string,
  projectType: string,
  location: { city?: string; state?: string; zip?: string },
  comparableProperties?: ComparableProperty[],
  propertyData?: PropertyData
): Promise<AggregatedPricingResult> {
  
  const startTime = Date.now();
  const dataSourcesQueried: string[] = [];
  const fallbacksUsed: string[] = [];
  
  console.log(`🏗️ Starting aggregated pricing analysis for ${zipCode}, project: ${projectType}`);
  
  // Query all available data sources in parallel
  const [ragConstruction, ragMarket, staticConstruction] = await Promise.allSettled([
    queryRAGConstructionData(zipCode, projectType),
    queryRAGMarketData(zipCode, location),
    queryStaticConstructionData(projectType, location)
  ]);
  
  dataSourcesQueried.push('rag_construction', 'rag_market', 'static_construction');
  
  // Process results and calculate confidence scores
  const constructionData = await selectBestConstructionPricing(
    ragConstruction,
    staticConstruction,
    projectType,
    location,
    fallbacksUsed
  );
  
  const marketData = await selectBestMarketPricing(
    ragMarket,
    zipCode,
    location,
    fallbacksUsed,
    comparableProperties,
    propertyData
  );
  
  // Cross-validate pricing consistency
  const crossValidation = validatePricingConsistency(
    constructionData.medium,
    marketData.ppsf
  );
  
  // Calculate overall confidence and strategy
  const overallConfidence = calculateOverallConfidence(
    constructionData.confidence,
    marketData.confidence,
    crossValidation.isValid
  );
  
  const strategy = determineStrategy(constructionData, marketData);
  const rationale = generateRationale(constructionData, marketData, crossValidation);
  
  const elapsedTime = Date.now() - startTime;
  console.log(`📊 Aggregated pricing completed in ${elapsedTime}ms - Strategy: ${strategy}, Confidence: ${(overallConfidence * 100).toFixed(1)}%`);
  
  return {
    construction: constructionData,
    market: marketData,
    overall: {
      confidence: overallConfidence,
      strategy,
      rationale,
      crossValidationStatus: crossValidation.status
    },
    metadata: {
      zipCode,
      projectType,
      region: `${location.city || 'Unknown'}, ${location.state || 'Unknown'}`,
      timestamp: new Date(),
      fallbacksUsed,
      dataSourcesQueried
    }
  };
}

/**
 * Query RAG construction data with error handling
 */
async function queryRAGConstructionData(zipCode: string, projectType: string): Promise<DataSourceResult> {
  try {
    const { getDynamicConstructionCosts } = await import('./rag-pricing');
    
    const result = await getDynamicConstructionCosts(zipCode, projectType);
    
    if (result && result.medium > 0) {
      return {
        available: true,
        confidence: (result as any).confidenceScore || 0.7,
        freshness: determineFreshness(result.source),
        source: `RAG Construction (${result.source})`,
        data: result
      };
    } else {
      return {
        available: false,
        confidence: 0,
        freshness: 'stale',
        source: 'RAG Construction',
        error: 'No valid construction cost data returned'
      };
    }
  } catch (error) {
    console.warn(`RAG construction data query failed for ${zipCode}:`, error);
    return {
      available: false,
      confidence: 0,
      freshness: 'stale',
      source: 'RAG Construction',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Query RAG market data with error handling
 */
async function queryRAGMarketData(zipCode: string, location: { city?: string; state?: string }): Promise<DataSourceResult> {
  try {
    const { getDynamicMarketPpsf } = await import('./rag-market-pricing');
    
    const result = await getDynamicMarketPpsf(zipCode, location);
    
    if (result && result.value > 0) {
      return {
        available: true,
        confidence: (result as any).confidenceScore || 0.7,
        freshness: determineFreshness(result.source),
        source: `RAG Market (${result.source})`,
        data: result
      };
    } else {
      return {
        available: false,
        confidence: 0,
        freshness: 'stale',
        source: 'RAG Market',
        error: 'No valid market data returned'
      };
    }
  } catch (error) {
    console.warn(`RAG market data query failed for ${zipCode}:`, error);
    return {
      available: false,
      confidence: 0,
      freshness: 'stale',
      source: 'RAG Market',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Query static construction data as fallback
 */
async function queryStaticConstructionData(
  projectType: string, 
  location: { city?: string; state?: string }
): Promise<DataSourceResult> {
  try {
    const result = estimateConstructionCostPpsf(location, projectType);
    
    return {
      available: true,
      confidence: 0.4, // Lower confidence for static data
      freshness: 'static',
      source: `Static Construction (${result.source})`,
      data: result
    };
  } catch (error) {
    console.warn(`Static construction data query failed:`, error);
    return {
      available: false,
      confidence: 0,
      freshness: 'stale',
      source: 'Static Construction',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Select the best construction pricing strategy based on available data
 */
async function selectBestConstructionPricing(
  ragResult: PromiseSettledResult<DataSourceResult>,
  staticResult: PromiseSettledResult<DataSourceResult>,
  projectType: string,
  location: { city?: string; state?: string },
  fallbacksUsed: string[]
): Promise<AggregatedPricingResult['construction']> {
  
  // Try RAG data first
  if (ragResult.status === 'fulfilled' && ragResult.value.available) {
    const data = ragResult.value.data;
    // RAG data structure has direct low/medium/high properties
    const costs = data;
    return {
      low: costs.low,
      medium: costs.medium,
      high: costs.high,
      confidence: ragResult.value.confidence,
      source: ragResult.value.source,
      dataFreshness: ragResult.value.freshness,
      methodology: 'RAG-enhanced web search with ML extraction'
    };
  } else {
    fallbacksUsed.push('construction_rag_to_static');
  }
  
  // Fallback to static data
  if (staticResult.status === 'fulfilled' && staticResult.value.available) {
    const data = staticResult.value.data;
    return {
      low: data.low,
      medium: data.medium,
      high: data.high,
      confidence: staticResult.value.confidence,
      source: staticResult.value.source,
      dataFreshness: staticResult.value.freshness,
      methodology: 'Static lookup with location multipliers'
    };
  } else {
    fallbacksUsed.push('construction_static_to_emergency');
  }
  
  // Emergency fallback - hardcoded values
  const emergencyMultiplier = location.state === 'CA' ? 1.4 : 1.0;
  return {
    low: Math.round(225 * emergencyMultiplier),
    medium: Math.round(275 * emergencyMultiplier),
    high: Math.round(350 * emergencyMultiplier),
    confidence: 0.2,
    source: 'Emergency fallback (hardcoded national averages)',
    dataFreshness: 'static',
    methodology: 'Emergency hardcoded values with basic location adjustment'
  };
}

/**
 * Select the best market pricing strategy based on available data
 */
async function selectBestMarketPricing(
  ragResult: PromiseSettledResult<DataSourceResult>,
  zipCode: string,
  location: { city?: string; state?: string },
  fallbacksUsed: string[],
  comparableProperties?: ComparableProperty[],
  propertyData?: PropertyData
): Promise<AggregatedPricingResult['market']> {
  
  // Try RAG market data first
  if (ragResult.status === 'fulfilled' && ragResult.value.available) {
    const data = ragResult.value.data;
    return {
      ppsf: data.value,
      confidence: ragResult.value.confidence,
      source: ragResult.value.source,
      dataFreshness: ragResult.value.freshness,
      methodology: 'RAG-enhanced real estate market search'
    };
  } else {
    fallbacksUsed.push('market_rag_to_comparables');
  }
  
  // Fallback to comparable properties
  if (comparableProperties && comparableProperties.length > 0) {
    const validComps = comparableProperties.filter(comp => comp.pricePsf > 0);
    if (validComps.length > 0) {
      const avgPpsf = validComps.reduce((sum, comp) => sum + comp.pricePsf, 0) / validComps.length;
      return {
        ppsf: Math.round(avgPpsf),
        confidence: Math.min(0.6 + validComps.length * 0.05, 0.8), // Confidence increases with more comps
        source: `Comparable properties (${validComps.length} sales)`,
        dataFreshness: 'recent',
        methodology: 'Average price per sqft from comparable sales'
      };
    } else {
      fallbacksUsed.push('market_comparables_to_property');
    }
  } else {
    fallbacksUsed.push('market_rag_to_property');
  }
  
  // Fallback to property data
  if (propertyData && propertyData.price && propertyData.sqft) {
    const ppsf = Math.round(propertyData.price / propertyData.sqft);
    return {
      ppsf,
      confidence: 0.5,
      source: 'Subject property analysis',
      dataFreshness: 'current',
      methodology: 'Price per sqft calculated from subject property'
    };
  } else {
    fallbacksUsed.push('market_property_to_emergency');
  }
  
  // Emergency fallback - location-based estimates
  const basePrice = location.state === 'CA' ? 1000 : 800;
  const cityMultiplier = getCityMultiplier(location.city);
  const emergencyPpsf = Math.round(basePrice * cityMultiplier);
  
  return {
    ppsf: emergencyPpsf,
    confidence: 0.2,
    source: 'Emergency fallback (location-based estimate)',
    dataFreshness: 'static',
    methodology: 'Hardcoded regional estimates'
  };
}

/**
 * Calculate confidence score based on multiple factors
 */
export function calculateConfidenceScore(
  sourceAuthority: number,
  dataFreshness: number,
  sampleSize: number,
  crossValidation: number
): number {
  const factors: ConfidenceFactors = {
    sourceAuthority: Math.min(sourceAuthority, 0.3),
    dataFreshness: Math.min(dataFreshness, 0.2),
    sampleSize: Math.min(sampleSize, 0.2),
    crossValidation: Math.min(crossValidation, 0.3)
  };
  
  const totalScore = Object.values(factors).reduce((sum, score) => sum + score, 0);
  return Math.min(totalScore, 1.0);
}

/**
 * Validate pricing consistency between construction costs and market values
 */
export function validatePricingConsistency(
  constructionCostPsf: number,
  marketPpsf: number
): { isValid: boolean; ratio: number; status: 'validated' | 'caution' | 'conflict' | 'unknown' } {
  
  if (!constructionCostPsf || !marketPpsf || constructionCostPsf <= 0 || marketPpsf <= 0) {
    return { isValid: false, ratio: 0, status: 'unknown' };
  }
  
  const ratio = marketPpsf / constructionCostPsf;
  
  // Typical market to construction ratios
  if (ratio >= 1.5 && ratio <= 4.0) {
    return { isValid: true, ratio, status: 'validated' };
  } else if (ratio >= 1.2 && ratio <= 5.0) {
    return { isValid: true, ratio, status: 'caution' };
  } else {
    return { isValid: false, ratio, status: 'conflict' };
  }
}

/**
 * Select the best pricing strategy based on available data
 */
export function selectBestPricingStrategy(availableData: DataSourceResult[]): {
  primary: DataSourceResult | null;
  secondary: DataSourceResult | null;
  rationale: string;
} {
  
  // Sort by confidence score
  const sorted = availableData
    .filter(data => data.available)
    .sort((a, b) => b.confidence - a.confidence);
  
  if (sorted.length === 0) {
    return {
      primary: null,
      secondary: null,
      rationale: 'No valid data sources available'
    };
  }
  
  const primary = sorted[0];
  const secondary = sorted.length > 1 ? sorted[1] : null;
  
  const rationale = `Selected ${primary.source} (confidence: ${(primary.confidence * 100).toFixed(1)}%) as primary source` +
    (secondary ? ` with ${secondary.source} (confidence: ${(secondary.confidence * 100).toFixed(1)}%) as validation` : '');
  
  return { primary, secondary, rationale };
}

/**
 * Advanced pricing aggregation with ensemble methods
 */
export async function getEnsemblePricing(
  zipCode: string,
  projectType: string,
  location: { city?: string; state?: string; zip?: string },
  comparableProperties?: ComparableProperty[],
  propertyData?: PropertyData
): Promise<{
  construction: { low: number; medium: number; high: number; confidence: number };
  market: { ppsf: number; confidence: number };
  ensemble: { weightedConstruction: number; weightedMarket: number; overallConfidence: number };
}> {
  
  const aggregated = await getAggregatedPricing(zipCode, projectType, location, comparableProperties, propertyData);
  
  // Weighted ensemble calculation
  const constructionWeight = aggregated.construction.confidence;
  const marketWeight = aggregated.market.confidence;
  const totalWeight = constructionWeight + marketWeight;
  
  const weightedConstruction = aggregated.construction.medium;
  const weightedMarket = aggregated.market.ppsf;
  const overallConfidence = totalWeight / 2; // Average of both confidences
  
  return {
    construction: {
      low: aggregated.construction.low,
      medium: aggregated.construction.medium,
      high: aggregated.construction.high,
      confidence: aggregated.construction.confidence
    },
    market: {
      ppsf: aggregated.market.ppsf,
      confidence: aggregated.market.confidence
    },
    ensemble: {
      weightedConstruction,
      weightedMarket,
      overallConfidence
    }
  };
}

/**
 * Advanced cross-validation with multiple consistency checks
 */
export function performAdvancedCrossValidation(
  constructionCosts: { low: number; medium: number; high: number },
  marketPpsf: number,
  location: { city?: string; state?: string }
): {
  consistencyScore: number;
  warnings: string[];
  recommendations: string[];
  validationDetails: {
    costToValueRatio: number;
    marketMultiplier: number;
    locationAdjustment: number;
    confidenceBoost: number;
  };
} {
  
  const warnings: string[] = [];
  const recommendations: string[] = [];
  
  // Calculate ratios and multipliers
  const costToValueRatio = marketPpsf > 0 ? marketPpsf / constructionCosts.medium : 0;
  const marketMultiplier = getCityMultiplier(location.city);
  
  let consistencyScore = 0.5; // Base score
  let confidenceBoost = 0;
  
  // Ratio analysis
  if (costToValueRatio >= 1.5 && costToValueRatio <= 4.0) {
    consistencyScore += 0.3;
    confidenceBoost += 0.1;
  } else if (costToValueRatio >= 1.2 && costToValueRatio <= 5.0) {
    consistencyScore += 0.15;
    warnings.push(`Cost-to-value ratio (${costToValueRatio.toFixed(2)}) is outside optimal range (1.5-4.0)`);
  } else {
    warnings.push(`Significant inconsistency: cost-to-value ratio is ${costToValueRatio.toFixed(2)}`);
    recommendations.push('Review market pricing data for accuracy');
  }
  
  // Location consistency check
  const expectedMultiplier = marketMultiplier;
  if (location.state === 'CA' && costToValueRatio < 1.5) {
    warnings.push('Construction costs may be underestimated for California market');
    recommendations.push('Consider higher-end construction specifications for this market');
  }
  
  // Construction cost spread analysis
  const costSpread = (constructionCosts.high - constructionCosts.low) / constructionCosts.medium;
  if (costSpread > 0.8) {
    consistencyScore += 0.1;
  } else if (costSpread < 0.3) {
    warnings.push('Construction cost range appears narrow - consider market volatility');
  }
  
  // Final consistency score
  consistencyScore = Math.min(1.0, Math.max(0.1, consistencyScore));
  
  return {
    consistencyScore,
    warnings,
    recommendations,
    validationDetails: {
      costToValueRatio,
      marketMultiplier,
      locationAdjustment: expectedMultiplier,
      confidenceBoost
    }
  };
}

/**
 * Helper functions
 */
function determineFreshness(source: string): 'current' | 'recent' | 'stale' | 'static' {
  if (source.includes('2024') || source.includes('current') || source.includes('latest')) {
    return 'current';
  } else if (source.includes('2023') || source.includes('recent')) {
    return 'recent';
  } else if (source.includes('static') || source.includes('fallback')) {
    return 'static';
  } else {
    return 'stale';
  }
}

function getCityMultiplier(city?: string): number {
  if (!city) return 1.0;
  
  const cityMultipliers: Record<string, number> = {
    'San Francisco': 1.8,
    'Los Angeles': 1.4,
    'Seattle': 1.4,
    'New York': 1.6,
    'Boston': 1.3,
    'Marina del Rey': 1.4,
    'Venice': 1.4,
    'Santa Monica': 1.5
  };
  
  return cityMultipliers[city] || 1.0;
}

function calculateOverallConfidence(
  constructionConfidence: number,
  marketConfidence: number,
  crossValidated: boolean
): number {
  const baseConfidence = (constructionConfidence + marketConfidence) / 2;
  const crossValidationBonus = crossValidated ? 0.1 : -0.1;
  
  return Math.max(0.1, Math.min(0.95, baseConfidence + crossValidationBonus));
}

function determineStrategy(
  constructionData: AggregatedPricingResult['construction'],
  marketData: AggregatedPricingResult['market']
): string {
  if (constructionData.dataFreshness === 'current' && marketData.dataFreshness === 'current') {
    return 'RAG-Enhanced (High Confidence)';
  } else if (constructionData.dataFreshness !== 'static' || marketData.dataFreshness !== 'static') {
    return 'Hybrid RAG-Static (Medium Confidence)';
  } else {
    return 'Static Fallback (Low Confidence)';
  }
}

function generateRationale(
  constructionData: AggregatedPricingResult['construction'],
  marketData: AggregatedPricingResult['market'],
  crossValidation: { status: string; ratio: number }
): string {
  const parts = [
    `Construction: ${constructionData.source} (${(constructionData.confidence * 100).toFixed(1)}% confidence)`,
    `Market: ${marketData.source} (${(marketData.confidence * 100).toFixed(1)}% confidence)`,
    `Cross-validation: ${crossValidation.status}${crossValidation.ratio > 0 ? ` (ratio: ${crossValidation.ratio.toFixed(2)})` : ''}`
  ];
  
  return parts.join(' | ');
}