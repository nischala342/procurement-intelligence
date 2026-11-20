/* eslint-disable */
// Generates collection.json (Postman Collection v2.1) and local.env.json.
// Run: npm run postman:build -w @pi/api   (collection.json is committed; edit this file, then regenerate.)
const fs = require('node:fs');
const path = require('node:path');

const lines = (s) => s.trim().split('\n').map((l) => l.replace(/^ {6}/, ''));

const url = (p, query) => ({
  raw: `{{baseUrl}}${p}${query ? '?' + query.map((q) => `${q.key}=${q.value}`).join('&') : ''}`,
  host: ['{{baseUrl}}'],
  path: p.split('/').filter(Boolean),
  ...(query ? { query } : {}),
});

const json = (obj) => ({
  mode: 'raw',
  raw: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2),
  options: { raw: { language: 'json' } },
});

// `form` = multipart fields: { key, value } or { key, type: 'file', src } (src is relative to Newman's workingDir)
const request = ({ name, method, path: p, query, body, form, pre, tests }) => ({
  name,
  event: [
    ...(pre ? [{ listen: 'prerequest', script: { type: 'text/javascript', exec: lines(pre) } }] : []),
    { listen: 'test', script: { type: 'text/javascript', exec: lines(tests) } },
  ],
  request: {
    method,
    header: [
      ...(form ? [] : [{ key: 'Content-Type', value: 'application/json' }]),
      { key: 'x-api-key', value: '{{apiKey}}', disabled: false },
    ],
    ...(body ? { body: json(body) } : {}),
    ...(form
      ? { body: { mode: 'formdata', formdata: form.map((f) => (f.type === 'file' ? { key: f.key, type: 'file', src: f.src } : { key: f.key, value: f.value, type: 'text' })) } }
      : {}),
    url: url(p, query),
  },
});

const file = (src) => ({ key: 'file', type: 'file', src });
const field = (key, value) => ({ key, value });

// Shared assertions injected into every test script
const envelopeOk = `
      pm.test('Envelope: success=true and data present', function () {
        const b = pm.response.json();
        pm.expect(b).to.have.property('success', true);
        pm.expect(b).to.have.property('data');
        pm.expect(b).to.not.have.property('error');
      });
      pm.test('Response time < 1500ms', function () { pm.expect(pm.response.responseTime).to.be.below(1500); });
`;
const envelopeErr = (status, code) => `
      pm.test('Status is ${status}', function () { pm.response.to.have.status(${status}); });
      pm.test('Envelope: success=false with error.code ${code}', function () {
        const b = pm.response.json();
        pm.expect(b).to.have.property('success', false);
        pm.expect(b.error).to.have.property('code', '${code}');
        pm.expect(b.error).to.have.property('message').that.is.a('string');
      });
`;
const itemShape = `
      pm.test('Item has expected schema', function () {
        const d = pm.response.json().data;
        pm.expect(d).to.include.all.keys('id', 'name', 'slug', 'price', 'quantity', 'status', 'createdAt', 'updatedAt');
        pm.expect(d.id).to.match(/^[a-f0-9]{24}$/);
        pm.expect(d.price).to.be.a('number');
      });
`;

const sessionCookieSet = `
      pm.test('Session cookie is HttpOnly and not exposed in the body', function () {
        const sc = [].concat(pm.response.headers.get('Set-Cookie') || []).join(';');
        pm.expect(sc).to.include('accessToken=');
        pm.expect(sc.toLowerCase()).to.include('httponly');
        pm.expect(JSON.stringify(pm.response.json())).to.not.include('passwordHash');
      });
`;
const userShape = `
      pm.test('Response has user session details', function () {
        const u = pm.response.json().data.user;
        pm.expect(u).to.include.all.keys('id', 'email', 'organizationName', 'tenantId');
        pm.expect(u.tenantId).to.match(/^[a-f0-9]{24}$/);
      });
`;

const AUTH_FOLDER = {
  name: '0. Authentication',
  item: [
    request({
      name: 'Signup (201, sets session cookie)',
      method: 'POST',
      path: '/api/v1/auth/signup',
      pre: `
      const stamp = Date.now();
      pm.environment.set('authEmailA', 'newman-a-' + stamp + '@example.com');
      pm.environment.set('authEmailB', 'newman-b-' + stamp + '@example.com');
      pm.environment.set('authPassword', 'Newman-Pass1');
      `,
      body: { email: '{{authEmailA}}', password: '{{authPassword}}', organizationName: 'Newman Org A' },
      tests: `
      pm.test('Status is 201', function () { pm.response.to.have.status(201); });
      ${envelopeOk}
      ${userShape}
      ${sessionCookieSet}
      pm.test('User belongs to their own tenant', function () {
        const u = pm.response.json().data.user;
        pm.expect(u.email).to.equal(pm.environment.get('authEmailA'));
        pm.expect(u.organizationName).to.equal('Newman Org A');
        pm.environment.set('tenantAId', u.tenantId);
      });
      `,
    }),
    request({
      name: 'Signup with an existing email (409 EMAIL_TAKEN)',
      method: 'POST',
      path: '/api/v1/auth/signup',
      body: { email: '{{authEmailA}}', password: '{{authPassword}}', organizationName: 'Someone Else' },
      tests: envelopeErr(409, 'EMAIL_TAKEN'),
    }),
    request({
      name: 'Signup with invalid fields (400)',
      method: 'POST',
      path: '/api/v1/auth/signup',
      body: { email: 'not-an-email', password: 'short', organizationName: 'x' },
      tests: `
      ${envelopeErr(400, 'VALIDATION_ERROR')}
      pm.test('details name the offending fields', function () {
        const paths = pm.response.json().error.details.map(function (d) { return d.path; });
        pm.expect(paths).to.include.members(['email', 'password', 'organizationName']);
      });
      `,
    }),
    request({
      name: 'GET /auth/me with session (200)',
      method: 'GET',
      path: '/api/v1/auth/me',
      tests: `
      pm.test('Status is 200', function () { pm.response.to.have.status(200); });
      ${envelopeOk}
      ${userShape}
      pm.test('Is the signed-up user', function () {
        pm.expect(pm.response.json().data.user.email).to.equal(pm.environment.get('authEmailA'));
      });
      `,
    }),
    request({
      name: 'Logout clears the session (200)',
      method: 'POST',
      path: '/api/v1/auth/logout',
      tests: `
      pm.test('Status is 200', function () { pm.response.to.have.status(200); });
      pm.test('Cookie is cleared', function () {
        const sc = [].concat(pm.response.headers.get('Set-Cookie') || []).join(';');
        pm.expect(sc).to.include('accessToken=;');
      });
      `,
    }),
    request({ name: 'GET /auth/me after logout (401)', method: 'GET', path: '/api/v1/auth/me', tests: envelopeErr(401, 'UNAUTHORIZED') }),
    request({ name: 'Tenant data requires a session: GET /vendors (401)', method: 'GET', path: '/api/v1/vendors', tests: envelopeErr(401, 'UNAUTHORIZED') }),
    request({ name: 'Tenant data requires a session: GET /ingestion/jobs (401)', method: 'GET', path: '/api/v1/ingestion/jobs', tests: envelopeErr(401, 'UNAUTHORIZED') }),
    request({
      name: 'Login with wrong password (401 INVALID_CREDENTIALS)',
      method: 'POST',
      path: '/api/v1/auth/login',
      body: { email: '{{authEmailA}}', password: 'Wrong-Pass-123' },
      tests: envelopeErr(401, 'INVALID_CREDENTIALS'),
    }),
    request({
      name: 'Login with unknown email gives the same error (401)',
      method: 'POST',
      path: '/api/v1/auth/login',
      body: { email: 'nobody-{{$timestamp}}@example.com', password: 'Wrong-Pass-123' },
      tests: `
      ${envelopeErr(401, 'INVALID_CREDENTIALS')}
      pm.test('No hint whether the email exists', function () {
        pm.expect(pm.response.json().error.message).to.equal('Invalid email or password');
      });
      `,
    }),
    request({
      name: 'Login (200, sets session cookie)',
      method: 'POST',
      path: '/api/v1/auth/login',
      body: { email: '{{authEmailA}}', password: '{{authPassword}}' },
      tests: `
      pm.test('Status is 200', function () { pm.response.to.have.status(200); });
      ${envelopeOk}
      ${userShape}
      ${sessionCookieSet}
      pm.test('Same tenant as at signup', function () {
        pm.expect(pm.response.json().data.user.tenantId).to.equal(pm.environment.get('tenantAId'));
      });
      `,
    }),
  ],
};

