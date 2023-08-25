const { expectRevert, singletons, send, ether } = require('@openzeppelin/test-helpers');
const { setSingletonsConfig, getSingletonsConfig } = require('@openzeppelin/test-helpers/src/config/singletons');
const { bufferToHex, keccakFromString } = require('ethereumjs-util');

const { expect } = require('chai');

const ERC1820Implementer = artifacts.require('$ERC1820Implementer');

contract('ERC1820Implementer', function (accounts) {
  const [registryFunder, implementee, other] = accounts;

  const ERC1820_ACCEPT_MAGIC = bufferToHex(keccakFromString('ERC1820_ACCEPT_MAGIC'));

  beforeEach(async function () {
    const config = getSingletonsConfig();

    setSingletonsConfig({
      abstraction: config.abstraction,
      defaultGas: null,
      defaultSender: config.defaultSender,
    });
    
    this.implementer = await ERC1820Implementer.new();
    // 0.08 ETH is not enough to deploy the registry
    await send.ether(registryFunder, '0xa990077c3205cbDf861e17Fa532eeB069cE9fF96', ether('80'));
    this.registry = await singletons.ERC1820Registry(registryFunder);

    this.interfaceA = bufferToHex(keccakFromString('interfaceA'));
    this.interfaceB = bufferToHex(keccakFromString('interfaceB'));
  });

  context('with no registered interfaces', function () {
    it('returns false when interface implementation is queried', async function () {
      expect(await this.implementer.canImplementInterfaceForAddress(this.interfaceA, implementee)).to.not.equal(
        ERC1820_ACCEPT_MAGIC,
      );
    });

    it('reverts when attempting to set as implementer in the registry', async function () {
      this.skip();
      //https://neonlabs.atlassian.net/browse/NDEV-2098
      await expectRevert(
        this.registry.setInterfaceImplementer(implementee, this.interfaceA, this.implementer.address, {
          from: implementee,
        }),
        'Does not implement the interface',
      );
    });
  });

  context('with registered interfaces', function () {
    beforeEach(async function () {
      await this.implementer.$_registerInterfaceForAddress(this.interfaceA, implementee);
    });

    it('returns true when interface implementation is queried', async function () {
      expect(await this.implementer.canImplementInterfaceForAddress(this.interfaceA, implementee)).to.equal(
        ERC1820_ACCEPT_MAGIC,
      );
    });

    it('returns false when interface implementation for non-supported interfaces is queried', async function () {
      expect(await this.implementer.canImplementInterfaceForAddress(this.interfaceB, implementee)).to.not.equal(
        ERC1820_ACCEPT_MAGIC,
      );
    });

    it('returns false when interface implementation for non-supported addresses is queried', async function () {
      expect(await this.implementer.canImplementInterfaceForAddress(this.interfaceA, other)).to.not.equal(
        ERC1820_ACCEPT_MAGIC,
      );
    });

    it('can be set as an implementer for supported interfaces in the registry', async function () {
      await this.registry.setInterfaceImplementer(implementee, this.interfaceA, this.implementer.address, {
        from: implementee, gas: 1570000
      });

      expect(await this.registry.getInterfaceImplementer(implementee, this.interfaceA)).to.equal(
        this.implementer.address,
      );
    });
  });
});
