// The demo log is a live spreadsheet, and it has been emptied twice by a
// template re-import. Rather than let a whole suite report "nothing logged" as
// three skips, check before running and rebuild if needed.

const { targets } = require('./app');
const { isSeeded, seed, PLAN } = require('./seed-demo');

module.exports = async () => {
  const T = targets();
  if (!T.adminUrl || !T.viewerUrl) {
    console.log('e2e: no targets configured, skipping the seed check');
    return;
  }
  if (!T.allowWrites) {
    console.log('e2e: writes disabled, not touching the demo data');
    return;
  }

  if (await isSeeded()) {
    console.log('e2e: demo log has sessions');
    return;
  }

  console.log(`e2e: demo log is empty, seeding ${PLAN.length} sessions…`);
  await seed({ quiet: true });
  console.log('e2e: seeded');
};