const ISOLATION_FOLDER = {
  name: '5. Tenant isolation',
  item: [
    request({
      name: 'Signup as a second organization (201)',
      method: 'POST',
      path: '/api/v1/auth/signup',
      body: { email: '{{authEmailB}}', password: '{{authPassword}}', organizationName: 'Newman Org B' },
      tests: `
      pm.test('Status is 201', function () { pm.response.to.have.status(201); });
      pm.test('Different tenant than organization A', function () {
        const t = pm.response.json().data.user.tenantId;
        pm.expect(t).to.not.equal(pm.environment.get('tenantAId'));
      });
      `,
    }),
    request({
      name: "B cannot read A's vendor (404)",
      method: 'GET',
      path: '/api/v1/vendors/{{acmeVendorId}}',
      tests: envelopeErr(404, 'NOT_FOUND'),
    }),
    request({
      name: "B cannot modify A's vendor (404)",
      method: 'PATCH',
      path: '/api/v1/vendors/{{acmeVendorId}}',
      body: { status: 'active' },
      tests: envelopeErr(404, 'NOT_FOUND'),
    }),
    request({
      name: "B cannot read A's vendor intelligence (404)",
      method: 'GET',
      path: '/api/v1/vendors/{{acmeVendorId}}/intelligence',
      tests: envelopeErr(404, 'NOT_FOUND'),
    }),
    request({
      name: "B cannot read A's ingestion job (404)",
      method: 'GET',
      path: '/api/v1/ingestion/jobs/{{ingestJobId}}',
      tests: envelopeErr(404, 'NOT_FOUND'),
    }),
    request({
      name: "B's vendor list is empty: no cross-tenant leakage",
      method: 'GET',
      path: '/api/v1/vendors',
      tests: `
      pm.test('Status is 200 and B sees nothing of A', function () {
        pm.response.to.have.status(200);
        pm.expect(pm.response.json().meta.total).to.equal(0);
      });
      `,
    }),
    request({
      name: "B's transactions filtered by A's job id are empty",
      method: 'GET',
      path: '/api/v1/transactions',
      query: [{ key: 'jobId', value: '{{ingestJobId}}' }],
      tests: `
      pm.test('Status is 200 with zero rows', function () {
        pm.response.to.have.status(200);
        pm.expect(pm.response.json().meta.total).to.equal(0);
      });
      `,
    }),
    request({
      name: 'B can ingest the very same file (duplicate detection is per tenant)',
      method: 'POST',
      path: '/api/v1/ingestion/jobs',
      form: [file('price-sheet.csv'), field('sourceType', 'price_sheet')],
      tests: `
      pm.test('Status is 201 (not 409)', function () { pm.response.to.have.status(201); });
      pm.test('Creates fresh transactions in B', function () {
        pm.expect(pm.response.json().data.stats.transactionsCreated).to.equal(5);
      });
      `,
    }),
    request({
      name: 'B gets its own Acme vendor, distinct from A',
      method: 'GET',
      path: '/api/v1/vendors',
      query: [{ key: 'search', value: 'acme' }],
      tests: `
      pm.test('One vendor, different id than A', function () {
        const d = pm.response.json().data;
        pm.expect(d).to.have.lengthOf(1);
        pm.expect(d[0].id).to.not.equal(pm.environment.get('acmeVendorId'));
      });
      `,
    }),
    request({
      name: 'Log back in as A (200)',
      method: 'POST',
      path: '/api/v1/auth/login',
      body: { email: '{{authEmailA}}', password: '{{authPassword}}' },
      tests: `pm.test('Status is 200', function () { pm.response.to.have.status(200); });`,
    }),
    request({
      name: "A's data is untouched by B's activity",
      method: 'GET',
      path: '/api/v1/vendors/{{acmeVendorId}}',
      tests: `
      pm.test('Status is 200 and still the same active vendor', function () {
        pm.response.to.have.status(200);
        pm.expect(pm.response.json().data.id).to.equal(pm.environment.get('acmeVendorId'));
        pm.expect(pm.response.json().data.status).to.equal('active');
      });
      `,
    }),
  ],
};

const INTEL_FOLDER = {
  name: '6. Vendor intelligence',
  item: [
    request({
      name: 'Ingest competing supplier price list (201)',
      method: 'POST',
      path: '/api/v1/ingestion/jobs',
      form: [file('price-sheet-alternatives.csv'), field('sourceType', 'price_sheet'), field('allowDuplicate', 'true')],
      tests: `
      pm.test('Status is 201', function () { pm.response.to.have.status(201); });
      pm.test('All 7 quote rows parsed', function () { pm.expect(pm.response.json().data.stats.rowsParsed).to.equal(7); });
      `,
    }),
    request({
      name: 'Ingest Tally Q2 purchases and payment (201)',
      method: 'POST',
      path: '/api/v1/ingestion/jobs',
      form: [file('tally-purchases-q2.xml'), field('sourceType', 'tally'), field('allowDuplicate', 'true')],
      tests: `
      pm.test('Status is 201', function () { pm.response.to.have.status(201); });
      pm.test('2 purchases + 1 payment parsed', function () { pm.expect(pm.response.json().data.stats.rowsParsed).to.equal(3); });
      `,
    }),
    request({
      name: 'Vendor directory returns summary metrics (200)',
      method: 'GET',
      path: '/api/v1/vendors',
      query: [
        { key: 'search', value: 'acme' },
        { key: 'sort', value: '-totalSpend' },
        { key: 'hideMerged', value: 'true' },
      ],
      tests: `
      pm.test('Status is 200', function () { pm.response.to.have.status(200); });
      ${envelopeOk}
      pm.test('Acme has spend, 3 orders, monthly cadence', function () {
        const d = pm.response.json().data;
        pm.expect(d).to.have.lengthOf(1);
        const s = d[0].summary;
        pm.expect(s.totalSpend).to.equal(76275);
        pm.expect(s.orderCount).to.equal(3);
        pm.expect(s.frequencyStatus).to.equal('monthly');
        pm.expect(s.avgDaysBetweenOrders).to.equal(30);
        pm.expect(s.lastPurchaseDate).to.match(/^2025-06-04/);
        pm.environment.set('acmeVendorId', d[0].id);
      });
      `,
    }),
    request({
      name: 'Directory sorts by total spend (200)',
      method: 'GET',
      path: '/api/v1/vendors',
      query: [{ key: 'sort', value: '-totalSpend' }],
      tests: `
      pm.test('Status is 200 and spend is descending', function () {
        pm.response.to.have.status(200);
        const spends = pm.response.json().data.map(function (v) { return v.summary.totalSpend; });
        const sorted = spends.slice().sort(function (a, b) { return b - a; });
        pm.expect(spends).to.eql(sorted);
        pm.expect(spends[0]).to.equal(76275);
      });
      `,
    }),
    request({
      name: 'Vendor intelligence deep dive (200)',
      method: 'GET',
      path: '/api/v1/vendors/{{acmeVendorId}}/intelligence',
      tests: `
      pm.test('Status is 200', function () { pm.response.to.have.status(200); });
      ${envelopeOk}
      pm.test('Purchases: spend, orders, average order value', function () {
        const s = pm.response.json().data.summary;
        pm.expect(s.totalSpend).to.equal(76275);
        pm.expect(s.orderCount).to.equal(3);
        pm.expect(s.avgOrderValue).to.equal(25425);
      });
      pm.test('Cadence is monthly (30 days)', function () {
        const f = pm.response.json().data.frequency;
        pm.expect(f.status).to.equal('monthly');
        pm.expect(f.avgDaysBetweenOrders).to.equal(30);
      });
      pm.test('Payment delay estimated by FIFO matching; one invoice outstanding', function () {
        const p = pm.response.json().data.paymentTerms;
        pm.expect(p.method).to.equal('fifo-estimate');
        pm.expect(p.invoicesPaid).to.equal(2);
        pm.expect(p.avgDaysToPay).to.equal(17.5);
        pm.expect(p.invoicesOutstanding).to.equal(1);
        pm.expect(p.outstandingAmount).to.equal(18875);
        pm.expect(p.source).to.equal('not_set');
      });
      pm.test('Catalog: steel units summed across orders, price rose', function () {
        const steel = pm.response.json().data.products.find(function (p) { return p.name === 'Steel Rod 12mm'; });
        pm.expect(steel, 'steel rod listed').to.exist;
        pm.expect(steel.unitsSupplied).to.equal(950);
        pm.expect(steel.baseUnit).to.equal('kg');
        pm.expect(steel.lastPrice).to.equal(75.5);
        pm.expect(steel.priceChangePct).to.be.above(0);
        pm.environment.set('steelProductId', steel.productId);
      });
      pm.test('Price history shows monthly inflation for steel', function () {
        const h = pm.response.json().data.priceHistory;
        pm.expect(h.granularity).to.equal('month');
        const s = h.series.find(function (x) { return x.name === 'Steel Rod 12mm'; });
        pm.expect(s.points.map(function (p) { return p.period; })).to.eql(['2025-04', '2025-05', '2025-06']);
        pm.expect(s.changePct).to.be.above(0);
        pm.expect(h.inflationPct).to.be.a('number');
      });
      pm.test('Price consistency is computed', function () {
        const c = pm.response.json().data.priceConsistency;
        pm.expect(c.rating).to.be.oneOf(['stable', 'moderate', 'volatile']);
        pm.expect(c.stabilityIndex).to.be.within(0, 100);
      });
      pm.test('Alternative supplier is cheaper than this vendor', function () {
        const items = pm.response.json().data.alternatives.items;
        const steel = items.find(function (i) { return i.product.name === 'Steel Rod 12mm'; });
        pm.expect(steel, 'steel comparison').to.exist;
        const alt = steel.suppliers.find(function (s) { return s.vendorName === 'Bharat Steel Traders'; });
        pm.expect(alt, 'Bharat listed').to.exist;
        pm.expect(alt.deltaVsBaselinePct).to.be.below(0);
        pm.expect(alt.rank).to.equal(1);
        const me = steel.suppliers.find(function (s) { return s.isBaseline; });
        pm.expect(me.vendorName).to.match(/^Acme/);
        pm.expect(alt.leadTimeDays).to.equal(null);
      });
      pm.test('Lead times are reported as not captured', function () {
        pm.expect(pm.response.json().data.dataQuality.leadTimes).to.equal('not_captured');
      });
      `,
    }),
    request({
      name: 'Quarterly price history (200)',
      method: 'GET',
      path: '/api/v1/vendors/{{acmeVendorId}}/intelligence',
      query: [{ key: 'granularity', value: 'quarter' }],
      tests: `
      pm.test('Status is 200 with quarter periods', function () {
        pm.response.to.have.status(200);
        const s = pm.response.json().data.priceHistory.series.find(function (x) { return x.name === 'Steel Rod 12mm'; });
        pm.expect(s.points.map(function (p) { return p.period; })).to.eql(['2025-Q2']);
      });
      `,
    }),
    request({
      name: 'Configure payment terms (200)',
      method: 'PATCH',
      path: '/api/v1/vendors/{{acmeVendorId}}',
      body: { paymentTermsDays: 30 },
      tests: `
      pm.test('Status is 200 and terms saved', function () {
        pm.response.to.have.status(200);
        pm.expect(pm.response.json().data.paymentTermsDays).to.equal(30);
      });
      `,
    }),
    request({
      name: 'Intelligence reflects Net 30 and on-time rate (200)',
      method: 'GET',
      path: '/api/v1/vendors/{{acmeVendorId}}/intelligence',
      tests: `
      pm.test('Net 30, both paid invoices within terms', function () {
        const p = pm.response.json().data.paymentTerms;
        pm.expect(p.label).to.equal('Net 30');
        pm.expect(p.source).to.equal('configured');
        pm.expect(p.onTimeRate).to.equal(1);
      });
      `,
    }),
    request({
      name: 'Payment terms out of range (400)',
      method: 'PATCH',
      path: '/api/v1/vendors/{{acmeVendorId}}',
      body: { paymentTermsDays: 400 },
      tests: envelopeErr(400, 'VALIDATION_ERROR'),
    }),
    request({
      name: 'Clear payment terms with null (200)',
      method: 'PATCH',
      path: '/api/v1/vendors/{{acmeVendorId}}',
      body: { paymentTermsDays: null },
      tests: `
      pm.test('Status is 200 and terms cleared', function () {
        pm.response.to.have.status(200);
        pm.expect(pm.response.json().data.paymentTermsDays).to.not.exist;
      });
      `,
    }),
    request({
      name: 'Cross-vendor comparison ranks by latest price (200)',
      method: 'GET',
      path: '/api/v1/vendors/compare',
      query: [{ key: 'productIds', value: '{{steelProductId}}' }],
      tests: `
      pm.test('Status is 200', function () { pm.response.to.have.status(200); });
      ${envelopeOk}
      pm.test('Two suppliers; Bharat is cheapest, Acme costlier vs lowest', function () {
        const c = pm.response.json().data[0];
        pm.expect(c.product.name).to.equal('Steel Rod 12mm');
        pm.expect(c.suppliers).to.have.lengthOf(2);
        pm.expect(c.suppliers[0].vendorName).to.equal('Bharat Steel Traders');
        pm.expect(c.suppliers[0].isCheapest).to.equal(true);
        pm.expect(c.suppliers[1].deltaVsCheapestPct).to.be.above(0);
        pm.expect(c.suppliers[1].deltaVsBaselinePct).to.equal(null);
      });
      `,
    }),
    request({
      name: 'Comparison with a baseline vendor shows price deltas (200)',
      method: 'GET',
      path: '/api/v1/vendors/compare',
      query: [
        { key: 'productIds', value: '{{steelProductId}}' },
        { key: 'baselineVendorId', value: '{{acmeVendorId}}' },
      ],
      tests: `
      pm.test('Bharat is cheaper than the baseline', function () {
        pm.response.to.have.status(200);
        const rows = pm.response.json().data[0].suppliers;
        const bharat = rows.find(function (s) { return s.vendorName === 'Bharat Steel Traders'; });
        pm.expect(bharat.deltaVsBaselinePct).to.be.below(0);
        pm.expect(rows.find(function (s) { return s.isBaseline; }).vendorName).to.match(/^Acme/);
      });
      `,
    }),
    request({ name: 'Compare without productIds (400)', method: 'GET', path: '/api/v1/vendors/compare', tests: envelopeErr(400, 'VALIDATION_ERROR') }),
    request({
      name: 'Compare with a malformed product id (400)',
      method: 'GET',
      path: '/api/v1/vendors/compare',
      query: [{ key: 'productIds', value: 'not-an-id' }],
      tests: envelopeErr(400, 'VALIDATION_ERROR'),
    }),
    request({
      name: 'Compare with an unknown product id (404)',
      method: 'GET',
      path: '/api/v1/vendors/compare',
      query: [{ key: 'productIds', value: '000000000000000000000000' }],
      tests: envelopeErr(404, 'NOT_FOUND'),
    }),
    request({
      name: 'Directory rejects an unknown sort (400)',
      method: 'GET',
      path: '/api/v1/vendors',
      query: [{ key: 'sort', value: 'bogus' }],
      tests: envelopeErr(400, 'VALIDATION_ERROR'),
    }),
    request({
      name: 'Invalid granularity (400)',
      method: 'GET',
      path: '/api/v1/vendors/{{acmeVendorId}}/intelligence',
      query: [{ key: 'granularity', value: 'week' }],
      tests: envelopeErr(400, 'VALIDATION_ERROR'),
    }),
  ],
};

