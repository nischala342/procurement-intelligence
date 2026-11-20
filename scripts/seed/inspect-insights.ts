import mongoose from 'mongoose';
import { UserModel } from '../../apps/api/src/modules/auth/model';
import { InsightModel } from '../../apps/api/src/modules/advisory/model';
import { narrationViolations } from '../../apps/api/src/modules/advisory/grounding';
import { MONGO_URI } from './env';

/** Dev tool: prints a demo business's insights and verifies every narrative number against its evidence. */
async function main() {
  const email = process.argv[2] ?? 'demo@procurement.test';
  await mongoose.connect(MONGO_URI);
  const user = await UserModel.findOne({ email });
  if (!user) throw new Error(`No user ${email}`);
  const insights = await InsightModel.find({ tenantId: user.tenantId, stale: { $ne: true } }).sort({ severityRank: -1, 'impact.amountInr': -1 });
  let bad = 0;
  for (const i of insights) {
    const v = narrationViolations({ headline: i.headline, summary: i.summary, rationale: i.rationale, recommendedAction: i.recommendedAction }, { facts: i.evidence, impact: i.impact, window: i.window });
    if (v.length) bad++;
    console.log(`[${i.severity}/${i.confidence}] ${i.type.padEnd(17)} ${i.status.padEnd(9)} ${i.headline}${v.length ? `   <-- UNGROUNDED ${v.join(',')}` : ''}`);
  }
  const sample = insights.find((i) => i.type === 'SOURCING_SHIFT') ?? insights[0];
  if (sample) console.log(`\nSample (${sample.type}):\n  ${sample.summary}\n  ${sample.rationale}\n  -> ${sample.recommendedAction}`);
  console.log(`\n${insights.length} insights, ${bad} with ungrounded numbers`);
}
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
