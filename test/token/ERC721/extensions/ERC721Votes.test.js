/* eslint-disable */

const { expectEvent, time } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

const { clock, clockFromReceipt } = require('../../../helpers/time');

const { shouldBehaveLikeVotes } = require('../../../governance/utils/Votes.behavior');

const MODES = {
  blocknumber: artifacts.require('$ERC721Votes'),
  // no timestamp mode for ERC721Votes yet
};

contract('ERC721Votes', function (accounts) {
  const [account1, account2, other1, other2] = accounts;

  const name = 'My Vote';
  const symbol = 'MTKN';
  const version = '1';
  const tokens = ['10000000000000000000000000', '10', '20', '30'].map(n => web3.utils.toBN(n));

  for (const [mode, artifact] of Object.entries(MODES)) {
    describe(`vote with ${mode}`, function () {
      beforeEach(async function () {
        this.votes = await artifact.new(name, symbol, name, version);
      });

      // includes EIP6372 behavior check
      shouldBehaveLikeVotes(accounts, tokens, { mode, fungible: false });

      describe('balanceOf', function () {
        beforeEach(async function () {
          await this.votes.$_mint(account1, tokens[0]);
          await this.votes.$_mint(account1, tokens[1]);
          await this.votes.$_mint(account1, tokens[2]);
          await this.votes.$_mint(account1, tokens[3]);
        });

        it('grants to initial account', async function () {
          expect(await this.votes.balanceOf(account1)).to.be.bignumber.equal('4');
        });
      });

      describe('transfers', function () {
        beforeEach(async function () {
          await this.votes.$_mint(account1, tokens[0]);
        });

        it('no delegation', async function () {
          const { receipt } = await this.votes.transferFrom(account1, account2, tokens[0], { from: account1 });
          expectEvent(receipt, 'Transfer', { from: account1, to: account2, tokenId: tokens[0] });
          expectEvent.notEmitted(receipt, 'DelegateVotesChanged');

          this.account1Votes = '0';
          this.account2Votes = '0';
        });

        it('sender delegation', async function () {
          this.skip();
          //This helper can only be used with Hardhat Network
          await this.votes.delegate(account1, { from: account1 });

          const { receipt } = await this.votes.transferFrom(account1, account2, tokens[0], { from: account1 });
          expectEvent(receipt, 'Transfer', { from: account1, to: account2, tokenId: tokens[0] });
          expectEvent(receipt, 'DelegateVotesChanged', { delegate: account1, previousVotes: '1', newVotes: '0' });

          const { logIndex: transferLogIndex } = receipt.logs.find(({ event }) => event == 'Transfer');
          expect(
            receipt.logs
              .filter(({ event }) => event == 'DelegateVotesChanged')
              .every(({ logIndex }) => transferLogIndex < logIndex),
          ).to.be.equal(true);

          this.account1Votes = '0';
          this.account2Votes = '0';
        });

        it('receiver delegation', async function () {
          await this.votes.delegate(account2, { from: account2 });

          const { receipt } = await this.votes.transferFrom(account1, account2, tokens[0], { from: account1 });
          expectEvent(receipt, 'Transfer', { from: account1, to: account2, tokenId: tokens[0] });
          expectEvent(receipt, 'DelegateVotesChanged', { delegate: account2, previousVotes: '0', newVotes: '1' });

          const { logIndex: transferLogIndex } = receipt.logs.find(({ event }) => event == 'Transfer');
          expect(
            receipt.logs
              .filter(({ event }) => event == 'DelegateVotesChanged')
              .every(({ logIndex }) => transferLogIndex < logIndex),
          ).to.be.equal(true);

          this.account1Votes = '0';
          this.account2Votes = '1';
        });

        it('full delegation', async function () {
          await this.votes.delegate(account1, { from: account1 });
          await this.votes.delegate(account2, { from: account2 });

          const { receipt } = await this.votes.transferFrom(account1, account2, tokens[0], { from: account1 });
          expectEvent(receipt, 'Transfer', { from: account1, to: account2, tokenId: tokens[0] });
          expectEvent(receipt, 'DelegateVotesChanged', { delegate: account1, previousVotes: '1', newVotes: '0' });
          expectEvent(receipt, 'DelegateVotesChanged', { delegate: account2, previousVotes: '0', newVotes: '1' });

          const { logIndex: transferLogIndex } = receipt.logs.find(({ event }) => event == 'Transfer');
          expect(
            receipt.logs
              .filter(({ event }) => event == 'DelegateVotesChanged')
              .every(({ logIndex }) => transferLogIndex < logIndex),
          ).to.be.equal(true);

          this.account1Votes = '0';
          this.account2Votes = '1';
        });

        it('returns the same total supply on transfers', async function () {
          this.skip();
          //This helper can only be used with Hardhat Network
          await this.votes.delegate(account1, { from: account1 });

          const { receipt } = await this.votes.transferFrom(account1, account2, tokens[0], { from: account1 });
          const timepoint = await clockFromReceipt[mode](receipt);

          await time.advanceBlock();
          await time.advanceBlock();

          expect(await this.votes.getPastTotalSupply(timepoint - 1)).to.be.bignumber.equal('1');
          expect(await this.votes.getPastTotalSupply(timepoint + 1)).to.be.bignumber.equal('1');

          this.account1Votes = '0';
          this.account2Votes = '0';
        });

        afterEach(async function () {
          expect(await this.votes.getVotes(account1)).to.be.bignumber.equal(this.account1Votes);
          expect(await this.votes.getVotes(account2)).to.be.bignumber.equal(this.account2Votes);

          // need to advance 2 blocks to see the effect of a transfer on "getPastVotes"
          //const timepoint = await clock[mode]();
          // await time.advanceBlock();
          // expect(await this.votes.getPastVotes(account1, timepoint)).to.be.bignumber.equal(this.account1Votes);
          // expect(await this.votes.getPastVotes(account2, timepoint)).to.be.bignumber.equal(this.account2Votes);
        });
      });
    });
  }
});
