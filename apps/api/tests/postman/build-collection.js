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

const collection = {
  info: {
    name: 'Procurement Intelligence API',
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
    { key: 'acmeVendorId', value: '', type: 'default', enabled: true },
  ],
  _postman_variable_scope: 'environment',
};

fs.writeFileSync(path.join(__dirname, 'collection.json'), JSON.stringify(collection, null, 2) + '\n');
fs.writeFileSync(path.join(__dirname, 'local.env.json'), JSON.stringify(environment, null, 2) + '\n');
console.log('Wrote collection.json and local.env.json');
