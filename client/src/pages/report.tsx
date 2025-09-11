import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getAnalysisReport } from "@/lib/api";
import { PropertyData, RenovationProject, ComparableProperty, Contractor, FinancialSummary as FinancialSummaryType } from "@shared/schema";
import { Download, DollarSign, Home, Calendar, MapPin, Target, TrendingUp, Clock, AlertTriangle, Users, CheckCircle } from "lucide-react";

export default function Report() {
  const { id } = useParams<{ id: string }>();

  const { data: report, isLoading, error } = useQuery({
    queryKey: ['/api/reports', id],
    queryFn: () => getAnalysisReport(id!),
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50" data-testid="report-loading">
        <div className="max-w-6xl mx-auto py-8 px-4">
          <Skeleton className="h-16 w-full mb-8" />
          <Skeleton className="h-64 w-full mb-8" />
          <Skeleton className="h-32 w-full mb-8" />
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-gray-50" data-testid="report-error">
        <div className="max-w-6xl mx-auto py-8 px-4">
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
      <div className="min-h-screen bg-gray-50" data-testid="report-incomplete">
        <div className="max-w-6xl mx-auto py-8 px-4">
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
  const propertyImage = propertyData.images?.[0] || "https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=400";
  
  // Calculate opportunity score (average ROI)
  const opportunityScore = Math.round(renovationProjects.reduce((sum, project) => sum + project.roi, 0) / renovationProjects.length);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="min-h-screen bg-gray-50" data-testid="report-completed">
      {/* Header */}
      <div className="bg-teal-600 text-white">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold" data-testid="text-report-title">Renovation ROI Report</h1>
            <Button 
              variant="secondary" 
              className="bg-orange-500 hover:bg-orange-600 text-white border-none"
              data-testid="button-download"
            >
              <Download className="w-4 h-4 mr-2" />
              Download as Report
            </Button>
          </div>
          <div className="mt-2 text-teal-100" data-testid="text-report-details">
            Property: {propertyData.address} | Report ID: {report.id?.slice(0, 8)} | Generated: {reportDate}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Property Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold" data-testid="title-property-overview">Property Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Property Details */}
              <div className="space-y-6">
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <div className="text-2xl font-bold text-teal-600" data-testid="text-property-price">
                      {propertyData.price ? formatCurrency(propertyData.price) : 'N/A'}
                    </div>
                    <div className="text-sm text-gray-600">Price</div>
                  </div>
                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <div className="text-2xl font-bold text-teal-600" data-testid="text-property-beds">
                      {propertyData.beds || 'N/A'}
                    </div>
                    <div className="text-sm text-gray-600">Beds</div>
                  </div>
                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <div className="text-2xl font-bold text-teal-600" data-testid="text-property-baths">
                      {propertyData.baths || 'N/A'}
                    </div>
                    <div className="text-sm text-gray-600">Baths</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <div className="text-2xl font-bold text-teal-600" data-testid="text-property-sqft">
                      {propertyData.sqft ? propertyData.sqft.toLocaleString() : 'N/A'}
                    </div>
                    <div className="text-sm text-gray-600">Sq Ft</div>
                  </div>
                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <div className="text-2xl font-bold text-teal-600" data-testid="text-property-year">
                      {propertyData.yearBuilt || 'N/A'}
                    </div>
                    <div className="text-sm text-gray-600">Year Built</div>
                  </div>
                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <div className="text-2xl font-bold text-teal-600" data-testid="text-property-lot">
                      {propertyData.lotSize || 'N/A'}
                    </div>
                    <div className="text-sm text-gray-600">Lot Size</div>
                  </div>
                </div>
              </div>
              
              {/* Property Image */}
              <div className="flex justify-center">
                <img
                  src={propertyImage}
                  alt="Property"
                  className="rounded-lg shadow-lg w-full h-64 object-cover"
                  data-testid="img-property-main"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Property Description */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold" data-testid="title-property-description">Property Description</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-700 leading-relaxed" data-testid="text-property-description">
              {propertyData.description}
            </p>
          </CardContent>
        </Card>

        {/* Investment Thesis */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold" data-testid="title-investment-thesis">Investment Thesis</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <div>
                <p className="text-gray-700 mb-4" data-testid="text-investment-summary">
                  The top recommendation is an <strong>ADU Conversion</strong>. This project scores an 
                  <strong> Average Opportunity</strong> due to its high potential ROI of {renovationProjects[0]?.roi || 0}% and strong 
                  rental income opportunities in this market. The existing property features, particularly the {propertyData.sqft} 
                  sq ft of space and {propertyData.lotSize} lot, make this the most strategic investment for this property.
                </p>
              </div>
              <div className="text-center">
                <div className="inline-block p-6 bg-orange-50 rounded-full">
                  <div className="text-3xl font-bold text-orange-600" data-testid="text-opportunity-score">
                    {opportunityScore}%
                  </div>
                  <div className="text-sm text-gray-600 mt-2">Opportunity Score</div>
                  <Badge variant="secondary" className="mt-2 bg-orange-100 text-orange-700">
                    Average
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Renovation Analysis & ROI */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold" data-testid="title-renovation-analysis">Renovation Analysis & ROI</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* ROI Comparison Chart */}
              <div>
                <h4 className="font-semibold mb-4" data-testid="title-roi-comparison">ROI Comparison</h4>
                <div className="space-y-4">
                  {renovationProjects.map((project, index) => (
                    <div key={project.id} className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium">{project.name}</span>
                        <span className="text-sm font-bold text-orange-600">{project.roi}%</span>
                      </div>
                      <Progress 
                        value={project.roi} 
                        className="h-2"
                        data-testid={`progress-roi-${index}`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Cost vs Value Added */}
              <div>
                <h4 className="font-semibold mb-4" data-testid="title-cost-value">Cost vs Value Added</h4>
                <div className="space-y-4">
                  {renovationProjects.map((project, index) => (
                    <div key={project.id} className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                      <div>
                        <div className="font-medium">{project.name}</div>
                        <div className="text-sm text-gray-600">
                          Cost: {formatCurrency((project.costRangeLow + project.costRangeHigh) / 2)}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-green-600">
                          +{formatCurrency(project.valueAdd)}
                        </div>
                        <div className="text-sm text-gray-600">Value Add</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Top Renovation Opportunities */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold" data-testid="title-renovation-opportunities">Top Renovation Opportunities</CardTitle>
          </CardHeader>
          <CardContent className="space-y-8">
            {renovationProjects.map((project, index) => (
              <div key={project.id} className="border rounded-lg p-6 bg-white shadow-sm" data-testid={`card-renovation-${index}`}>
                {/* Project Header */}
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-teal-600 text-white rounded-full flex items-center justify-center font-bold">
                      {index + 1}
                    </div>
                    <h3 className="text-lg font-semibold" data-testid={`text-project-name-${index}`}>
                      {project.name}
                    </h3>
                  </div>
                  <Badge variant="secondary" className="bg-orange-100 text-orange-700 font-bold">
                    {project.roi}% ROI
                  </Badge>
                </div>

                {/* Project Description */}
                <p className="text-gray-700 mb-6" data-testid={`text-project-description-${index}`}>
                  {project.description}
                </p>

                {/* Project Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <div className="text-lg font-bold text-teal-600">
                      {formatCurrency((project.costRangeLow + project.costRangeHigh) / 2)}
                    </div>
                    <div className="text-sm text-gray-600">Est. Cost</div>
                  </div>
                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <div className="text-lg font-bold text-green-600">
                      {formatCurrency(project.valueAdd)}
                    </div>
                    <div className="text-sm text-gray-600">Value Add</div>
                  </div>
                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <div className="text-lg font-bold text-blue-600">
                      {project.timeline}
                    </div>
                    <div className="text-sm text-gray-600">Timeline</div>
                  </div>
                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <div className="text-lg font-bold text-purple-600">
                      {index === 0 ? 'Moderate' : index === 1 ? 'Difficult' : 'Moderate'}
                    </div>
                    <div className="text-sm text-gray-600">Difficulty</div>
                  </div>
                </div>

                {/* Project Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Project Roadmap */}
                  <div>
                    <h4 className="font-semibold mb-3 flex items-center">
                      <CheckCircle className="w-4 h-4 mr-2 text-green-600" />
                      Project Roadmap
                    </h4>
                    <ul className="text-sm space-y-2 text-gray-700">
                      <li>• Obtain necessary permits (check local regulations in Los Angeles)</li>
                      <li>• Hire a contractor experienced in ADU conversions</li>
                      <li>• Design and plan layout, considering existing garage structure and utilities</li>
                      <li>• Execute construction, focusing on insulation, electrical, and plumbing</li>
                      <li>• Complete ADU adhering to building codes and receive final inspection</li>
                      <li>• Obtain Certificate of Occupancy</li>
                    </ul>
                  </div>

                  {/* Potential Risks */}
                  <div>
                    <h4 className="font-semibold mb-3 flex items-center">
                      <AlertTriangle className="w-4 h-4 mr-2 text-orange-600" />
                      Potential Risks
                    </h4>
                    <ul className="text-sm space-y-2 text-gray-700">
                      <li>• Permitting delays (common in Los Angeles)</li>
                      <li>• Unexpected construction costs (add 10-20% contingency)</li>
                      <li>• Compliance with local building codes</li>
                      <li>• Finding qualified contractors experienced with ADU regulations</li>
                      <li>• Potential plumbing and electrical upgrades</li>
                    </ul>
                  </div>

                  {/* Recommended Pros */}
                  <div>
                    <h4 className="font-semibold mb-3 flex items-center">
                      <Users className="w-4 h-4 mr-2 text-blue-600" />
                      Recommended Pros
                    </h4>
                    <div className="space-y-3">
                      {contractors.slice(0, 2).map((contractor, contractorIndex) => (
                        <button 
                          key={contractorIndex} 
                          className="w-full p-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors text-left group cursor-pointer"
                          onClick={() => window.open(`tel:${contractor.contact}`, '_self')}
                          data-testid={`button-contractor-${contractorIndex}`}
                        >
                          <div className="font-medium text-blue-700 group-hover:text-blue-800">{contractor.name}</div>
                          <div className="text-sm text-blue-600 group-hover:text-blue-700">{contractor.specialty}</div>
                          <div className="text-xs text-blue-500 mt-1">📞 Tap to call</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Local Market Comparables */}
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold" data-testid="title-market-comparables">Local Market Comparables</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full" data-testid="table-comparables">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 font-semibold">Address</th>
                    <th className="text-left py-3 font-semibold">Sale Price</th>
                    <th className="text-left py-3 font-semibold">Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {comparableProperties.map((comp, index) => (
                    <tr key={index} className="border-b" data-testid={`row-comparable-${index}`}>
                      <td className="py-3 font-medium">{comp.address}</td>
                      <td className="py-3">{formatCurrency(comp.price)}</td>
                      <td className="py-3 text-gray-600">
                        For Sale: {comp.beds} bed, {comp.baths} bath, {comp.sqft.toLocaleString()} sqft
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}