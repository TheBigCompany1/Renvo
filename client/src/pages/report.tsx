import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getAnalysisReport } from "@/lib/api";
import PropertySummary from "@/components/property-summary";
import RenovationProjectCard from "@/components/renovation-project-card";
import ComparableProperties from "@/components/comparable-properties";
import FinancialSummary from "@/components/financial-summary";
import ContractorRecommendations from "@/components/contractor-recommendations";
import { PropertyData, RenovationProject, ComparableProperty, Contractor, FinancialSummary as FinancialSummaryType } from "@shared/schema";

export default function Report() {
  const { id } = useParams<{ id: string }>();

  const { data: report, isLoading, error } = useQuery({
    queryKey: ['/api/reports', id],
    queryFn: () => getAnalysisReport(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="py-8" data-testid="report-loading">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Card className="mb-8">
            <CardContent className="p-8">
              <Skeleton className="h-8 w-3/4 mb-4" />
              <Skeleton className="h-4 w-1/2 mb-6" />
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-20" />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="py-8" data-testid="report-error">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Card>
            <CardContent className="p-8 text-center">
              <h2 className="text-2xl font-bold text-foreground mb-4">Report Not Found</h2>
              <p className="text-muted-foreground">
                The requested analysis report could not be found or may have expired.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (report.status !== 'completed') {
    return (
      <div className="py-8" data-testid="report-incomplete">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Card>
            <CardContent className="p-8 text-center">
              <h2 className="text-2xl font-bold text-foreground mb-4">Analysis In Progress</h2>
              <p className="text-muted-foreground">
                Your property analysis is still being processed. Please check back in a few minutes.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const propertyData = report.propertyData as PropertyData;
  const renovationProjects = report.renovationProjects as RenovationProject[];
  const comparableProperties = report.comparableProperties as ComparableProperty[];
  const contractors = report.contractors as Contractor[];
  const financialSummary = report.financialSummary as FinancialSummaryType;

  const reportDate = report.completedAt ? new Date(report.completedAt).toLocaleDateString() : new Date().toLocaleDateString();

  return (
    <div className="py-8" data-testid="report-completed">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Property Summary */}
        <PropertySummary propertyData={propertyData} reportDate={reportDate} />

        {/* Property Images */}
        {propertyData.images && propertyData.images.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Property Images</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="grid-property-images">
                {propertyData.images.map((image, index) => (
                  <img
                    key={index}
                    src={image}
                    alt={`Property image ${index + 1}`}
                    className="rounded-lg shadow-md w-full h-48 object-cover"
                    data-testid={`img-property-${index}`}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Renovation Recommendations */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>AI-Recommended Renovation Projects</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6" data-testid="list-renovation-projects">
              {renovationProjects.map((project, index) => (
                <RenovationProjectCard
                  key={project.id}
                  project={project}
                  isTopRated={index === 0}
                />
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Market Analysis */}
        <div className="grid lg:grid-cols-2 gap-8 mb-8">
          <ComparableProperties 
            comparableProperties={comparableProperties} 
            avgPricePsf={financialSummary.avgPricePsf} 
          />
          <FinancialSummary financialSummary={financialSummary} />
        </div>

        {/* Contractor Recommendations */}
        <ContractorRecommendations contractors={contractors} />
      </div>
    </div>
  );
}
