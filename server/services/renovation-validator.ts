import { RenovationProject, ComparableProperty, PropertyData, FinancialSummary } from "@shared/schema";
import { 
  estimateMarketPpsf, 
  estimateConstructionCostPpsf, 
  classifyProjectType, 
  parseSquareFootageFromDescription 
} from "./pricing";
import { getDynamicConstructionCosts } from "./rag-pricing";
import { 
  getAggregatedPricing, 
  getEnsemblePricing, 
  performAdvancedCrossValidation,
  AggregatedPricingResult 
} from "./pricing-aggregator";
import { calculateWeightedCurrentValue, getRoiStarRating } from "./location-comparables";

interface ValidationResult {
  correctedProjects: RenovationProject[];
  financialSummary: FinancialSummary;
  validationSummary: {
    totalCorrections: number;
    correctedProjectIds: string[];
    avgCostDelta: number;
    avgValueDelta: number;
  };
}

interface Location {
  city?: string;
  state?: string;
  zip?: string;
}

/**
 * Validate and correct renovation projects for mathematical consistency
 */
export async function validateRenovationProjects(
  projects: RenovationProject[],
  propertyData: PropertyData,
  comparableProperties: ComparableProperty[],
  location: Location
): Promise<ValidationResult> {
  
  const correctedProjects: RenovationProject[] = [];
  const validationStats: Array<{ costDelta: number; valueDelta: number }> = [];
  const correctedProjectIds: string[] = [];

  // Get aggregated pricing data with enhanced intelligence
  console.log(`🧠 Using intelligent pricing aggregator for validation in ${location.zip || 'unknown location'}`);
  
  // We'll get aggregated pricing for the primary project type to establish market baseline
  const primaryProjectType = projects.length > 0 ? classifyProjectType(projects[0].name, projects[0].description) : 'default';
  
  const aggregatedPricing = await getAggregatedPricing(
    location.zip || '90210', // fallback zip for API calls
    primaryProjectType,
    location,
    comparableProperties,
    propertyData
  );
  
  const marketPpsf = aggregatedPricing.market.ppsf;
  const marketPricingResult = {
    value: marketPpsf,
    source: aggregatedPricing.market.source,
    modelVersion: '2024.2-aggregated',
    region: aggregatedPricing.metadata.region
  };
  
  console.log(`💡 Aggregated pricing confidence: ${(aggregatedPricing.overall.confidence * 100).toFixed(1)}% | Strategy: ${aggregatedPricing.overall.strategy}`);

  for (const project of projects) {
    const correctedProject = await validateSingleProject(
      project, 
      propertyData, 
      marketPricingResult, 
      location,
      aggregatedPricing // Pass aggregated pricing for enhanced validation
    );
    
    correctedProjects.push(correctedProject);
    
    // Track validation statistics
    if (correctedProject.validation?.corrected) {
      correctedProjectIds.push(project.id);
      validationStats.push({
        costDelta: correctedProject.validation.costDeltaPct,
        valueDelta: correctedProject.validation.valueDeltaPct
      });
    }
  }

  // Sort projects by ROI and add star ratings and ranking
  const rankedProjects = sortProjectsByROI(correctedProjects);
  
  // Compute corrected financial summary using weighted comparables
  const financialSummary = computeFinancialSummary(
    rankedProjects, 
    propertyData, 
    marketPpsf,
    comparableProperties
  );

  // Calculate validation summary
  const validationSummary = {
    totalCorrections: correctedProjectIds.length,
    correctedProjectIds,
    avgCostDelta: validationStats.length > 0 ? 
      validationStats.reduce((sum, stat) => sum + Math.abs(stat.costDelta), 0) / validationStats.length : 0,
    avgValueDelta: validationStats.length > 0 ? 
      validationStats.reduce((sum, stat) => sum + Math.abs(stat.valueDelta), 0) / validationStats.length : 0
  };

  console.log(`⭐ Ranked ${rankedProjects.length} projects by ROI with star ratings`);

  return {
    correctedProjects: rankedProjects, // Return ranked projects with star ratings
    financialSummary,
    validationSummary
  };
}

/**
 * Validate and correct a single renovation project
 */
