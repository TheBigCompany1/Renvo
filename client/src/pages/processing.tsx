import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getAnalysisReport } from "@/lib/api";
import { Check, AlertTriangle, RefreshCw, Home } from "lucide-react";

export default function Processing() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();

  const { data: report, isLoading } = useQuery({
    queryKey: ['/api/reports', id],
    queryFn: () => getAnalysisReport(id!),
    refetchInterval: (data) => {
      if (data && typeof data === 'object' && 'status' in data) {
        if (data.status === 'completed' || data.status === 'failed') {
          return false;
        }
      }
      return 2000;
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (report?.status === 'completed') {
      navigate(`/report/${id}`);
    }
  }, [report?.status, navigate, id]);

  if (isLoading || !report) {
    return (
      <div className="py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Card>
            <CardContent className="p-12">
              <div className="animate-pulse">Loading...</div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (report?.status === 'failed') {
    const failureReason = (report as any).failureReason ||
      "We encountered an issue while processing your property. Please try again.";

    return (
      <div className="py-20">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <Card className="shadow-lg border-0 bg-white">
            <CardHeader className="text-center pb-4">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
              <CardTitle className="text-2xl font-bold text-foreground mb-2">
                Unable to Complete Analysis
              </CardTitle>
              <p className="text-muted-foreground text-base">
                {failureReason}
              </p>
            </CardHeader>
            <CardContent className="pt-2 pb-8">
              <div className="mb-6 p-4 bg-amber-50 rounded-lg border border-amber-200">
                <h3 className="font-semibold text-amber-800 mb-2">What you can do:</h3>
                <ul className="text-sm text-amber-700 space-y-2">
                  <li className="flex items-start gap-2">
                    <span className="font-medium">1.</span>
                    <span>Try entering the property address manually instead of a URL</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-medium">2.</span>
                    <span>Double-check that the address is correct and the property exists</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-medium">3.</span>
                    <span>Wait a few minutes and try again</span>
                  </li>
                </ul>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  onClick={() => navigate('/')}
                  className="bg-teal-600 hover:bg-teal-700 text-white"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Try Again
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate('/')}
                >
                  <Home className="w-4 h-4 mr-2" />
                  Go Home
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const steps = [
    { id: 'extraction', label: 'Property data extraction', completed: !!report.propertyData },
    { id: 'analysis', label: 'AI renovation analysis', completed: !!report.renovationProjects },
    { id: 'calculations', label: 'Financial calculations', completed: !!report.financialSummary },
    { id: 'comparables', label: 'Comparable property search', completed: !!report.comparableProperties },
    { id: 'contractors', label: 'Contractor recommendations', completed: !!report.contractors },
  ];

  const currentStep = steps.findIndex(step => !step.completed);
  const completedSteps = steps.filter(step => step.completed).length;

  return (
    <div className="py-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <Card>
          <CardContent className="p-12">
            <div className="mb-8">
              <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                <div className="w-8 h-8 bg-accent rounded-full animate-bounce"></div>
              </div>
              <h2 className="text-3xl font-bold text-foreground mb-4">
                Analyzing Your Property
              </h2>
              <p className="text-muted-foreground text-lg">
                Our AI is working hard to provide you with the best renovation insights
              </p>
            </div>

            <div className="space-y-4 max-w-md mx-auto">
              {steps.map((step, index) => (
                <div
                  key={step.id}
                  className={`flex items-center space-x-3 p-3 rounded-lg ${
                    step.completed
                      ? 'bg-muted/50'
                      : index === currentStep
                      ? 'bg-accent/10'
                      : ''
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center ${
                      step.completed
                        ? 'bg-accent'
                        : index === currentStep
                        ? 'bg-accent animate-spin'
                        : 'border-2 border-muted'
                    }`}
                  >
                    {step.completed ? (
                      <Check className="w-4 h-4 text-white" />
                    ) : index === currentStep ? (
                      <div className="w-3 h-3 bg-white rounded-full"></div>
                    ) : null}
                  </div>
                  <span
                    className={`font-medium ${
                      step.completed || index === currentStep
                        ? 'text-foreground'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-8">
              <p className="text-sm text-muted-foreground">
                Estimated completion: <span className="font-medium">
                  {completedSteps < 5 ? `${Math.ceil((5 - completedSteps) * 0.5)} minutes` : 'Almost done'}
                </span>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
