import { getStripeSync, getUncachableStripeClient } from './stripeClient';
import { storage } from './storage';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        'STRIPE WEBHOOK ERROR: Payload must be a Buffer. ' +
        'Received type: ' + typeof payload + '. ' +
        'Ensure webhook route is registered BEFORE app.use(express.json()).'
      );
    }

    let sync;
    try {
      sync = await getStripeSync();
      await sync.processWebhook(payload, signature);
    } catch (syncErr: any) {
      console.error('Stripe webhook signature verification failed:', syncErr.message);
      throw new Error('Webhook signature verification failed');
    }

    const body = JSON.parse(payload.toString());
    const eventType = body?.type;

    console.log(`Stripe webhook verified and received: ${eventType}`);

    try {
      if (eventType === 'checkout.session.completed') {
        await WebhookHandlers.handleCheckoutCompleted(body.data?.object);
      } else if (eventType === 'customer.subscription.deleted') {
        await WebhookHandlers.handleSubscriptionCancelled(body.data?.object);
      } else if (eventType === 'customer.subscription.updated') {
        await WebhookHandlers.handleSubscriptionUpdated(body.data?.object);
      }
    } catch (handlerErr) {
      console.error('Error in webhook event handler:', handlerErr);
    }
  }

  static async handleCheckoutCompleted(session: any): Promise<void> {
    if (!session?.metadata?.userId) return;

    const userId = session.metadata.userId;
    const priceType = session.metadata.priceType;

    console.log(`Checkout completed for user ${userId}, type: ${priceType}`);

    if (priceType === 'subscription') {
      const subscriptionId = typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id;
      if (subscriptionId) {
        await storage.updateUserSubscription(userId, subscriptionId, 'active');
        console.log(`Subscription activated for user ${userId}`);
      }
    } else {
      const credits = parseInt(session.metadata.credits || '1', 10);
      const user = await storage.getUser(userId);
      if (user) {
        const newCredits = (user.reportCredits || 0) + credits;
        await storage.updateUserCredits(userId, newCredits);
        console.log(`Added ${credits} credits to user ${userId}, total: ${newCredits}`);
      }
    }
  }

  static async handleSubscriptionCancelled(subscription: any): Promise<void> {
    const stripe = await getUncachableStripeClient();
    const customerId = typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id;

    if (!customerId) return;

    const customer = await stripe.customers.retrieve(customerId);
    const userId = (customer as any).metadata?.userId;
    if (userId) {
      await storage.updateUserSubscription(userId, subscription.id, 'cancelled');
      console.log(`Subscription cancelled for user ${userId}`);
    }
  }

  static async handleSubscriptionUpdated(subscription: any): Promise<void> {
    const stripe = await getUncachableStripeClient();
    const customerId = typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id;

    if (!customerId) return;

    const customer = await stripe.customers.retrieve(customerId);
    const userId = (customer as any).metadata?.userId;
    if (userId) {
      const status = subscription.status === 'active' ? 'active' : subscription.status;
      await storage.updateUserSubscription(userId, subscription.id, status);
      console.log(`Subscription updated for user ${userId}: ${status}`);
    }
  }
}
