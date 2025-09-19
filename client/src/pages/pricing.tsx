import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { insertEmailSignupSchema, type InsertEmailSignup } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  Check, 
  Star, 
  Zap, 
  Crown, 
  Building2, 
  Mail, 
  Users, 
  Shield, 
  Clock, 
  TrendingUp,
  ChevronRight,
  Gift
} from "lucide-react";

export default function Pricing() {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { toast } = useToast();

  const form = useForm<InsertEmailSignup>({
    resolver: zodResolver(insertEmailSignupSchema),
    defaultValues: {
      email: "",
      signupSource: "pricing_page"
    }
  });

  const emailSignupMutation = useMutation({
    mutationFn: async (data: InsertEmailSignup) => {
      return apiRequest("POST", "/api/email-signups", data);
    },
    onSuccess: () => {
      setIsSubmitted(true);
      toast({
        title: "Success!",
        description: "Thanks for signing up! We'll keep you updated on new features."
      });
    },
    onError: (error) => {
      console.error("Email signup error:", error);
      toast({
        title: "Error",
        description: "Failed to sign up. Please try again.",
        variant: "destructive"
      });
    }
  });

  const handleEmailSubmit = (data: InsertEmailSignup) => {
    emailSignupMutation.mutate(data);
  };

  const freePlanFeatures = [
    "Complete property analysis report",
    "ROI calculations & projections", 
    "Market comparable properties",
    "Neighborhood analysis",
    "Renovation cost estimates",
    "Basic contractor recommendations",
    "PDF report download",
    "Email support"
  ];

  const proPlanFeatures = [
    "Everything in Free",
    "Unlimited property analyses",
    "Advanced market insights",
    "Priority contractor network",
    "Custom renovation scenarios",
    "Deal flow alerts",
    "Portfolio tracking",
    "Priority email & chat support"
  ];

  const enterpriseFeatures = [
    "Everything in Pro",
    "Team collaboration tools",
    "Bulk property analysis",
    "Custom market reports",
    "API access",
    "Dedicated account manager",
    "White-label reports",
    "24/7 phone support"
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.1),transparent)] dark:bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.05),transparent)]" />
        
        <div className="relative z-10 container mx-auto px-4 py-20 lg:py-32">
          <div className="text-center max-w-4xl mx-auto">
            <Badge className="mb-6 bg-gradient-to-r from-orange-500 to-red-500 text-white border-0" data-testid="badge-free-analysis">
              <Gift className="w-4 h-4 mr-2" />
              Get Started Free
            </Badge>
            <h1 className="text-4xl lg:text-6xl font-bold text-white mb-6 tracking-tight" data-testid="title-pricing">
              Simple, Transparent Pricing
            </h1>
            <p className="text-xl lg:text-2xl text-white/90 mb-8 font-medium" data-testid="text-hero-description">
              Start with a free comprehensive property analysis. Upgrade as you scale your real estate investments.
            </p>
            <p className="text-lg text-white/70 max-w-2xl mx-auto" data-testid="text-hero-subtitle">
              No hidden fees, no credit card required to start. Get immediate value with our free analysis tool.
            </p>
          </div>
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="container mx-auto px-4 py-20">
        <div className="grid lg:grid-cols-3 gap-8 max-w-7xl mx-auto">
          {/* Free Plan */}
          <Card className="relative bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/15 transition-colors" data-testid="card-free-plan">
            <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-green-500 text-white border-0" data-testid="badge-most-popular">
              <Star className="w-4 h-4 mr-1" />
              Most Popular
            </Badge>
            <CardHeader className="text-center pb-8">
              <div className="w-16 h-16 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center mx-auto mb-4">
                <Zap className="w-8 h-8 text-white" />
              </div>
              <CardTitle className="text-2xl font-bold text-white mb-2" data-testid="title-free-plan">Free Analysis</CardTitle>
              <div className="text-4xl font-bold text-white mb-2" data-testid="price-free">$0</div>
              <p className="text-white/70" data-testid="text-free-description">Perfect for getting started</p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                {freePlanFeatures.map((feature, index) => (
                  <div key={index} className="flex items-center gap-3 text-white/80" data-testid={`free-feature-${index}`}>
                    <Check className="w-5 h-5 text-green-400 shrink-0" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>

              {/* Email Capture */}
              <div className="pt-6 border-t border-white/20">
                <p className="text-white/90 font-medium mb-4 text-center" data-testid="text-email-prompt">
                  Get notified when new features launch
                </p>
                {!isSubmitted ? (
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleEmailSubmit)} className="space-y-3">
                      <FormField
                        control={form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Input
                                type="email"
                                placeholder="Enter your email"
                                className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
                                data-testid="input-email"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage className="text-red-300" />
                          </FormItem>
                        )}
                      />
                      <Button
                        type="submit"
                        disabled={emailSignupMutation.isPending}
                        className="w-full bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 border-0 shadow-lg disabled:opacity-50"
                        data-testid="button-submit-email"
                      >
                        {emailSignupMutation.isPending ? "Signing up..." : "Get Updates"}
                      </Button>
                    </form>
                  </Form>
                ) : (
                  <div className="text-center p-4 bg-green-500/20 rounded-lg" data-testid="message-email-success">
                    <Check className="w-6 h-6 text-green-400 mx-auto mb-2" />
                    <p className="text-green-400 font-medium">Thanks! We'll keep you updated.</p>
                  </div>
                )}
              </div>

              <Link href="/" data-testid="link-start-free">
                <Button className="w-full h-12 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 border-0 shadow-lg" data-testid="button-start-free">
                  Start Free Analysis
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </Link>
            </CardContent>
          </Card>

          {/* Pro Plan */}
          <Card className="relative bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/15 transition-colors lg:scale-105" data-testid="card-pro-plan">
            <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-orange-500 to-red-500 text-white border-0" data-testid="badge-recommended">
              <Crown className="w-4 h-4 mr-1" />
              Recommended
            </Badge>
            <CardHeader className="text-center pb-8">
              <div className="w-16 h-16 rounded-full bg-gradient-to-r from-orange-500 to-red-500 flex items-center justify-center mx-auto mb-4">
                <TrendingUp className="w-8 h-8 text-white" />
              </div>
              <CardTitle className="text-2xl font-bold text-white mb-2" data-testid="title-pro-plan">Pro</CardTitle>
              <div className="text-4xl font-bold text-white mb-2" data-testid="price-pro">
                $49
                <span className="text-lg font-normal text-white/70">/month</span>
              </div>
              <p className="text-white/70" data-testid="text-pro-description">For active investors</p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                {proPlanFeatures.map((feature, index) => (
                  <div key={index} className="flex items-center gap-3 text-white/80" data-testid={`pro-feature-${index}`}>
                    <Check className="w-5 h-5 text-orange-400 shrink-0" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
              <Button className="w-full h-12 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 border-0 shadow-lg" data-testid="button-upgrade-pro">
                Coming Soon
                <Clock className="w-4 h-4 ml-2" />
              </Button>
            </CardContent>
          </Card>

          {/* Enterprise Plan */}
          <Card className="relative bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/15 transition-colors" data-testid="card-enterprise-plan">
            <CardHeader className="text-center pb-8">
              <div className="w-16 h-16 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 flex items-center justify-center mx-auto mb-4">
                <Building2 className="w-8 h-8 text-white" />
              </div>
              <CardTitle className="text-2xl font-bold text-white mb-2" data-testid="title-enterprise-plan">Enterprise</CardTitle>
              <div className="text-4xl font-bold text-white mb-2" data-testid="price-enterprise">Custom</div>
              <p className="text-white/70" data-testid="text-enterprise-description">For teams & institutions</p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                {enterpriseFeatures.map((feature, index) => (
                  <div key={index} className="flex items-center gap-3 text-white/80" data-testid={`enterprise-feature-${index}`}>
                    <Check className="w-5 h-5 text-purple-400 shrink-0" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
              <Button className="w-full h-12 bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 border-0 shadow-lg" data-testid="button-contact-sales">
                Contact Sales
                <Mail className="w-4 h-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Value Proposition Section */}
      <div className="bg-white/5 backdrop-blur-sm border-t border-white/10">
        <div className="container mx-auto px-4 py-20">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold text-white mb-6" data-testid="title-value-proposition">
              Why Start with Renvo?
            </h2>
            <p className="text-lg text-white/70 max-w-2xl mx-auto" data-testid="text-value-description">
              Our free analysis provides professional-grade insights that would typically cost hundreds of dollars from a consultant.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <Card className="bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/15 transition-colors" data-testid="value-card-0">
              <CardContent className="p-8 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center mx-auto">
                  <Shield className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-white" data-testid="value-title-0">
                  No Risk, All Reward
                </h3>
                <p className="text-white/70" data-testid="value-description-0">
                  Get professional property analysis at zero cost. No credit card, no commitment required.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/15 transition-colors" data-testid="value-card-1">
              <CardContent className="p-8 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-gradient-to-r from-orange-500 to-red-500 flex items-center justify-center mx-auto">
                  <Users className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-white" data-testid="value-title-1">
                  Trusted by Investors
                </h3>
                <p className="text-white/70" data-testid="value-description-1">
                  Join thousands of real estate investors who rely on Renvo for data-driven investment decisions.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/15 transition-colors" data-testid="value-card-2">
              <CardContent className="p-8 text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 flex items-center justify-center mx-auto">
                  <Zap className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-semibold text-white" data-testid="value-title-2">
                  Instant Results
                </h3>
                <p className="text-white/70" data-testid="value-description-2">
                  Get comprehensive analysis in 2-3 minutes. No waiting, no back-and-forth with consultants.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* CTA Section */}
      <div className="container mx-auto px-4 py-20">
        <div className="text-center max-w-2xl mx-auto space-y-8">
          <h2 className="text-3xl lg:text-4xl font-bold text-white" data-testid="title-final-cta">
            Ready to Maximize Your Property's Potential?
          </h2>
          <p className="text-lg text-white/70" data-testid="text-final-cta-description">
            Start with our free comprehensive analysis and discover the hidden value in any property.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/" data-testid="link-start-free-analysis">
              <Button 
                className="h-14 px-8 text-lg font-semibold bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 border-0 shadow-lg"
                data-testid="button-start-free-analysis"
              >
                Start Free Analysis
              </Button>
            </Link>
            <Link href="/how-it-works" data-testid="link-learn-more">
              <Button 
                variant="outline" 
                className="h-14 px-8 text-lg font-semibold bg-white/10 backdrop-blur-sm border-white/20 text-white hover:bg-white/20"
                data-testid="button-learn-more"
              >
                How It Works
              </Button>
            </Link>
          </div>
          <div className="text-white/60 text-sm">
            <p>✓ 100% Free to start • ✓ No signup required • ✓ Results in minutes</p>
          </div>
        </div>
      </div>
    </div>
  );
}