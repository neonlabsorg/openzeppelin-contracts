const { BN, singletons, send, ether } = require('@openzeppelin/test-helpers');

const { expect } = require('chai');

const ERC777PresetFixedSupply = artifacts.require('ERC777PresetFixedSupply');

contract('ERC777PresetFixedSupply', function (accounts) {
  const [registryFunder, owner, defaultOperatorA, defaultOperatorB, anyone] = accounts;

  const initialSupply = new BN('10000');
  const name = 'ERC777Preset';
  const symbol = '777P';

  const defaultOperators = [defaultOperatorA, defaultOperatorB];

  before(async function () {
    // 0.08 ETH is not enough to deploy the registry
    await send.ether(registryFunder, '0xa990077c3205cbDf861e17Fa532eeB069cE9fF96', ether('80'));
    await singletons.ERC1820Registry(registryFunder);
  });

  beforeEach(async function () {
    this.token = await ERC777PresetFixedSupply.new(name, symbol, defaultOperators, initialSupply, owner);
  });

  it('returns the name', async function () {
    expect(await this.token.name()).to.equal(name);
  });

  it('returns the symbol', async function () {
    expect(await this.token.symbol()).to.equal(symbol);
  });

  it('returns the default operators', async function () {
    expect(await this.token.defaultOperators()).to.deep.equal(defaultOperators);
  });

  it('default operators are operators for all accounts', async function () {
    for (const operator of defaultOperators) {
      expect(await this.token.isOperatorFor(operator, anyone)).to.equal(true);
    }
  });

  it('returns the total supply equal to initial supply', async function () {
    expect(await this.token.totalSupply()).to.be.bignumber.equal(initialSupply);
  });

  it('returns the balance of owner equal to initial supply', async function () {
    expect(await this.token.balanceOf(owner)).to.be.bignumber.equal(initialSupply);
  });
});
