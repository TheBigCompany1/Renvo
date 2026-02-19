import { getUncachableStripeClient } from './stripeClient';

async function seedProducts() {
  const stripe = await getUncachableStripeClient();

  const existingProducts = await stripe.products.list({ limit: 100 });
  if (existingProducts.data.length > 0) {
    console.log('Products already exist, skipping seed');
    existingProducts.data.forEach(p => console.log(`  - ${p.name} (${p.id})`));
    return;
  }

  console.log('Creating Stripe products...');

  const firstReport = await stripe.products.create({
    name: 'First Property Analysis',
    description: 'Your first Renvo property analysis report at a special introductory price',
    metadata: { type: 'first_report', credits: '1' },
  });
  await stripe.prices.create({
    product: firstReport.id,
    unit_amount: 399,
    currency: 'usd',
    metadata: { priceType: 'first_report' },
  });
  console.log(`Created: ${firstReport.name} - $3.99`);

  const singleReport = await stripe.products.create({
    name: 'Property Analysis Report',
    description: 'Complete AI-powered property renovation analysis with ROI calculations',
    metadata: { type: 'single_report', credits: '1' },
  });
  await stripe.prices.create({
    product: singleReport.id,
    unit_amount: 999,
    currency: 'usd',
    metadata: { priceType: 'single_report' },
  });
  console.log(`Created: ${singleReport.name} - $9.99`);

  const bundle = await stripe.products.create({
    name: '5-Report Bundle',
    description: 'Bundle of 5 property analysis reports - save 30% compared to individual reports',
    metadata: { type: 'bundle', credits: '5' },
  });
  await stripe.prices.create({
    product: bundle.id,
    unit_amount: 3499,
    currency: 'usd',
    metadata: { priceType: 'bundle' },
  });
  console.log(`Created: ${bundle.name} - $34.99`);

  const subscription = await stripe.products.create({
    name: 'Renvo Pro Monthly',
    description: 'Unlimited property analysis reports with priority support',
    metadata: { type: 'subscription' },
  });
  await stripe.prices.create({
    product: subscription.id,
    unit_amount: 2999,
    currency: 'usd',
    recurring: { interval: 'month' },
    metadata: { priceType: 'subscription' },
  });
  console.log(`Created: ${subscription.name} - $29.99/mo`);

  console.log('\nAll products created successfully!');
}

seedProducts().catch(console.error);
