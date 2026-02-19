import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth"; // Ensure this import exists
import { Loader2 } from "lucide-react";
import Header from "@/components/header";
import Footer from "@/components/footer";
import Home from "@/pages/home";
import About from "@/pages/about";
import HowItWorks from "@/pages/how-it-works";
import Pricing from "@/pages/pricing";
import Processing from "@/pages/processing";
import Report from "@/pages/report";
import Dashboard from "@/pages/dashboard";
import CheckoutSuccess from "@/pages/checkout-success";
import NotFound from "@/pages/not-found";
import AuthPage from "@/pages/auth-page";

function ProtectedRoute({ component: Component, ...rest }: any) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/auth" />;
  }

  return <Component {...rest} />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/auth" component={AuthPage} />
      <Route path="/about" component={About} />
      <Route path="/how-it-works" component={HowItWorks} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/processing/:id">
        {(params) => <ProtectedRoute component={Processing} params={params} />}
      </Route>
      <Route path="/report/:id">
        {(params) => <ProtectedRoute component={Report} params={params} />}
      </Route>
      <Route path="/dashboard">
        {() => <ProtectedRoute component={Dashboard} />}
      </Route>
      <Route path="/checkout/success" component={CheckoutSuccess} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="min-h-screen flex flex-col">
          <Header />
          <Switch>
            <Route path="/auth" component={AuthPage} />
            <Route>
              <div className="flex-1 flex flex-col">
                <main className="flex-1">
                  <Router />
                </main>
                <Footer />
              </div>
            </Route>
          </Switch>
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
