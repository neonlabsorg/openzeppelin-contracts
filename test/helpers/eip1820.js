const { singletons } = require('@openzeppelin/test-helpers');
const { setSingletonsConfig, getSingletonsConfig } = require('@openzeppelin/test-helpers/src/config/singletons')
const {web3} = require("@openzeppelin/test-helpers/src/setup");
const {ERC1820_REGISTRY_ADDRESS} = require("@openzeppelin/test-helpers/src/data");
const send = require("@openzeppelin/test-helpers/src/send");
const ether = require("@openzeppelin/test-helpers/src/ether");


async function NeonERC1820Registry (funder) {
  const code = await web3.eth.getCode(ERC1820_REGISTRY_ADDRESS);
  const config = getSingletonsConfig();

  setSingletonsConfig({
    abstraction: config.abstraction,
    defaultGas: 1e7,
    defaultSender: config.defaultSender,
  })
  
  if (code.length <= '0x0'.length) {
    await send.ether(funder, '0xa990077c3205cbDf861e17Fa532eeB069cE9fF96', ether('10'));
  }
  
  return await singletons.ERC1820Registry(funder);
}

module.exports = {
  NeonERC1820Registry,
};