const PRODUCT_FOLDER = {
  name: '7. Product intelligence',
  item: [
    request({
      name: 'Catalog list returns summary metrics (200)',
      method: 'GET',
      path: '/api/v1/products',
      query: [
        { key: 'search', value: 'steel' },
        { key: 'sort', value: '-totalSpend' },
        { key: 'hideMerged', value: 'true' },
      ],
      tests: `
      pm.test('Status is 200', function () { pm.response.to.have.status(200); });
      ${envelopeOk}
      pm.test('Steel Rod summary: spend, share, current and average price, vendors', function () {
        const d = pm.response.json().data;
        pm.expect(d).to.have.lengthOf(1);
        const s = d[0].summary;
        pm.expect(s.totalSpend).to.equal(70175);
        pm.expect(s.spendSharePct).to.be.closeTo(82.29, 0.05);
        pm.expect(s.currentPrice).to.equal(75.5);
        pm.expect(s.currentPriceKind).to.equal('purchase');
        pm.expect(s.avgPurchasePrice).to.be.closeTo(73.8684, 0.001);
        pm.expect(s.primaryVendor.name).to.match(/^Acme/);
        pm.expect(s.bestVendor.name).to.match(/^Acme/);
        pm.expect(s.bestVendor.score).to.be.within(0, 100);
        pm.expect(s.vendorCount).to.equal(2);
        pm.environment.set('steelProductId', d[0].id);
      });
      `,
    }),
    request({
      name: 'Catalog sorts by spend (200)',
      method: 'GET',
      path: '/api/v1/products',
      query: [{ key: 'sort', value: '-totalSpend' }],
      tests: `
      pm.test('Status is 200 and spend is descending', function () {
        pm.response.to.have.status(200);
        const spends = pm.response.json().data.map(function (p) { return p.summary.totalSpend; });
        pm.expect(spends).to.eql(spends.slice().sort(function (a, b) { return b - a; }));
        pm.expect(spends[0]).to.equal(70175);
      });
      `,
    }),
    request({
      name: 'Product intelligence deep dive (200)',
      method: 'GET',
      path: '/api/v1/products/{{steelProductId}}/intelligence',
      query: [{ key: 'asOf', value: '2025-06-10' }],
      tests: `
      pm.test('Status is 200', function () { pm.response.to.have.status(200); });
      ${envelopeOk}
      pm.test('Purchases: spend, units, orders, prices paid', function () {
        const s = pm.response.json().data.summary;
        pm.expect(s.totalSpend).to.equal(70175);
        pm.expect(s.unitsPurchased).to.equal(950);
        pm.expect(s.orderCount).to.equal(3);
        pm.expect(s.weightedAvgPurchasePrice).to.be.closeTo(73.8684, 0.001);
        pm.expect(s.meanPurchasePrice).to.be.closeTo(74.1667, 0.001);
        pm.expect(s.currentPrice.price).to.equal(75.5);
        pm.expect(s.currentPrice.kind).to.equal('purchase');
      });
      pm.test('Lowest recorded purchase price with vendor and date; lowest quote tracked separately', function () {
        const d = pm.response.json().data;
        pm.expect(d.lowestPurchase.price).to.equal(73);
        pm.expect(d.lowestPurchase.vendorName).to.match(/^Acme/);
        pm.expect(d.lowestPurchase.date).to.match(/^2025-04-05/);
        pm.expect(d.highestPurchase.price).to.equal(75.5);
        pm.expect(d.lowestQuote.price).to.equal(68.4);
        pm.expect(d.lowestQuote.vendorName).to.equal('Bharat Steel Traders');
        pm.expect(d.priceComparison.currentVsLowestPct).to.equal(3.42);
        pm.expect(d.priceComparison.currentVsAveragePct).to.equal(2.21);
      });
      pm.test('History has chronological purchase and quote points with suppliers', function () {
        const pts = pm.response.json().data.history.points;
        pm.expect(pts).to.have.lengthOf(8);
        pm.expect(pts.filter(function (p) { return p.kind === 'purchase'; })).to.have.lengthOf(3);
        const times = pts.map(function (p) { return new Date(p.date).getTime(); });
        pm.expect(times).to.eql(times.slice().sort(function (a, b) { return a - b; }));
        pm.expect(pts[0]).to.include.all.keys('date', 'price', 'kind', 'vendorName', 'quantity');
      });
      pm.test('Fluctuation: rising month over month', function () {
        const f = pm.response.json().data.fluctuation;
        pm.expect(f.basis).to.equal('purchases');
        pm.expect(f.trend).to.equal('rising');
        pm.expect(f.changePct).to.equal(3.42);
        pm.expect(f.avgMonthOverMonthPct).to.equal(1.7);
        pm.expect(f.monthly).to.have.lengthOf(3);
        pm.expect(f.monthly[0].changePct).to.equal(null);
        pm.expect(f.stability.rating).to.be.oneOf(['stable', 'moderate', 'volatile']);
      });
      pm.test('Best-performing vendor with score breakdown and savings callout', function () {
        const b = pm.response.json().data.bestVendor;
        pm.expect(b.vendorName).to.match(/^Acme/);
        pm.expect(b.score).to.be.within(0, 100);
        pm.expect(b.breakdown).to.have.all.keys('price', 'stability', 'reliability');
        pm.expect(b.savings.cheapestVendorName).to.equal('Bharat Steel Traders');
        pm.expect(b.savings.pct).to.be.closeTo(5.7, 0.05);
        pm.expect(b.savings.onHistoricalVolume).to.equal(2535);
        pm.expect(pm.response.json().data.vendors.map(function (v) { return v.rank; })).to.eql([1, 2]);
      });
      pm.test('Consumption velocity from purchase volume', function () {
        const c = pm.response.json().data.consumption;
        pm.expect(c.velocityPerDay).to.be.closeTo(11.6667, 0.001);
        pm.expect(c.velocityPerMonth).to.equal(350);
        pm.expect(c.ordersConsidered).to.equal(3);
        pm.expect(c.avgDaysBetweenOrders).to.equal(30);
        pm.expect(c.basis).to.equal('purchase_volume');
      });
      pm.test('Reorder recommendation with assumed lead time flagged', function () {
        const r = pm.response.json().data.reorder;
        pm.expect(r.status).to.equal('order_now');
        pm.expect(r.leadTimeSource).to.equal('assumed_default');
        pm.expect(r.leadTimeDays).to.equal(14);
        pm.expect(r.safetyStockMethod).to.equal('statistical');
        pm.expect(r.reorderPoint).to.equal(204);
        pm.expect(r.recommendedOrderQty).to.equal(350);
        pm.expect(r.estimatedStockOnHand).to.equal(180);
        pm.expect(r.estimatedOrderCost).to.equal(26425);
        pm.expect(r.assumptions).to.be.an('array').that.is.not.empty;
      });
      pm.test('Alternatives: Bharat is cheaper than the current supplier', function () {
        const a = pm.response.json().data.alternatives;
        pm.expect(a.baselineVendor.name).to.match(/^Acme/);
        pm.expect(a.cheaperVendorCount).to.equal(1);
        const alt = a.vendors.find(function (v) { return v.vendorName === 'Bharat Steel Traders'; });
        pm.expect(alt.deltaVsBaselinePct).to.be.below(0);
        pm.expect(a.substitutes).to.be.an('array');
      });
      pm.test('Data-quality flags are explicit', function () {
        const q = pm.response.json().data.dataQuality;
        pm.expect(q.leadTimes).to.equal('assumed_default');
        pm.expect(q.stockOnHand).to.equal('not_tracked');
        pm.expect(q.reliability).to.equal('proxy');
      });
      `,
    }),
    request({
      name: 'Alternatives endpoint (200)',
      method: 'GET',
      path: '/api/v1/products/{{steelProductId}}/alternatives',
      tests: `
      pm.test('Status is 200', function () { pm.response.to.have.status(200); });
      ${envelopeOk}
      pm.test('Suppliers ranked by price with deltas vs the primary vendor', function () {
        const d = pm.response.json().data;
        pm.expect(d.vendors[0].vendorName).to.equal('Bharat Steel Traders');
        pm.expect(d.vendors[0].deltaVsBaselinePct).to.be.below(0);
        pm.expect(d.vendors[1].isBaseline).to.equal(true);
        pm.expect(d.baselineVendor.lastPrice).to.equal(75.5);
        pm.expect(d.substitutes).to.be.an('array');
      });
      `,
    }),
    request({
      name: 'Configure lead time and safety stock (200)',
      method: 'PATCH',
      path: '/api/v1/products/{{steelProductId}}',
      body: { leadTimeDays: 5, safetyStockDays: 3 },
      tests: `
      pm.test('Status is 200 and settings saved', function () {
        pm.response.to.have.status(200);
        const d = pm.response.json().data;
        pm.expect(d.leadTimeDays).to.equal(5);
        pm.expect(d.safetyStockDays).to.equal(3);
      });
      `,
    }),
    request({
      name: 'Reorder plan reflects configured inputs (200)',
      method: 'GET',
      path: '/api/v1/products/{{steelProductId}}/intelligence',
      query: [{ key: 'asOf', value: '2025-06-10' }],
      tests: `
      pm.test('Configured lead time, configured safety cover, order soon', function () {
        const r = pm.response.json().data.reorder;
        pm.expect(r.leadTimeSource).to.equal('configured');
        pm.expect(r.leadTimeDays).to.equal(5);
        pm.expect(r.safetyStockMethod).to.equal('configured_days');
        pm.expect(r.reorderPoint).to.equal(94);
        pm.expect(r.status).to.equal('order_soon');
      });
      `,
    }),
    request({
      name: 'Reorder inputs out of range (400)',
      method: 'PATCH',
      path: '/api/v1/products/{{steelProductId}}',
      body: { leadTimeDays: 999 },
      tests: envelopeErr(400, 'VALIDATION_ERROR'),
    }),
    request({
      name: 'Clear reorder inputs with null (200)',
      method: 'PATCH',
      path: '/api/v1/products/{{steelProductId}}',
      body: { leadTimeDays: null, safetyStockDays: null },
      tests: `
      pm.test('Status is 200 and inputs cleared', function () {
        pm.response.to.have.status(200);
        pm.expect(pm.response.json().data.leadTimeDays).to.not.exist;
        pm.expect(pm.response.json().data.safetyStockDays).to.not.exist;
      });
      `,
    }),
    request({
      name: 'Catalog rejects an unknown sort (400)',
      method: 'GET',
      path: '/api/v1/products',
      query: [{ key: 'sort', value: 'bogus' }],
      tests: envelopeErr(400, 'VALIDATION_ERROR'),
    }),
    request({
      name: 'Invalid asOf date (400)',
      method: 'GET',
      path: '/api/v1/products/{{steelProductId}}/intelligence',
      query: [{ key: 'asOf', value: 'not-a-date' }],
      tests: envelopeErr(400, 'VALIDATION_ERROR'),
    }),
    request({
      name: 'Unknown product (404)',
      method: 'GET',
      path: '/api/v1/products/000000000000000000000000/intelligence',
      tests: envelopeErr(404, 'NOT_FOUND'),
    }),
    request({
      name: 'Log in as organization B (200)',
      method: 'POST',
      path: '/api/v1/auth/login',
      body: { email: '{{authEmailB}}', password: '{{authPassword}}' },
      tests: `pm.test('Status is 200', function () { pm.response.to.have.status(200); });`,
    }),
    request({
      name: "B cannot read A's product intelligence (404)",
      method: 'GET',
      path: '/api/v1/products/{{steelProductId}}/intelligence',
      tests: envelopeErr(404, 'NOT_FOUND'),
    }),
    request({
      name: "B cannot read A's product alternatives (404)",
      method: 'GET',
      path: '/api/v1/products/{{steelProductId}}/alternatives',
      tests: envelopeErr(404, 'NOT_FOUND'),
    }),
    request({
      name: "B's catalog has its own steel product with no purchases of A's",
      method: 'GET',
      path: '/api/v1/products',
      query: [{ key: 'search', value: 'steel' }],
      tests: `
      pm.test('B sees only its own product, with none of the other tenant spend', function () {
        const d = pm.response.json().data;
        pm.expect(d).to.have.lengthOf(1);
        pm.expect(d[0].id).to.not.equal(pm.environment.get('steelProductId'));
        pm.expect(d[0].summary.totalSpend).to.equal(0);
        pm.expect(d[0].summary.currentPriceKind).to.equal('quote');
      });
      `,
    }),
  ],
};

