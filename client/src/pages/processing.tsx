import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getAnalysisReport } from "@/lib/api";
import { Check, CheckCircle, MailOpen, AlertTriangle, RefreshCw, Home } from "lucide-react";
import { EmailSignup } from "@/components/email-signup";

export default function Processing() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const [emailCaptured, setEmailCaptured] = useState(false);
  const [showEmailCapture, setShowEmailCapture] = useState(false);

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
    if (report?.status === 'completed' && !showEmailCapture && !emailCaptured) {
      // Show email capture when analysis is complete but email hasn't been captured yet
      setShowEmailCapture(true);
    }
    // Note: We no longer auto-navigate on failed status - we show an error page instead
    // The setTimeout in handleEmailSuccess will handle the delayed navigation for success
  }, [report?.status, navigate, id, showEmailCapture, emailCaptured]);

  const handleEmailSuccess = () => {
    setEmailCaptured(true);
    // Small delay to show success state before navigation
    setTimeout(() => {
      navigate(`/report/${id}`);
    }, 1500);
  };

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

  // Show email capture when analysis is complete
  if (showEmailCapture && report?.status === 'completed') {
    return (
      <div className="py-20" data-testid="email-capture-page">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <Card className="shadow-lg border-0 bg-white">
            <CardHeader className="text-center pb-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <CardTitle className="text-2xl font-bold text-foreground mb-2" data-testid="title-analysis-complete">
                Analysis Complete!
              </CardTitle>
              <p className="text-muted-foreground text-lg">
                Your property analysis is ready. Get your detailed report delivered to your inbox.
              </p>
            </CardHeader>
            <CardContent className="pt-2 pb-8">
              <div className="mb-6 p-4 bg-teal-50 rounded-lg border border-teal-200">
                <div className="flex items-center space-x-3 mb-3">
                  <MailOpen className="w-5 h-5 text-teal-600" />
                  <h3 className="font-semibold text-teal-800">Why we need your email:</h3>
                </div>
                <ul className="text-sm text-teal-700 space-y-1">
                  <li>• Access your report anytime with a secure link</li>
                  <li>• Get notified of market updates for your property</li>
                  <li>• Receive tips and insights for your renovation projects</li>
                </ul>
              </div>
              
              <EmailSignup
                signupSource="property-analysis"
                reportId={id}
                placeholder="Enter your email to access your report"
                buttonText="Get My Report"
                loadingText="Preparing your report..."
                successMessage="Perfect! Redirecting to your report..."
                description="Join thousands of property investors who trust RENVO for market insights."
                layout="vertical"
                size="lg"
                variant="card"
                styling={{
                  container: "border-0 shadow-none bg-transparent p-0",
                  input: "h-12 text-base border-gray-300 focus:border-teal-500 focus:ring-teal-500",
                  button: "h-12 bg-teal-600 hover:bg-teal-700 text-white font-semibold",
                  description: "text-center text-gray-600 mb-4"
                }}
                onSuccess={handleEmailSuccess}
                testIdPrefix="property-analysis-email"
                data-testid="email-signup-property-analysis"
              />
              
              <div className="mt-6 text-center">
                <p className="text-xs text-gray-500">
                  By providing your email, you agree to receive updates from RENVO. Unsubscribe anytime.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Show error state when analysis failed
  if (report?.status === 'failed') {
    const failureReason = (report as any).failureReason || 
      "We encountered an issue while processing your property. Please try again.";
    
    return (
      <div className="py-20" data-testid="error-page">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <Card className="shadow-lg border-0 bg-white">
            <CardHeader className="text-center pb-4">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
              <CardTitle className="text-2xl font-bold text-foreground mb-2" data-testid="title-analysis-failed">
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
                    <span>Double-check that the Redfin URL is correct and the property exists</span>
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
                  data-testid="button-try-again"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Try Again
                </Button>
                <Button
                  variant="outline"
                  onClick={() => navigate('/')}
                  data-testid="button-go-home"
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
