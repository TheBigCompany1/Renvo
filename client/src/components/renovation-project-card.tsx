import { RenovationProject } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface RenovationProjectCardProps {
  project: RenovationProject;
  isTopRated?: boolean;
}

export default function RenovationProjectCard({ project, isTopRated }: RenovationProjectCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow" data-testid={`card-project-${project.id}`}>
      <CardContent className="p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-4">
          <div>
            <h3 className="text-xl font-semibold text-foreground mb-2" data-testid={`text-project-name-${project.id}`}>
              {project.name}
            </h3>
            <p className="text-muted-foreground" data-testid={`text-project-description-${project.id}`}>
              {project.description}
            </p>
          </div>
          {isTopRated && (
            <div className="mt-4 lg:mt-0">
              <Badge variant="secondary" className="bg-accent/10 text-accent">
                Highest ROI
              </Badge>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">Cost Range</p>
            <p className="text-lg font-semibold text-foreground" data-testid={`text-cost-range-${project.id}`}>
              ${project.costRangeLow.toLocaleString()} - ${project.costRangeHigh.toLocaleString()}
            </p>
          </div>
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">Value Add</p>
            <p className="text-lg font-semibold text-foreground" data-testid={`text-value-add-${project.id}`}>
              ${project.valueAdd.toLocaleString()}
            </p>
          </div>
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">ROI</p>
            <p className="text-lg font-semibold text-chart-2" data-testid={`text-roi-${project.id}`}>
              {project.roi}%
            </p>
          </div>
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">Timeline</p>
            <p className="text-lg font-semibold text-foreground" data-testid={`text-timeline-${project.id}`}>
              {project.timeline}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
