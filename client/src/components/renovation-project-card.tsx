import { RenovationProject } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface RenovationProjectCardProps {
  project: RenovationProject;
  isTopRated?: boolean;
}

export default function RenovationProjectCard({ project, isTopRated }: RenovationProjectCardProps) {
  // Debug: Log the exact data being received from API
  console.log(`🔍 Component "${project.name}" received:`, {
    valueAdd: project.valueAdd,
    valuePerSqft: project.valuePerSqft,
    sqftAdded: project.sqftAdded,
    costPerSqft: project.costPerSqft,
    roi: project.roi,
    description: project.description?.substring(0, 100) + "..."
  });
  
  return (
    <Card className="hover:shadow-md transition-shadow" data-testid={`card-project-${project.id}`}>
      <CardContent className="p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-semibold text-foreground mb-2" data-testid={`text-project-name-${project.id}`}>
              {project.name}
            </h3>
            <p className="text-muted-foreground mb-2" data-testid={`text-project-description-${project.id}`}>
              {project.detailedDescription || project.description}
            </p>
            {project.sqftAdded && (
              <div className="text-sm bg-blue-50 text-blue-700 px-2 py-1 rounded inline-block">
                +{project.sqftAdded.toLocaleString()} sq ft added
              </div>
            )}
          </div>
          {isTopRated && (
            <div className="mt-4 lg:mt-0">
              <Badge variant="secondary" className="bg-accent/10 text-accent">
                Highest ROI
              </Badge>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">Cost Range</p>
            <p className="text-lg font-semibold text-foreground" data-testid={`text-cost-range-${project.id}`}>
              ${project.costRangeLow.toLocaleString()} - ${project.costRangeHigh.toLocaleString()}
            </p>
          </div>
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">Validated Value Add</p>
            <p className="text-lg font-semibold text-green-600" data-testid={`text-value-add-${project.id}`}>
              ${project.valueAdd.toLocaleString()}
            </p>
            <p className="text-xs text-muted-foreground">${project.valuePerSqft}/sqft</p>
          </div>
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">ROI</p>
            <p className="text-lg font-semibold text-chart-2" data-testid={`text-roi-${project.id}`}>
              {Math.round(project.roi)}%
            </p>
          </div>
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">Timeline</p>
            <p className="text-lg font-semibold text-foreground" data-testid={`text-timeline-${project.id}`}>
              {project.timeline}
            </p>
          </div>
        </div>

        {/* Cost & Value Breakdown - Using Validated Values */}
        {(project.costPerSqft || project.valuePerSqft || project.sqftAdded) && (
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Validated Cost & Value Breakdown</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              {project.costPerSqft && project.sqftAdded && (
                <div>
                  <p className="text-gray-600">Validated Cost</p>
                  <p className="font-semibold" data-testid={`text-cost-breakdown-${project.id}`}>
                    ${project.costPerSqft.toLocaleString()}/sq ft × {project.sqftAdded.toLocaleString()} sq ft = ${(project.costPerSqft * project.sqftAdded).toLocaleString()}
                  </p>
                </div>
              )}
              {project.valueAdd && project.valuePerSqft && project.sqftAdded && (
                <div>
                  <p className="text-gray-600">Validated Value Add</p>
                  <p className="font-semibold text-green-600" data-testid={`text-value-breakdown-${project.id}`}>
                    ${project.valuePerSqft.toLocaleString()}/sq ft × {project.sqftAdded.toLocaleString()} sq ft = ${project.valueAdd.toLocaleString()}
                  </p>
                </div>
              )}
              {project.valueAdd && project.costPerSqft && project.sqftAdded && (
                <div>
                  <p className="text-gray-600">ROI Calculation</p>
                  <p className="font-semibold text-blue-600" data-testid={`text-roi-calculation-${project.id}`}>
                    ${project.valueAdd.toLocaleString()} ÷ ${(project.costPerSqft * project.sqftAdded).toLocaleString()} = {Math.round(project.roi)}%
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
