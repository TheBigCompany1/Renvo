import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { FileText, CreditCard, Crown, Plus, ExternalLink, Clock } from "lucide-react";
import { useEffect } from "react";

export default function Dashboard() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      window.location.href = "/api/login";
    }
  }, [authLoading, isAuthenticated]);

  const { data: userStatus } = useQuery({
    queryKey: ['/api/user/status'],
    queryFn: async () => {
      const res = await fetch('/api/user/status', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    enabled: isAuthenticated,
  });

  const { data: reports, isLoading: reportsLoading } = useQuery({
    queryKey: ['/api/user/reports'],
    queryFn: async () => {
      const res = await fetch('/api/user/reports', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    enabled: isAuthenticated,
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stripe/create-portal");
      return res.json();
    },
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
    },
    onError: () => {
      toast({ title: "Error", description: "Could not open billing portal", variant: "destructive" });
    },
  });

  if (authLoading) {
    return (
      <div className="py-20">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="animate-pulse">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="py-12 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground">
            Welcome back{userStatus?.firstName ? `, ${userStatus.firstName}` : ''}
          </h1>
          <p className="text-muted-foreground mt-1">Manage your reports and account</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                  <CreditCard className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Report Credits</p>
                  <p className="text-2xl font-bold">{userStatus?.reportCredits || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                  <FileText className="w-6 h-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Reports Generated</p>
                  <p className="text-2xl font-bold">{userStatus?.totalReportsGenerated || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
                  <Crown className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Subscription</p>
                  <p className="text-lg font-bold capitalize">
                    {userStatus?.subscriptionStatus === 'active' ? (
                      <Badge className="bg-green-500">Pro Active</Badge>
                    ) : (
                      <span className="text-muted-foreground">None</span>
                    )}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex flex-wrap gap-3 mb-8">
          <Button onClick={() => navigate('/')} className="gap-2 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600">
            <Plus className="w-4 h-4" />
            New Analysis
          </Button>
          <Button onClick={() => navigate('/pricing')} variant="outline" className="gap-2">
            <CreditCard className="w-4 h-4" />
            Buy Credits
          </Button>
          {userStatus?.stripeCustomerId && (
            <Button
              onClick={() => portalMutation.mutate()}
              variant="outline"
              className="gap-2"
              disabled={portalMutation.isPending}
            >
              <ExternalLink className="w-4 h-4" />
              Manage Billing
            </Button>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Your Reports</CardTitle>
          </CardHeader>
          <CardContent>
            {reportsLoading ? (
              <div className="animate-pulse space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 bg-muted rounded" />
                ))}
              </div>
            ) : !reports || reports.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No reports yet</h3>
                <p className="text-muted-foreground mb-4">Start your first property analysis to see results here.</p>
                <Button onClick={() => navigate('/')} className="bg-gradient-to-r from-orange-500 to-red-500">
                  Analyze a Property
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {reports.map((report: any) => (
                  <div
                    key={report.id}
                    className="flex items-center justify-between p-4 bg-muted/50 rounded-lg hover:bg-muted transition-colors cursor-pointer"
                    onClick={() => {
                      if (report.status === 'completed') navigate(`/report/${report.id}`);
                      else if (report.status === 'processing' || report.status === 'pending') navigate(`/processing/${report.id}`);
                    }}
                  >
                    <div className="flex-1">
                      <p className="font-medium">
                        {report.propertyAddress || report.propertyUrl || 'Unknown Property'}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          {report.createdAt ? new Date(report.createdAt).toLocaleDateString() : 'N/A'}
                        </span>
                      </div>
                    </div>
                    <Badge variant={
                      report.status === 'completed' ? 'default' :
                      report.status === 'processing' ? 'secondary' :
                      report.status === 'failed' ? 'destructive' : 'outline'
                    }>
                      {report.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
