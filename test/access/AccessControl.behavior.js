const { expectEvent, constants, BN } = require('@openzeppelin/test-helpers');
const { expectRevertCustomError } = require('../helpers/customError');
const { expect } = require('chai');

const { time } = require('@nomicfoundation/hardhat-network-helpers');

const { shouldSupportInterfaces } = require('../utils/introspection/SupportsInterface.behavior');
const { network } = require('hardhat');
const { ZERO_ADDRESS } = require('@openzeppelin/test-helpers/src/constants');

const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000';
const ROLE = web3.utils.soliditySha3('ROLE');
const OTHER_ROLE = web3.utils.soliditySha3('OTHER_ROLE');
const ZERO = web3.utils.toBN(0);

function shouldBehaveLikeAccessControl(admin, authorized, other, otherAdmin) {
  shouldSupportInterfaces(['AccessControl']);

  describe('default admin', function () {
    it('deployer has default admin role', async function () {
      expect(await this.accessControl.hasRole(DEFAULT_ADMIN_ROLE, admin)).to.equal(true);
    });

    it("other roles's admin is the default admin role", async function () {
      expect(await this.accessControl.getRoleAdmin(ROLE)).to.equal(DEFAULT_ADMIN_ROLE);
    });

    it("default admin role's admin is itself", async function () {
      expect(await this.accessControl.getRoleAdmin(DEFAULT_ADMIN_ROLE)).to.equal(DEFAULT_ADMIN_ROLE);
    });
  });

  describe('granting', function () {
    beforeEach(async function () {
      await this.accessControl.grantRole(ROLE, authorized, { from: admin });
    });

    it('non-admin cannot grant role to other accounts', async function () {
      await expectRevertCustomError(
        this.accessControl.grantRole(ROLE, authorized, { from: other }),
        'AccessControlUnauthorizedAccount',
        [other, DEFAULT_ADMIN_ROLE],
      );
    });

    it('accounts can be granted a role multiple times', async function () {
      await this.accessControl.grantRole(ROLE, authorized, { from: admin });
      const receipt = await this.accessControl.grantRole(ROLE, authorized, { from: admin });
      expectEvent.notEmitted(receipt, 'RoleGranted');
    });
  });

  describe('revoking', function () {
    it('roles that are not had can be revoked', async function () {
      expect(await this.accessControl.hasRole(ROLE, authorized)).to.equal(false);

      const receipt = await this.accessControl.revokeRole(ROLE, authorized, { from: admin });
      expectEvent.notEmitted(receipt, 'RoleRevoked');
    });

    context('with granted role', function () {
      beforeEach(async function () {
        await this.accessControl.grantRole(ROLE, authorized, { from: admin });
      });

      it('admin can revoke role', async function () {
        const receipt = await this.accessControl.revokeRole(ROLE, authorized, { from: admin });
        expectEvent(receipt, 'RoleRevoked', { account: authorized, role: ROLE, sender: admin });

        expect(await this.accessControl.hasRole(ROLE, authorized)).to.equal(false);
      });

      it('non-admin cannot revoke role', async function () {
        await expectRevertCustomError(
          this.accessControl.revokeRole(ROLE, authorized, { from: other }),
          'AccessControlUnauthorizedAccount',
          [other, DEFAULT_ADMIN_ROLE],
        );
      });

      it('a role can be revoked multiple times', async function () {
        await this.accessControl.revokeRole(ROLE, authorized, { from: admin });

        const receipt = await this.accessControl.revokeRole(ROLE, authorized, { from: admin });
        expectEvent.notEmitted(receipt, 'RoleRevoked');
      });
    });
  });

  describe('renouncing', function () {
    it('roles that are not had can be renounced', async function () {
      const receipt = await this.accessControl.renounceRole(ROLE, authorized, { from: authorized });
      expectEvent.notEmitted(receipt, 'RoleRevoked');
    });

    context('with granted role', function () {
      beforeEach(async function () {
        await this.accessControl.grantRole(ROLE, authorized, { from: admin });
      });

      it('bearer can renounce role', async function () {
        const receipt = await this.accessControl.renounceRole(ROLE, authorized, { from: authorized });
        expectEvent(receipt, 'RoleRevoked', { account: authorized, role: ROLE, sender: authorized });

        expect(await this.accessControl.hasRole(ROLE, authorized)).to.equal(false);
      });

      it('only the sender can renounce their roles', async function () {
        await expectRevertCustomError(
          this.accessControl.renounceRole(ROLE, authorized, { from: admin }),
          'AccessControlBadConfirmation',
          [],
        );
      });

      it('a role can be renounced multiple times', async function () {
        await this.accessControl.renounceRole(ROLE, authorized, { from: authorized });

        const receipt = await this.accessControl.renounceRole(ROLE, authorized, { from: authorized });
        expectEvent.notEmitted(receipt, 'RoleRevoked');
      });
    });
  });

  describe('setting role admin', function () {
    beforeEach(async function () {
      const receipt = await this.accessControl.$_setRoleAdmin(ROLE, OTHER_ROLE);
      expectEvent(receipt, 'RoleAdminChanged', {
        role: ROLE,
        previousAdminRole: DEFAULT_ADMIN_ROLE,
        newAdminRole: OTHER_ROLE,
      });

      await this.accessControl.grantRole(OTHER_ROLE, otherAdmin, { from: admin });
    });

    it("a role's admin role can be changed", async function () {
      expect(await this.accessControl.getRoleAdmin(ROLE)).to.equal(OTHER_ROLE);
    });

    it('the new admin can grant roles', async function () {
      const receipt = await this.accessControl.grantRole(ROLE, authorized, { from: otherAdmin });
      expectEvent(receipt, 'RoleGranted', { account: authorized, role: ROLE, sender: otherAdmin });
    });

    it('the new admin can revoke roles', async function () {
      await this.accessControl.grantRole(ROLE, authorized, { from: otherAdmin });
      const receipt = await this.accessControl.revokeRole(ROLE, authorized, { from: otherAdmin });
      expectEvent(receipt, 'RoleRevoked', { account: authorized, role: ROLE, sender: otherAdmin });
    });

    it("a role's previous admins no longer grant roles", async function () {
      await expectRevertCustomError(
        this.accessControl.grantRole(ROLE, authorized, { from: admin }),
        'AccessControlUnauthorizedAccount',
        [admin.toLowerCase(), OTHER_ROLE],
      );
    });

    it("a role's previous admins no longer revoke roles", async function () {
      await expectRevertCustomError(
        this.accessControl.revokeRole(ROLE, authorized, { from: admin }),
        'AccessControlUnauthorizedAccount',
        [admin.toLowerCase(), OTHER_ROLE],
      );
    });
  });

  describe('onlyRole modifier', function () {
    beforeEach(async function () {
      await this.accessControl.grantRole(ROLE, authorized, { from: admin });
    });

    it('do not revert if sender has role', async function () {
      await this.accessControl.methods['$_checkRole(bytes32)'](ROLE, { from: authorized });
    });

    it("revert if sender doesn't have role #1", async function () {
      await expectRevertCustomError(
        this.accessControl.methods['$_checkRole(bytes32)'](ROLE, { from: other }),
        'AccessControlUnauthorizedAccount',
        [other, ROLE],
      );
    });

    it("revert if sender doesn't have role #2", async function () {
      await expectRevertCustomError(
        this.accessControl.methods['$_checkRole(bytes32)'](OTHER_ROLE, { from: authorized }),
        'AccessControlUnauthorizedAccount',
        [authorized.toLowerCase(), OTHER_ROLE],
      );
    });
  });

  describe('internal functions', function () {
    describe('_grantRole', function () {
      it('return true if the account does not have the role', async function () {
        const receipt = await this.accessControl.$_grantRole(ROLE, authorized);
        expectEvent(receipt, 'return$_grantRole', { ret0: true });
      });

      it('return false if the account has the role', async function () {
        await this.accessControl.$_grantRole(ROLE, authorized);

        const receipt = await this.accessControl.$_grantRole(ROLE, authorized);
        expectEvent(receipt, 'return$_grantRole', { ret0: false });
      });
    });

    describe('_revokeRole', function () {
      it('return true if the account has the role', async function () {
        await this.accessControl.$_grantRole(ROLE, authorized);

        const receipt = await this.accessControl.$_revokeRole(ROLE, authorized);
        expectEvent(receipt, 'return$_revokeRole', { ret0: true });
      });

      it('return false if the account does not have the role', async function () {
        const receipt = await this.accessControl.$_revokeRole(ROLE, authorized);
        expectEvent(receipt, 'return$_revokeRole', { ret0: false });
      });
    });
  });
}