const groundingCheck = `
      pm.test('Every number in the narrative is present in the evidence packet', function () {
        const d = pm.response.json().data;
        const allowed = {};
        const key = function (n) { return Number(n.toFixed(4)).toString(); };
        const add = function (n) { n = Math.abs(n); [0, 1, 2, 3, 4].forEach(function (dp) { allowed[key(Number(n.toFixed(dp)))] = true; }); };
        const nums = function (t) { return (String(t).match(/\\d[\\d,]*(?:\\.\\d+)?/g) || []).map(function (x) { return Number(x.replace(/,/g, '')); }); };
        const walk = function (v) {
          if (typeof v === 'number') add(v);
          else if (typeof v === 'string') nums(v).forEach(add);
          else if (Array.isArray(v)) v.forEach(walk);
          else if (v && typeof v === 'object') Object.keys(v).forEach(function (k) { walk(v[k]); });
        };
        walk(d.evidence); walk(d.impact); walk(d.window);
        const bad = [];
        ['headline', 'summary', 'rationale', 'recommendedAction'].forEach(function (f) {
          nums(d[f]).forEach(function (n) { if (!allowed[key(n)]) bad.push(f + ':' + n); });
        });
        pm.expect(bad, 'numbers not in evidence').to.eql([]);
      });
`;

