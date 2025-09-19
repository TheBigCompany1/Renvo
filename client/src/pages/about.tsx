import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Target, 
  Brain, 
  Users, 
  Eye, 
  Building2, 
  TrendingUp, 
  Shield, 
  Award, 
  Lightbulb, 
  BarChart3,
  ChevronRight,
  Star,
  Zap,
  Globe,
  CheckCircle
} from "lucide-react";

export default function About() {
  const missionPoints = [
    "Eliminate guesswork in real estate investment decisions",
    "Provide professional-grade analysis to every investor",
    "Make data-driven renovation insights accessible and affordable",
    "Empower investors with confidence to maximize property value"
  ];

  const technologyFeatures = [
    {
      icon: Brain,
      title: "AI-Powered Analysis",
      description: "Advanced machine learning models trained on thousands of successful renovations and market transactions"
    },
    {
      icon: BarChart3,
      title: "Market Intelligence",
      description: "Real-time market data analysis and comparable property research for accurate ROI projections"
    },
    {
      icon: Zap,
      title: "Instant Insights",
      description: "Get comprehensive property analysis in minutes, not weeks of manual research"
    },
    {
      icon: Shield,
      title: "Verified Data",
      description: "Cross-referenced data from multiple sources ensures accuracy and reliability in every report"
    }
  ];

  const teamExpertise = [
    {
      title: "Real Estate Investment",
      description: "Decades of combined experience in property acquisition, renovation, and portfolio management",
      years: "25+ Years"
    },
    {
      title: "Technology & AI",
      description: "Cutting-edge expertise in machine learning, data science, and real estate technology platforms",
      years: "15+ Years"
    },
    {
      title: "Market Analysis",
      description: "Deep understanding of local markets, comparable analysis, and property valuation methodologies",
      years: "20+ Years"
    }
  ];

  const visionPoints = [
    "Become the essential tool for every real estate investor",
    "Democratize access to professional-grade property analysis",
    "Transform how investment decisions are made in real estate",
    "Build the most comprehensive real estate intelligence platform"
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.1),transparent)] dark:bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.05),transparent)]" />
        
        <div className="relative z-10 container mx-auto px-4 py-20 lg:py-32">
          <div className="text-center max-w-4xl mx-auto">
            <Badge className="mb-6 bg-gradient-to-r from-orange-500 to-red-500 text-white border-0" data-testid="badge-about">
              <Building2 className="w-4 h-4 mr-2" />
              About Renvo
            </Badge>
            <h1 className="text-4xl lg:text-6xl font-bold text-white mb-6 tracking-tight" data-testid="title-about">
              Empowering Smart Real Estate Investments
            </h1>
            <p className="text-xl lg:text-2xl text-white/90 mb-8 font-medium" data-testid="text-hero-description">
              We're revolutionizing how investors make renovation decisions with AI-powered analysis and data-driven insights.
            </p>
            <p className="text-lg text-white/70 max-w-2xl mx-auto" data-testid="text-hero-subtitle">
              Founded by real estate professionals and technology experts, Renvo bridges the gap between complex market data and actionable investment strategies.
            </p>
          </div>
        </div>
      </div>

      {/* Mission Section */}
      <div className="container mx-auto px-4 py-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 rounded-full bg-gradient-to-r from-orange-500 to-red-500 flex items-center justify-center">
                <Target className="w-8 h-8 text-white" />
              </div>
            </div>
            <h2 className="text-3xl lg:text-4xl font-bold text-white mb-6" data-testid="title-mission">
              Our Mission
            </h2>
            <p className="text-xl text-white/80 max-w-3xl mx-auto" data-testid="text-mission-description">
              To help real estate investors make confident, data-driven renovation decisions that maximize property value and investment returns.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {missionPoints.map((point, index) => (
              <div key={index} className="flex items-start gap-4 p-6 bg-white/5 backdrop-blur-sm rounded-lg border border-white/10" data-testid={`mission-point-${index}`}>
                <CheckCircle className="w-6 h-6 text-green-400 shrink-0 mt-1" />
                <p className="text-white/80 text-lg">{point}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Technology Section */}
      <div className="bg-white/5 backdrop-blur-sm border-t border-white/10">
        <div className="container mx-auto px-4 py-20">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center">
                  <Brain className="w-8 h-8 text-white" />
                </div>
              </div>
              <h2 className="text-3xl lg:text-4xl font-bold text-white mb-6" data-testid="title-technology">
                Advanced Technology
              </h2>
              <p className="text-xl text-white/80 max-w-3xl mx-auto" data-testid="text-technology-description">
                Our AI-powered platform combines machine learning, market intelligence, and real estate expertise to deliver unparalleled analysis accuracy.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              {technologyFeatures.map((feature, index) => {
                const IconComponent = feature.icon;
                return (
                  <Card key={index} className="bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/15 transition-colors" data-testid={`technology-feature-${index}`}>
                    <CardContent className="p-6 text-center space-y-4">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-r from-blue-500 to-purple-500 flex items-center justify-center mx-auto">
                        <IconComponent className="w-6 h-6 text-white" />
                      </div>
                      <h3 className="text-lg font-semibold text-white" data-testid={`technology-feature-title-${index}`}>
                        {feature.title}
                      </h3>
                      <p className="text-white/70 text-sm" data-testid={`technology-feature-description-${index}`}>
                        {feature.description}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Team & Expertise Section */}
      <div className="container mx-auto px-4 py-20">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <div className="flex justify-center mb-6">
              <div className="w-16 h-16 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center">
                <Users className="w-8 h-8 text-white" />
              </div>
            </div>
            <h2 className="text-3xl lg:text-4xl font-bold text-white mb-6" data-testid="title-team">
              Team & Expertise
            </h2>
            <p className="text-xl text-white/80 max-w-3xl mx-auto" data-testid="text-team-description">
              Our team combines deep real estate investment experience with cutting-edge technology expertise to deliver reliable, actionable insights.
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {teamExpertise.map((expertise, index) => (
              <Card key={index} className="bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/15 transition-colors" data-testid={`team-expertise-${index}`}>
                <CardContent className="p-8 text-center space-y-6">
                  <div className="text-4xl font-bold text-transparent bg-gradient-to-r from-green-500 to-emerald-500 bg-clip-text" data-testid={`team-expertise-years-${index}`}>
                    {expertise.years}
                  </div>
                  <h3 className="text-xl font-semibold text-white" data-testid={`team-expertise-title-${index}`}>
                    {expertise.title}
                  </h3>
                  <p className="text-white/70" data-testid={`team-expertise-description-${index}`}>
                    {expertise.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {/* Vision Section */}
      <div className="bg-white/5 backdrop-blur-sm border-t border-white/10">
        <div className="container mx-auto px-4 py-20">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
                  <Eye className="w-8 h-8 text-white" />
                </div>
              </div>
              <h2 className="text-3xl lg:text-4xl font-bold text-white mb-6" data-testid="title-vision">
                Our Vision
              </h2>
              <p className="text-xl text-white/80 max-w-3xl mx-auto" data-testid="text-vision-description">
                We envision a future where every real estate investor has access to professional-grade analysis and market intelligence, regardless of their experience level or portfolio size.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6 mb-12">
              {visionPoints.map((point, index) => (
                <div key={index} className="flex items-start gap-4 p-6 bg-white/5 backdrop-blur-sm rounded-lg border border-white/10" data-testid={`vision-point-${index}`}>
                  <Star className="w-6 h-6 text-purple-400 shrink-0 mt-1" />
                  <p className="text-white/80 text-lg">{point}</p>
                </div>
              ))}
            </div>

            {/* Trust & Credibility Indicators */}
            <div className="grid md:grid-cols-3 gap-8">
              <Card className="bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/15 transition-colors" data-testid="trust-indicator-0">
                <CardContent className="p-6 text-center space-y-4">
                  <Globe className="w-8 h-8 text-blue-400 mx-auto" />
                  <div className="text-2xl font-bold text-white" data-testid="trust-indicator-number-0">1000+</div>
                  <p className="text-white/70" data-testid="trust-indicator-description-0">Properties Analyzed</p>
                </CardContent>
              </Card>

              <Card className="bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/15 transition-colors" data-testid="trust-indicator-1">
                <CardContent className="p-6 text-center space-y-4">
                  <Award className="w-8 h-8 text-yellow-400 mx-auto" />
                  <div className="text-2xl font-bold text-white" data-testid="trust-indicator-number-1">95%</div>
                  <p className="text-white/70" data-testid="trust-indicator-description-1">Analysis Accuracy</p>
                </CardContent>
              </Card>

              <Card className="bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/15 transition-colors" data-testid="trust-indicator-2">
                <CardContent className="p-6 text-center space-y-4">
                  <TrendingUp className="w-8 h-8 text-green-400 mx-auto" />
                  <div className="text-2xl font-bold text-white" data-testid="trust-indicator-number-2">$2M+</div>
                  <p className="text-white/70" data-testid="trust-indicator-description-2">ROI Generated</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="container mx-auto px-4 py-20">
        <div className="text-center max-w-3xl mx-auto space-y-8">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-full bg-gradient-to-r from-orange-500 to-red-500 flex items-center justify-center">
              <Lightbulb className="w-8 h-8 text-white" />
            </div>
          </div>
          <h2 className="text-3xl lg:text-4xl font-bold text-white" data-testid="title-cta">
            Ready to Transform Your Investment Strategy?
          </h2>
          <p className="text-lg text-white/70" data-testid="text-cta-description">
            Join thousands of successful real estate investors who trust Renvo for data-driven renovation decisions.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/" data-testid="link-start-analysis">
              <Button 
                className="h-14 px-8 text-lg font-semibold bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 border-0 shadow-lg"
                data-testid="button-start-analysis"
              >
                Start Your Free Analysis
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
            <Link href="/how-it-works" data-testid="link-learn-more">
              <Button 
                variant="outline" 
                className="h-14 px-8 text-lg font-semibold bg-white/10 backdrop-blur-sm border-white/20 text-white hover:bg-white/20"
                data-testid="button-learn-more"
              >
                Learn How It Works
              </Button>
            </Link>
          </div>
          <div className="text-white/60 text-sm">
            <p>✓ Free analysis • ✓ No signup required • ✓ Results in 2-3 minutes</p>
          </div>
        </div>
      </div>
    </div>
  );
}