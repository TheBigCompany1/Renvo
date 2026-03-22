export default function Privacy() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl min-h-screen">
      <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>
      
      <div className="prose prose-slate lg:prose-lg max-w-none text-muted-foreground">
        <p className="mb-4">Last updated: March 2026</p>
        
        <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">1. Information We Collect</h2>
        <p className="mb-4">
          At Renvo, we collect information that you expressly provide when using our Service. This includes:
        </p>
        <ul className="list-disc pl-6 mb-4 space-y-2">
          <li><strong>Account Information:</strong> When you register, we collect your email address, username, and encrypted password.</li>
          <li><strong>Property Data:</strong> Addresses, property URLs, and any details you input to generate reports or chat with the AI assistant.</li>
          <li><strong>Payment Information:</strong> Processed securely via our payment providers (e.g., Stripe). We do not store full credit card details on our servers.</li>
        </ul>

        <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">2. How We Use Your Information</h2>
        <p className="mb-4">
          We use the information we collect to:
        </p>
        <ul className="list-disc pl-6 mb-4 space-y-2">
          <li>Provide, maintain, and improve our Service.</li>
          <li>Generate the AI property reports and context for the chat bot.</li>
          <li>Process transactions and send related information, including purchase confirmations and invoices.</li>
          <li>Send technical notices, updates, and security alerts.</li>
        </ul>

        <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">3. Data Usage with AI Models</h2>
        <p className="mb-4">
          To provide our core service, the property details and chat messages you provide are sent to third-party AI models (e.g., Google Gemini). Our integrations are configured to ensure your specific input data is <strong>not</strong> used to train these foundational models without explicit permission.
        </p>

        <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">4. Data Security</h2>
        <p className="mb-4">
          We implement appropriate technical and organizational security measures designed to protect the security of any personal information we process. However, please also remember that we cannot guarantee that the internet itself is 100% secure.
        </p>

        <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">5. Cookies and Web Trackers</h2>
        <p className="mb-4">
          We may use cookies and similar tracking technologies to track the activity on our Service and hold certain information to improve your user experience and session management.
        </p>

        <h2 className="text-2xl font-semibold text-foreground mt-8 mb-4">6. Contact Us</h2>
        <p className="mb-4">
          If you have any questions or concerns about this Privacy Policy, please contact us at privacy@renvo.ai.
        </p>
      </div>
    </div>
  );
}
