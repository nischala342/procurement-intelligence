/**
 * Demo businesses created by `npm run db:seed` (scripts/seed/data/dataset.ts). Shown on the sign-in screen so
 * reviewers can explore without signing up. Disable with VITE_DEMO_MODE=false for non-demo deployments.
 */
export interface DemoAccount {
  code: string;
  email: string;
  organizationName: string;
  country: string;
  currency: string;
  primary?: boolean;
  highlight: string;
}

export const DEMO_PASSWORD = 'Demo@12345';
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE !== 'false';

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { code: 'UK', email: 'demo@procurement.test', organizationName: 'Thames Valley Manufacturing Ltd', country: 'United Kingdom', currency: 'GBP', primary: true, highlight: 'Fullest demo: every recommendation type, review states, a demo benchmark' },
  { code: 'DE', email: 'demo.de@procurement.test', organizationName: 'Rheinwerk Fertigung GmbH', country: 'Germany', currency: 'EUR', highlight: 'Mid-size buyer, amounts in euros' },
  { code: 'US', email: 'demo.us@procurement.test', organizationName: 'Lakeshore Industrial Inc.', country: 'United States', currency: 'USD', highlight: 'Smaller buyer, amounts in US dollars' },
  { code: 'JP', email: 'demo.jp@procurement.test', organizationName: 'Sakura Precision K.K.', country: 'Japan', currency: 'JPY', highlight: 'Sparse history: shows how the engine stays quiet without evidence' },
  { code: 'AU', email: 'demo.au@procurement.test', organizationName: 'Southern Cross Fabrication Pty Ltd', country: 'Australia', currency: 'AUD', highlight: 'Sparse history, amounts in Australian dollars' },
];
