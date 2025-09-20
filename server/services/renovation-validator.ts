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

  // Compute corrected financial summary
  const financialSummary = computeFinancialSummary(
    correctedProjects, 
    propertyData, 
    marketPpsf
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

  return {
    correctedProjects,
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
  
  // Step 1: Determine square footage added
  let sqftAdded = project.sqftAdded;
  if (!sqftAdded || sqftAdded <= 0) {
    // Parse from description if missing
    const parsedSqft = parseSquareFootageFromDescription(
      `${project.name} ${project.description} ${project.detailedDescription || ""}`
    );
    
    if (parsedSqft > 0) {
      sqftAdded = parsedSqft;
    } else {
      // Only apply default for addition-like projects, otherwise use 0
      const projectType = classifyProjectType(project.name, project.description);
      const additionTypes = ["adu", "addition", "second_story", "garage_conversion"];
      sqftAdded = additionTypes.includes(projectType) ? 500 : 0;
    }
  }

  // Step 2: Classify project type and get enhanced construction costs using aggregated pricing
  const projectType = classifyProjectType(project.name, project.description);
  
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
      source: projectPricing.construction.source,
      modelVersion: '2024.2-aggregated',
      region: projectPricing.metadata.region
    };
    
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

  // Step 3: Compute deterministic values
  const newTotalSqft = propertyData.sqft + sqftAdded;
  const currentValue = propertyData.price || (propertyData.sqft * marketPricingResult.value);
  
  // For addition projects, use sqft-based valuation; for remodels, use current + AI valueAdd
  let postRenovationValue: number;
  let computedValueAdd: number;
  
  if (sqftAdded > 0) {
    // Addition projects: use deterministic sqft-based calculation
    postRenovationValue = newTotalSqft * marketPricingResult.value;
    computedValueAdd = postRenovationValue - currentValue;
  } else {
    // Remodel projects: preserve AI valueAdd and compute postRenovationValue from it
    computedValueAdd = project.valueAdd || 0;
    postRenovationValue = currentValue + computedValueAdd;
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
  
  // Compute costs using selected cost per sqft
  const computedCostMed = sqftAdded * costPerSqftToUse;
  const computedCostLow = sqftAdded * (usingAICost ? costPerSqftToUse * 0.85 : constructionCostResult.low);
  const computedCostHigh = sqftAdded * (usingAICost ? costPerSqftToUse * 1.15 : constructionCostResult.high);
  
  // Compute ROI: ((valueAdd - cost) / cost) * 100  
  const computedROI = computedCostMed > 0 ? 
    ((computedValueAdd - computedCostMed) / computedCostMed) * 100 : 0;

  // Step 4: Determine if this is an addition-like project that should use deterministic corrections
  const additionTypes = ["adu", "addition", "second_story", "garage_conversion"];
  const isAdditionProject = additionTypes.includes(projectType) && sqftAdded > 0;
  
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
    
    // Apply corrections only if this is an addition project and deviations exceed threshold
    costRangeLow: (isAdditionProject && needsCostCorrection) ? computedCostLow : project.costRangeLow,
    costRangeHigh: (isAdditionProject && needsCostCorrection) ? computedCostHigh : project.costRangeHigh,
    valueAdd: isAdditionProject ? computedValueAdd : project.valueAdd, // Always use computed value for additions
    roi: (() => {
      if (!isAdditionProject) return project.roi; // Preserve AI ROI for remodels
      
      // For addition projects, always use computed ROI with computed value add
      if (needsCostCorrection) {
        // Use computed costs and computed value add
        return computedROI;
      } else {
        // Use AI costs but computed value add for mathematical consistency
        const aiCostMed = (project.costRangeLow + project.costRangeHigh) / 2;
        return aiCostMed > 0 ? ((computedValueAdd - aiCostMed) / aiCostMed) * 100 : computedROI;
      }
    })(),
    
    // Update per-sqft values if corrected
    costPerSqft: (isAdditionProject && needsCostCorrection) ? costPerSqftToUse : project.costPerSqft,
    valuePerSqft: (isAdditionProject && sqftAdded > 0) ? 
      (computedValueAdd / sqftAdded) : project.valuePerSqft, // Always use computed value per sqft for additions
    
    // Set enhanced pricing sources and validation
    pricingSources: {
      constructionCost: constructionCostResult.source,
      marketPpsf: marketPricingResult.source,
      modelVersion: marketPricingResult.modelVersion,
      region: marketPricingResult.region,
      // Enhanced pricing metadata
      pricingStrategy,
      confidence: pricingConfidence,
      dataFreshness,
      methodology: constructionCostResult.methodology || 'Standard pricing analysis'
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

  return correctedProject;
}

/**
 * Compute corrected financial summary from validated projects
 */
function computeFinancialSummary(
  projects: RenovationProject[],
  propertyData: PropertyData,
  marketPpsf: number
): FinancialSummary {
  
  const currentValue = propertyData.price || (propertyData.sqft * marketPpsf);
  
  // Use corrected values, not AI estimates
  const totalRenovationCost = projects.reduce((sum, project) => {
    return sum + ((project.costRangeLow + project.costRangeHigh) / 2);
  }, 0);
  
  const totalValueAdd = projects.reduce((sum, project) => {
    return sum + (project.valueAdd || 0);
  }, 0);
  
  const afterRepairValue = currentValue + totalValueAdd;
  const totalROI = totalRenovationCost > 0 ? 
    ((totalValueAdd - totalRenovationCost) / totalRenovationCost) * 100 : 0;
  
  // Calculate post-renovation square footage
  // Sum sqftAdded for projects that increase living area
  const livingAreaIncreasingTypes = ["adu", "addition", "second_story", "garage_conversion"];
  const totalAddedSqft = projects.reduce((sum, project) => {
    const projectType = classifyProjectType(project.name, project.description);
    if (livingAreaIncreasingTypes.includes(projectType)) {
      return sum + (project.sqftAdded || 0);
    }
    return sum;
  }, 0);
  const postRenovationSqft = propertyData.sqft + totalAddedSqft;

  return {
    currentValue,
    totalRenovationCost,
    totalValueAdd,
    afterRepairValue,
    totalROI,
    avgPricePsf: marketPpsf,
    postRenovationSqft
  };
}

/**
 * Sort projects by ROI (highest first) after validation
 */
export function sortProjectsByROI(projects: RenovationProject[]): RenovationProject[] {
  return [...projects].sort((a, b) => (b.roi || 0) - (a.roi || 0));
}