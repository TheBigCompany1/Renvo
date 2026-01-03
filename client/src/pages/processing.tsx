import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { getAnalysisReport } from "@/lib/api";
import { Check } from "lucide-react";

export default function Processing() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();

  const { data: report, isLoading } = useQuery({
    queryKey: ['/api/reports', id],
    queryFn: () => getAnalysisReport(id!),
    refetchInterval: (data) => {
      // Stop polling when completed or failed
      if (data && typeof data === 'object' && 'status' in data) {
        if (data.status === 'completed' || data.status === 'failed') {
          return false;
        }
      }
      return 2000; // Poll every 2 seconds
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (report?.status === 'completed') {
      navigate(`/report/${id}`);
    } else if (report?.status === 'failed') {
      navigate('/');
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
    <div className="py-20" data-testid="processing-page">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <Card>
          <CardContent className="p-12">
            <div className="mb-8">
              <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                <div className="w-8 h-8 bg-accent rounded-full animate-bounce"></div>
              </div>
              <h2 className="text-3xl font-bold text-foreground mb-4" data-testid="text-analyzing-title">
                Analyzing Your Property
              </h2>
              <p className="text-muted-foreground text-lg">
                Our AI is working hard to provide you with the best renovation insights
              </p>
            </div>

            {/* Progress Steps */}
            <div className="space-y-4 max-w-md mx-auto" data-testid="progress-steps">
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
                  data-testid={`step-${step.id}`}
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
                Estimated completion: <span className="font-medium" data-testid="text-estimated-time">
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
