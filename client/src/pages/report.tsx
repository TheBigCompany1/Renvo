import { useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { getAnalysisReport } from "@/lib/api";
import { PropertyData, RenovationProject, ComparableProperty, Contractor, FinancialSummary as FinancialSummaryType } from "@shared/schema";
import { Download, DollarSign, Home, Calendar, MapPin, Target, TrendingUp, Clock, AlertTriangle, Users, CheckCircle, Star, GraduationCap, Footprints, Shield, CloudRain, FileText, Wallet, Building, MessageSquare, Sparkles, LineChart, Briefcase } from "lucide-react";
import { ReportChatPanel } from "@/components/report-chat-panel";

// Helper function to render star rating
const StarRating = ({ rating }: { rating: number }) => {
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    stars.push(
      <Star
        key={i}
        className={`w-4 h-4 ${i <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
      />
    );
  }
  return <div className="flex items-center gap-0.5">{stars}</div>;
};

// Helper function to get star rating from ROI
const getRoiStarRating = (roi: number): number => {
  if (roi >= 150) return 5;
  if (roi >= 100) return 4;
  if (roi >= 50) return 3;
  if (roi >= 25) return 2;
  return 1;
};

export default function Report() {
  const { id } = useParams<{ id: string }>();
  const [imageLoadError, setImageLoadError] = useState(false);

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
  const renovationProjectsRaw = report.renovationProjects as RenovationProject[];
  // Sort by calculated ROI for consistency with displayed values
  const renovationProjects = [...renovationProjectsRaw].sort((a, b) => {
    const costA = (a.costRangeLow + a.costRangeHigh) / 2;
    const costB = (b.costRangeLow + b.costRangeHigh) / 2;
    const roiA = costA > 0 ? ((a.valueAdd - costA) / costA) * 100 : 0;
    const roiB = costB > 0 ? ((b.valueAdd - costB) / costB) * 100 : 0;
    return roiB - roiA;
  });
  const comparableProperties = (report.comparableProperties as ComparableProperty[]) || [];
  const financialSummary = report.financialSummary as FinancialSummaryType;
  const validationSummary = report.validationSummary as any;
  const imagery = report.imagery as { streetViewUrl?: string; satelliteUrl?: string } | undefined;

  const reportDate = report.completedAt ? new Date(report.completedAt).toLocaleDateString() : new Date().toLocaleDateString();

  // Use the Street View URL from the backend (already includes API key)
  const streetViewUrl = imagery?.streetViewUrl || null;

  // Calculate ROI properly: (Value Add - Cost) / Cost * 100
  const calculateROI = (project: RenovationProject) => {
    const cost = (project.costRangeLow + project.costRangeHigh) / 2;
    if (cost <= 0) return 0;
    return Math.round(((project.valueAdd - cost) / cost) * 100);
  };

  // Calculate opportunity score (average ROI across all projects)
  const opportunityScore = renovationProjects.length > 0
    ? Math.round(renovationProjects.reduce((sum, project) => sum + calculateROI(project), 0) / renovationProjects.length)
    : 0;

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

  // Extract owner and investor analysis from validation summary if available
  const ownerAnalysis = validationSummary?.ownerAnalysis;
  const investorAnalysis = validationSummary?.investorAnalysis;

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

      <div className="max-w-[1400px] mx-auto px-4 py-8">
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
          {/* Main Report Column (Spans 3 cols on xl) */}
          <div className="xl:col-span-3 space-y-8">
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
                        <div className="text-sm text-gray-600">Current Estimate</div>
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
                    {propertyData.lastSoldPrice && (
                      <div className="mt-4 p-3 bg-blue-50 rounded-lg text-center">
                        <div className="text-lg font-semibold text-blue-700">
                          Last Sold: {formatCurrency(propertyData.lastSoldPrice)}
                          {propertyData.lastSoldDate && (
                            <span className="text-sm font-normal text-blue-600 ml-2">({propertyData.lastSoldDate})</span>
                          )}
                        </div>
                      </div>
                    )}
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

                  {/* Property Image - Google Street View for guaranteed accuracy */}
                  <div className="flex justify-center">
                    {streetViewUrl && !imageLoadError ? (
                      <img
                        src={streetViewUrl}
                        alt={`Street View of ${propertyData.address}`}
                        className="rounded-lg shadow-lg w-full h-64 object-cover"
                        data-testid="img-property-main"
                        onError={() => setImageLoadError(true)}
                      />
                    ) : (
                      <div className="rounded-lg shadow-lg w-full h-64 bg-gradient-to-br from-teal-50 to-teal-100 flex items-center justify-center">
                        <div className="text-center">
                          <Home className="w-16 h-16 text-teal-300 mx-auto mb-2" />
                          <p className="text-teal-600 font-medium">Property Analysis</p>
                          <p className="text-teal-500 text-sm">{propertyData.address}</p>
                        </div>
                      </div>
                    )}
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

            {/* Investment Verdict & Scoring Overview */}
            {validationSummary && (
              <Card className={`border-2 ${validationSummary.verdict?.includes('Strong') || opportunityScore >= 75 ? 'border-green-500' : validationSummary.verdict?.includes('Poor') ? 'border-red-500' : 'border-orange-500'}`}>
                <CardHeader className={`bg-gradient-to-r ${validationSummary.verdict?.includes('Strong') || opportunityScore >= 75 ? 'from-green-50' : validationSummary.verdict?.includes('Poor') ? 'from-red-50' : 'from-orange-50'} to-white`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-xl font-bold flex items-center gap-2" data-testid="title-investment-analysis">
                        <LineChart className={`w-6 h-6 ${validationSummary.verdict?.includes('Strong') || opportunityScore >= 75 ? 'text-green-600' : 'text-orange-600'}`} />
                        Investment Thesis & Verdict
                      </CardTitle>
                      <p className="text-sm text-gray-600 mt-1">AI-generated risk assessment and strategic recommendation</p>
                    </div>
                    <div className="text-right">
                      <Badge className={`text-sm px-3 py-1 ${validationSummary.verdict?.includes('Strong') || opportunityScore >= 75 ? 'bg-green-100 text-green-800' : validationSummary.verdict?.includes('Poor') ? 'bg-red-100 text-red-800' : 'bg-orange-100 text-orange-800'}`}>
                        {validationSummary.verdict || (opportunityScore >= 75 ? 'Strong Investment' : opportunityScore >= 50 ? 'Good Opportunity' : opportunityScore >= 25 ? 'Marginal' : 'High Risk')}
                      </Badge>
                      <div className="text-xs text-gray-500 mt-2 font-medium">Confidence Score: {Math.round(opportunityScore)}/100</div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-6 space-y-6">
                  {/* Thesis Reasoning */}
                  {validationSummary.reasoning && (
                    <div className="bg-gray-50 p-5 rounded-xl border border-gray-100">
                      <h4 className="font-semibold text-gray-900 mb-2 flex items-center">
                        <Target className="w-4 h-4 mr-2 text-blue-600" />
                        Executive Summary
                      </h4>
                      <p className="text-gray-700 leading-relaxed text-sm">
                        {validationSummary.reasoning}
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Best Strategy */}
                    {validationSummary.bestStrategy && (
                      <div className="space-y-2">
                        <h4 className="font-semibold text-gray-900 text-sm uppercase tracking-wider">Primary Strategy</h4>
                        <div className="flex bg-blue-50/50 p-4 rounded-lg border border-blue-100 h-full items-center">
                          <span className="font-medium text-blue-900">{validationSummary.bestStrategy}</span>
                        </div>
                      </div>
                    )}

                    {/* Important Considerations */}
                    {validationSummary.importantConsiderations && validationSummary.importantConsiderations.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-semibold text-gray-900 text-sm uppercase tracking-wider">Critical Factors</h4>
                        <ul className="bg-orange-50/50 p-4 rounded-lg border border-orange-100 h-full space-y-2">
                          {validationSummary.importantConsiderations.map((consideration: string, i: number) => (
                            <li key={i} className="flex items-start text-sm text-orange-900">
                              <span className="mr-2 opacity-60">•</span>
                              <span className="leading-snug">{consideration}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Investor vs Owner Analysis */}
                  {(validationSummary.investorAnalysis || validationSummary.ownerAnalysis) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-gray-100">
                      {validationSummary.investorAnalysis && (
                        <div>
                          <h4 className="font-semibold text-gray-900 mb-3 flex items-center text-sm uppercase tracking-wider">
                            <Briefcase className="w-4 h-4 mr-2 text-indigo-600" />
                            Investor Profile
                          </h4>
                          <div className="space-y-3 bg-indigo-50/30 p-4 rounded-lg">
                            <div className="flex justify-between text-sm py-1 border-b border-indigo-100 border-dashed">
                              <span className="text-gray-600">Target Profit Margin</span>
                              <span className="font-medium text-indigo-900">{formatCurrency(validationSummary.investorAnalysis.targetProfit || 0)}</span>
                            </div>
                            <div className="flex justify-between text-sm py-1 border-b border-indigo-100 border-dashed">
                              <span className="text-gray-600">Max Purchase Price</span>
                              <span className="font-medium text-indigo-900">{formatCurrency(validationSummary.investorAnalysis.maxPurchasePriceForProfit || 0)}</span>
                            </div>
                            <p className="text-xs text-indigo-800 mt-2 bg-indigo-100/50 p-2 rounded">
                              {validationSummary.investorAnalysis.recommendation}
                            </p>
                          </div>
                        </div>
                      )}

                      {validationSummary.ownerAnalysis && (
                        <div>
                          <h4 className="font-semibold text-gray-900 mb-3 flex items-center text-sm uppercase tracking-wider">
                            <Home className="w-4 h-4 mr-2 text-emerald-600" />
                            Homeowner Profile
                          </h4>
                          <div className="space-y-3 bg-emerald-50/30 p-4 rounded-lg">
                            <div className="flex justify-between text-sm py-1 border-b border-emerald-100 border-dashed">
                              <span className="text-gray-600">Current Equity Est.</span>
                              <span className="font-medium text-emerald-900">{formatCurrency(validationSummary.ownerAnalysis.currentEquity || 0)}</span>
                            </div>
                            <div className="flex justify-between text-sm py-1 border-b border-emerald-100 border-dashed">
                              <span className="text-gray-600">Best Path Forward</span>
                              <span className="font-medium text-emerald-900">{validationSummary.ownerAnalysis.bestProjectForOwner}</span>
                            </div>
                            <p className="text-xs text-emerald-800 mt-2 bg-emerald-100/50 p-2 rounded">
                              {validationSummary.ownerAnalysis.recommendation}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                </CardContent>
              </Card>
            )}

            {/* Property History & Financials */}
            {(propertyData.permitHistory || propertyData.propertyTaxAnnual || propertyData.rentalPotential) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl font-semibold flex items-center gap-2">
                    <FileText className="w-5 h-5 text-teal-600" />
                    Property History & Financials
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Permit History */}
                    {propertyData.permitHistory && propertyData.permitHistory.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-teal-700 font-medium">
                          <FileText className="w-4 h-4" />
                          Permit History
                        </div>
                        <div className="space-y-2">
                          {propertyData.permitHistory.slice(0, 4).map((permit: any, idx: number) => (
                            <div key={idx} className="text-sm bg-gray-50 p-2 rounded">
                              <div className="flex justify-between">
                                <span className="font-medium text-gray-800">{permit.type}</span>
                                {permit.date && <span className="text-gray-500">{permit.date}</span>}
                              </div>
                              <p className="text-gray-600 text-xs mt-1">{permit.description}</p>
                              {permit.value && (
                                <p className="text-teal-600 text-xs font-medium mt-1">Value: {formatCurrency(permit.value)}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Property Taxes */}
                    {propertyData.propertyTaxAnnual && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-teal-700 font-medium">
                          <Wallet className="w-4 h-4" />
                          Property Taxes
                        </div>
                        <div className="bg-orange-50 p-4 rounded-lg text-center">
                          <div className="text-2xl font-bold text-orange-600">
                            {formatCurrency(propertyData.propertyTaxAnnual)}
                          </div>
                          <div className="text-sm text-gray-600 mt-1">Annual Property Tax</div>
                          {propertyData.propertyTaxRate && (
                            <div className="text-xs text-gray-500 mt-2">
                              Tax Rate: {propertyData.propertyTaxRate}%
                            </div>
                          )}
                          <div className="text-sm text-gray-600 mt-2">
                            {formatCurrency(propertyData.propertyTaxAnnual / 12)}/month
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Rental Potential */}
                    {propertyData.rentalPotential && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-teal-700 font-medium">
                          <Building className="w-4 h-4" />
                          Rental Income Potential
                        </div>
                        <div className="bg-blue-50 p-4 rounded-lg space-y-3">
                          {propertyData.rentalPotential.estimatedMonthlyRent && (
                            <div className="text-center">
                              <div className="text-2xl font-bold text-blue-600">
                                {formatCurrency(propertyData.rentalPotential.estimatedMonthlyRent)}/mo
                              </div>
                              <div className="text-sm text-gray-600">Estimated Rent</div>
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            {propertyData.rentalPotential.annualRentalIncome && (
                              <div>
                                <div className="text-gray-600">Annual Income</div>
                                <div className="font-medium">{formatCurrency(propertyData.rentalPotential.annualRentalIncome)}</div>
                              </div>
                            )}
                            {propertyData.rentalPotential.capRate && (
                              <div>
                                <div className="text-gray-600">Cap Rate</div>
                                <div className="font-medium">{propertyData.rentalPotential.capRate}%</div>
                              </div>
                            )}
                          </div>
                          {propertyData.rentalPotential.marketRentRange && (
                            <div className="text-xs text-gray-500 text-center">
                              Market Range: {formatCurrency(propertyData.rentalPotential.marketRentRange.low || 0)} - {formatCurrency(propertyData.rentalPotential.marketRentRange.high || 0)}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

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
                        <div className="w-8 h-8 bg-teal-600 text-white rounded-full flex items-center justify-center font-bold" data-testid={`text-project-rank-${index}`}>
                          #{project.rank ?? index + 1}
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold" data-testid={`text-project-name-${index}`}>
                            {project.name}
                          </h3>
                          {/* Star Rating - uses backend value, falls back for older reports */}
                          <div className="flex items-center gap-2 mt-1" data-testid={`star-rating-${index}`}>
                            <StarRating rating={project.starRating ?? getRoiStarRating(calculateROI(project))} />
                            <span className="text-sm text-gray-500">
                              {(() => {
                                const stars = project.starRating ?? getRoiStarRating(calculateROI(project));
                                return `(${stars >= 4 ? 'Excellent' : stars >= 3 ? 'Good' : 'Fair'} ROI)`;
                              })()}
                            </span>
                          </div>
                        </div>
                        {/* Validation Badge */}
                        {(project as any).corrected && (
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200" data-testid={`badge-corrected-${index}`}>
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Validated
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        <Badge variant="secondary" className="bg-orange-100 text-orange-700 font-bold text-lg px-3 py-1">
                          {calculateROI(project)}% ROI
                        </Badge>
                      </div>
                    </div>

                    {/* Balanced UX Layout */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8 mt-6">
                      
                      {/* Left Column: Narrative Analysis & Structured Data */}
                      <div className="lg:col-span-2 space-y-6">
                        {/* Narrative Description */}
                        <div>
                          <h4 className="font-semibold text-gray-900 mb-3 text-lg flex items-center">
                            <Sparkles className="w-5 h-5 mr-2 text-blue-500" />
                            Strategy & Opportunity
                          </h4>
                          <div className="prose prose-blue max-w-none text-gray-700 leading-relaxed bg-blue-50/50 p-5 rounded-xl border border-blue-100" data-testid={`text-project-description-${index}`}>
                            {project.description}
                          </div>
                        </div>

                        {/* Value Drivers & Target Demographic */}
                        {((project as any).value_drivers?.length > 0 || (project as any).target_demographic) && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {(project as any).value_drivers?.length > 0 && (
                              <div className="bg-emerald-50/50 p-5 rounded-xl border border-emerald-100">
                                <h4 className="font-semibold text-emerald-900 mb-3 text-sm uppercase tracking-wider flex items-center">
                                  <TrendingUp className="w-4 h-4 mr-2 text-emerald-600" />
                                  Value Drivers
                                </h4>
                                <ul className="space-y-2 text-emerald-800 text-sm">
                                  {(project as any).value_drivers.map((driver: string, i: number) => (
                                    <li key={i} className="flex items-start">
                                      <span className="mr-2 text-emerald-500">✓</span>
                                      <span className="leading-snug">{driver}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {(project as any).target_demographic && (
                              <div className="bg-purple-50/50 p-5 rounded-xl border border-purple-100">
                                <h4 className="font-semibold text-purple-900 mb-3 text-sm uppercase tracking-wider flex items-center">
                                  <Users className="w-4 h-4 mr-2 text-purple-600" />
                                  Target Market
                                </h4>
                                <p className="text-purple-800 text-sm leading-relaxed">
                                  {(project as any).target_demographic}
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Execution Roadmap & Risks */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {(project as any).roadmap_steps && (project as any).roadmap_steps.length > 0 && (
                            <div className="bg-gray-50/50 p-5 rounded-xl border border-gray-200">
                              <h4 className="font-semibold text-gray-900 mb-3 text-sm uppercase tracking-wider flex items-center">
                                <CheckCircle className="w-4 h-4 mr-2 text-gray-600" />
                                Execution Roadmap
                              </h4>
                              <ul className="space-y-3 text-gray-700 text-sm">
                                {(project as any).roadmap_steps.map((step: string, i: number) => (
                                  <li key={i} className="flex items-start">
                                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center text-xs font-bold mr-3 mt-0.5">{i + 1}</div>
                                    <span className="leading-snug">{step}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {(project as any).potential_risks && (project as any).potential_risks.length > 0 && (
                            <div className="bg-orange-50/50 p-5 rounded-xl border border-orange-100">
                              <h4 className="font-semibold text-orange-900 mb-3 text-sm uppercase tracking-wider flex items-center">
                                <AlertTriangle className="w-4 h-4 mr-2 text-orange-500" />
                                Risk Factors
                              </h4>
                              <ul className="space-y-2 text-orange-800 text-sm">
                                {(project as any).potential_risks.map((risk: string, i: number) => (
                                  <li key={i} className="flex items-start">
                                    <span className="mr-2 opacity-60">•</span>
                                    <span className="leading-snug">{risk}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>

                      </div>

                      {/* Right Column: Financial Breakdown ("Receipt" format) */}
                      {(() => {
                        const projectCost = (project as any).computedCost || (project.costRangeLow + project.costRangeHigh) / 2;
                        const netProfit = project.valueAdd - projectCost;
                        return (
                          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col justify-center space-y-4">
                            <h4 className="font-semibold text-gray-900 mb-1 border-b pb-3 text-center tracking-tight uppercase text-sm">
                              Financial Breakdown
                            </h4>

                            <div className="flex justify-between items-center py-2 border-b border-gray-50 border-dashed">
                              <span className="text-gray-600 font-medium">Est. Cost</span>
                              <div className="text-right">
                                <span className="font-bold text-teal-700">{formatCurrency(projectCost)}</span>
                                {(project as any).costPerSqftUsed && <div className="text-xs text-gray-400 mt-0.5">${(project as any).costPerSqftUsed}/sqft</div>}
                              </div>
                            </div>

                            <div className="flex justify-between items-center py-2 border-b border-gray-50 border-dashed">
                              <span className="text-gray-600 font-medium">Value Add</span>
                              <div className="text-right">
                                <span className="font-bold text-green-700">+{formatCurrency(project.valueAdd)}</span>
                                {(project as any).pricePsfUsed && <div className="text-xs text-gray-400 mt-0.5">${(project as any).pricePsfUsed}/sqft</div>}
                              </div>
                            </div>

                            <div className="flex justify-between items-center py-2 border-b border-gray-50 border-dashed">
                              <span className="text-gray-600 font-medium">Timeline</span>
                              <span className="font-bold text-blue-700">{project.timeline}</span>
                            </div>

                            <div className={`flex justify-between items-center p-3 rounded-lg ${netProfit > 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                              <span className="font-semibold text-gray-800">Net Profit</span>
                              <span className={`font-bold ${netProfit > 0 ? 'text-green-700' : 'text-red-700'}`}>
                                {netProfit > 0 ? '+' : ''}{formatCurrency(netProfit)}
                              </span>
                            </div>

                            <div className="flex justify-between items-center p-3 bg-gray-900 rounded-lg text-white mt-2">
                              <span className="font-medium text-gray-300">Post-Reno Value</span>
                              <div className="text-right">
                                <span className="font-bold text-lg text-white">
                                  {(project as any).computedValue ?
                                    formatCurrency((project as any).computedValue) :
                                    (financialSummary?.currentValue ? formatCurrency(financialSummary.currentValue + project.valueAdd) : 'N/A')
                                  }
                                </span>
                                {(project as any).newTotalSqft && <div className="text-xs text-gray-400 mt-0.5">{(project as any).newTotalSqft.toLocaleString()} sqft</div>}
                              </div>
                            </div>

                          </div>
                        );
                      })()}

                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>


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

            {/* Neighborhood & Lifestyle Scores */}
            {(propertyData.schools || propertyData.walkScores || propertyData.crimeStats || propertyData.hazardRisk) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-xl font-semibold flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-teal-600" />
                    Neighborhood & Lifestyle
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {/* Schools */}
                    {propertyData.schools && propertyData.schools.length > 0 && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-teal-700 font-medium">
                          <GraduationCap className="w-4 h-4" />
                          Nearby Schools
                        </div>
                        {propertyData.schools.slice(0, 3).map((school: any, idx: number) => (
                          <div key={idx} className="flex justify-between items-center text-sm bg-gray-50 p-2 rounded">
                            <span className="text-gray-700 truncate max-w-[60%]">{school.name}</span>
                            <Badge variant={school.rating >= 8 ? "default" : school.rating >= 5 ? "secondary" : "outline"}>
                              {school.rating}/10
                            </Badge>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Walk Scores */}
                    {propertyData.walkScores && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-teal-700 font-medium">
                          <Footprints className="w-4 h-4" />
                          Walkability Scores
                        </div>
                        <div className="space-y-2">
                          {propertyData.walkScores.walkScore !== undefined && (
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-gray-600">Walk Score</span>
                              <div className="flex items-center gap-2">
                                <Progress value={propertyData.walkScores.walkScore} className="w-20 h-2" />
                                <span className="font-medium w-8">{propertyData.walkScores.walkScore}</span>
                              </div>
                            </div>
                          )}
                          {propertyData.walkScores.transitScore !== undefined && (
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-gray-600">Transit Score</span>
                              <div className="flex items-center gap-2">
                                <Progress value={propertyData.walkScores.transitScore} className="w-20 h-2" />
                                <span className="font-medium w-8">{propertyData.walkScores.transitScore}</span>
                              </div>
                            </div>
                          )}
                          {propertyData.walkScores.bikeScore !== undefined && (
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-gray-600">Bike Score</span>
                              <div className="flex items-center gap-2">
                                <Progress value={propertyData.walkScores.bikeScore} className="w-20 h-2" />
                                <span className="font-medium w-8">{propertyData.walkScores.bikeScore}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Crime Stats */}
                    {propertyData.crimeStats && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-teal-700 font-medium">
                          <Shield className="w-4 h-4" />
                          Safety & Crime
                        </div>
                        <div className="space-y-2">
                          {propertyData.crimeStats.overallRating && (
                            <div className="flex items-center gap-2">
                              <Badge variant={
                                propertyData.crimeStats.overallRating === 'very_low' || propertyData.crimeStats.overallRating === 'low'
                                  ? "default"
                                  : propertyData.crimeStats.overallRating === 'moderate'
                                    ? "secondary"
                                    : "destructive"
                              }>
                                {propertyData.crimeStats.overallRating.replace('_', ' ').toUpperCase()} CRIME
                              </Badge>
                            </div>
                          )}
                          {propertyData.crimeStats.description && (
                            <p className="text-sm text-gray-600">{propertyData.crimeStats.description}</p>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Hazard Risk */}
                    {propertyData.hazardRisk && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-teal-700 font-medium">
                          <CloudRain className="w-4 h-4" />
                          Natural Hazards
                        </div>
                        <div className="space-y-2 text-sm">
                          {propertyData.hazardRisk.floodZone && (
                            <div className="flex justify-between">
                              <span className="text-gray-600">Flood Zone</span>
                              <span className="font-medium">{propertyData.hazardRisk.floodZone}</span>
                            </div>
                          )}
                          {propertyData.hazardRisk.floodRisk && (
                            <div className="flex justify-between items-center">
                              <span className="text-gray-600">Flood Risk</span>
                              <Badge variant={propertyData.hazardRisk.floodRisk === 'minimal' || propertyData.hazardRisk.floodRisk === 'low' ? "default" : "secondary"}>
                                {propertyData.hazardRisk.floodRisk}
                              </Badge>
                            </div>
                          )}
                          {propertyData.hazardRisk.fireRisk && (
                            <div className="flex justify-between items-center">
                              <span className="text-gray-600">Fire Risk</span>
                              <Badge variant={propertyData.hazardRisk.fireRisk === 'minimal' || propertyData.hazardRisk.fireRisk === 'low' ? "default" : "secondary"}>
                                {propertyData.hazardRisk.fireRisk}
                              </Badge>
                            </div>
                          )}
                          {propertyData.hazardRisk.earthquakeRisk && (
                            <div className="flex justify-between items-center">
                              <span className="text-gray-600">Earthquake Risk</span>
                              <Badge variant={propertyData.hazardRisk.earthquakeRisk === 'minimal' || propertyData.hazardRisk.earthquakeRisk === 'low' ? "default" : "secondary"}>
                                {propertyData.hazardRisk.earthquakeRisk}
                              </Badge>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Accuracy Validation Summary - Moved to Bottom */}
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
          </div>

          {/* --- Chatbox Column --- */}
          <div className="xl:col-span-1">
            <ReportChatPanel reportId={id!} />
          </div>
        </div>
      </div>
    </div>
  );
}