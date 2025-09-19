import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Search, 
  Brain, 
  FileText, 
  DollarSign, 
  MapPin, 
  Users, 
  ArrowRight, 
  CheckCircle 
} from "lucide-react";

export default function HowItWorks() {
  const steps = [
    {
      number: "01",
      title: "Enter Property URL",
      description: "Simply paste a Redfin or Zillow URL of the property you're interested in analyzing. Our system works with most major real estate platforms.",
      icon: Search,
      features: [
        "Support for Redfin and Zillow URLs",
        "No account registration required",
        "Instant property data extraction",
        "Secure and private analysis"
      ]
    },
    {
      number: "02", 
      title: "AI Analyzes the Property",
      description: "Our advanced AI system analyzes the property using machine learning models trained on thousands of successful renovations and market data.",
      icon: Brain,
      features: [
        "Property condition assessment", 
        "Market trends analysis",
        "Neighborhood evaluation",
        "Comparable property research"
      ]
    },
    {
      number: "03",
      title: "Get Your Comprehensive Report", 
      description: "Receive a detailed renovation report with ROI calculations, comparable properties, and vetted contractor recommendations to maximize your investment.",
      icon: FileText,
      features: [
        "ROI calculations & projections",
        "Comparable property analysis", 
        "Contractor recommendations",
        "Detailed renovation roadmap"
      ]
    }
  ];

  const reportFeatures = [
    {
      icon: DollarSign,
      title: "ROI Analysis",
      description: "Detailed return on investment calculations with multiple scenarios"
    },
    {
      icon: MapPin,
      title: "Market Comparables",
      description: "Recent sales data and market trends for similar properties"
    },
    {
      icon: Users,
      title: "Contractor Network",
      description: "Vetted contractors with reviews and competitive pricing"
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.1),transparent)] dark:bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.05),transparent)]" />
        
        <div className="relative z-10 container mx-auto px-4 py-20 lg:py-32">
          <div className="text-center max-w-4xl mx-auto">
            <h1 className="text-4xl lg:text-6xl font-bold text-white mb-6 tracking-tight" data-testid="title-how-it-works">
              How It Works
            </h1>
            <p className="text-xl lg:text-2xl text-white/90 mb-8 font-medium" data-testid="text-hero-description">
              Transform any property listing into a comprehensive renovation investment analysis in minutes
            </p>
            <p className="text-lg text-white/70 max-w-2xl mx-auto" data-testid="text-hero-subtitle">
              Our AI-powered platform analyzes properties, market conditions, and renovation opportunities to help real estate investors make informed decisions.
            </p>
          </div>
        </div>
      </div>

      {/* Steps Section */}
      <div className="container mx-auto px-4 py-20">
        <div className="space-y-20">
          {steps.map((step, index) => {
            const IconComponent = step.icon;
            const isEven = index % 2 === 0;
            
            return (
              <div key={step.number} className={`relative flex flex-col ${isEven ? 'lg:flex-row' : 'lg:flex-row-reverse'} items-center gap-12 lg:gap-20`} data-testid={`step-${step.number}`}>
                {/* Content */}
                <div className="flex-1 space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-r from-orange-500 to-red-500 flex items-center justify-center text-white font-bold text-xl" data-testid={`step-number-${step.number}`}>
                      {step.number}
                    </div>
                    <h2 className="text-3xl lg:text-4xl font-bold text-white" data-testid={`step-title-${step.number}`}>
                      {step.title}
                    </h2>
                  </div>
                  
                  <p className="text-lg text-white/80 leading-relaxed" data-testid={`step-description-${step.number}`}>
                    {step.description}
                  </p>

                  <div className="grid sm:grid-cols-2 gap-3">
                    {step.features.map((feature, featureIndex) => (
                      <div key={featureIndex} className="flex items-center gap-3 text-white/70" data-testid={`step-feature-${step.number}-${featureIndex}`}>
                        <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>

                  {index < steps.length - 1 && (
                    <div className="flex items-center gap-3 pt-4 lg:hidden">
                      <ArrowRight className="w-6 h-6 text-orange-500" />
                      <span className="text-orange-500 font-medium">Next Step</span>
                    </div>
                  )}
                </div>

                {/* Icon/Visual */}
                <div className="flex-1 flex justify-center">
                  <Card className="w-full max-w-sm bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/15 transition-colors" data-testid={`step-card-${step.number}`}>
                    <CardContent className="p-8 flex flex-col items-center text-center space-y-4">
                      <div className="w-20 h-20 rounded-full bg-gradient-to-r from-orange-500 to-red-500 flex items-center justify-center">
                        <IconComponent className="w-10 h-10 text-white" />
                      </div>
                      <h3 className="text-xl font-semibold text-white">
                        {step.title}
                      </h3>
                    </CardContent>
                  </Card>
                </div>

                {/* Arrow (Desktop only) */}
                {index < steps.length - 1 && (
                  <div className="hidden lg:block absolute left-1/2 transform -translate-x-1/2 mt-32">
                    <ArrowRight className="w-8 h-8 text-orange-500" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Report Features Section */}
      <div className="bg-white/5 backdrop-blur-sm border-t border-white/10">
        <div className="container mx-auto px-4 py-20">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-white mb-6" data-testid="title-report-features">
              What You Get in Your Report
            </h2>
            <p className="text-lg text-white/70 max-w-2xl mx-auto" data-testid="text-report-description">
              Our comprehensive analysis provides everything you need to make confident investment decisions.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {reportFeatures.map((feature, index) => {
              const IconComponent = feature.icon;
              return (
                <Card key={index} className="bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/15 transition-colors" data-testid={`report-feature-${index}`}>
                  <CardContent className="p-8 text-center space-y-4">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-r from-orange-500 to-red-500 flex items-center justify-center mx-auto">
                      <IconComponent className="w-8 h-8 text-white" />
                    </div>
                    <h3 className="text-xl font-semibold text-white" data-testid={`report-feature-title-${index}`}>
                      {feature.title}
                    </h3>
                    <p className="text-white/70" data-testid={`report-feature-description-${index}`}>
                      {feature.description}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="container mx-auto px-4 py-20">
        <div className="text-center max-w-2xl mx-auto space-y-8">
          <h2 className="text-3xl lg:text-4xl font-bold text-white" data-testid="title-cta">
            Ready to Analyze Your First Property?
          </h2>
          <p className="text-lg text-white/70" data-testid="text-cta-description">
            Get started with your property analysis today. No signup required, results in 2-3 minutes.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/" data-testid="link-start-analysis">
              <Button 
                className="h-14 px-8 text-lg font-semibold bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 border-0 shadow-lg"
                data-testid="button-start-analysis"
              >
                Start Your Analysis
              </Button>
            </Link>
            <Link href="/" data-testid="link-view-example">
              <Button 
                variant="outline" 
                className="h-14 px-8 text-lg font-semibold bg-white/10 backdrop-blur-sm border-white/20 text-white hover:bg-white/20"
                data-testid="button-view-example"
              >
                View Example Report
              </Button>
            </Link>
          </div>
          <div className="text-white/60 text-sm">
            <p>✓ No credit card required • ✓ Instant results • ✓ Professional analysis</p>
          </div>
        </div>
      </div>
    </div>
  );
}