import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
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

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/about" component={About} />
      <Route path="/how-it-works" component={HowItWorks} />
      <Route path="/pricing" component={Pricing} />
      <Route path="/processing/:id" component={Processing} />
      <Route path="/report/:id" component={Report} />
      <Route path="/dashboard" component={Dashboard} />
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
          <main className="flex-1">
            <Router />
          </main>
          <Footer />
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