const ADVISORY_FOLDER = {
  name: '8. Advisory',
  item: [
    request({
      name: 'Log in as organization A (200)',
      method: 'POST',
      path: '/api/v1/auth/login',
      body: { email: '{{authEmailA}}', password: '{{authPassword}}' },
      tests: `pm.test('Status is 200', function () { pm.response.to.have.status(200); });`,
    }),
    request({
      name: 'No insights before the first scan (200)',
      method: 'GET',
      path: '/api/v1/advisory/insights',
      tests: `
      pm.test('Status is 200 and empty', function () {
        pm.response.to.have.status(200);
        pm.expect(pm.response.json().meta.total).to.equal(0);
      });
      `,
    }),
    request({
      name: 'Record a verified external benchmark (201)',
      method: 'POST',
      path: '/api/v1/advisory/benchmarks',
      body: { productId: '{{steelProductId}}', priceBase: 69, sourceName: 'Newman test index', sourceUrl: 'https://example.com/newman', observedAt: '2025-06-01', verified: true },
      tests: `
      pm.test('Status is 201 and attributed to the verifier', function () {
        pm.response.to.have.status(201);
        const d = pm.response.json().data;
        pm.expect(d.verified).to.equal(true);
        pm.expect(d.verifiedBy).to.equal(pm.environment.get('authEmailA'));
        pm.expect(d.priceBase).to.equal(69);
        pm.environment.set('advBenchmarkId', d.id);
      });
      `,
    }),
    request({
      name: 'A verified benchmark needs a source URL (400)',
      method: 'POST',
      path: '/api/v1/advisory/benchmarks',
      body: { productId: '{{steelProductId}}', priceBase: 60, sourceName: 'No source', observedAt: '2025-06-01', verified: true },
      tests: envelopeErr(400, 'BAD_REQUEST'),
    }),
    request({
      name: 'Run intelligence scan as of 2025-06-10 (200)',
      method: 'POST',
      path: '/api/v1/advisory/generate',
      body: { asOf: '2025-06-10' },
      tests: `
      pm.test('Status is 200', function () { pm.response.to.have.status(200); });
      ${envelopeOk}
      pm.test('Deterministic engine found one insight per applicable signal', function () {
        const s = pm.response.json().data;
        pm.expect(s.asOfReason).to.equal('requested');
        pm.expect(s.byType).to.eql({ COST_CREEP: 1, SUPPLIER_VARIANCE: 1, CONSOLIDATION: 0, REORDER_ALERT: 1, MARKET_SAVINGS: 1, SOURCING_SHIFT: 0, DELIVERY_RISK: 0, MAVERICK_SPEND: 0, BUDGET_OVERRUN: 0, SUPPLY_RISK: 0 }); // purchase-order detectors stay silent without PO data
        pm.expect(s.signalsDetected).to.equal(4);
        pm.expect(s.created).to.equal(4);
        pm.expect(s.markedStale).to.equal(0);
        pm.expect(s.llmEnabled).to.be.a('boolean');
        pm.expect(s.narratedByLlm + s.narratedByTemplate).to.equal(4);
      });
      `,
    }),
    request({
      name: 'List active insights, most severe first (200)',
      method: 'GET',
      path: '/api/v1/advisory/insights',
      tests: `
      pm.test('Status is 200 with four insights and no heavy evidence in the list', function () {
        pm.response.to.have.status(200);
        const b = pm.response.json();
        pm.expect(b.meta.total).to.equal(4);
        b.data.forEach(function (i) {
          pm.expect(i).to.include.all.keys('type', 'severity', 'confidence', 'status', 'headline', 'summary', 'rationale', 'recommendedAction', 'impact', 'entities', 'generator');
          pm.expect(i).to.not.have.property('evidence');
          pm.expect(i).to.not.have.property('tenantId');
          pm.expect(i.status).to.equal('ACTIVE');
        });
        const ranks = b.data.map(function (i) { return { HIGH: 3, MEDIUM: 2, LOW: 1 }[i.severity]; });
        pm.expect(ranks).to.eql(ranks.slice().sort(function (a, c) { return c - a; }));
        const byType = {};
        b.data.forEach(function (i) { byType[i.type] = i.id; });
        pm.environment.set('advInsightMarket', byType.MARKET_SAVINGS);
        pm.environment.set('advInsightReorder', byType.REORDER_ALERT);
        pm.environment.set('advInsightVariance', byType.SUPPLIER_VARIANCE);
        pm.environment.set('advInsightCreep', byType.COST_CREEP);
      });
      `,
    }),
    request({
      name: 'Filter insights by type (200)',
      method: 'GET',
      path: '/api/v1/advisory/insights',
      query: [{ key: 'type', value: 'REORDER_ALERT' }],
      tests: `pm.test('Only the reorder alert', function () { pm.response.to.have.status(200); const d = pm.response.json().data; pm.expect(d).to.have.lengthOf(1); pm.expect(d[0].type).to.equal('REORDER_ALERT'); });`,
    }),
    request({
      name: 'Filter insights by severity (200)',
      method: 'GET',
      path: '/api/v1/advisory/insights',
      query: [{ key: 'severity', value: 'MEDIUM' }],
      tests: `pm.test('Only the reorder alert is MEDIUM (market savings is bumped to HIGH: > 3% of total spend)', function () { pm.response.to.have.status(200); const t = pm.response.json().data.map(function (i) { return i.type; }); pm.expect(t).to.eql(['REORDER_ALERT']); });`,
    }),
    request({
      name: 'Market insight evidence: verified benchmark and gross savings (200)',
      method: 'GET',
      path: '/api/v1/advisory/insights/{{advInsightMarket}}',
      tests: `
      pm.test('Status is 200', function () { pm.response.to.have.status(200); });
      ${envelopeOk}
      pm.test('Evidence packet carries the exact figures and provenance', function () {
        const d = pm.response.json().data;
        pm.expect(d.severity).to.equal('HIGH'); // 9.4% premium = MEDIUM, bumped because 4,625 is > 3% of total spend
        pm.expect(d.confidence).to.equal('HIGH');
        pm.expect(d.impact.kind).to.equal('savings');
        pm.expect(d.impact.amountInr).to.equal(4625);
        pm.expect(d.impact.basis).to.match(/^GROSS/);
        pm.expect(d.evidence.benchmark.sourceName).to.equal('Newman test index');
        pm.expect(d.evidence.benchmark.sourceUrl).to.equal('https://example.com/newman');
        pm.expect(d.evidence.benchmark.verifiedBy).to.equal(pm.environment.get('authEmailA'));
        pm.expect(d.evidence.paid.latestPrice).to.equal(75.5);
        pm.expect(d.evidence.grossSavings).to.equal(4625);
        pm.expect(d.entities.productIds).to.have.lengthOf(1);
        pm.expect(d.rfq.productId).to.equal(pm.environment.get('steelProductId'));
      });
      ${groundingCheck}
      `,
    }),
    request({
      name: 'Reorder insight evidence (200)',
      method: 'GET',
      path: '/api/v1/advisory/insights/{{advInsightReorder}}',
      tests: `
      pm.test('Reorder evidence matches the product plan, lead time flagged as assumed', function () {
        pm.response.to.have.status(200);
        const d = pm.response.json().data;
        pm.expect(d.severity).to.equal('MEDIUM');
        pm.expect(d.impact.kind).to.equal('risk');
        pm.expect(d.evidence.recommendedOrderQty).to.equal(350);
        pm.expect(d.evidence.reorderPoint).to.equal(204);
        pm.expect(d.evidence.leadTimeSource).to.equal('assumed_default');
        pm.expect(d.evidence.assumptions).to.be.an('array').that.is.not.empty;
      });
      ${groundingCheck}
      `,
    }),
    request({
      name: 'Supplier variance evidence (200)',
      method: 'GET',
      path: '/api/v1/advisory/insights/{{advInsightVariance}}',
      tests: `
      pm.test('Acme is pricier than Bharat; the cost of the gap is exact', function () {
        pm.response.to.have.status(200);
        const d = pm.response.json().data;
        pm.expect(d.evidence.vendor.vendorName).to.match(/^Acme/);
        pm.expect(d.evidence.peer.vendorName).to.equal('Bharat Steel Traders');
        pm.expect(d.evidence.premiumPct).to.be.closeTo(6.04, 0.01);
        pm.expect(d.impact.amountInr).to.equal(2535);
        pm.expect(d.confidence).to.equal('HIGH');
        pm.expect(d.evidence.comparison.monthsHigher).to.equal(3);
      });
      ${groundingCheck}
      `,
    }),
    request({
      name: 'Cost creep evidence (200)',
      method: 'GET',
      path: '/api/v1/advisory/insights/{{advInsightCreep}}',
      tests: `
      pm.test('Creep compares the 60-day windows', function () {
        pm.response.to.have.status(200);
        const d = pm.response.json().data;
        pm.expect(d.evidence.scope).to.equal('product');
        pm.expect(d.evidence.windowDays).to.equal(60);
        pm.expect(d.evidence.changePct).to.be.closeTo(2.51, 0.01);
        pm.expect(d.impact.kind).to.equal('cost_increase');
      });
      ${groundingCheck}
      `,
    }),
    request({
      name: 'Mark an insight as actioned (200)',
      method: 'PATCH',
      path: '/api/v1/advisory/insights/{{advInsightVariance}}/status',
      body: { status: 'ACTIONED', note: 'Renegotiating with the supplier' },
      tests: `
      pm.test('Status is 200 and recorded in history', function () {
        pm.response.to.have.status(200);
        const d = pm.response.json().data;
        pm.expect(d.status).to.equal('ACTIONED');
        const h = d.statusHistory[d.statusHistory.length - 1];
        pm.expect(h.status).to.equal('ACTIONED');
        pm.expect(h.by).to.equal(pm.environment.get('authEmailA'));
        pm.expect(h.note).to.equal('Renegotiating with the supplier');
      });
      `,
    }),
    request({
      name: 'Snooze an insight for 7 days (200)',
      method: 'PATCH',
      path: '/api/v1/advisory/insights/{{advInsightReorder}}/status',
      body: { status: 'SNOOZED', snoozeDays: 7 },
      tests: `
      pm.test('Snoozed until a future date', function () {
        pm.response.to.have.status(200);
        const d = pm.response.json().data;
        pm.expect(d.status).to.equal('SNOOZED');
        pm.expect(new Date(d.snoozedUntil).getTime()).to.be.above(Date.now());
      });
      `,
    }),
    request({
      name: 'Default list now shows only active insights (200)',
      method: 'GET',
      path: '/api/v1/advisory/insights',
      tests: `pm.test('Actioned and snoozed insights are hidden', function () { pm.response.to.have.status(200); pm.expect(pm.response.json().meta.total).to.equal(2); });`,
    }),
    request({
      name: 'List snoozed insights (200)',
      method: 'GET',
      path: '/api/v1/advisory/insights',
      query: [{ key: 'status', value: 'SNOOZED' }],
      tests: `pm.test('One snoozed', function () { pm.response.to.have.status(200); pm.expect(pm.response.json().meta.total).to.equal(1); });`,
    }),
    request({ name: 'Invalid lifecycle status (400)', method: 'PATCH', path: '/api/v1/advisory/insights/{{advInsightCreep}}/status', body: { status: 'DONE' }, tests: envelopeErr(400, 'VALIDATION_ERROR') }),
    request({ name: 'Snooze length out of range (400)', method: 'PATCH', path: '/api/v1/advisory/insights/{{advInsightCreep}}/status', body: { status: 'SNOOZED', snoozeDays: 0 }, tests: envelopeErr(400, 'VALIDATION_ERROR') }),
    request({
      name: 'Re-scan is idempotent and preserves user decisions (200)',
      method: 'POST',
      path: '/api/v1/advisory/generate',
      body: { asOf: '2025-06-10' },
      tests: `
      pm.test('Nothing new, everything unchanged', function () {
        pm.response.to.have.status(200);
        const s = pm.response.json().data;
        pm.expect(s.created).to.equal(0);
        pm.expect(s.updated).to.equal(0);
        pm.expect(s.unchanged).to.equal(4);
        pm.expect(s.reopened).to.equal(0);
      });
      `,
    }),
    request({
      name: 'Actioned decision survived the re-scan (200)',
      method: 'GET',
      path: '/api/v1/advisory/insights/{{advInsightVariance}}',
      tests: `pm.test('Still ACTIONED', function () { pm.response.to.have.status(200); pm.expect(pm.response.json().data.status).to.equal('ACTIONED'); });`,
    }),
    request({
      name: 'Command-center summary (200)',
      method: 'GET',
      path: '/api/v1/advisory/summary',
      tests: `
      pm.test('Status is 200', function () { pm.response.to.have.status(200); });
      ${envelopeOk}
      pm.test('Counts by type, severity and lifecycle; savings are per type', function () {
        const d = pm.response.json().data;
        pm.expect(d.activeTotal).to.equal(2);
        pm.expect(d.byType.MARKET_SAVINGS.count).to.equal(1);
        pm.expect(d.byType.MARKET_SAVINGS.potentialSavings).to.equal(4625);
        pm.expect(d.byType.COST_CREEP.count).to.equal(1);
        pm.expect(d.byType.REORDER_ALERT.count).to.equal(0);
        pm.expect(d.byStatus.ACTIONED).to.equal(1);
        pm.expect(d.byStatus.SNOOZED).to.equal(1);
        pm.expect(d.lastScan.summary.signalsDetected).to.equal(4);
        pm.expect(d.note).to.match(/not additive/);
      });
      `,
    }),
    request({
      name: 'Draft an RFQ from the market insight (200)',
      method: 'POST',
      path: '/api/v1/advisory/insights/{{advInsightMarket}}/rfq-draft',
      body: {},
      tests: `
      pm.test('Status is 200', function () { pm.response.to.have.status(200); });
      ${envelopeOk}
      pm.test('Structured item, suppliers and checklist from the evidence', function () {
        const d = pm.response.json().data;
        pm.expect(d.items[0].name).to.equal('Steel Rod 12mm');
        pm.expect(d.items[0].baseUnit).to.equal('kg');
        pm.expect(d.items[0].targetQuantity).to.equal(950);
        const names = d.suppliers.map(function (s) { return s.name; });
        pm.expect(names.some(function (n) { return /^Acme/.test(n); })).to.equal(true);
        pm.expect(names).to.include('Bharat Steel Traders');
        pm.expect(d.suppliers.find(function (s) { return /^Acme/.test(s.name); }).relationship).to.equal('current');
        pm.expect(d.suppliers.find(function (s) { return s.name === 'Bharat Steel Traders'; }).relationship).to.equal('alternative');
        pm.expect(d.checklist.join(' ')).to.match(/Lead time/);
        pm.environment.set('advBharatVendorId', d.suppliers.find(function (s) { return s.name === 'Bharat Steel Traders'; }).vendorId);
      });
      pm.test('The supplier-facing text does not leak the internal reference price', function () {
        const d = pm.response.json().data;
        pm.expect(d.referencePrice).to.equal(69);
        pm.expect(d.bodyText).to.include('Request for Quotation');
        pm.expect(d.bodyText).to.include('Steel Rod 12mm');
        pm.expect(d.bodyText).to.not.include('69');
        pm.expect(d.internalNotes.join(' ')).to.include('Internal reference price');
        pm.expect(d.placeholders).to.be.an('array').that.is.not.empty;
      });
      `,
    }),
    request({
      name: 'RFQ with chosen suppliers, quantity and notes (200)',
      method: 'POST',
      path: '/api/v1/advisory/insights/{{advInsightMarket}}/rfq-draft',
      body: { vendorIds: ['{{advBharatVendorId}}'], targetQuantity: 1200, notes: 'Delivery in two lots' },
      tests: `
      pm.test('Only the selected supplier, entered quantity and notes', function () {
        pm.response.to.have.status(200);
        const d = pm.response.json().data;
        pm.expect(d.suppliers).to.have.lengthOf(1);
        pm.expect(d.suppliers[0].name).to.equal('Bharat Steel Traders');
        pm.expect(d.items[0].targetQuantity).to.equal(1200);
        pm.expect(d.items[0].quantityBasis).to.equal('Entered by you');
        pm.expect(d.bodyText).to.include('Delivery in two lots');
      });
      `,
    }),
    request({
      name: 'RFQ with an unknown supplier (400)',
      method: 'POST',
      path: '/api/v1/advisory/insights/{{advInsightMarket}}/rfq-draft',
      body: { vendorIds: ['000000000000000000000000'] },
      tests: envelopeErr(400, 'UNKNOWN_VENDOR'),
    }),
    request({
      name: 'List benchmarks (200)',
      method: 'GET',
      path: '/api/v1/advisory/benchmarks',
      query: [{ key: 'productId', value: '{{steelProductId}}' }],
      tests: `pm.test('Includes ours', function () { pm.response.to.have.status(200); pm.expect(pm.response.json().data.map(function (b) { return b.id; })).to.include(pm.environment.get('advBenchmarkId')); });`,
    }),
    request({
      name: 'Delete the benchmark (200)',
      method: 'DELETE',
      path: '/api/v1/advisory/benchmarks/{{advBenchmarkId}}',
      tests: `pm.test('Deleted', function () { pm.response.to.have.status(200); pm.expect(pm.response.json().data.deleted).to.equal(true); });`,
    }),
    request({
      name: 'Re-scan: insight whose evidence disappeared is hidden as stale (200)',
      method: 'POST',
      path: '/api/v1/advisory/generate',
      body: { asOf: '2025-06-10' },
      tests: `
      pm.test('Market insight no longer detected', function () {
        pm.response.to.have.status(200);
        const s = pm.response.json().data;
        pm.expect(s.byType.MARKET_SAVINGS).to.equal(0);
        pm.expect(s.markedStale).to.equal(1);
        pm.expect(s.unchanged).to.equal(3);
      });
      `,
    }),
    request({
      name: 'Stale insights are excluded unless requested (200)',
      method: 'GET',
      path: '/api/v1/advisory/insights',
      query: [
        { key: 'status', value: 'ALL' },
        { key: 'includeStale', value: 'true' },
      ],
      tests: `pm.test('All four are retained for history', function () { pm.response.to.have.status(200); pm.expect(pm.response.json().meta.total).to.equal(4); });`,
    }),
    request({
      name: 'Hidden by default once stale (200)',
      method: 'GET',
      path: '/api/v1/advisory/insights',
      query: [{ key: 'status', value: 'ALL' }],
      tests: `pm.test('Three visible', function () { pm.response.to.have.status(200); pm.expect(pm.response.json().meta.total).to.equal(3); });`,
    }),
    request({ name: 'Unknown insight type filter (400)', method: 'GET', path: '/api/v1/advisory/insights', query: [{ key: 'type', value: 'BOGUS' }], tests: envelopeErr(400, 'VALIDATION_ERROR') }),
    request({ name: 'Unsupported scan window (400)', method: 'POST', path: '/api/v1/advisory/generate', body: { windowDays: 45 }, tests: envelopeErr(400, 'VALIDATION_ERROR') }),
    request({ name: 'Invalid asOf date (400)', method: 'POST', path: '/api/v1/advisory/generate', body: { asOf: 'not-a-date' }, tests: envelopeErr(400, 'VALIDATION_ERROR') }),
    request({ name: 'Unknown insight (404)', method: 'GET', path: '/api/v1/advisory/insights/000000000000000000000000', tests: envelopeErr(404, 'NOT_FOUND') }),
    request({
      name: 'Log in as organization B (200)',
      method: 'POST',
      path: '/api/v1/auth/login',
      body: { email: '{{authEmailB}}', password: '{{authPassword}}' },
      tests: `pm.test('Status is 200', function () { pm.response.to.have.status(200); });`,
    }),
    request({ name: "B cannot read A's insight (404)", method: 'GET', path: '/api/v1/advisory/insights/{{advInsightCreep}}', tests: envelopeErr(404, 'NOT_FOUND') }),
    request({ name: "B cannot change A's insight (404)", method: 'PATCH', path: '/api/v1/advisory/insights/{{advInsightCreep}}/status', body: { status: 'DISMISSED' }, tests: envelopeErr(404, 'NOT_FOUND') }),
    request({ name: "B cannot draft an RFQ from A's insight (404)", method: 'POST', path: '/api/v1/advisory/insights/{{advInsightCreep}}/rfq-draft', body: {}, tests: envelopeErr(404, 'NOT_FOUND') }),
    request({
      name: "B's feed and summary are empty (200)",
      method: 'GET',
      path: '/api/v1/advisory/summary',
      tests: `pm.test('Nothing leaks across tenants', function () { pm.response.to.have.status(200); const d = pm.response.json().data; pm.expect(d.activeTotal).to.equal(0); pm.expect(d.lastScan).to.equal(null); });`,
    }),
    request({
      name: "B cannot record a benchmark for A's product (404)",
      method: 'POST',
      path: '/api/v1/advisory/benchmarks',
      body: { productId: '{{steelProductId}}', priceBase: 50, sourceName: 'Cross-tenant attempt', observedAt: '2025-06-01' },
      tests: envelopeErr(404, 'NOT_FOUND'),
    }),
  ],
};

