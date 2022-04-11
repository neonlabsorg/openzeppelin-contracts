/// ENVVAR
// - CI:                output gas report to file instead of stdout
// - COVERAGE:          enable coverage report
// - ENABLE_GAS_REPORT: enable gas report
// - COMPILE_MODE:      production modes enables optimizations (default: development)
// - COMPILE_VERSION:   compiler version (default: 0.8.3)
// - COINMARKETCAP:     coinmarkercat api key for USD value in gas report

const fs = require('fs');
const path = require('path');

const getStringValue = (input) => {
  return input === undefined ? '' : input;
};

const getArrayValue = (input) => {
  return input === undefined ? [] : String(input).split(',')
}

const Config = {
  privateKeys: getArrayValue(process.env.PRIVATE_KEYS),
  networkId: getStringValue(process.env.NETWORK_ID),
  proxyUrl: getStringValue(process.env.PROXY_URL)
};

const argv = require('yargs/yargs')()
  .env('')
  .options({
    ci: {
      type: 'boolean',
      default: false
    },
    coverage: {
      type: 'boolean',
      default: false
    },
    gas: {
      alias: 'enableGasReport',
      type: 'boolean',
      default: false
    },
    mode: {
      alias: 'compileMode',
      type: 'string',
      choices: ['production', 'development'],
      default: 'development'
    },
    compiler: {
      alias: 'compileVersion',
      type: 'string',
      default: '0.8.10'
    },
    coinmarketcap: {
      alias: 'coinmarketcapApiKey',
      type: 'string'
    }
  }).argv;

require('@nomiclabs/hardhat-truffle5');

for (const f of fs.readdirSync(path.join(__dirname, 'hardhat'))) {
  require(path.join(__dirname, 'hardhat', f));
}

const withOptimizations =
  argv.enableGasReport || argv.compileMode === 'production';

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    version: argv.compiler,
    settings: {
      optimizer: {
        enabled: withOptimizations,
        runs: 200
      }
    }
  },
  defaultNetwork: 'neonlabs',
  networks: {
    neonlabs: {
      url: Config.proxyUrl,
      accounts: Config.privateKeys,
      network_id: parseInt(Config.networkId),
      gas: "auto",
      gasPrice: "auto",
      allowUnlimitedContractSize: !withOptimizations,
      timeout: 180000,
      isFork: true
    }
  },
  gasReporter: {
    currency: 'USD',
    outputFile: argv.ci ? 'gas-report.txt' : undefined,
    coinmarketcap: argv.coinmarketcap
  },
  mocha: {
    timeout: 600000,
    reporter: 'mocha-multi-reporters',
    reporterOption: {
      "reporterEnabled": "spec, allure-mocha",
      "allureMochaReporterOptions": {
        "resultsDir": "../../allure-results"
      }
    },
    diff: true
  }
};