function shouldBehaveLikeAccessControlEnumerable(admin, authorized, other, otherAdmin, otherAuthorized) {
  shouldSupportInterfaces(['AccessControlEnumerable']);

  describe('enumerating', function () {
    it('role bearers can be enumerated', async function () {
      await this.accessControl.grantRole(ROLE, authorized, { from: admin });
      await this.accessControl.grantRole(ROLE, other, { from: admin });
      await this.accessControl.grantRole(ROLE, otherAuthorized, { from: admin });
      await this.accessControl.revokeRole(ROLE, other, { from: admin });

      const memberCount = await this.accessControl.getRoleMemberCount(ROLE);
      expect(memberCount).to.bignumber.equal('2');

      const bearers = [];
      for (let i = 0; i < memberCount; ++i) {
        bearers.push(await this.accessControl.getRoleMember(ROLE, i));
      }

      expect(bearers).to.have.members([authorized, otherAuthorized]);
    });
    it('role enumeration should be in sync after renounceRole call', async function () {
      expect(await this.accessControl.getRoleMemberCount(ROLE)).to.bignumber.equal('0');
      await this.accessControl.grantRole(ROLE, admin, { from: admin });
      expect(await this.accessControl.getRoleMemberCount(ROLE)).to.bignumber.equal('1');
      await this.accessControl.renounceRole(ROLE, admin, { from: admin });
      expect(await this.accessControl.getRoleMemberCount(ROLE)).to.bignumber.equal('0');
    });
  });
}

