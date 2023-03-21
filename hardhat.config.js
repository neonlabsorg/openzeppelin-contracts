/// ENVVAR
// - CI:                output gas report to file instead of stdout
// - COVERAGE:          enable coverage report
// - ENABLE_GAS_REPORT: enable gas report
// - COMPILE_MODE:      production modes enables optimizations (default: development)
// - COMPILE_VERSION:   compiler version (default: 0.8.9)
// - COINMARKETCAP:     coinmarkercat api key for USD value in gas report

const getStringValue = (input) => {
  return input === undefined ? '' : input;
};

const getArrayValue = (input) => {
  return input === undefined ? [] : String(input).split(',');
};

const Config = {
  privateKeys: getArrayValue(process.env.PRIVATE_KEYS),
  networkId: getStringValue(process.env.NETWORK_ID),
  proxyUrl: getStringValue(process.env.PROXY_URL),
};

const fs = require('fs');
const path = require('path');
const argv = require('yargs/yargs')()
  .env('')
  .options({
    coverage: {
      type: 'boolean',
      default: false,
    },
    gas: {
      alias: 'enableGasReport',
      type: 'boolean',
      default: false,
    },
    gasReport: {
      alias: 'enableGasReportPath',
      type: 'string',
      implies: 'gas',
      default: undefined,
    },
    mode: {
      alias: 'compileMode',
      type: 'string',
      choices: ['production', 'development'],
      default: 'development',
    },
    ir: {
      alias: 'enableIR',
      type: 'boolean',
      default: false,
    },
    compiler: {
      alias: 'compileVersion',
      type: 'string',
      default: '0.8.13',
    },
    coinmarketcap: {
      alias: 'coinmarketcapApiKey',
      type: 'string',
    },
  }).argv;

require('@nomiclabs/hardhat-truffle5');
require('hardhat-ignore-warnings');
require('hardhat-exposed');

require('solidity-docgen');

for (const f of fs.readdirSync(path.join(__dirname, 'hardhat'))) {
  require(path.join(__dirname, 'hardhat', f));
}

const withOptimizations = argv.gas || argv.compileMode === 'production';

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    version: argv.compiler,
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: withOptimizations && argv.ir,
    },
  },
  defaultNetwork: 'neonlabs',
  networks: {
    neonlabs: {
      url: Config.proxyUrl,
      accounts: Config.privateKeys,
      network_id: parseInt(Config.networkId),
      gas: 'auto',
      gasPrice: 'auto',
      allowUnlimitedContractSize: !withOptimizations,
      timeout: 180000,
      isFork: true,
    },
  },
  warnings: {
    '*': {
      'code-size': withOptimizations,
      'unused-param': !argv.coverage, // coverage causes unused-param warnings
      default: 'error',
    },
  },
  gasReporter: {
    showMethodSig: true,
    currency: 'USD',
    outputFile: argv.gasReport,
    coinmarketcap: argv.coinmarketcap,
  },
  mocha: {
    timeout: 600000,
    reporter: 'mocha-multi-reporters',
    reporterOption: {
      reporterEnabled: 'spec, allure-mocha',
      allureMochaReporterOptions: {
        resultsDir: '../../allure-results',
      },
    },
  },
  exposed: {
    exclude: [
      'vendor/**/*',
      // overflow clash
      'utils/Timers.sol',
    ],
  },
  docgen: require('./docs/config'),
};

if (argv.gas) {
  require('hardhat-gas-reporter');
  module.exports.gasReporter = {
    showMethodSig: true,
    currency: 'USD',
    outputFile: argv.gasReport,
    coinmarketcap: argv.coinmarketcap,
  };
}

if (argv.coverage) {
  require('solidity-coverage');
  module.exports.networks.hardhat.initialBaseFeePerGas = 0;
}
