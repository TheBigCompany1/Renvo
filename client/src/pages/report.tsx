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
  const renovationProjects = (report.renovationProjects as RenovationProject[]).sort((a, b) => b.roi - a.roi);
  const comparableProperties = (report.comparableProperties as ComparableProperty[]) || [];
  const financialSummary = report.financialSummary as FinancialSummaryType;
  const validationSummary = report.validationSummary as any;

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

  const getSourceLabel = (source?: string) => {
    switch (source) {
      case 'web_search': return 'Web Search';
      case 'location_based': return 'Market Data';
      case 'api': return 'MLS API';
      case 'fallback': return 'Estimate';
      case 'location_based_generated': return 'Local Directory';
      default: return 'Market Data';
    }
  };

  const getSourceBadgeStyle = (source?: string) => {
    switch (source) {
      case 'web_search': return 'bg-green-100 text-green-700';
      case 'location_based': return 'bg-blue-100 text-blue-700';
      case 'api': return 'bg-purple-100 text-purple-700';
      case 'fallback': return 'bg-gray-100 text-gray-700';
      case 'location_based_generated': return 'bg-orange-100 text-orange-700';
      default: return 'bg-blue-100 text-blue-700';
    }
  };

  // Calculate estimated current value using dynamic market data
  const calculateEstimatedCurrentValue = (propertyData: PropertyData, comparableProperties: ComparableProperty[], renovationProjects: RenovationProject[]) => {
    if (!propertyData.price || !propertyData.sqft) {
      return 'N/A';
    }

    // Find the maximum square footage addition from all renovation projects
    const maxAddedSqft = renovationProjects && renovationProjects.length > 0 
      ? Math.max(...renovationProjects.map(p => p.sqftAdded || 0), 0)
      : 0;
    
    // Total livable square footage including best renovation option
    const totalLivableSqft = propertyData.sqft + maxAddedSqft;

    console.log('🔍 Estimated Current Value Debug:');
    console.log('  Base sqft:', propertyData.sqft);
    console.log('  Max added sqft:', maxAddedSqft);
    console.log('  Total livable sqft:', totalLivableSqft);
    console.log('  Renovation projects:', renovationProjects?.map(p => ({ name: p.name, sqftAdded: p.sqftAdded })));
    console.log('  Comparable properties count:', comparableProperties?.length);

    // Use average price per sqft from comparable properties if available
    if (comparableProperties && comparableProperties.length > 0) {
      const avgPricePsf = comparableProperties.reduce((sum, comp) => sum + comp.pricePsf, 0) / comparableProperties.length;
      console.log('  Avg comp price per sqft:', avgPricePsf);
      if (avgPricePsf > 100) { // Sanity check
        const estimatedValue = Math.floor(totalLivableSqft * avgPricePsf);
        console.log('  Using comparables - Estimated value:', estimatedValue);
        return formatCurrency(estimatedValue);
      }
    }

    // Fallback: use current price per sqft applied to total livable space
    const currentPricePsf = propertyData.price / propertyData.sqft;
    const estimatedValue = Math.floor(totalLivableSqft * currentPricePsf);
    console.log('  Using fallback - Current price per sqft:', currentPricePsf);
    console.log('  Using fallback - Estimated value:', estimatedValue);
    return formatCurrency(estimatedValue);
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
            {propertyData.location && (
              <div className="text-sm text-gray-600" data-testid="text-location-context">
                📍 Market Analysis for {propertyData.location.city}, {propertyData.location.state}
              </div>
            )}
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
                    <div className="text-sm text-gray-600">Last Price Sold</div>
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
                  <strong> Average Opportunity</strong> due to its high potential ROI of {Math.round(renovationProjects[0]?.roi || 0)}% and strong 
                  rental income opportunities in this market. The existing property features, particularly the {propertyData.sqft} 
                  sq ft of space and {propertyData.lotSize} lot, make this the most strategic investment for this property.
                </p>
              </div>
              <div className="text-center space-y-6">
                <div className="inline-block p-6 bg-orange-50 rounded-full">
                  <div className="text-3xl font-bold text-orange-600" data-testid="text-opportunity-score">
                    {Math.round(opportunityScore)}%
                  </div>
                  <div className="text-sm text-gray-600 mt-2">Opportunity Score</div>
                  <Badge variant="secondary" className="mt-2 bg-orange-100 text-orange-700">
                    Average
                  </Badge>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600" data-testid="text-property-estimated-price">
                    {calculateEstimatedCurrentValue(propertyData, comparableProperties, renovationProjects)}
                  </div>
                  <div className="text-sm text-gray-600">Estimated Post-Renovation Value</div>
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
                        <span className="text-sm font-bold text-orange-600">{Math.round(project.roi)}%</span>
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
                    {/* Validation Badge */}
                    {(project as any).corrected && (
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200" data-testid={`badge-corrected-${index}`}>
                        <CheckCircle className="w-3 h-3 mr-1" />
                        Validated
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge variant="secondary" className="bg-orange-100 text-orange-700 font-bold">
                      {Math.round(project.roi)}% ROI
                    </Badge>
                  </div>
                </div>

                {/* Project Description */}
                <p className="text-gray-700 mb-6" data-testid={`text-project-description-${index}`}>
                  {project.description}
                </p>

                {/* Project Metrics */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6">
                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <div className="text-lg font-bold text-teal-600">
                      {(project as any).computedCost ? formatCurrency((project as any).computedCost) : formatCurrency((project.costRangeLow + project.costRangeHigh) / 2)}
                    </div>
                    <div className="text-sm text-gray-600">
                      {(project as any).computedCost ? 'Validated Cost' : 'Est. Cost'}
                    </div>
                    {(project as any).costPerSqftUsed && (
                      <div className="text-xs text-gray-500 mt-1">
                        ${(project as any).costPerSqftUsed}/sqft
                      </div>
                    )}
                  </div>
                  <div className="text-center p-4 bg-gray-50 rounded-lg">
                    <div className="text-lg font-bold text-green-600">
                      {formatCurrency(project.valueAdd)}
                    </div>
                    <div className="text-sm text-gray-600">
                      {(project as any).corrected ? 'Validated Value Add' : 'Est. Value Add'}
                    </div>
                    {(project as any).pricePsfUsed && (
                      <div className="text-xs text-gray-500 mt-1">
                        ${(project as any).pricePsfUsed}/sqft
                      </div>
                    )}
                  </div>
                  <div className="text-center p-4 bg-orange-50 rounded-lg">
                    <div className="text-lg font-bold text-orange-600">
                      {(project as any).computedValue ? 
                        formatCurrency((project as any).computedValue) : 
                        (propertyData.price ? formatCurrency(propertyData.price + project.valueAdd) : 'N/A')
                      }
                    </div>
                    <div className="text-sm text-gray-600">Post-Renovation Value</div>
                    {(project as any).newTotalSqft && (
                      <div className="text-xs text-gray-500 mt-1">
                        {(project as any).newTotalSqft.toLocaleString()} sqft total
                      </div>
                    )}
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
                      {(project.contractors || []).slice(0, 2).map((contractor, contractorIndex) => (
                        <div 
                          key={contractorIndex} 
                          className="p-3 bg-blue-50 border border-blue-200 rounded-lg"
                          data-testid={`card-contractor-${contractorIndex}`}
                        >
                          <div className="font-medium text-blue-700 mb-1">{contractor.name}</div>
                          <div className="text-sm text-blue-600 mb-1">{contractor.specialty}</div>
                          {(contractor.city || contractor.distanceMiles) && (
                            <div className="text-xs text-gray-500 mb-2">
                              {contractor.city && contractor.state && `📍 ${contractor.city}, ${contractor.state}`}
                              {contractor.distanceMiles && ` • ${Math.round(contractor.distanceMiles)} miles away`}
                              {contractor.source && (
                                <span className={`ml-2 px-2 py-0.5 rounded text-xs ${getSourceBadgeStyle(contractor.source)}`}>
                                  {getSourceLabel(contractor.source)}
                                </span>
                              )}
                            </div>
                          )}
                          <div className="flex gap-2">
                            {contractor.contact && (
                              <button 
                                className="flex items-center px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs transition-colors"
                                onClick={() => window.open(`tel:${contractor.contact}`, '_self')}
                                data-testid={`button-call-${contractorIndex}`}
                              >
                                📞 Call
                              </button>
                            )}
                            {contractor.website && (
                              <button 
                                className="flex items-center px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-xs transition-colors"
                                onClick={() => window.open(contractor.website, '_blank')}
                                data-testid={`button-website-${contractorIndex}`}
                              >
                                🌐 Website
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Validation Summary */}
        {validationSummary && (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl font-semibold flex items-center" data-testid="title-validation-summary">
                <CheckCircle className="w-5 h-5 mr-2 text-blue-600" />
                Accuracy Validation Summary
              </CardTitle>
              <div className="text-sm text-gray-600">
                Mathematical consistency checks and pricing validation applied to ensure accurate calculations
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Validation Statistics */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-gray-900">Validation Statistics</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                      <span className="text-sm font-medium">Projects Analyzed</span>
                      <span className="font-bold text-blue-700">{validationSummary.totalProjects || renovationProjects.length}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                      <span className="text-sm font-medium">Projects Corrected</span>
                      <span className="font-bold text-green-700">{validationSummary.totalCorrected || 0}</span>
                    </div>
                    <div className="flex justify-between items-center p-3 bg-orange-50 rounded-lg">
                      <span className="text-sm font-medium">Avg. Deviation Fixed</span>
                      <span className="font-bold text-orange-700">
                        {validationSummary.avgCostDelta ? `${Math.round(validationSummary.avgCostDelta)}%` : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Pricing Sources */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-gray-900">Pricing Sources</h4>
                  <div className="space-y-2">
                    <div className="text-sm text-gray-600">Cost Models:</div>
                    <div className="flex flex-wrap gap-2">
                      <Badge className="bg-blue-100 text-blue-700">Market Data</Badge>
                      <Badge className="bg-green-100 text-green-700">Regional Costs</Badge>
                    </div>
                    <div className="text-sm text-gray-600 mt-3">Value Models:</div>
                    <div className="flex flex-wrap gap-2">
                      <Badge className="bg-purple-100 text-purple-700">Comparable Sales</Badge>
                      <Badge className="bg-orange-100 text-orange-700">Price/SqFt Analysis</Badge>
                    </div>
                  </div>
                </div>

                {/* Accuracy Improvements */}
                <div className="space-y-4">
                  <h4 className="font-semibold text-gray-900">Accuracy Improvements</h4>
                  <div className="space-y-3 text-sm">
                    {validationSummary.correctedProjectIds && validationSummary.correctedProjectIds.length > 0 ? (
                      <>
                        <div className="p-3 bg-green-50 rounded-lg">
                          <div className="font-medium text-green-800">✓ Mathematical Consistency</div>
                          <div className="text-green-700 text-xs mt-1">
                            Square footage × cost per sqft = total cost
                          </div>
                        </div>
                        <div className="p-3 bg-blue-50 rounded-lg">
                          <div className="font-medium text-blue-800">✓ Market-Based Pricing</div>
                          <div className="text-blue-700 text-xs mt-1">
                            Values based on local comparable sales
                          </div>
                        </div>
                        <div className="p-3 bg-purple-50 rounded-lg">
                          <div className="font-medium text-purple-800">✓ ROI Recalculation</div>
                          <div className="text-purple-700 text-xs mt-1">
                            Return calculations updated with validated costs
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="p-3 bg-gray-50 rounded-lg">
                        <div className="font-medium text-gray-800">✓ AI Estimates Verified</div>
                        <div className="text-gray-700 text-xs mt-1">
                          Original calculations within acceptable range
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Validation Details */}
              {validationSummary.correctedProjectIds && validationSummary.correctedProjectIds.length > 0 && (
                <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="text-sm">
                    <div className="font-medium text-blue-900 mb-2">🔍 Validation Process Details</div>
                    <div className="text-blue-800 space-y-1 text-xs">
                      <div>• Addition projects automatically corrected when AI estimates deviated over 10% from market data</div>
                      <div>• Remodel projects (kitchens, bathrooms) preserve AI estimates as they're harder to standardize</div>
                      <div>• All corrections logged with before/after values for transparency</div>
                      <div>• ROI rankings updated based on corrected financial projections</div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Local Market Comparables */}
        {comparableProperties && comparableProperties.length > 0 && (
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
                    <th className="text-left py-3 font-semibold">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {comparableProperties.map((comp, index) => (
                    <tr key={index} className="border-b" data-testid={`row-comparable-${index}`}>
                      <td className="py-3 font-medium">
                        {comp.address}
                        {comp.distanceMiles && (
                          <div className="text-xs text-gray-500 mt-1">
                            📍 {Math.round(comp.distanceMiles)} miles away
                          </div>
                        )}
                      </td>
                      <td className="py-3">{formatCurrency(comp.price)}</td>
                      <td className="py-3 text-gray-600">
                        {comp.beds} bed, {comp.baths} bath • {comp.sqft?.toLocaleString()} sqft • Sold {comp.dateSold}
                        <div className="text-xs text-gray-500 mt-1">
                          ${comp.pricePsf}/sq ft
                        </div>
                      </td>
                      <td className="py-3">
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${getSourceBadgeStyle(comp.source)}`}>
                          {getSourceLabel(comp.source)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        )}
        
        {/* Show message when no comparables available */}
        {(!comparableProperties || comparableProperties.length === 0) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl font-semibold" data-testid="title-market-comparables">Local Market Comparables</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-gray-500">
                <p>Comparable properties data is currently being processed or unavailable.</p>
                <p className="text-sm mt-2">This may occur when using demonstration data or if market data is limited for this area.</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}