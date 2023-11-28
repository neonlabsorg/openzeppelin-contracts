const { expect } = require('chai');
const optimizationsEnabled = config.solidity.compilers.some(c => c.settings.optimizer.enabled);


async function expectRevertCustomError(promise, reason) {
  try {
    await promise;
    expect.fail("Expected promise to throw but it didn't");
  } catch (revert) {
    if (reason) {
      if (optimizationsEnabled) {
        // Optimizations currently mess with Hardhat's decoding of custom errors
        expect(revert.message).to.include.oneOf([reason, 'unrecognized return data or custom error', 'execution reverted']);
      } else {
        expect(revert.message).to.include(reason);
      }
    }
  }
}

module.exports = {
  expectRevertCustomError,
};
