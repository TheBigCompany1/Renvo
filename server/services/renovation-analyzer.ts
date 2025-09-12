import { PropertyData, RenovationProject, FinancialSummary, ComparableProperty } from "@shared/schema";
import { analyzePropertyForRenovations } from "./openai";

export async function processRenovationAnalysis(
  propertyData: PropertyData,
  comparableProperties: ComparableProperty[]
): Promise<{ projects: RenovationProject[]; financialSummary: FinancialSummary }> {
  try {
    // Get AI analysis
    const aiAnalysis = await analyzePropertyForRenovations(propertyData, propertyData.images);
    
    // Convert AI analysis to our schema format
    const projects: RenovationProject[] = (aiAnalysis.renovation_ideas || aiAnalysis.projects || []).map((project: any, index: number) => {
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
        costPerSqft: project.cost_per_sqft,
        valuePerSqft: project.value_per_sqft,
        detailedDescription: project.detailed_description || project.description
      };
    });

    // Calculate financial summary
    const currentValue = propertyData.price || calculateEstimatedValue(propertyData, comparableProperties);
    const totalRenovationCost = projects.reduce((sum, project) => sum + ((project.costRangeLow + project.costRangeHigh) / 2), 0);
    const totalValueAdd = projects.reduce((sum, project) => sum + project.valueAdd, 0);
    const afterRepairValue = currentValue + totalValueAdd;
    const totalROI = Math.round(((totalValueAdd - totalRenovationCost) / totalRenovationCost) * 100);
    const avgPricePsf = comparableProperties.length > 0 
      ? Math.round(comparableProperties.reduce((sum, comp) => sum + comp.pricePsf, 0) / comparableProperties.length)
      : Math.round(currentValue / propertyData.sqft);

    const financialSummary: FinancialSummary = {
      currentValue,
      totalRenovationCost,
      totalValueAdd,
      afterRepairValue,
      totalROI,
      avgPricePsf
    };

    return { projects, financialSummary };
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
