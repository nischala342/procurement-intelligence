import bcrypt from 'bcryptjs';
import { AppError } from '../../utils/AppError';
import { TenantModel, UserModel } from './model';
import type { LoginInput, SignupInput } from './schema';

const BCRYPT_ROUNDS = 12;
// Compared against when the email is unknown so that response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-password-1', BCRYPT_ROUNDS);

export const hashPassword = (plain: string) => bcrypt.hash(plain, BCRYPT_ROUNDS);

const isDuplicateKey = (e: unknown) => (e as { code?: number })?.code === 11000;

/** Creates the tenant (the user's organisation) and its first user. */
export async function signup(input: SignupInput) {
  if (await UserModel.exists({ email: input.email })) throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
  const passwordHash = await hashPassword(input.password);
  const tenant = await TenantModel.create({ name: input.organizationName });
  try {
    return await UserModel.create({ email: input.email, passwordHash, organizationName: input.organizationName, tenantId: tenant._id });
  } catch (e) {
    await TenantModel.deleteOne({ _id: tenant._id }); // do not leave an orphan tenant behind
    if (isDuplicateKey(e)) throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
    throw e;
  }
}

export async function login(input: LoginInput) {
  const user = await UserModel.findOne({ email: input.email }).select('+passwordHash');
  const ok = await bcrypt.compare(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  return user;
}

export async function getUser(userId: string) {
  const user = await UserModel.findById(userId);
  if (!user) throw new AppError(401, 'UNAUTHORIZED', 'Account no longer exists');
  return user;
}
