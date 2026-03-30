import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { createAnalysisReport } from "@/lib/api";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function Home() {
  const background1 = "/background1.mp4";
  const background2 = "/background2.mp4";
  const [propertyInput, setPropertyInput] = useState("");
  const [userType, setUserType] = useState<"homeowner" | "investor" | "">("");
  const [targetBudget, setTargetBudget] = useState<string>("");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [showTosModal, setShowTosModal] = useState(false);

  const acceptTosMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/user/accept-tos", { method: "POST" });
      if (!res.ok) throw new Error("Failed to accept TOS");
      return res.json();
    },
    onSuccess: () => {
      setShowTosModal(false);
      createReportMutation.mutate({
        propertyInput: propertyInput.trim(),
        userType: userType || undefined,
        targetBudget: targetBudget ? parseInt(targetBudget.replace(/\D/g, '')) : undefined
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to accept Terms of Service. Please try again.",
        variant: "destructive",
      });
    }
  });

  useEffect(() => {
    const pending = sessionStorage.getItem('pendingAddress');
    if (pending && isAuthenticated) {
      setPropertyInput(pending);
      sessionStorage.removeItem('pendingAddress');
    }
  }, [isAuthenticated]);

  const createReportMutation = useMutation({
    mutationFn: (data: any) => createAnalysisReport(data),
    onSuccess: (data) => {
      navigate(`/processing/${data.reportId}`);
    },
    onError: (error: any) => {
      const message = error.message || "";
      if (message.includes("402")) {
        sessionStorage.setItem('pendingAddress', propertyInput.trim());
        navigate("/pricing");
        return;
      }
      if (message.includes("403") && message.toLowerCase().includes("terms")) {
        setShowTosModal(true);
        return;
      }
      toast({
        title: "Error",
        description: error.message || "Failed to start analysis. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!propertyInput.trim()) {
      toast({
        title: "Input Required",
        description: "Please enter a property address",
        variant: "destructive",
      });
      return;
    }

    if (!isAuthenticated) {
      sessionStorage.setItem('pendingAddress', propertyInput.trim());
      navigate("/auth");
      return;
    }

    createReportMutation.mutate({
      propertyInput: propertyInput.trim(),
      userType: userType || undefined,
      targetBudget: targetBudget ? parseInt(targetBudget.replace(/\D/g, '')) : undefined
    });
  };

  const videoGridItems = [
    { src: background1, delay: '0s' },
    { src: background2, delay: '2s' },
    { src: background1, delay: '4s' },
    { src: background2, delay: '1s' },
    { src: background1, delay: '3s' },
    { src: background2, delay: '5s' },
    { src: background1, delay: '6s' },
    { src: background2, delay: '7s' },
    { src: background1, delay: '8s' },
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-black" style={{ backgroundColor: 'black' }}>
      <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-1">
        {videoGridItems.map((item, index) => (
          <div key={index} className="relative overflow-hidden">
            <video
              src={item.src}
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              className="w-full h-full object-cover"
              style={{
                animationDelay: item.delay,
                filter: 'brightness(0.4)'
              }}
            />
          </div>
        ))}
      </div>

      <div className="absolute inset-0 bg-black/50" />

      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 text-center">
        <h1 className="text-6xl lg:text-8xl font-bold text-white mb-6 tracking-wider">
          RENVO
        </h1>

        <p className="text-xl lg:text-2xl text-white/90 mb-12 max-w-4xl font-medium">
          Maximize the Value of Your Property with Highest and Best Use Analysis
        </p>

        <div className="w-full max-w-3xl">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <AddressAutocomplete
                  value={propertyInput}
                  onChange={setPropertyInput}
                  placeholder="Enter property address"
                  className="h-14 text-lg px-6 bg-white/95 backdrop-blur-sm border-0 shadow-lg text-gray-900 placeholder:text-gray-500"
                />
              </div>
              <Button
                type="submit"
                className="h-14 px-8 text-lg font-semibold bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 border-0 shadow-lg shrink-0"
                disabled={createReportMutation.isPending || authLoading}
              >
                {createReportMutation.isPending ? "Analyzing..." : "Analyze"}
              </Button>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <Select value={userType} onValueChange={(val) => setUserType(val as any)}>
                  <SelectTrigger className="h-12 bg-white/10 backdrop-blur-sm border-white/20 text-white placeholder:text-white/60">
                    <SelectValue placeholder="I am a... (Optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="homeowner">Homeowner</SelectItem>
                    <SelectItem value="investor">Potential Investor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Input 
                  type="text" 
                  value={targetBudget}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9]/g, '');
                    setTargetBudget(val ? `$${parseInt(val).toLocaleString()}` : '');
                  }}
                  placeholder="Target Renovation Budget (Optional)" 
                  className="h-12 bg-white/10 backdrop-blur-sm border-white/20 text-white placeholder:text-white/60 focus:bg-white/20"
                />
              </div>
            </div>
          </form>

          <div className="mt-8 text-white/80 text-sm">
            <p>First report just $3.99 · Results in 2-3 minutes · AI-powered analysis</p>
          </div>
        </div>
      </div>

      <Dialog open={showTosModal} onOpenChange={setShowTosModal}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-xl text-gray-900">Terms of Service Required</DialogTitle>
            <DialogDescription className="text-gray-600">
              Please accept our Terms of Service to continue generating reports. This is securely required for all accounts to verify platform usage parameters.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center space-x-2 py-4">
            <p className="text-sm text-gray-500 font-medium leading-relaxed">
              By clicking accept, you officially agree to our <a href="/terms" className="text-teal-600 hover:text-teal-700 hover:underline" target="_blank">Terms of Service</a> and <a href="/privacy" className="text-teal-600 hover:text-teal-700 hover:underline" target="_blank">Privacy Policy</a> for the Renvo.ai platform.
            </p>
          </div>
          <DialogFooter className="sm:justify-end gap-2">
            <Button variant="outline" className="text-gray-700 bg-white" onClick={() => setShowTosModal(false)}>Cancel</Button>
            <Button 
              onClick={() => acceptTosMutation.mutate()} 
              disabled={acceptTosMutation.isPending}
              className="bg-teal-600 hover:bg-teal-700 text-white border-0 shadow-md"
            >
              {acceptTosMutation.isPending ? "Accepting..." : "I Accept & Continue"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
