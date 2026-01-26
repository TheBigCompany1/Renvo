import { PropertyData, RenovationProject, FinancialSummary, ComparableProperty } from "@shared/schema";
import { analyzePropertyForRenovations } from "./gemini";
import { validateRenovationProjects, sortProjectsByROI } from "./renovation-validator";

export async function processRenovationAnalysis(
  propertyData: PropertyData,
  comparableProperties: ComparableProperty[],
  location: { city?: string; state?: string; zip?: string }
): Promise<{ projects: RenovationProject[]; financialSummary: FinancialSummary; validationSummary?: any }> {
  try {
    // Get AI analysis
    const aiAnalysis = await analyzePropertyForRenovations(propertyData, propertyData.images);
    
    // Convert AI analysis to our schema format  
    const rawProjects: RenovationProject[] = (aiAnalysis.renovation_ideas || []).map((project: any, index: number) => {
      const sqftAdded = project.sqft_added || (project.new_total_sqft ? project.new_total_sqft - propertyData.sqft : undefined);
      const enhancedDescription = project.detailed_description || project.description;
      
      // Enhance description with specific details when available
      let finalDescription = enhancedDescription;
      if (sqftAdded && sqftAdded > 0) {
        finalDescription += ` This project adds ${sqftAdded.toLocaleString()} square feet to the property.`;
      }
      if (project.cost_per_sqft) {
        finalDescription += ` Construction cost estimated at $${project.cost_per_sqft}/sq ft.`;
      }
      if (project.buyer_profile) {
        finalDescription += ` Appeals to ${project.buyer_profile.toLowerCase()}.`;
      }
      
      // Calculate newTotalSqft (total sqft after renovation)
      const newTotalSqft = project.new_total_sqft || (sqftAdded ? propertyData.sqft + sqftAdded : propertyData.sqft);
      
      return {
        id: `project-${index + 1}`,
        name: project.name,
        description: finalDescription,
        costRangeLow: project.estimated_cost ? project.estimated_cost.low : project.costRangeLow,
        costRangeHigh: project.estimated_cost ? project.estimated_cost.high : project.costRangeHigh,
        valueAdd: project.estimated_value_add ? project.estimated_value_add.medium : project.valueAdd,
        roi: project.roi || Math.round(((project.estimated_value_add?.medium || project.valueAdd || 0) - ((project.estimated_cost?.low || project.costRangeLow || 0) + (project.estimated_cost?.high || project.costRangeHigh || 0)) / 2) / (((project.estimated_cost?.low || project.costRangeLow || 0) + (project.estimated_cost?.high || project.costRangeHigh || 0)) / 2) * 100),
        timeline: project.timeline,
        priority: index + 1,
        // Enhanced fields for detailed breakdown
        sqftAdded: sqftAdded,
        newTotalSqft: newTotalSqft,
        costPerSqft: project.cost_per_sqft,
        valuePerSqft: project.value_per_sqft,
        detailedDescription: project.detailed_description || project.description
      };
    });

    // Apply deterministic validation and correction with enhanced RAG pricing
    console.log("🔍 Applying renovation validation with dynamic RAG pricing...");
    console.log(`📍 Location: ${location.city || 'Unknown'}, ${location.state || 'Unknown'} ${location.zip || '(no zip)'}`);
    
    const validationStartTime = Date.now();
    const validationResult = await validateRenovationProjects(
      rawProjects,
      propertyData,
      comparableProperties,
      location
    );
    const validationDuration = Date.now() - validationStartTime;
    
    // Sort projects by ROI (highest first) after validation
    const sortedProjects = sortProjectsByROI(validationResult.correctedProjects);
    
    // Enhanced validation summary with pricing strategy analysis
    console.log(`✅ Validation complete in ${validationDuration}ms. ${validationResult.validationSummary.totalCorrections} corrections applied.`);
    
    // Analyze pricing strategies used across projects
    const pricingStrategies = sortedProjects.map(p => p.pricingSources?.pricingStrategy).filter(Boolean);
    const uniqueStrategies = Array.from(new Set(pricingStrategies));
    const avgConfidence = sortedProjects.reduce((sum, p) => sum + (p.pricingSources?.confidence || 0), 0) / sortedProjects.length;
    
    console.log(`📊 Pricing Analysis:`);
    console.log(`  - Strategies used: ${uniqueStrategies.join(', ')}`);
    console.log(`  - Average pricing confidence: ${(avgConfidence * 100).toFixed(1)}%`);
    console.log(`  - Data freshness: ${sortedProjects.map(p => p.pricingSources?.dataFreshness).filter(Boolean).join(', ')}`);
    
    if (validationResult.validationSummary.totalCorrections > 0) {
      console.log(`📈 Corrections Applied:`);
      console.log(`  - Avg cost delta: ${validationResult.validationSummary.avgCostDelta.toFixed(1)}%`);
      console.log(`  - Avg value delta: ${validationResult.validationSummary.avgValueDelta.toFixed(1)}%`);
      console.log(`  - Corrected projects: ${validationResult.validationSummary.correctedProjectIds.join(', ')}`);
    }
    
    // Log any validation warnings across all projects
    const allWarnings = sortedProjects.flatMap(p => p.validation?.warnings || []);
    if (allWarnings.length > 0) {
      console.log(`⚠️ Validation Warnings: ${allWarnings.length} issues detected`);
      allWarnings.slice(0, 3).forEach(warning => console.log(`  - ${warning}`));
      if (allWarnings.length > 3) console.log(`  - ... and ${allWarnings.length - 3} more`);
    }

    return { 
      projects: sortedProjects, 
      financialSummary: validationResult.financialSummary,
      validationSummary: validationResult.validationSummary
    };
  } catch (error) {
    console.error("Error processing renovation analysis:", error);
    throw new Error("Failed to process renovation analysis: " + (error as Error).message);
  }
}

function calculateEstimatedValue(propertyData: PropertyData, comparableProperties: ComparableProperty[]): number {
  if (comparableProperties.length === 0) {
    // Fallback calculation if no comparables
    return propertyData.sqft * 500; // $500 per sqft default
  }
  
  const avgPricePsf = comparableProperties.reduce((sum, comp) => sum + comp.pricePsf, 0) / comparableProperties.length;
  return Math.round(propertyData.sqft * avgPricePsf);
}
