import { RenovationProject, ComparableProperty, PropertyData, FinancialSummary } from "@shared/schema";
import { 
  estimateMarketPpsf, 
  estimateConstructionCostPpsf, 
  classifyProjectType, 
  parseSquareFootageFromDescription 
} from "./pricing";

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
export function validateRenovationProjects(
  projects: RenovationProject[],
  propertyData: PropertyData,
  comparableProperties: ComparableProperty[],
  location: Location
): ValidationResult {
  
  const correctedProjects: RenovationProject[] = [];
  const validationStats: Array<{ costDelta: number; valueDelta: number }> = [];
  const correctedProjectIds: string[] = [];

  // Get market pricing data
  const marketPricingResult = estimateMarketPpsf(comparableProperties, propertyData, location);
  const marketPpsf = marketPricingResult.value;

  for (const project of projects) {
    const correctedProject = validateSingleProject(
      project, 
      propertyData, 
      marketPricingResult, 
      location
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
function validateSingleProject(
  project: RenovationProject,
  propertyData: PropertyData,
  marketPricingResult: { value: number; source: string; modelVersion: string; region: string },
  location: Location
): RenovationProject {
  
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

  // Step 2: Classify project type and get construction costs
  const projectType = classifyProjectType(project.name, project.description);
  const constructionCostResult = estimateConstructionCostPpsf(location, projectType);

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
    
    // Apply corrections only if this is an addition project and deviations exceed threshold
    costRangeLow: (isAdditionProject && needsCostCorrection) ? computedCostLow : project.costRangeLow,
    costRangeHigh: (isAdditionProject && needsCostCorrection) ? computedCostHigh : project.costRangeHigh,
    valueAdd: (isAdditionProject && needsValueCorrection) ? computedValueAdd : project.valueAdd,
    roi: (() => {
      if (!isAdditionProject) return project.roi; // Preserve AI ROI for remodels
      if (needsCostCorrection || needsValueCorrection) return computedROI; // Use computed ROI for corrected additions
      
      // For additions where cost isn't corrected, compute ROI from AI cost median
      const aiCostMed = (project.costRangeLow + project.costRangeHigh) / 2;
      const valueAddToUse = needsValueCorrection ? computedValueAdd : project.valueAdd;
      return aiCostMed > 0 ? ((valueAddToUse - aiCostMed) / aiCostMed) * 100 : project.roi;
    })(),
    
    // Update per-sqft values if corrected
    costPerSqft: (isAdditionProject && needsCostCorrection) ? costPerSqftToUse : project.costPerSqft,
    valuePerSqft: (isAdditionProject && needsValueCorrection && sqftAdded > 0) ? 
      (computedValueAdd / sqftAdded) : project.valuePerSqft,
    
    // Set pricing sources and validation
    pricingSources: {
      constructionCost: constructionCostResult.source,
      marketPpsf: marketPricingResult.source,
      modelVersion: marketPricingResult.modelVersion,
      region: marketPricingResult.region
    },
    
    validation: {
      costDeltaPct,
      valueDeltaPct,
      corrected: isAdditionProject ? corrected : false // Only mark as corrected for addition projects
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