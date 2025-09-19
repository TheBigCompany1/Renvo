import { Link } from "wouter";

export default function Header() {
  return (
    <header className="bg-white border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <Link href="/">
            <div className="flex items-center space-x-3 cursor-pointer">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-primary-foreground font-bold text-lg">R</span>
              </div>
              <span className="text-xl font-bold text-foreground">Renvo</span>
            </div>
          </Link>
          <nav className="hidden md:flex space-x-8">
            <Link href="/how-it-works" className="text-muted-foreground hover:text-foreground transition-colors" data-testid="nav-how-it-works">
              How it Works
            </Link>
            <Link href="/pricing" className="text-muted-foreground hover:text-foreground transition-colors" data-testid="nav-pricing">
              Pricing
            </Link>
            <Link href="/about" className="text-muted-foreground hover:text-foreground transition-colors" data-testid="nav-about">
              About
            </Link>
          </nav>
          <button className="bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors">
            Get Started
          </button>
        </div>
      </div>
    </header>
  );
}
