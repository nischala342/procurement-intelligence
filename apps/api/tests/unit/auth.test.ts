import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env';
import { loginBody, signupBody } from '../../src/modules/auth/schema';
import { signAccessToken, verifyAccessToken } from '../../src/modules/auth/tokens';

const ids = { userId: 'a'.repeat(24), tenantId: 'b'.repeat(24) };

describe('auth schemas', () => {
  it('normalises email and accepts a valid signup', () => {
    const r = signupBody.parse({ email: '  Jane@Example.COM ', password: 'Passw0rdOK', organizationName: ' Acme  ' });
    assert.equal(r.email, 'jane@example.com');
    assert.equal(r.organizationName, 'Acme');
  });
  it('rejects weak passwords and bad input', () => {
    const bad = (p: string) => signupBody.safeParse({ email: 'a@b.co', password: p, organizationName: 'Acme' }).success;
    assert.equal(bad('short1'), false); // < 8
    assert.equal(bad('allletters'), false); // no number
    assert.equal(bad('12345678'), false); // no letter
    assert.equal(bad('a1'.repeat(40)), false); // > 72 bytes
    assert.equal(signupBody.safeParse({ email: 'nope', password: 'Passw0rdOK', organizationName: 'Acme' }).success, false);
    assert.equal(loginBody.safeParse({ email: 'a@b.co', password: '' }).success, false);
  });
});

describe('access tokens', () => {
  it('round-trips the user identity', () => {
    const user = verifyAccessToken(signAccessToken({ ...ids, email: 'a@b.co' }));
    assert.deepEqual(user, { ...ids, email: 'a@b.co' });
  });
  it('rejects tampered, foreign-secret, expired and malformed tokens', () => {
    const good = signAccessToken({ ...ids, email: 'a@b.co' });
    assert.equal(verifyAccessToken(good + 'x'), null);
    assert.equal(verifyAccessToken('not-a-jwt'), null);
    const foreign = jwt.sign({ email: 'a@b.co', tid: ids.tenantId }, 'some-other-secret-that-is-long-enough-xx', { subject: ids.userId });
    assert.equal(verifyAccessToken(foreign), null);
    const expired = jwt.sign({ email: 'a@b.co', tid: ids.tenantId }, env.jwtSecret, { subject: ids.userId, expiresIn: -10 });
    assert.equal(verifyAccessToken(expired), null);
    const badTenant = jwt.sign({ email: 'a@b.co', tid: 'not-an-object-id' }, env.jwtSecret, { subject: ids.userId });
    assert.equal(verifyAccessToken(badTenant), null);
  });
  it('rejects tokens signed with the "none" algorithm', () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({ sub: ids.userId, email: 'a@b.co', tid: ids.tenantId })).toString('base64url');
    assert.equal(verifyAccessToken(`${header}.${body}.`), null);
  });
});
