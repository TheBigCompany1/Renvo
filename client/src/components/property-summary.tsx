import { PropertyData } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";

interface PropertySummaryProps {
  propertyData: PropertyData;
  reportDate: string;
}

export default function PropertySummary({ propertyData, reportDate }: PropertySummaryProps) {
  return (
    <Card className="mb-8">
      <CardContent className="p-8">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2" data-testid="text-property-address">
              {propertyData.address}
            </h1>
            <p className="text-muted-foreground">
              Report generated on <span data-testid="text-report-date">{reportDate}</span>
            </p>
          </div>
          <div className="flex space-x-4 mt-4 lg:mt-0">
            <button 
              className="px-4 py-2 border border-border rounded-lg hover:bg-muted transition-colors"
              data-testid="button-download-pdf"
            >
              Download PDF
            </button>
            <button 
              className="px-4 py-2 bg-accent text-accent-foreground rounded-lg hover:bg-accent/90 transition-colors"
              data-testid="button-share-report"
            >
              Share Report
            </button>
          </div>
        </div>

        {/* Property Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">Current Value</p>
            <p className="text-xl font-semibold text-foreground" data-testid="text-current-value">
              ${propertyData.price?.toLocaleString() || 'N/A'}
            </p>
          </div>
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">Square Footage</p>
            <p className="text-xl font-semibold text-foreground" data-testid="text-square-footage">
              {propertyData.sqft.toLocaleString()} sq ft
            </p>
          </div>
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">Bedrooms/Bathrooms</p>
            <p className="text-xl font-semibold text-foreground" data-testid="text-bed-bath">
              {propertyData.beds} bed / {propertyData.baths} bath
            </p>
          </div>
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">Year Built</p>
            <p className="text-xl font-semibold text-foreground" data-testid="text-year-built">
              {propertyData.yearBuilt || 'N/A'}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
