import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Check, Star, Zap, Crown, Package, Sparkles } from "lucide-react";

export default function Pricing() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [tosAccepted, setTosAccepted] = useState(false);

  const checkoutMutation = useMutation({
    mutationFn: async (priceType: string) => {
      const res = await apiRequest("POST", "/api/checkout", { priceType, tosAccepted: true });
      return res.json();
    },
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start checkout",
        variant: "destructive",
      });
    },
  });

  const handlePurchase = async (priceType: string) => {
    if (!isAuthenticated) {
      window.location.href = "/api/login";
      return;
    }

    if (!tosAccepted) {
      toast({
        title: "Terms Required",
        description: "Please accept the Terms of Service to continue.",
        variant: "destructive",
      });
      return;
    }

    checkoutMutation.mutate(priceType);
  };

  const isPending = checkoutMutation.isPending;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.1),transparent)]" />

        <div className="relative z-10 container mx-auto px-4 py-20 lg:py-32">
          <div className="text-center max-w-4xl mx-auto">
            <Badge className="mb-6 bg-gradient-to-r from-orange-500 to-red-500 text-white border-0">
              <Sparkles className="w-4 h-4 mr-2" />
              Special Launch Pricing
            </Badge>
            <h1 className="text-4xl lg:text-6xl font-bold text-white mb-6 tracking-tight">
              Simple, Transparent Pricing
            </h1>
            <p className="text-xl lg:text-2xl text-white/90 mb-4 font-medium">
              Get professional property analysis powered by AI at a fraction of traditional consulting costs.
            </p>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-12">
        <div className="grid lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
          <Card className="relative bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/15 transition-colors">
            <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-green-500 text-white border-0">
              <Star className="w-4 h-4 mr-1" />
              Try It Out
            </Badge>
            <CardHeader className="text-center pb-6">
              <div className="w-14 h-14 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center mx-auto mb-4">
                <Zap className="w-7 h-7 text-white" />
              </div>
              <CardTitle className="text-xl font-bold text-white mb-1">First Report</CardTitle>
              <div className="text-4xl font-bold text-white mb-1">$3.99</div>
              <p className="text-white/70 text-sm">One-time intro price</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                {['Complete property analysis', 'ROI calculations', 'Contractor recommendations', 'Market comparables'].map((feature, i) => (
                  <div key={i} className="flex items-center gap-2 text-white/80 text-sm">
                    <Check className="w-4 h-4 text-green-400 shrink-0" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
              <Button
                className="w-full bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 border-0"
                onClick={() => handlePurchase('first_report')}
                disabled={isPending}
              >
                {isPending ? 'Processing...' : 'Get Started'}
              </Button>
            </CardContent>
          </Card>

          <Card className="relative bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/15 transition-colors">
            <CardHeader className="text-center pb-6">
              <div className="w-14 h-14 rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 flex items-center justify-center mx-auto mb-4">
                <Zap className="w-7 h-7 text-white" />
              </div>
              <CardTitle className="text-xl font-bold text-white mb-1">Single Report</CardTitle>
              <div className="text-4xl font-bold text-white mb-1">$9.99</div>
              <p className="text-white/70 text-sm">Per report</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                {['Complete property analysis', 'ROI calculations', 'Contractor recommendations', 'Market comparables'].map((feature, i) => (
                  <div key={i} className="flex items-center gap-2 text-white/80 text-sm">
                    <Check className="w-4 h-4 text-blue-400 shrink-0" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
              <Button
                className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 border-0"
                onClick={() => handlePurchase('single_report')}
                disabled={isPending}
              >
                {isPending ? 'Processing...' : 'Buy Report'}
              </Button>
            </CardContent>
          </Card>

          <Card className="relative bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/15 transition-colors lg:scale-105">
            <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-orange-500 to-red-500 text-white border-0">
              <Crown className="w-4 h-4 mr-1" />
              Best Value
            </Badge>
            <CardHeader className="text-center pb-6">
              <div className="w-14 h-14 rounded-full bg-gradient-to-r from-orange-500 to-red-500 flex items-center justify-center mx-auto mb-4">
                <Package className="w-7 h-7 text-white" />
              </div>
              <CardTitle className="text-xl font-bold text-white mb-1">5-Report Bundle</CardTitle>
              <div className="text-4xl font-bold text-white mb-1">$34.99</div>
              <p className="text-white/70 text-sm">$6.99 per report - Save 30%</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                {['5 complete analyses', 'Save 30% vs individual', 'Never expires', 'All premium features'].map((feature, i) => (
                  <div key={i} className="flex items-center gap-2 text-white/80 text-sm">
                    <Check className="w-4 h-4 text-orange-400 shrink-0" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
              <Button
                className="w-full bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 border-0"
                onClick={() => handlePurchase('bundle')}
                disabled={isPending}
              >
                {isPending ? 'Processing...' : 'Buy Bundle'}
              </Button>
            </CardContent>
          </Card>

          <Card className="relative bg-white/10 backdrop-blur-sm border-white/20 hover:bg-white/15 transition-colors">
            <CardHeader className="text-center pb-6">
              <div className="w-14 h-14 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 flex items-center justify-center mx-auto mb-4">
                <Crown className="w-7 h-7 text-white" />
              </div>
              <CardTitle className="text-xl font-bold text-white mb-1">Pro Monthly</CardTitle>
              <div className="text-4xl font-bold text-white mb-1">$29.99</div>
              <p className="text-white/70 text-sm">Per month - Unlimited</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                {['Unlimited reports', 'Priority support', 'Market alerts', 'Portfolio tracking'].map((feature, i) => (
                  <div key={i} className="flex items-center gap-2 text-white/80 text-sm">
                    <Check className="w-4 h-4 text-purple-400 shrink-0" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
              <Button
                className="w-full bg-gradient-to-r from-purple-500 to-indigo-500 hover:from-purple-600 hover:to-indigo-600 border-0"
                onClick={() => handlePurchase('subscription')}
                disabled={isPending}
              >
                {isPending ? 'Processing...' : 'Subscribe'}
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="max-w-2xl mx-auto mt-8">
          <div className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg p-6">
            <div className="flex items-start gap-3">
              <Checkbox
                id="tos"
                checked={tosAccepted}
                onCheckedChange={(checked) => setTosAccepted(checked === true)}
                className="mt-1 border-white/40 data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500"
              />
              <label htmlFor="tos" className="text-sm text-white/80 cursor-pointer">
                I acknowledge that Renvo reports are for <span className="font-semibold text-white">informational purposes only</span> and do not constitute professional architectural, engineering, financial, or legal advice. All estimates and projections are AI-generated approximations. I agree to the{" "}
                <a href="/terms" className="text-orange-400 hover:text-orange-300 underline">Terms of Service</a>.
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
