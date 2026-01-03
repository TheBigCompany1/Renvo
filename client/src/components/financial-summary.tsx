import { FinancialSummary } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface FinancialSummaryProps {
  financialSummary: FinancialSummary;
}

export default function FinancialSummaryComponent({ financialSummary }: FinancialSummaryProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle data-testid="text-financial-summary-title">Financial Summary</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex justify-between items-center p-4 border border-border rounded-lg">
            <span className="text-muted-foreground">Current Property Value</span>
            <span className="font-semibold text-foreground" data-testid="text-financial-current-value">
              ${financialSummary.currentValue.toLocaleString()}
            </span>
          </div>

          <div className="flex justify-between items-center p-4 border border-border rounded-lg">
            <span className="text-muted-foreground">Total Renovation Cost</span>
            <span className="font-semibold text-foreground" data-testid="text-financial-total-cost">
              ${financialSummary.totalRenovationCost.toLocaleString()}
            </span>
          </div>

          <div className="flex justify-between items-center p-4 border border-border rounded-lg">
            <span className="text-muted-foreground">Total Value Add</span>
            <span className="font-semibold text-chart-2" data-testid="text-financial-total-value-add">
              +${financialSummary.totalValueAdd.toLocaleString()}
            </span>
          </div>

          <div className="flex justify-between items-center p-4 bg-accent/10 border border-accent/20 rounded-lg">
            <span className="text-foreground font-medium">After Repair Value (ARV)</span>
            <span className="font-bold text-xl text-foreground" data-testid="text-financial-arv">
              ${financialSummary.afterRepairValue.toLocaleString()}
            </span>
          </div>

          <div className="flex justify-between items-center p-4 bg-chart-2/10 border border-chart-2/20 rounded-lg">
            <span className="text-foreground font-medium">Total ROI</span>
            <span className="font-bold text-xl text-chart-2" data-testid="text-financial-total-roi">
              {financialSummary.totalROI}%
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
