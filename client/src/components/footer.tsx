import { Link } from "wouter";

export default function Footer() {
  return (
    <footer className="bg-muted py-12 border-t border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-lg">R</span>
              </div>
              <span className="text-xl font-bold text-foreground">Renvo</span>
            </div>
            <p className="text-muted-foreground">
              AI-powered real estate renovation analysis for smarter investment decisions.
            </p>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-4">Product</h3>
            <ul className="space-y-2 text-muted-foreground">
              <li><Link href="/how-it-works" className="hover:text-foreground">How it Works</Link></li>
              <li><Link href="/pricing" className="hover:text-foreground">Pricing</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-4">Company</h3>
            <ul className="space-y-2 text-muted-foreground">
              <li><Link href="/about" className="hover:text-foreground">About</Link></li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-4">Legal</h3>
            <ul className="space-y-2 text-muted-foreground">
              <li><Link href="/terms" className="hover:text-foreground">Terms of Service</Link></li>
              <li><Link href="/privacy" className="hover:text-foreground">Privacy Policy</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-border mt-8 pt-8">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-amber-800 font-medium mb-1">Disclaimer</p>
            <p className="text-xs text-amber-700">
              Renvo reports are for informational purposes only and do not constitute professional architectural, engineering, financial, or legal advice. All renovation cost estimates, ROI projections, and property valuations are AI-generated approximations and should not be relied upon as the sole basis for investment decisions. Always consult qualified professionals before making renovation or investment decisions.
            </p>
          </div>
          <p className="text-center text-muted-foreground text-sm">&copy; {new Date().getFullYear()} Renvo. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