function shouldBehaveLikeAccessControlDefaultAdminRules(delay, defaultAdmin, newDefaultAdmin, other) {
  shouldSupportInterfaces(['AccessControlDefaultAdminRules']);

  for (const getter of ['owner', 'defaultAdmin']) {
    describe(`${getter}()`, function () {
      it('has a default set to the initial default admin', async function () {
        const value = await this.accessControl[getter]();
        expect(value).to.equal(defaultAdmin);
        expect(await this.accessControl.hasRole(DEFAULT_ADMIN_ROLE, value)).to.be.true;
      });

    });
  }

  describe('pendingDefaultAdmin()', function () {
    it('returns 0 if no pending default admin transfer', async function () {
      const { newAdmin, schedule } = await this.accessControl.pendingDefaultAdmin();
      expect(newAdmin).to.eq(ZERO_ADDRESS);
      expect(schedule).to.be.bignumber.eq(ZERO);
    });

    describe('when there is a scheduled default admin transfer', function () {
      beforeEach('begins admin transfer', async function () {
        await this.accessControl.beginDefaultAdminTransfer(newDefaultAdmin, { from: defaultAdmin });
      });

    });
  });

  describe('defaultAdminDelay()', function () {
    it('returns the current delay', async function () {
      expect(await this.accessControl.defaultAdminDelay()).to.be.bignumber.eq(delay);
    });

    describe('when there is a scheduled delay change', function () {
      const newDelay = web3.utils.toBN(0xdead); // Any change

      beforeEach('begins delay change', async function () {
        await this.accessControl.changeDefaultAdminDelay(newDelay, { from: defaultAdmin });
      });


    });
  });

  describe('pendingDefaultAdminDelay()', function () {
    it('returns 0 if not set', async function () {
      const { newDelay, schedule } = await this.accessControl.pendingDefaultAdminDelay();
      expect(newDelay).to.be.bignumber.eq(ZERO);
      expect(schedule).to.be.bignumber.eq(ZERO);
    });

    describe('when there is a scheduled delay change', function () {
      const newDelay = web3.utils.toBN(0xdead); // Any change

      beforeEach('begins admin transfer', async function () {
        await this.accessControl.changeDefaultAdminDelay(newDelay, { from: defaultAdmin });
      });

    });
  });

  describe('defaultAdminDelayIncreaseWait()', function () {
    it('should return 5 days (default)', async function () {
      expect(await this.accessControl.defaultAdminDelayIncreaseWait()).to.be.bignumber.eq(
        web3.utils.toBN(time.duration.days(5)),
      );
    });
  });

  it('should revert if granting default admin role', async function () {
    await expectRevertCustomError(
      this.accessControl.grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin, { from: defaultAdmin }),
      'AccessControlEnforcedDefaultAdminRules',
      [],
    );
  });

  it('should revert if revoking default admin role', async function () {
    await expectRevertCustomError(
      this.accessControl.revokeRole(DEFAULT_ADMIN_ROLE, defaultAdmin, { from: defaultAdmin }),
      'AccessControlEnforcedDefaultAdminRules',
      [],
    );
  });

  it("should revert if defaultAdmin's admin is changed", async function () {
    await expectRevertCustomError(
      this.accessControl.$_setRoleAdmin(DEFAULT_ADMIN_ROLE, OTHER_ROLE),
      'AccessControlEnforcedDefaultAdminRules',
      [],
    );
  });

  it('should not grant the default admin role twice', async function () {
    await expectRevertCustomError(
      this.accessControl.$_grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin),
      'AccessControlEnforcedDefaultAdminRules',
      [],
    );
  });

  describe('begins a default admin transfer', function () {
    let receipt;
    let acceptSchedule;

    it('reverts if called by non default admin accounts', async function () {
      await expectRevertCustomError(
        this.accessControl.beginDefaultAdminTransfer(newDefaultAdmin, { from: other }),
        'AccessControlUnauthorizedAccount',
        [other, DEFAULT_ADMIN_ROLE],
      );
    });

    describe('when there is no pending delay nor pending admin transfer', function () {
      beforeEach('begins admin transfer', async function () {
        this.skip();
        //This helper can only be used with Hardhat Network
        receipt = await this.accessControl.beginDefaultAdminTransfer(newDefaultAdmin, { from: defaultAdmin });
        acceptSchedule = web3.utils.toBN(await time.latest()).add(delay);
      });

      it('should set pending default admin and schedule', async function () {
        const { newAdmin, schedule } = await this.accessControl.pendingDefaultAdmin();
        expect(newAdmin).to.equal(newDefaultAdmin);
        expect(schedule).to.be.bignumber.equal(acceptSchedule);
        expectEvent(receipt, 'DefaultAdminTransferScheduled', {
          newAdmin,
          acceptSchedule,
        });
      });
    });

    describe('when there is a pending admin transfer', function () {
      beforeEach('sets a pending default admin transfer', async function () {
        this.skip();
        //This helper can only be used with Hardhat Network
        await this.accessControl.beginDefaultAdminTransfer(newDefaultAdmin, { from: defaultAdmin });
        acceptSchedule = web3.utils.toBN(await time.latest()).add(delay);
      });

    });

    describe('when there is a pending delay', function () {
      const newDelay = web3.utils.toBN(time.duration.hours(3));

      beforeEach('schedule a delay change', async function () {
        await this.accessControl.changeDefaultAdminDelay(newDelay, { from: defaultAdmin });
        const pendingDefaultAdminDelay = await this.accessControl.pendingDefaultAdminDelay();
        acceptSchedule = pendingDefaultAdminDelay.schedule;
      });

    });
  });

  describe('accepts transfer admin', function () {
    let acceptSchedule;

    beforeEach(async function () {
      this.skip();
      //This helper can only be used with Hardhat Network
      await this.accessControl.beginDefaultAdminTransfer(newDefaultAdmin, { from: defaultAdmin });
      acceptSchedule = web3.utils.toBN(await time.latest()).add(delay);
    });


    describe('when caller is pending default admin and delay has passed', function () {
      beforeEach(async function () {
        this.skip();
        //This helper can only be used with Hardhat Network
        await time.setNextBlockTimestamp(acceptSchedule.addn(1));
      });

      it('accepts a transfer and changes default admin', async function () {
        const receipt = await this.accessControl.acceptDefaultAdminTransfer({ from: newDefaultAdmin });

        // Storage changes
        expect(await this.accessControl.hasRole(DEFAULT_ADMIN_ROLE, defaultAdmin)).to.be.false;
        expect(await this.accessControl.hasRole(DEFAULT_ADMIN_ROLE, newDefaultAdmin)).to.be.true;
        expect(await this.accessControl.owner()).to.equal(newDefaultAdmin);

        // Emit events
        expectEvent(receipt, 'RoleRevoked', {
          role: DEFAULT_ADMIN_ROLE,
          account: defaultAdmin,
        });
        expectEvent(receipt, 'RoleGranted', {
          role: DEFAULT_ADMIN_ROLE,
          account: newDefaultAdmin,
        });

        // Resets pending default admin and schedule
        const { newAdmin, schedule } = await this.accessControl.pendingDefaultAdmin();
        expect(newAdmin).to.equal(constants.ZERO_ADDRESS);
        expect(schedule).to.be.bignumber.equal(ZERO);
      });
    });

    describe('schedule not passed', function () {
      for (const [fromSchedule, tag] of [
        [-1, 'less'],
        [0, 'equal'],
      ]) {
        it(`should revert if block.timestamp is ${tag} to schedule`, async function () {
          this.skip();
          //This helper can only be used with Hardhat Network
          await time.setNextBlockTimestamp(acceptSchedule.toNumber() + fromSchedule);
          await expectRevertCustomError(
            this.accessControl.acceptDefaultAdminTransfer({ from: newDefaultAdmin }),
            'AccessControlEnforcedDefaultAdminDelay',
            [acceptSchedule],
          );
        });
      }
    });
  });

  describe('cancels a default admin transfer', function () {
    it('reverts if called by non default admin accounts', async function () {
      await expectRevertCustomError(
        this.accessControl.cancelDefaultAdminTransfer({ from: other }),
        'AccessControlUnauthorizedAccount',
        [other, DEFAULT_ADMIN_ROLE],
      );
    });

    describe('when there is a pending default admin transfer', function () {
      let acceptSchedule;

      beforeEach(async function () {
        this.skip();
        //This helper can only be used with Hardhat Network
        await this.accessControl.beginDefaultAdminTransfer(newDefaultAdmin, { from: defaultAdmin });
        acceptSchedule = web3.utils.toBN(await time.latest()).add(delay);
      });


    });

    describe('when there is no pending default admin transfer', async function () {
      it('should succeed without changes', async function () {
        const receipt = await this.accessControl.cancelDefaultAdminTransfer({ from: defaultAdmin });

        const { newAdmin, schedule } = await this.accessControl.pendingDefaultAdmin();
        expect(newAdmin).to.equal(constants.ZERO_ADDRESS);
        expect(schedule).to.be.bignumber.equal(ZERO);

        expectEvent.notEmitted(receipt, 'DefaultAdminTransferCanceled');
      });
    });
  });

  describe('renounces admin', function () {
    let expectedSchedule;
    let delayPassed;
    let delayNotPassed;

    beforeEach(async function () {
      this.skip();
      //This helper can only be used with Hardhat Network
      await this.accessControl.beginDefaultAdminTransfer(constants.ZERO_ADDRESS, { from: defaultAdmin });
      expectedSchedule = web3.utils.toBN(await time.latest()).add(delay);
      delayNotPassed = expectedSchedule;
      delayPassed = expectedSchedule.addn(1);
    });


  });

  describe('changes delay', function () {
    it('reverts if called by non default admin accounts', async function () {
      await expectRevertCustomError(
        this.accessControl.changeDefaultAdminDelay(time.duration.hours(4), {
          from: other,
        }),
        'AccessControlUnauthorizedAccount',
        [other, DEFAULT_ADMIN_ROLE],
      );
    });
    
  });

  describe('rollbacks a delay change', function () {
    it('reverts if called by non default admin accounts', async function () {
      await expectRevertCustomError(
        this.accessControl.rollbackDefaultAdminDelay({ from: other }),
        'AccessControlUnauthorizedAccount',
        [other, DEFAULT_ADMIN_ROLE],
      );
    });

    describe('when there is a pending delay', function () {
      beforeEach('set pending delay', async function () {
        await this.accessControl.changeDefaultAdminDelay(time.duration.hours(12), { from: defaultAdmin });
      });

    });

    describe('when there is no pending delay', function () {
      it('succeeds without changes', async function () {
        await this.accessControl.rollbackDefaultAdminDelay({ from: defaultAdmin });

        const { newDelay, schedule } = await this.accessControl.pendingDefaultAdminDelay();
        expect(newDelay).to.be.bignumber.eq(ZERO);
        expect(schedule).to.be.bignumber.eq(ZERO);
      });
    });
  });
}

module.exports = {
  DEFAULT_ADMIN_ROLE,
  shouldBehaveLikeAccessControl,
  shouldBehaveLikeAccessControlEnumerable,
  shouldBehaveLikeAccessControlDefaultAdminRules,
};