const ANALYTICS_FOLDER = {
  name: '9. Analytics overview',
  item: [
    request({
      name: "B's overview is empty: nothing leaks across tenants (200)",
      method: 'GET',
      path: '/api/v1/analytics/overview',
      tests: `
      pm.test('Status is 200', function () { pm.response.to.have.status(200); });
      ${envelopeOk}
      pm.test('Organization B sees none of A\u2019s purchases', function () {
        const d = pm.response.json().data;
        pm.expect(d.kpis.purchaseLines).to.equal(0);
        pm.expect(d.kpis.spend).to.equal(0);
        pm.expect(d.topSuppliers).to.have.lengthOf(0);
        pm.expect(d.insights.active).to.equal(0);
      });
      `,
    }),
    request({
      name: 'Log in as organization A (200)',
      method: 'POST',
      path: '/api/v1/auth/login',
      body: { email: '{{authEmailA}}', password: '{{authPassword}}' },
      tests: `pm.test('Status is 200', function () { pm.response.to.have.status(200); });`,
    }),
    request({
      name: "A's 12-month overview (200)",
      method: 'GET',
      path: '/api/v1/analytics/overview',
      tests: `
      pm.test('Status is 200', function () { pm.response.to.have.status(200); });
      ${envelopeOk}
      pm.test('Window, currency and series shape', function () {
        const d = pm.response.json().data;
        pm.expect(d.window.months).to.equal(12);
        pm.expect(d.currency).to.equal('INR');
        pm.expect(d.monthly).to.have.lengthOf(12);
        pm.expect(d.asOfReason).to.be.oneOf(['now', 'latest_data']);
      });
      pm.test('KPIs reconcile with the series', function () {
        const d = pm.response.json().data;
        pm.expect(d.kpis.purchaseLines).to.be.above(0);
        const monthly = d.monthly.reduce(function (n, m) { return n + m.spend; }, 0);
        pm.expect(Math.abs(monthly - d.kpis.spend)).to.be.below(1);
        const cats = d.byCategory.reduce(function (n, c) { return n + c.spend; }, 0);
        pm.expect(Math.abs(cats - d.kpis.spend)).to.be.below(1);
        pm.expect(d.byCategory.length).to.be.at.most(8);
        pm.expect(d.topSuppliers.length).to.be.at.most(8);
      });
      pm.test('Absent source fields are null, never invented', function () {
        const k = pm.response.json().data.kpis;
        pm.expect(k.onTimePct).to.equal(null);
        pm.expect(k.maverickPct).to.equal(null);
        pm.expect(k.budgetVariancePct).to.equal(null);
      });
      `,
    }),
    request({
      name: '24-month window (200)',
      method: 'GET',
      path: '/api/v1/analytics/overview',
      query: [{ key: 'months', value: '24' }],
      tests: `pm.test('Status is 200 with 24 months', function () { pm.response.to.have.status(200); pm.expect(pm.response.json().data.monthly).to.have.lengthOf(24); });`,
    }),
    request({ name: 'Window below 3 months (400)', method: 'GET', path: '/api/v1/analytics/overview', query: [{ key: 'months', value: '2' }], tests: envelopeErr(400, 'VALIDATION_ERROR') }),
    request({ name: 'Unknown query parameter (400)', method: 'GET', path: '/api/v1/analytics/overview', query: [{ key: 'tenantId', value: 'x' }], tests: envelopeErr(400, 'VALIDATION_ERROR') }),
  ],
};

