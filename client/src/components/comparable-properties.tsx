import { ComparableProperty } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ComparablePropertiesProps {
  comparableProperties: ComparableProperty[];
  avgPricePsf: number;
}

export default function ComparableProperties({ comparableProperties, avgPricePsf }: ComparablePropertiesProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle data-testid="text-comparables-title">Comparable Properties</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4" data-testid="list-comparable-properties">
          {comparableProperties.map((comp, index) => (
            <div 
              key={index}
              className="flex items-center justify-between p-4 border border-border rounded-lg"
              data-testid={`row-comparable-${index}`}
            >
              <div>
                <p className="font-semibold text-foreground" data-testid={`text-comparable-address-${index}`}>
                  {comp.address}
                </p>
                <p className="text-sm text-muted-foreground" data-testid={`text-comparable-details-${index}`}>
                  {comp.beds}bd • {comp.baths}ba • {comp.sqft.toLocaleString()} sq ft
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-foreground" data-testid={`text-comparable-price-${index}`}>
                  ${comp.price.toLocaleString()}
                </p>
                <p className="text-sm text-muted-foreground" data-testid={`text-comparable-date-${index}`}>
                  Sold {comp.dateSold}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 p-4 bg-muted/50 rounded-lg">
          <p className="text-sm text-muted-foreground">Average Price per Sq Ft</p>
          <p className="text-xl font-semibold text-foreground" data-testid="text-avg-price-psf">
            ${avgPricePsf}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
