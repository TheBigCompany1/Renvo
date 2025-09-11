import { Contractor } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Star } from "lucide-react";

interface ContractorRecommendationsProps {
  contractors: Contractor[];
}

export default function ContractorRecommendations({ contractors }: ContractorRecommendationsProps) {
  const renderStars = (rating: number) => {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 !== 0;
    const stars = [];
    
    for (let i = 0; i < fullStars; i++) {
      stars.push(<Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />);
    }
    
    if (hasHalfStar) {
      stars.push(<Star key="half" className="w-4 h-4 text-yellow-400" />);
    }
    
    while (stars.length < 5) {
      stars.push(<Star key={`empty-${stars.length}`} className="w-4 h-4 text-muted" />);
    }
    
    return stars;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle data-testid="text-contractors-title">Recommended Contractors</CardTitle>
        <p className="text-muted-foreground">
          Top-rated contractors in your area specializing in your recommended renovations
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-3 gap-6" data-testid="list-contractors">
          {contractors.map((contractor, index) => (
            <Card 
              key={index} 
              className="hover:shadow-md transition-shadow"
              data-testid={`card-contractor-${index}`}
            >
              <CardContent className="p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center">
                    <span className="font-semibold text-accent">
                      {contractor.name.split(' ').map(word => word[0]).join('').slice(0, 2)}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground" data-testid={`text-contractor-name-${index}`}>
                      {contractor.name}
                    </h3>
                    <p className="text-sm text-muted-foreground" data-testid={`text-contractor-specialty-${index}`}>
                      {contractor.specialty}
                    </p>
                  </div>
                </div>
                
                <div className="space-y-2 mb-4">
                  <div className="flex items-center space-x-2">
                    <div className="flex">
                      {renderStars(contractor.rating)}
                    </div>
                    <span className="text-sm text-muted-foreground" data-testid={`text-contractor-rating-${index}`}>
                      {contractor.rating} ({contractor.reviewCount} reviews)
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground" data-testid={`text-contractor-experience-${index}`}>
                    {contractor.experience}
                  </p>
                </div>
                
                <Button 
                  variant="outline" 
                  className="w-full"
                  data-testid={`button-get-quote-${index}`}
                >
                  Get Quote
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
