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
    const projects: RenovationProject[] = aiAnalysis.projects.map((project, index) => ({
      id: `project-${index + 1}`,
      name: project.name,
      description: project.description,
      costRangeLow: project.costRangeLow,
      costRangeHigh: project.costRangeHigh,
      valueAdd: project.valueAdd,
      roi: Math.round(((project.valueAdd - ((project.costRangeLow + project.costRangeHigh) / 2)) / ((project.costRangeLow + project.costRangeHigh) / 2)) * 100),
      timeline: project.timeline,
      priority: project.priority
    }));

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
