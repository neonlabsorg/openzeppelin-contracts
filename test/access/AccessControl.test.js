const { DEFAULT_ADMIN_ROLE, shouldBehaveLikeAccessControl } = require('./AccessControl.behavior.js');

const AccessControl = artifacts.require('$AccessControl');

contract('AccessControl', function (accounts) {
  beforeEach(async function () {
    this.skip();
    //Cannot create instance of BridgeArbitrumL2Mock; no code at address 0x0000000000000000000000000000000000000064
    this.accessControl = await AccessControl.new({ from: accounts[0] });
    await this.accessControl.$_grantRole(DEFAULT_ADMIN_ROLE, accounts[0]);
  });

  shouldBehaveLikeAccessControl('AccessControl', ...accounts);
});
