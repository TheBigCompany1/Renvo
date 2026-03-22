import { stripe } from './stripeClient';
import { storage } from './storage';
import Stripe from 'stripe';

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not set');
    }

    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (err: any) {
      console.error(`Webhook signature verification failed: ${err.message}`);
      throw new Error(`Webhook signature verification failed: ${err.message}`);
    }

    console.log(`Stripe webhook verified and received: ${event.type}`);

    try {
      if (event.type === 'checkout.session.completed') {
        await WebhookHandlers.handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
      } else if (event.type === 'customer.subscription.deleted') {
        await WebhookHandlers.handleSubscriptionCancelled(event.data.object as Stripe.Subscription);
      } else if (event.type === 'customer.subscription.updated') {
        await WebhookHandlers.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
      }
    } catch (handlerErr) {
      console.error('Error in webhook event handler:', handlerErr);
    }
  }

  static async handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
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

  static async handleSubscriptionCancelled(subscription: Stripe.Subscription): Promise<void> {
    const customerId = typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer?.id;

    if (!customerId) return;

    // We can't easily get the user from customerId without a lookup table if not syncing users to stripe customers
    // But typically we store stripeCustomerId in our users table.
    // For now we try to rely on metadata if available, or we might need to look up user by stripeCustomerId
    // Replit sync was handling this mapping.
    // If metadata is on the subscription object, we use it.

    // Stripe subscriptions usually inherit metadata from checkout session but it's not guaranteed.
    // Let's check logic: storage.updateUserSubscription uses userId.

    // We need to find the user by Stripe Customer ID if metadata is missing.
    // Since we don't have a direct method `getUserByStripeCustomerId` in storage interface seen so far, 
    // we might need to add it or rely on metadata being present.

    const userId = subscription.metadata?.userId;
    if (userId) {
      await storage.updateUserSubscription(userId, subscription.id, 'cancelled');
      console.log(`Subscription cancelled for user ${userId}`);
    } else {
      console.warn(`Could not find userId in subscription metadata for cancelled subscription ${subscription.id}`);
    }
  }

  static async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    const userId = subscription.metadata?.userId;
    if (userId) {
      const status = subscription.status === 'active' ? 'active' : subscription.status;
      await storage.updateUserSubscription(userId, subscription.id, status);
      console.log(`Subscription updated for user ${userId}: ${status}`);
    } else {
      console.warn(`Could not find userId in subscription metadata for subscription ${subscription.id}`);
    }
  }
}
