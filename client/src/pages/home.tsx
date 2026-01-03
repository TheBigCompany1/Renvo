import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { createAnalysisReport } from "@/lib/api";
import { Link2, Shield, Calculator, Wrench } from "lucide-react";

export default function Home() {
  const [propertyUrl, setPropertyUrl] = useState("");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const createReportMutation = useMutation({
    mutationFn: createAnalysisReport,
    onSuccess: (data) => {
      navigate(`/processing/${data.reportId}`);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start analysis. Please check your URL and try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!propertyUrl) {
      toast({
        title: "URL Required",
        description: "Please enter a Redfin property URL",
        variant: "destructive",
      });
      return;
    }

    if (!propertyUrl.includes('redfin.com')) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid Redfin property URL",
        variant: "destructive",
      });
      return;
    }

    createReportMutation.mutate(propertyUrl);
  };

  return (
    <div className="py-12 lg:py-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h1 className="text-4xl lg:text-6xl font-bold text-foreground mb-6">
          AI-Powered Real Estate <br className="hidden sm:block" />
          <span className="text-accent">Renovation Analysis</span>
        </h1>
        <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
          Transform any Redfin property URL into a comprehensive renovation report with cost estimates, 
          ROI calculations, and contractor recommendations.
        </p>

        {/* URL Input Form */}
        <Card className="max-w-2xl mx-auto">
          <CardContent className="p-8">
            <div className="mb-6">
              <h2 className="text-2xl font-semibold text-foreground mb-2">Start Your Analysis</h2>
              <p className="text-muted-foreground">Paste a Redfin property URL to begin</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative" data-testid="url-input-container">
                <Input
                  type="url"
                  placeholder="https://www.redfin.com/property-url..."
                  value={propertyUrl}
                  onChange={(e) => setPropertyUrl(e.target.value)}
                  className="pl-12"
                  data-testid="input-property-url"
                />
                <Link2 className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
              </div>

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={createReportMutation.isPending}
                data-testid="button-analyze-property"
              >
                {createReportMutation.isPending ? "Starting Analysis..." : "Analyze Property"}
              </Button>
            </form>

            <div className="mt-6 text-sm text-muted-foreground">
              <p>✓ Free analysis • ✓ No signup required • ✓ Results in 2-3 minutes</p>
            </div>
          </CardContent>
        </Card>

        {/* Feature Highlights */}
        <div className="grid md:grid-cols-3 gap-8 mt-16">
          <div className="text-center">
            <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center mx-auto mb-4">
              <Shield className="w-6 h-6 text-accent" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">AI-Powered Analysis</h3>
            <p className="text-muted-foreground">
              Advanced AI analyzes property photos and details to identify the most profitable renovation opportunities.
            </p>
          </div>

          <div className="text-center">
            <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center mx-auto mb-4">
              <Calculator className="w-6 h-6 text-accent" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Financial Projections</h3>
            <p className="text-muted-foreground">
              Get detailed cost estimates, ARV calculations, and ROI projections backed by local market data.
            </p>
          </div>

          <div className="text-center">
            <div className="w-12 h-12 bg-accent/10 rounded-lg flex items-center justify-center mx-auto mb-4">
              <Wrench className="w-6 h-6 text-accent" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">Contractor Network</h3>
            <p className="text-muted-foreground">
              Connect with vetted local contractors specialized in your recommended renovation projects.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
