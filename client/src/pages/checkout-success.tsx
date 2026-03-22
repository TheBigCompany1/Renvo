import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Loader2 } from "lucide-react";

export default function CheckoutSuccess() {
  const [, navigate] = useLocation();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');
  const [message, setMessage] = useState('Verifying your payment...');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');

    if (!sessionId) {
      setStatus('error');
      setMessage('No payment session found.');
      return;
    }

    fetch(`/api/checkout/verify?session_id=${sessionId}`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setStatus('success');
          if (data.type === 'subscription') {
            setMessage('Your Pro subscription is now active! You have unlimited reports.');
          } else {
            setMessage(`Payment successful! You now have ${data.credits} report credit${data.credits !== 1 ? 's' : ''}.`);
          }

          if (data.reportAddress) {
            sessionStorage.setItem('pendingAddress', data.reportAddress);
          }

          setTimeout(() => {
            navigate('/dashboard');
          }, 3000);
        } else {
          setStatus('error');
          setMessage(data.message || 'Payment verification failed.');
        }
      })
      .catch(() => {
        setStatus('error');
        setMessage('Failed to verify payment. Please contact support.');
      });
  }, [navigate]);

  return (
    <div className="py-20">
      <div className="max-w-md mx-auto px-4">
        <Card className="shadow-lg">
          <CardContent className="p-8 text-center">
            {status === 'verifying' && (
              <>
                <Loader2 className="w-16 h-16 text-primary mx-auto mb-4 animate-spin" />
                <h2 className="text-2xl font-bold mb-2">Verifying Payment</h2>
                <p className="text-muted-foreground">{message}</p>
              </>
            )}
            {status === 'success' && (
              <>
                <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold mb-2">Payment Successful!</h2>
                <p className="text-muted-foreground mb-4">{message}</p>
                <p className="text-sm text-muted-foreground">Redirecting to your dashboard...</p>
              </>
            )}
            {status === 'error' && (
              <>
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">!</span>
                </div>
                <h2 className="text-2xl font-bold mb-2">Something Went Wrong</h2>
                <p className="text-muted-foreground mb-4">{message}</p>
                <Button onClick={() => navigate('/pricing')}>
                  Try Again
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
