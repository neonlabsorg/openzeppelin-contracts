const ethSigUtil = require('eth-sig-util');
const Wallet = require('ethereumjs-wallet').default;
const { getDomain, domainType } = require('../helpers/eip712');
const { expectRevertCustomError } = require('../helpers/customError');

const { constants, expectRevert, expectEvent, time } = require('@openzeppelin/test-helpers');
const { expect } = require('chai');

const ERC2771Forwarder = artifacts.require('ERC2771Forwarder');
const CallReceiverMockTrustingForwarder = artifacts.require('CallReceiverMockTrustingForwarder');

contract('ERC2771Forwarder', function (accounts) {
  const [, refundReceiver, another] = accounts;

  const tamperedValues = {
    from: another,
    value: web3.utils.toWei('0.5'),
    data: '0x1742',
  };

  beforeEach(async function () {
    this.forwarder = await ERC2771Forwarder.new('ERC2771Forwarder');

    this.domain = await getDomain(this.forwarder);
    this.types = {
      EIP712Domain: domainType(this.domain),
      ForwardRequest: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'gas', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint48' },
        { name: 'data', type: 'bytes' },
      ],
    };

    this.alice = Wallet.generate();
    this.alice.address = web3.utils.toChecksumAddress(this.alice.getAddressString());

    this.timestamp = await time.latest();
    this.receiver = await CallReceiverMockTrustingForwarder.new(this.forwarder.address);
    this.request = {
      from: this.alice.address,
      to: this.receiver.address,
      value: '0',
      gas: '100000',
      data: this.receiver.contract.methods.mockFunction().encodeABI(),
      deadline: this.timestamp.toNumber() + 60, // 1 minute
    };
    this.requestData = {
      ...this.request,
      nonce: (await this.forwarder.nonces(this.alice.address)).toString(),
    };

    this.forgeData = request => ({
      types: this.types,
      domain: this.domain,
      primaryType: 'ForwardRequest',
      message: { ...this.requestData, ...request },
    });
    this.sign = (privateKey, request) =>
      ethSigUtil.signTypedMessage(privateKey, {
        data: this.forgeData(request),
      });
    this.estimateRequest = request =>
      web3.eth.estimateGas({
        from: this.forwarder.address,
        to: request.to,
        data: web3.utils.encodePacked({ value: request.data, type: 'bytes' }, { value: request.from, type: 'address' }),
        value: request.value,
        gas: request.gas,
      });

    this.requestData.signature = this.sign(this.alice.getPrivateKey());
  });

  context('verify', function () {
    context('with valid signature', function () {
      it('returns true without altering the nonce', async function () {
        expect(await this.forwarder.nonces(this.requestData.from)).to.be.bignumber.equal(
          web3.utils.toBN(this.requestData.nonce),
        );
        expect(await this.forwarder.verify(this.requestData)).to.be.equal(true);
        expect(await this.forwarder.nonces(this.requestData.from)).to.be.bignumber.equal(
          web3.utils.toBN(this.requestData.nonce),
        );
      });
    });

    context('with tampered values', function () {
      for (const [key, value] of Object.entries(tamperedValues)) {
        it(`returns false with tampered ${key}`, async function () {
          expect(await this.forwarder.verify(this.forgeData({ [key]: value }).message)).to.be.equal(false);
        });
      }

      it('returns false with an untrustful to', async function () {
        expect(await this.forwarder.verify(this.forgeData({ to: another }).message)).to.be.equal(false);
      });

      it('returns false with tampered signature', async function () {
        const tamperedsign = web3.utils.hexToBytes(this.requestData.signature);
        tamperedsign[42] ^= 0xff;
        this.requestData.signature = web3.utils.bytesToHex(tamperedsign);
        expect(await this.forwarder.verify(this.requestData)).to.be.equal(false);
      });

      it('returns false with valid signature for non-current nonce', async function () {
        const req = {
          ...this.requestData,
          nonce: this.requestData.nonce + 1,
        };
        req.signature = this.sign(this.alice.getPrivateKey(), req);
        expect(await this.forwarder.verify(req)).to.be.equal(false);
      });

      it('returns false with valid signature for expired deadline', async function () {
        const req = {
          ...this.requestData,
          deadline: this.timestamp - 1,
        };
        req.signature = this.sign(this.alice.getPrivateKey(), req);
        expect(await this.forwarder.verify(req)).to.be.equal(false);
      });
    });
  });

  context('execute', function () {
    context('with valid requests', function () {
      beforeEach(async function () {
        expect(await this.forwarder.nonces(this.requestData.from)).to.be.bignumber.equal(
          web3.utils.toBN(this.requestData.nonce),
        );
      });

      it('emits an event and consumes nonce for a successful request', async function () {
        const receipt = await this.forwarder.execute(this.requestData);
        await expectEvent.inTransaction(receipt.tx, this.receiver, 'MockFunctionCalled');
        await expectEvent.inTransaction(receipt.tx, this.forwarder, 'ExecutedForwardRequest', {
          signer: this.requestData.from,
          nonce: web3.utils.toBN(this.requestData.nonce),
          success: true,
        });
        expect(await this.forwarder.nonces(this.requestData.from)).to.be.bignumber.equal(
          web3.utils.toBN(this.requestData.nonce + 1),
        );
      });

      it('reverts with an unsuccessful request', async function () {
        const req = {
          ...this.requestData,
          data: this.receiver.contract.methods.mockFunctionRevertsNoReason().encodeABI(),
        };
        req.signature = this.sign(this.alice.getPrivateKey(), req);
        await expectRevertCustomError(this.forwarder.execute(req), 'FailedInnerCall', []);
      });
    });

    context('with tampered request', function () {
      for (const [key, value] of Object.entries(tamperedValues)) {
        it(`reverts with tampered ${key}`, async function () {
          const data = this.forgeData({ [key]: value });
          await expectRevertCustomError(
            this.forwarder.execute(data.message, {
              value: key == 'value' ? value : 0, // To avoid MismatchedValue error
            }),
            'ERC2771ForwarderInvalidSigner',
            [ethSigUtil.recoverTypedSignature({ data, sig: this.requestData.signature }), data.message.from],
          );
        });
      }

      it('reverts with an untrustful to', async function () {
        const data = this.forgeData({ to: another });
        await expectRevertCustomError(this.forwarder.execute(data.message), 'ERC2771UntrustfulTarget', [
          data.message.to,
          this.forwarder.address,
        ]);
      });

      it('reverts with tampered signature', async function () {
        const tamperedSig = web3.utils.hexToBytes(this.requestData.signature);
        tamperedSig[42] ^= 0xff;
        this.requestData.signature = web3.utils.bytesToHex(tamperedSig);
        await expectRevertCustomError(this.forwarder.execute(this.requestData), 'ERC2771ForwarderInvalidSigner', [
          ethSigUtil.recoverTypedSignature({ data: this.forgeData(), sig: tamperedSig }),
          this.requestData.from,
        ]);
      });

      it('reverts with valid signature for non-current nonce', async function () {
        // Execute first a request
        await this.forwarder.execute(this.requestData);

        // And then fail due to an already used nonce
        await expectRevertCustomError(this.forwarder.execute(this.requestData), 'ERC2771ForwarderInvalidSigner', [
          ethSigUtil.recoverTypedSignature({
            data: this.forgeData({ ...this.requestData, nonce: this.requestData.nonce + 1 }),
            sig: this.requestData.signature,
          }),
          this.requestData.from,
        ]);
      });

      it('reverts with valid signature for expired deadline', async function () {
        const req = {
          ...this.requestData,
          deadline: this.timestamp - 1,
        };
        req.signature = this.sign(this.alice.getPrivateKey(), req);
        await expectRevertCustomError(this.forwarder.execute(req), 'ERC2771ForwarderExpiredRequest', [
          this.timestamp - 1,
        ]);
      });

      it('reverts with valid signature but mismatched value', async function () {
        const value = 100;
        const req = {
          ...this.requestData,
          value,
        };
        req.signature = this.sign(this.alice.getPrivateKey(), req);
        await expectRevertCustomError(this.forwarder.execute(req), 'ERC2771ForwarderMismatchedValue', [0, value]);
      });
    });
  });

  context('executeBatch', function () {
    const batchValue = requestDatas => requestDatas.reduce((value, request) => value + Number(request.value), 0);

    beforeEach(async function () {
      this.bob = Wallet.generate();
      this.bob.address = web3.utils.toChecksumAddress(this.bob.getAddressString());

      this.eve = Wallet.generate();
      this.eve.address = web3.utils.toChecksumAddress(this.eve.getAddressString());

      this.signers = [this.alice, this.bob, this.eve];

      this.requestDatas = await Promise.all(
        this.signers.map(async ({ address }) => ({
          ...this.requestData,
          from: address,
          nonce: (await this.forwarder.nonces(address)).toString(),
          value: web3.utils.toWei('10', 'gwei'),
        })),
      );

      this.requestDatas = this.requestDatas.map((requestData, i) => ({
        ...requestData,
        signature: this.sign(this.signers[i].getPrivateKey(), requestData),
      }));

      this.msgValue = batchValue(this.requestDatas);

      this.gasUntil = async reqIdx => {
        const gas = 0;
        const estimations = await Promise.all(
          new Array(reqIdx + 1).fill().map((_, idx) => this.estimateRequest(this.requestDatas[idx])),
        );
        return estimations.reduce((acc, estimation) => acc + estimation, gas);
      };
    });

    context('with valid requests', function () {
      beforeEach(async function () {
        for (const request of this.requestDatas) {
          expect(await this.forwarder.verify(request)).to.be.equal(true);
        }

        this.receipt = await this.forwarder.executeBatch(this.requestDatas, another, { value: this.msgValue });
      });

      it('emits events', async function () {
        for (const request of this.requestDatas) {
          await expectEvent.inTransaction(this.receipt.tx, this.receiver, 'MockFunctionCalled');
          await expectEvent.inTransaction(this.receipt.tx, this.forwarder, 'ExecutedForwardRequest', {
            signer: request.from,
            nonce: web3.utils.toBN(request.nonce),
            success: true,
          });
        }
      });

      it('increase nonces', async function () {
        for (const request of this.requestDatas) {
          expect(await this.forwarder.nonces(request.from)).to.be.bignumber.eq(web3.utils.toBN(request.nonce + 1));
        }
      });
    });

    context('with tampered requests', function () {
      beforeEach(async function () {
        this.idx = 1; // Tampered idx
      });

      it('reverts with mismatched value', async function () {
        this.requestDatas[this.idx].value = 100;
        this.requestDatas[this.idx].signature = this.sign(
          this.signers[this.idx].getPrivateKey(),
          this.requestDatas[this.idx],
        );
        await expectRevertCustomError(
          this.forwarder.executeBatch(this.requestDatas, another, { value: this.msgValue }),
          'ERC2771ForwarderMismatchedValue',
          [batchValue(this.requestDatas), this.msgValue],
        );
      });

      context('when the refund receiver is the zero address', function () {
        beforeEach(function () {
          this.refundReceiver = constants.ZERO_ADDRESS;
        });

        for (const [key, value] of Object.entries(tamperedValues)) {
          it(`reverts with at least one tampered request ${key}`, async function () {
            const data = this.forgeData({ ...this.requestDatas[this.idx], [key]: value });

            this.requestDatas[this.idx] = data.message;

            await expectRevertCustomError(
              this.forwarder.executeBatch(this.requestDatas, this.refundReceiver, { value: this.msgValue }),
              'ERC2771ForwarderInvalidSigner',
              [
                ethSigUtil.recoverTypedSignature({ data, sig: this.requestDatas[this.idx].signature }),
                data.message.from,
              ],
            );
          });
        }

        it('reverts with at least one untrustful to', async function () {
          const data = this.forgeData({ ...this.requestDatas[this.idx], to: another });

          this.requestDatas[this.idx] = data.message;

          await expectRevertCustomError(
            this.forwarder.executeBatch(this.requestDatas, this.refundReceiver, { value: this.msgValue }),
            'ERC2771UntrustfulTarget',
            [this.requestDatas[this.idx].to, this.forwarder.address],
          );
        });

        it('reverts with at least one tampered request signature', async function () {
          const tamperedSig = web3.utils.hexToBytes(this.requestDatas[this.idx].signature);
          tamperedSig[42] ^= 0xff;

          this.requestDatas[this.idx].signature = web3.utils.bytesToHex(tamperedSig);

          await expectRevertCustomError(
            this.forwarder.executeBatch(this.requestDatas, this.refundReceiver, { value: this.msgValue }),
            'ERC2771ForwarderInvalidSigner',
            [
              ethSigUtil.recoverTypedSignature({
                data: this.forgeData(this.requestDatas[this.idx]),
                sig: this.requestDatas[this.idx].signature,
              }),
              this.requestDatas[this.idx].from,
            ],
          );
        });

        it('reverts with at least one valid signature for non-current nonce', async function () {
          // Execute first a request
          await this.forwarder.execute(this.requestDatas[this.idx], { value: this.requestDatas[this.idx].value });

          // And then fail due to an already used nonce
          await expectRevertCustomError(
            this.forwarder.executeBatch(this.requestDatas, this.refundReceiver, { value: this.msgValue }),
            'ERC2771ForwarderInvalidSigner',
            [
              ethSigUtil.recoverTypedSignature({
                data: this.forgeData({ ...this.requestDatas[this.idx], nonce: this.requestDatas[this.idx].nonce + 1 }),
                sig: this.requestDatas[this.idx].signature,
              }),
              this.requestDatas[this.idx].from,
            ],
          );
        });

        it('reverts with at least one valid signature for expired deadline', async function () {
          this.requestDatas[this.idx].deadline = this.timestamp.toNumber() - 1;
          this.requestDatas[this.idx].signature = this.sign(
            this.signers[this.idx].getPrivateKey(),
            this.requestDatas[this.idx],
          );
          await expectRevertCustomError(
            this.forwarder.executeBatch(this.requestDatas, this.refundReceiver, { value: this.msgValue }),
            'ERC2771ForwarderExpiredRequest',
            [this.timestamp.toNumber() - 1],
          );
        });
      });

      context('when the refund receiver is a known address', function () {
        beforeEach(async function () {
          this.refundReceiver = refundReceiver;
          this.initialRefundReceiverBalance = web3.utils.toBN(await web3.eth.getBalance(this.refundReceiver));
          this.initialTamperedRequestNonce = await this.forwarder.nonces(this.requestDatas[this.idx].from);
        });

        for (const [key, value] of Object.entries(tamperedValues)) {
          it(`ignores a request with tampered ${key} and refunds its value`, async function () {
            const data = this.forgeData({ ...this.requestDatas[this.idx], [key]: value });

            this.requestDatas[this.idx] = data.message;

            const receipt = await this.forwarder.executeBatch(this.requestDatas, this.refundReceiver, {
              value: batchValue(this.requestDatas),
            });
            expect(receipt.logs.filter(({ event }) => event === 'ExecutedForwardRequest').length).to.be.equal(2);
          });
        }

        it('ignores a request with a valid signature for non-current nonce', async function () {
          // Execute first a request
          await this.forwarder.execute(this.requestDatas[this.idx], { value: this.requestDatas[this.idx].value });
          this.initialTamperedRequestNonce++; // Should be already incremented by the individual `execute`

          // And then ignore the same request in a batch due to an already used nonce
          const receipt = await this.forwarder.executeBatch(this.requestDatas, this.refundReceiver, {
            value: this.msgValue,
          });
          expect(receipt.logs.filter(({ event }) => event === 'ExecutedForwardRequest').length).to.be.equal(2);
        });

        it('ignores a request with a valid signature for expired deadline', async function () {
          this.requestDatas[this.idx].deadline = this.timestamp.toNumber() - 1;
          this.requestDatas[this.idx].signature = this.sign(
            this.signers[this.idx].getPrivateKey(),
            this.requestDatas[this.idx],
          );

          const receipt = await this.forwarder.executeBatch(this.requestDatas, this.refundReceiver, {
            value: this.msgValue,
          });
          expect(receipt.logs.filter(({ event }) => event === 'ExecutedForwardRequest').length).to.be.equal(2);
        });

        afterEach(async function () {
          // The invalid request value was refunded
          expect(await web3.eth.getBalance(this.refundReceiver)).to.be.bignumber.equal(
            this.initialRefundReceiverBalance.add(web3.utils.toBN(this.requestDatas[this.idx].value)),
          );

          // The invalid request from's nonce was not incremented
          expect(await this.forwarder.nonces(this.requestDatas[this.idx].from)).to.be.bignumber.eq(
            web3.utils.toBN(this.initialTamperedRequestNonce),
          );
        });
      });
    });
  });
});