async function validateSingleProject(
  project: RenovationProject,
  propertyData: PropertyData,
  marketPricingResult: { value: number; source: string; modelVersion: string; region: string },
  location: Location,
  aggregatedPricing?: AggregatedPricingResult
): Promise<RenovationProject> {
  
  // Step 1: Dynamically determine NEW livable space being added
  // PRIORITY ORDER (most reliable to least):
  // 1. AI-provided sqftAdded (most accurate - AI analyzed the project)
  // 2. AI-provided newTotalSqft minus existing sqft
  // 3. Parsed from description (fallback)
  
  const projectType = classifyProjectType(project.name, project.description);
  
  console.log(`🏗️ Analyzing renovation project: ${project.name}`);
  console.log(`📐 Current property livable sqft: ${propertyData.sqft}`);
  console.log(`🤖 AI provided - sqftAdded: ${project.sqftAdded}, newTotalSqft: ${project.newTotalSqft}`);
  
  let sqftAdded: number;
  let sqftSource: string;
  
  // PRIORITY 1: Use AI's sqftAdded if provided and reasonable
  if (project.sqftAdded && project.sqftAdded > 0) {
    sqftAdded = project.sqftAdded;
    sqftSource = 'AI-provided sqftAdded';
    console.log(`✅ Using AI's sqft added: ${sqftAdded} sqft`);
  }
  // PRIORITY 2: Calculate from AI's newTotalSqft 
  else if (project.newTotalSqft && project.newTotalSqft > propertyData.sqft) {
    sqftAdded = project.newTotalSqft - propertyData.sqft;
    sqftSource = 'Calculated from AI newTotalSqft';
    console.log(`🧠 Calculated sqft added: ${project.newTotalSqft} - ${propertyData.sqft} = ${sqftAdded} sqft`);
  }
  // PRIORITY 3: Parse from description (fallback only)
  else {
    const fullDescription = `${project.name} ${project.description} ${project.detailedDescription || ""}`.toLowerCase();
    
    // Check if this involves converting non-livable space to livable space
    const conversionKeywords = ['convert', 'conversion', 'into', 'above', 'garage', 'attic', 'basement', 'shed'];
    const isConversion = conversionKeywords.some(keyword => fullDescription.includes(keyword));
    
    // Extract the largest square footage number from description (most likely the main addition)
    const sqftMatches = fullDescription.match(/(\d+(?:,\d{3})*)\s*(?:sq\.?\s*ft\.?|sqft|square\s+feet?)/gi) || [];
    const parsedSqftValues = sqftMatches.map(m => parseInt(m.replace(/[^\d]/g, ''))).filter(n => n > 100 && n < 10000);
    const largestParsedSqft = parsedSqftValues.length > 0 ? Math.max(...parsedSqftValues) : 0;
    
    if (largestParsedSqft > 0) {
      sqftAdded = largestParsedSqft;
      sqftSource = isConversion ? 'Parsed from description (conversion)' : 'Parsed from description';
      console.log(`📖 Parsed sqft from description: ${sqftAdded} sqft (${isConversion ? 'conversion' : 'addition'})`);
    } else {
      // Last resort: reasonable defaults for addition projects only
      const additionTypes = ["adu", "addition", "second_story", "garage_conversion"];
      sqftAdded = additionTypes.includes(projectType) ? 600 : 0;
      sqftSource = 'Default estimate';
      console.log(`⚠️ Using default estimate for ${projectType}: ${sqftAdded} sqft`);
    }
  }
  
  console.log(`📊 Final sqftAdded: ${sqftAdded} sqft (source: ${sqftSource})`);
  
  // Sanity check: sqftAdded should be reasonable (100 to 3000 sqft for most projects)
  if (sqftAdded < 100 && projectType !== 'remodel' && projectType !== 'default') {
    console.log(`⚠️ Warning: sqftAdded (${sqftAdded}) seems too small for ${projectType} project`);
  }

  // Step 2: Get enhanced construction costs using aggregated pricing (projectType already declared above)
  
  let constructionCostResult;
  let validationWarnings: string[] = [];
  let validationRecommendations: string[] = [];
  let pricingStrategy = 'unknown';
  let pricingConfidence = 0;
  let dataFreshness: 'current' | 'recent' | 'stale' | 'static' = 'static';
  
  // Always try to use aggregated pricing system which has built-in fallbacks
  try {
    console.log(`🧠 Using aggregated pricing system for project-specific costs: ${projectType}`);
    const projectPricing = await getAggregatedPricing(
      location.zip || '90210', // Use fallback zip if not available - aggregator handles this
      projectType,
      location,
      undefined, // Don't pass comparables again for individual projects
      propertyData
    );
    
    constructionCostResult = {
      low: projectPricing.construction.low,
      medium: projectPricing.construction.medium,
      high: projectPricing.construction.high,
    };
    
    // Store source and model info separately for pricing sources
    const constructionSource = projectPricing.construction.source;
    const constructionModelVersion = '2024.2-aggregated';
    const constructionRegion = projectPricing.metadata.region;
    
    // Extract enhanced pricing metadata
    pricingStrategy = projectPricing.overall.strategy;
    pricingConfidence = projectPricing.construction.confidence;
    dataFreshness = projectPricing.construction.dataFreshness;
    
    // Perform advanced cross-validation
    const crossValidation = performAdvancedCrossValidation(
      constructionCostResult,
      marketPricingResult.value,
      location
    );
    
    validationWarnings = crossValidation.warnings;
    validationRecommendations = crossValidation.recommendations;
    
    console.log(`🎯 Project-specific pricing: $${constructionCostResult.medium}/sqft (confidence: ${(pricingConfidence * 100).toFixed(1)}%)`);
    console.log(`🔍 Cross-validation score: ${(crossValidation.consistencyScore * 100).toFixed(1)}%`);
    console.log(`📊 Strategy: ${pricingStrategy} | Data: ${dataFreshness} | Fallbacks: ${projectPricing.metadata.fallbacksUsed.length}`);
    
  } catch (error) {
    console.error(`❌ Aggregated pricing system failed for ${projectType}: ${error}`);
    
    // Emergency fallback to static pricing only if aggregated pricing completely fails
    console.log(`🔄 Using emergency static fallback for ${projectType}`);
    constructionCostResult = estimateConstructionCostPpsf(location, projectType);
    pricingStrategy = 'Emergency Static Fallback';
    pricingConfidence = 0.2;
    dataFreshness = 'static';
    validationWarnings.push('Pricing system temporarily unavailable - using static estimates');
    validationRecommendations.push('Pricing accuracy may be reduced - consider re-running analysis');
  }

  // Step 3: Compute values using EXACT user formulas
  const newTotalSqft = propertyData.sqft + sqftAdded;
  const marketPPSF = marketPricingResult.value;
  
  // USER FORMULAS:
  // Validated costs = construction price per sqft × new sqft
  // Validated value add = market price per sqft × added sqft from renovation  
  // Post-renovation value = market price per sqft × total livable sqft (existing + renovation)
  
  let postRenovationValue: number;
  let computedValueAdd: number;
  
  if (sqftAdded > 0) {
    // Addition projects: use EXACT user formulas
    // Formula 3: Post-renovation value = market PPSF × total livable sqft
    postRenovationValue = marketPPSF * newTotalSqft;
    
    // Formula 2: Validated value add = market PPSF × added sqft  
    computedValueAdd = marketPPSF * sqftAdded;
    
    console.log(`💰 Using exact user formulas:
      - Market PPSF: $${marketPPSF}
      - Existing sqft: ${propertyData.sqft}
      - Added sqft: ${sqftAdded}
      - Total sqft: ${newTotalSqft}
      - Value add: $${marketPPSF} × ${sqftAdded} = $${computedValueAdd.toLocaleString()}
      - Post-reno value: $${marketPPSF} × ${newTotalSqft} = $${postRenovationValue.toLocaleString()}`);
  } else {
    // Remodel projects: preserve AI valueAdd and compute postRenovationValue from it
    computedValueAdd = project.valueAdd || 0;
    const currentValueEstimate = propertyData.sqft * marketPPSF;
    postRenovationValue = currentValueEstimate + computedValueAdd;
  }
  
  // Step 3a: Determine cost per sqft - use AI if within 20% of model, otherwise use model
  let costPerSqftToUse = constructionCostResult.medium;
  let usingAICost = false;
  
  if (project.costPerSqft && project.costPerSqft > 0) {
    const aiCostDelta = Math.abs(project.costPerSqft - constructionCostResult.medium) / constructionCostResult.medium;
    if (aiCostDelta <= 0.20) { // Within 20%
      costPerSqftToUse = project.costPerSqft;
      usingAICost = true;
    }
  }
  
  // Formula 1: Validated costs = construction price per sqft × new sqft
  const constructionPPSF = costPerSqftToUse;
  const computedCostMed = sqftAdded * constructionPPSF;
  const computedCostLow = sqftAdded * constructionCostResult.low;
  const computedCostHigh = sqftAdded * constructionCostResult.high;
  
  console.log(`🔨 Using exact cost formula:
    - Construction PPSF: $${constructionPPSF}
    - New sqft: ${sqftAdded}
    - Validated costs: $${constructionPPSF} × ${sqftAdded} = $${computedCostMed.toLocaleString()}`);
  
  // USER ROI FORMULA: (valueAdd / cost) * 100  
  const computedROI = computedCostMed > 0 ? 
    (computedValueAdd / computedCostMed) * 100 : 0;
  
  console.log(`💸 ROI calculation:
    - Value add: $${computedValueAdd.toLocaleString()}
    - Cost: $${computedCostMed.toLocaleString()}  
    - ROI: $${computedValueAdd.toLocaleString()} ÷ $${computedCostMed.toLocaleString()} = ${computedROI.toFixed(1)}%`);

  // Step 4: Determine if this is an addition-like project that should use deterministic corrections
  const additionTypes = ["adu", "addition", "second_story", "garage_conversion"];
  const isAdditionProject = additionTypes.includes(projectType) && sqftAdded > 0;
  
  console.log(`🔍 Addition project check for "${project.name}":
    - Project type: "${projectType}"
    - Sqft added: ${sqftAdded}
    - Is addition project: ${isAdditionProject}
    - Will use corrected values: ${isAdditionProject}`);
  
  let costDeltaPct = 0;
  let valueDeltaPct = 0;
  let needsCostCorrection = false;
  let needsValueCorrection = false;
  let corrected = false;

  if (isAdditionProject) {
    // For addition projects, compare with AI estimates and check for corrections
    const aiCostMed = (project.costRangeLow + project.costRangeHigh) / 2;
    const aiValueAdd = project.valueAdd;
    
    costDeltaPct = aiCostMed > 0 ? ((computedCostMed - aiCostMed) / aiCostMed) * 100 : 0;
    valueDeltaPct = aiValueAdd > 0 ? ((computedValueAdd - aiValueAdd) / aiValueAdd) * 100 : 0;
    
    needsCostCorrection = Math.abs(costDeltaPct) > 10;
    needsValueCorrection = Math.abs(valueDeltaPct) > 10;
    corrected = needsCostCorrection || needsValueCorrection;
  }

  // Step 5: Apply corrections if needed (only for addition projects)
  const finalValueAdd = isAdditionProject ? computedValueAdd : project.valueAdd;
  
  console.log(`🔧 Setting final values for "${project.name}":
    - Original AI valueAdd: $${project.valueAdd?.toLocaleString() || 'N/A'}
    - Computed valueAdd: $${computedValueAdd.toLocaleString()}
    - Is addition project: ${isAdditionProject}
    - Final valueAdd being set: $${finalValueAdd.toLocaleString()}`);
    
  const correctedProject: RenovationProject = {
    ...project,
    
    // Always set computed fields
    sqftAdded,
    newTotalSqft,
    postRenovationValue,
    marketPricePsfUsed: marketPricingResult.value,
    costPerSqftUsed: costPerSqftToUse, // Use the actual cost per sqft that was selected
    
    // Frontend expects these fields directly on the project object
    corrected: isAdditionProject ? corrected : false,
    computedCost: computedCostMed,
    computedValue: postRenovationValue,
    pricePsfUsed: marketPricingResult.value,
    
    // For addition projects: ALWAYS use exact user formulas (no AI values)
    costRangeLow: isAdditionProject ? computedCostLow : project.costRangeLow,
    costRangeHigh: isAdditionProject ? computedCostHigh : project.costRangeHigh,
    valueAdd: finalValueAdd, // Always use computed value for additions
    // For addition projects: ALWAYS use computed ROI with exact formulas (no AI costs)
    roi: isAdditionProject ? computedROI : project.roi,
    
    // For addition projects: ALWAYS use exact per-sqft values from formulas  
    costPerSqft: isAdditionProject ? constructionPPSF : project.costPerSqft,
    valuePerSqft: isAdditionProject ? marketPPSF : project.valuePerSqft, // Market PPSF for additions
    
    // Set enhanced pricing sources and validation
    pricingSources: {
      constructionCost: 'Aggregated pricing system',
      marketPpsf: marketPricingResult.source,
      modelVersion: marketPricingResult.modelVersion,
      region: marketPricingResult.region,
      // Enhanced pricing metadata
      pricingStrategy,
      confidence: pricingConfidence,
      dataFreshness,
      methodology: 'Standard pricing analysis'
    },
    
    validation: {
      costDeltaPct,
      valueDeltaPct,
      corrected: isAdditionProject ? corrected : false, // Only mark as corrected for addition projects
      // Enhanced validation information
      warnings: validationWarnings,
      recommendations: validationRecommendations,
      confidence: pricingConfidence,
      pricingAccuracy: pricingConfidence > 0.7 ? 'high' : pricingConfidence > 0.4 ? 'medium' : 'low'
    }
  };

  console.log(`🚀 Final project object being returned for "${correctedProject.name}":
    - valueAdd: $${correctedProject.valueAdd?.toLocaleString() || 'N/A'}
    - valuePerSqft: $${correctedProject.valuePerSqft?.toLocaleString() || 'N/A'}
    - sqftAdded: ${correctedProject.sqftAdded || 'N/A'}
    - costPerSqft: $${correctedProject.costPerSqft?.toLocaleString() || 'N/A'}
    - roi: ${correctedProject.roi?.toFixed(1) || 'N/A'}%`);

  return correctedProject;
}

