import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { createAnalysisReport } from "@/lib/api";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";

export default function Home() {
  // Using public directory paths for video files
  const background1 = "/background1.mp4";
  const background2 = "/background2.mp4";
  const [propertyInput, setPropertyInput] = useState("");
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
        description: "Please enter a Redfin URL or property address",
        variant: "destructive",
      });
      return;
    }

    // The backend will automatically detect if it's a URL or address
    // No validation needed here - let the API handle it
    createReportMutation.mutate(propertyInput.trim());
  };

  // Create video grid items
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
    <div className="relative min-h-screen overflow-hidden">
      {/* Video Grid Background */}
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
              onLoadedData={() => console.log('Video loaded:', item.src)}
              onError={(e) => console.error('Video error:', item.src, e)}
              style={{
                animationDelay: item.delay,
                filter: 'brightness(0.4)'
              }}
            />
          </div>
        ))}
      </div>

      {/* Dark Overlay */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Content Overlay */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 text-center">
        {/* RENVO Branding */}
        <h1 className="text-6xl lg:text-8xl font-bold text-white mb-6 tracking-wider" data-testid="title-brand">
          RENVO
        </h1>
        
        {/* Tagline */}
        <p className="text-xl lg:text-2xl text-white/90 mb-12 max-w-4xl font-medium" data-testid="text-tagline">
          Maximize the Value of Your Property with Highest and Best Use Analysis
        </p>

        {/* Search Form */}
        <div className="w-full max-w-3xl">
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <AddressAutocomplete
                value={propertyInput}
                onChange={setPropertyInput}
                placeholder="Enter Redfin URL or property address (e.g., 123 Main St, Los Angeles, CA)"
                className="h-14 text-lg px-6 bg-white/95 backdrop-blur-sm border-0 shadow-lg text-gray-900 placeholder:text-gray-500"
                data-testid="input-property"
              />
            </div>
            <Button
              type="submit"
              className="h-14 px-8 text-lg font-semibold bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 border-0 shadow-lg"
              disabled={createReportMutation.isPending}
              data-testid="button-analyze-property"
            >
              {createReportMutation.isPending ? "Analyzing..." : "Analyze"}
            </Button>
          </form>

          {/* Benefits */}
          <div className="mt-8 text-white/80 text-sm">
            <p>✓ Free analysis • ✓ Just email for results • ✓ Results in 2-3 minutes</p>
          </div>
        </div>
      </div>
    </div>
  );
}