const collection = {
  info: {
    name: 'quoteScout API',
    description: 'Health, Items CRUD lifecycle and validation tests. Self-contained: creates and deletes its own data.',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  item: [
    AUTH_FOLDER,
    {
      name: '1. Health',
      item: [
        request({
          name: 'GET /health',
          method: 'GET',
          path: '/api/v1/health',
          tests: `
      pm.test('Status is 200', function () { pm.response.to.have.status(200); });
      ${envelopeOk}
      pm.test('Database is connected', function () {
        const d = pm.response.json().data;
        pm.expect(d.status).to.equal('ok');
        pm.expect(d.db.status).to.equal('connected');
        pm.expect(d.uptimeSeconds).to.be.a('number');
        pm.expect(new Date(d.timestamp).toString()).to.not.equal('Invalid Date');
      });
      `,
        }),
      ],
    },
    {
      name: '2. Items CRUD lifecycle',
      item: [
        request({
          name: 'Create item (201)',
          method: 'POST',
          path: '/api/v1/items',
          pre: `
      pm.environment.set('uniqueSlug', 'newman-item-' + Date.now());
      `,
          body: {
            name: 'Newman Test Item',
            slug: '{{uniqueSlug}}',
            description: 'Created by the Newman suite',
            category: 'testing',
            price: 42.5,
            quantity: 7,
            status: 'active',
          },
          tests: `
      pm.test('Status is 201', function () { pm.response.to.have.status(201); });
      ${envelopeOk}
      ${itemShape}
      pm.test('Persisted values echo the request', function () {
        const d = pm.response.json().data;
        pm.expect(d.slug).to.equal(pm.environment.get('uniqueSlug'));
        pm.expect(d.price).to.equal(42.5);
        pm.expect(d.status).to.equal('active');
      });
      pm.test('Save createdItemId to environment', function () {
        const id = pm.response.json().data.id;
        pm.expect(id).to.be.a('string');
        pm.environment.set('createdItemId', id);
      });
      `,
        }),
        request({
          name: 'Read item (200)',
          method: 'GET',
          path: '/api/v1/items/{{createdItemId}}',
          tests: `
      pm.test('Status is 200', function () { pm.response.to.have.status(200); });
      ${envelopeOk}
      ${itemShape}
      pm.test('Returns the created item', function () {
        pm.expect(pm.response.json().data.id).to.equal(pm.environment.get('createdItemId'));
      });
      `,
        }),
        request({
          name: 'List items with search + pagination meta (200)',
          method: 'GET',
          path: '/api/v1/items',
          query: [
            { key: 'search', value: '{{uniqueSlug}}' },
            { key: 'page', value: '1' },
            { key: 'limit', value: '5' },
          ],
          tests: `
      pm.test('Status is 200', function () { pm.response.to.have.status(200); });
      ${envelopeOk}
      pm.test('data is an array containing the created item', function () {
        const b = pm.response.json();
        pm.expect(b.data).to.be.an('array').with.lengthOf(1);
        pm.expect(b.data[0].id).to.equal(pm.environment.get('createdItemId'));
      });
      pm.test('meta has pagination fields', function () {
        pm.expect(pm.response.json().meta).to.include.all.keys('page', 'limit', 'total', 'totalPages');
      });
      `,
        }),
        request({
          name: 'Update item (200)',
          method: 'PATCH',
          path: '/api/v1/items/{{createdItemId}}',
          body: { price: 99.99, quantity: 3, status: 'archived' },
          tests: `
      pm.test('Status is 200', function () { pm.response.to.have.status(200); });
      ${envelopeOk}
      ${itemShape}
      pm.test('Fields were updated, others untouched', function () {
        const d = pm.response.json().data;
        pm.expect(d.price).to.equal(99.99);
        pm.expect(d.quantity).to.equal(3);
        pm.expect(d.status).to.equal('archived');
        pm.expect(d.name).to.equal('Newman Test Item');
      });
      `,
        }),
        request({
          name: 'Delete item (200)',
          method: 'DELETE',
          path: '/api/v1/items/{{createdItemId}}',
          tests: `
      pm.test('Status is 200', function () { pm.response.to.have.status(200); });
      ${envelopeOk}
      pm.test('Reports deletion of the right id', function () {
        const d = pm.response.json().data;
        pm.expect(d.deleted).to.equal(true);
        pm.expect(d.id).to.equal(pm.environment.get('createdItemId'));
      });
      `,
        }),
        request({
          name: 'Verify deleted item returns 404',
          method: 'GET',
          path: '/api/v1/items/{{createdItemId}}',
          tests: envelopeErr(404, 'NOT_FOUND'),
        }),
      ],
    },
    {
      name: '3. Validation & negative tests',
      item: [
        request({
          name: 'Create with invalid payload (400)',
          method: 'POST',
          path: '/api/v1/items',
          body: { name: '', price: -5, quantity: 1.5, status: 'bogus' },
          tests: `
      ${envelopeErr(400, 'VALIDATION_ERROR')}
      pm.test('details lists offending fields', function () {
        const details = pm.response.json().error.details;
        pm.expect(details).to.be.an('array').that.is.not.empty;
        const paths = details.map(function (d) { return d.path; });
        pm.expect(paths).to.include.members(['name', 'price', 'quantity', 'status']);
      });
      `,
        }),
        request({
          name: 'Create with missing required price (400)',
          method: 'POST',
          path: '/api/v1/items',
          body: { name: 'No price' },
          tests: envelopeErr(400, 'VALIDATION_ERROR'),
        }),
        request({
          name: 'Create with malformed JSON (400)',
          method: 'POST',
          path: '/api/v1/items',
          body: '{ "name": ',
          tests: envelopeErr(400, 'INVALID_JSON'),
        }),
        request({
          name: 'Get with malformed id (400)',
          method: 'GET',
          path: '/api/v1/items/not-an-object-id',
          tests: envelopeErr(400, 'VALIDATION_ERROR'),
        }),
        request({
          name: 'Update with empty body (400)',
          method: 'PATCH',
          path: '/api/v1/items/000000000000000000000000',
          body: {},
          tests: envelopeErr(400, 'VALIDATION_ERROR'),
        }),
        request({
          name: 'List with invalid query (400)',
          method: 'GET',
          path: '/api/v1/items',
          query: [{ key: 'limit', value: '1000' }],
          tests: envelopeErr(400, 'VALIDATION_ERROR'),
        }),
        request({
          name: 'Unknown route (404)',
          method: 'GET',
          path: '/api/v1/does-not-exist',
          tests: envelopeErr(404, 'NOT_FOUND'),
        }),
      ],
    },
    {
      name: '4. Ingestion & normalisation',
      item: [
        request({
          name: 'Upload price sheet (201, row-level error tolerated)',
          method: 'POST',
          path: '/api/v1/ingestion/jobs',
          form: [file('price-sheet.csv'), field('sourceType', 'price_sheet'), field('allowDuplicate', 'true')],
          tests: `
      pm.test('Status is 201', function () { pm.response.to.have.status(201); });
      ${envelopeOk}
      pm.test('Job stats reflect parsed rows and the one bad row', function () {
        const d = pm.response.json().data;
        pm.expect(d.status).to.equal('completed_with_errors');
        pm.expect(d.stats.rowsParsed).to.equal(5);
        pm.expect(d.stats.rowsFailed).to.equal(1);
        pm.expect(d.stats.transactionsCreated + d.stats.duplicatesIgnored).to.equal(5);
        pm.expect(d.rowErrors).to.have.lengthOf(1);
        pm.expect(d.fileHash).to.match(/^[a-f0-9]{64}$/);
      });
      pm.test('Save ingestJobId', function () { pm.environment.set('ingestJobId', pm.response.json().data.id); });
      `,
        }),
        request({
          name: 'Re-upload identical file is rejected (409 DUPLICATE_FILE)',
          method: 'POST',
          path: '/api/v1/ingestion/jobs',
          form: [file('price-sheet.csv'), field('sourceType', 'price_sheet')],
          tests: `
      ${envelopeErr(409, 'DUPLICATE_FILE')}
      pm.test('Points at an existing job (details.jobId)', function () {
        pm.expect(pm.response.json().error.details.jobId).to.match(/^[a-f0-9]{24}$/);
      });
      `,
        }),
        request({
          name: 'Reprocessing with allowDuplicate creates zero new transactions',
          method: 'POST',
          path: '/api/v1/ingestion/jobs',
          form: [file('price-sheet.csv'), field('sourceType', 'price_sheet'), field('allowDuplicate', 'true')],
          tests: `
      pm.test('Status is 201', function () { pm.response.to.have.status(201); });
      pm.test('All rows de-duplicated by fingerprint', function () {
        const s = pm.response.json().data.stats;
        pm.expect(s.transactionsCreated).to.equal(0);
        pm.expect(s.duplicatesIgnored).to.equal(5);
      });
      `,
        }),
        request({
          name: 'Get job (200)',
          method: 'GET',
          path: '/api/v1/ingestion/jobs/{{ingestJobId}}',
          tests: `
      pm.test('Status is 200', function () { pm.response.to.have.status(200); });
      ${envelopeOk}
      pm.test('Row error is reported with its row number', function () {
        const e = pm.response.json().data.rowErrors[0];
        pm.expect(e.rowNumber).to.equal(7);
        pm.expect(e.message).to.match(/unit price/i);
      });
      `,
        }),
        request({
          name: 'List raw records filtered to errors (200)',
          method: 'GET',
          path: '/api/v1/ingestion/jobs/{{ingestJobId}}/records',
          query: [{ key: 'status', value: 'error' }],
          tests: `
      pm.test('Status is 200', function () { pm.response.to.have.status(200); });
      pm.test('One failed raw record retaining the source row', function () {
        const b = pm.response.json();
        pm.expect(b.data).to.have.lengthOf(1);
        pm.expect(b.data[0].status).to.equal('error');
        pm.expect(b.meta.total).to.equal(1);
      });
      `,
        }),
        request({
          name: 'Upload Tally XML (201)',
          method: 'POST',
          path: '/api/v1/ingestion/jobs',
          form: [file('tally-purchases.xml'), field('sourceType', 'tally'), field('allowDuplicate', 'true')],
          tests: `
      pm.test('Status is 201', function () { pm.response.to.have.status(201); });
      pm.test('3 purchase lines + 1 payment parsed, journal skipped', function () {
        const d = pm.response.json().data;
        pm.expect(d.status).to.equal('completed');
        pm.expect(d.stats.rowsParsed).to.equal(4);
        pm.expect(d.stats.rowsSkipped).to.equal(1);
      });
      `,
        }),
        request({
          name: 'Vendor spellings resolved to a single vendor',
          method: 'GET',
          path: '/api/v1/vendors',
          query: [{ key: 'search', value: 'acme' }],
          tests: `
      pm.test('Status is 200', function () { pm.response.to.have.status(200); });
      pm.test('Exactly one Acme vendor with aliases and tax id', function () {
        const d = pm.response.json().data;
        pm.expect(d).to.have.lengthOf(1);
        pm.expect(d[0].status).to.equal('active');
        pm.expect(d[0].taxId).to.equal('27AAACA1234A1Z5');
        pm.expect(d[0].aliases).to.be.an('array').that.is.not.empty;
        pm.environment.set('acmeVendorId', d[0].id);
      });
      `,
        }),
        request({
          name: 'Transactions for vendor are normalised (200)',
          method: 'GET',
          path: '/api/v1/transactions',
          query: [
            { key: 'vendorId', value: '{{acmeVendorId}}' },
            { key: 'limit', value: '50' },
          ],
          tests: `
      pm.test('Status is 200', function () { pm.response.to.have.status(200); });
      ${envelopeOk}
      pm.test('Every row has currency, base amount and traceability', function () {
        const d = pm.response.json().data;
        pm.expect(d).to.be.an('array').that.is.not.empty;
        d.forEach(function (t) {
          pm.expect(t).to.include.keys('kind', 'sourceType', 'jobId', 'rawRecordId', 'currency');
          if (t.kind !== 'price_quote') pm.expect(t.amountBase).to.be.a('number');
        });
      });
      pm.test('USD quote converted to INR (0.88 USD/kg * 83.2)', function () {
        const q = pm.response.json().data.find(function (t) { return t.currency === 'USD'; });
        pm.expect(q, 'USD quote present').to.exist;
        pm.expect(q.unitPriceBase).to.be.closeTo(73.216, 0.001);
      });
      `,
        }),
        request({
          name: 'Reference data lists units and FX (200)',
          method: 'GET',
          path: '/api/v1/reference',
          tests: `
      pm.test('Status is 200', function () { pm.response.to.have.status(200); });
      pm.test('Has units and base currency', function () {
        const d = pm.response.json().data;
        pm.expect(d.units).to.be.an('array').that.is.not.empty;
        pm.expect(d.currency.baseCurrency).to.equal('INR');
      });
      `,
        }),
        request({
          name: 'PDF invoice not enabled (501)',
          method: 'POST',
          path: '/api/v1/ingestion/jobs',
          form: [file('sample-invoice.pdf'), field('sourceType', 'pdf_invoice')],
          tests: envelopeErr(501, 'NOT_IMPLEMENTED'),
        }),
        request({
          name: 'Wrong file type for source (400)',
          method: 'POST',
          path: '/api/v1/ingestion/jobs',
          form: [file('tally-purchases.xml'), field('sourceType', 'price_sheet')],
          tests: envelopeErr(400, 'UNSUPPORTED_FILE_TYPE'),
        }),
        request({
          name: 'Missing file (400)',
          method: 'POST',
          path: '/api/v1/ingestion/jobs',
          form: [field('sourceType', 'price_sheet')],
          tests: envelopeErr(400, 'FILE_REQUIRED'),
        }),
        request({
          name: 'Invalid sourceType (400)',
          method: 'POST',
          path: '/api/v1/ingestion/jobs',
          form: [file('price-sheet.csv'), field('sourceType', 'carrier_pigeon')],
          tests: envelopeErr(400, 'VALIDATION_ERROR'),
        }),
        request({
          name: 'Merge vendor into itself (400)',
          method: 'POST',
          path: '/api/v1/vendors/{{acmeVendorId}}/merge',
          body: { targetId: '{{acmeVendorId}}' },
          tests: envelopeErr(400, 'BAD_REQUEST'),
        }),
      ],
    },
    ISOLATION_FOLDER,
    INTEL_FOLDER,
    PRODUCT_FOLDER,
    ADVISORY_FOLDER,
    ANALYTICS_FOLDER,
  ],
};

const environment = {
  id: 'pi-local-env',
  name: 'Procurement Intelligence - Local',
  values: [
    { key: 'baseUrl', value: 'http://localhost:4000', type: 'default', enabled: true },
    { key: 'apiKey', value: '', type: 'secret', enabled: true },
    { key: 'createdItemId', value: '', type: 'default', enabled: true },
    { key: 'uniqueSlug', value: '', type: 'default', enabled: true },
    { key: 'ingestJobId', value: '', type: 'default', enabled: true },
    { key: 'authEmailA', value: '', type: 'default', enabled: true },
    { key: 'authEmailB', value: '', type: 'default', enabled: true },
    { key: 'authPassword', value: '', type: 'secret', enabled: true },
    { key: 'tenantAId', value: '', type: 'default', enabled: true },
    { key: 'steelProductId', value: '', type: 'default', enabled: true },
    { key: 'advBenchmarkId', value: '', type: 'default', enabled: true },
    { key: 'advInsightMarket', value: '', type: 'default', enabled: true },
    { key: 'advInsightReorder', value: '', type: 'default', enabled: true },
    { key: 'advInsightVariance', value: '', type: 'default', enabled: true },
    { key: 'advInsightCreep', value: '', type: 'default', enabled: true },
    { key: 'advBharatVendorId', value: '', type: 'default', enabled: true },
    { key: 'acmeVendorId', value: '', type: 'default', enabled: true },
  ],
  _postman_variable_scope: 'environment',
};

fs.writeFileSync(path.join(__dirname, 'collection.json'), JSON.stringify(collection, null, 2) + '\n');
fs.writeFileSync(path.join(__dirname, 'local.env.json'), JSON.stringify(environment, null, 2) + '\n');
console.log('Wrote collection.json and local.env.json');