/**
 * Compute corrected financial summary from validated projects
 * Uses weighted comparables for more accurate current value estimation
 */
function computeFinancialSummary(
  projects: RenovationProject[],
  propertyData: PropertyData,
  marketPpsf: number,
  comparables?: ComparableProperty[]
): FinancialSummary {
  
  // USER FORMULAS - use these EXACT calculations:
  // Formula 1: Validated costs = construction price per sqft × new sqft
  // Formula 2: Validated value add = market price per sqft × added sqft from renovation  
  // Formula 3: Post-renovation value = market price per sqft × total livable sqft
  
  // Calculate total added sqft from addition projects
  const livingAreaIncreasingTypes = ["adu", "addition", "second_story", "garage_conversion"];
  const totalAddedSqft = projects.reduce((sum, project) => {
    const projectType = classifyProjectType(project.name, project.description);
    if (livingAreaIncreasingTypes.includes(projectType)) {
      return sum + (project.sqftAdded || 0);
    }
    return sum;
  }, 0);
  
  // Calculate current value using weighted comparables if available
  let currentValue: number;
  let avgPricePsf = marketPpsf;
  
  if (comparables && comparables.length > 0) {
    // Use weighted average from scored comparables for more accurate estimation
    const weightedResult = calculateWeightedCurrentValue(comparables, propertyData);
    currentValue = weightedResult.estimatedValue;
    avgPricePsf = weightedResult.avgPricePsf;
    console.log(`🏠 Using weighted comparable analysis for current value (confidence: ${weightedResult.confidence}%)`);
  } else {
    // Fallback to simple calculation
    currentValue = propertyData.sqft * marketPpsf;
    console.log(`🏠 Using simple sqft × PPSF for current value (no comparables available)`);
  }
  
  // Formula 3: Post-renovation value = market PPSF × total livable sqft
  const postRenovationSqft = propertyData.sqft + totalAddedSqft;
  const afterRepairValue = avgPricePsf * postRenovationSqft;
  
  // Formula 2: Total validated value add = market PPSF × total added sqft  
  const totalValueAdd = avgPricePsf * totalAddedSqft;
  
  // Formula 1: Total validated costs = sum of (construction PPSF × project sqft)
  const totalRenovationCost = projects.reduce((sum, project) => {
    const projectType = classifyProjectType(project.name, project.description);
    if (livingAreaIncreasingTypes.includes(projectType)) {
      // Use the validated cost per sqft × sqft for addition projects
      const costPerSqft = project.costPerSqft || 400; // Default to $400/sqft if undefined
      return sum + (costPerSqft * (project.sqftAdded || 0));
    } else {
      // For remodels, use the average cost range  
      return sum + ((project.costRangeLow + project.costRangeHigh) / 2);
    }
  }, 0);
  
  // USER ROI FORMULA: (valueAdd / cost) * 100
  const originalROI = totalRenovationCost > 0 ? 
    (totalValueAdd / totalRenovationCost) * 100 : 0;
  let totalROI = originalROI;
  
  // SANITY CHECKS - Cap unrealistic estimates
  // Max value-add should not exceed 150% of current property value
  const MAX_VALUE_ADD_RATIO = 1.5;
  // Max ROI should not exceed 300% (already very optimistic)
  const MAX_ROI = 300;
  // After repair value should not exceed 2.5x current value
  const MAX_ARV_RATIO = 2.5;
  
  let cappedValueAdd = totalValueAdd;
  let cappedAfterRepairValue = afterRepairValue;
  let sanityCheckApplied = false;
  
  // Check if value-add is unrealistic
  if (totalValueAdd > currentValue * MAX_VALUE_ADD_RATIO) {
    cappedValueAdd = Math.round(currentValue * MAX_VALUE_ADD_RATIO);
    console.log(`⚠️ SANITY CHECK: Value-add $${totalValueAdd.toLocaleString()} exceeds ${MAX_VALUE_ADD_RATIO * 100}% of property value, capping to $${cappedValueAdd.toLocaleString()}`);
    sanityCheckApplied = true;
  }
  
  // Check if after repair value is unrealistic
  if (afterRepairValue > currentValue * MAX_ARV_RATIO) {
    cappedAfterRepairValue = Math.round(currentValue * MAX_ARV_RATIO);
    console.log(`⚠️ SANITY CHECK: ARV $${afterRepairValue.toLocaleString()} exceeds ${MAX_ARV_RATIO}x current value, capping to $${cappedAfterRepairValue.toLocaleString()}`);
    sanityCheckApplied = true;
  }
  
  // Recalculate ROI with capped values
  if (sanityCheckApplied) {
    totalROI = totalRenovationCost > 0 ? (cappedValueAdd / totalRenovationCost) * 100 : 0;
  }
  
  // Cap ROI if still too high
  if (totalROI > MAX_ROI) {
    console.log(`⚠️ SANITY CHECK: ROI ${totalROI.toFixed(1)}% exceeds max ${MAX_ROI}%, capping`);
    totalROI = MAX_ROI;
    sanityCheckApplied = true;
  }
  
  console.log(`📊 Financial Summary using exact user formulas:
    - Existing sqft: ${propertyData.sqft}
    - Total added sqft: ${totalAddedSqft}  
    - Post-renovation sqft: ${postRenovationSqft}
    - Market PPSF: $${avgPricePsf}
    - Current value: $${currentValue.toLocaleString()}
    - Total value add: $${cappedValueAdd.toLocaleString()}${sanityCheckApplied ? ' (capped from $' + totalValueAdd.toLocaleString() + ')' : ''}
    - After repair value: $${cappedAfterRepairValue.toLocaleString()}${sanityCheckApplied ? ' (capped from $' + afterRepairValue.toLocaleString() + ')' : ''}
    - Total renovation cost: $${totalRenovationCost.toLocaleString()}
    - Total ROI: ${totalROI.toFixed(1)}%${sanityCheckApplied ? ' (capped from ' + originalROI.toFixed(1) + '%)' : ''}`);

  return {
    currentValue,
    totalRenovationCost,
    totalValueAdd: cappedValueAdd,
    afterRepairValue: cappedAfterRepairValue,
    totalROI,
    avgPricePsf,
    postRenovationSqft,
    // Preserve original values for transparency
    originalTotalValueAdd: sanityCheckApplied ? totalValueAdd : undefined,
    originalAfterRepairValue: sanityCheckApplied ? afterRepairValue : undefined,
    originalTotalROI: sanityCheckApplied ? originalROI : undefined,
    sanityCheckApplied
  };
}

/**
 * Sort projects by ROI (highest first) and add star ratings and ranking
 * Also applies per-project ROI caps
 */
export function sortProjectsByROI(projects: RenovationProject[]): RenovationProject[] {
  // Max ROI per project (300% is already very optimistic for any single renovation)
  const MAX_PROJECT_ROI = 300;
  
  // Apply ROI caps to each project
  const cappedProjects = projects.map(project => {
    let roi = project.roi || 0;
    if (roi > MAX_PROJECT_ROI) {
      console.log(`⚠️ SANITY CHECK: Project "${project.name}" ROI ${roi.toFixed(1)}% capped to ${MAX_PROJECT_ROI}%`);
      roi = MAX_PROJECT_ROI;
    }
    return { ...project, roi };
  });
  
  // Sort by ROI (highest first)
  const sorted = [...cappedProjects].sort((a, b) => (b.roi || 0) - (a.roi || 0));
  
  // Add star ratings and rank to each project
  return sorted.map((project, index) => ({
    ...project,
    rank: index + 1, // 1-indexed ranking
    starRating: getRoiStarRating(project.roi || 0),
  }));
}