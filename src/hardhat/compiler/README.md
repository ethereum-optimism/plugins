# @eth-optimism/plugins/hardhat/compiler

A plugin that brings OVM compiler support to Hardhat projects.

## Installation

Installation is super simple. 

First, grab the package.
Via `npm`: 

```
npm install @eth-optimism/plugins
```

Via `yarn`:

```
yarn add @eth-optimism/plugins
```

### New required step
With the first stable release of the plugin for `hardhat`, we require adding these lines to your `package.json` for a smooth DevEx experience for compiling, testing, and deploying EVM _**and**_ OVM contracts/artifacts. Instead of our previous method of just running `yarn compile` and other yarn commands, you'll be using these instead.

So, make sure to add these lines under your `"scripts"` in your `package.json`:
```json
{
    "scripts": {
        "clean": "rimraf ./cache && rimraf ./artifacts && rimraf ./deployments",
        "compile:evm": "hardhat compile",
        "compile:ovm": "TARGET=ovm hardhat compile",
        "compile": "yarn clean && yarn compile:evm && yarn compile:ovm",
        "test:evm": "yarn hardhat test",
        "deploy:evm": "yarn hardhat --network l1 deploy --tags ERC20",
        "test:ovm": "yarn TARGET=ovm hardhat test",
        "deploy:ovm": "yarn TARGET=ovm hardhat --network l2 deploy --tags ERC20 --ovm"
    }
}
```

Next, import the plugin inside your `hardhat.config.js`:

```js
// hardhat.config.js

require("@eth-optimism/plugins/hardhat/compiler")
```

Or if using TypeScript:

```ts
// hardhat.config.ts

import "@eth-optimism/plugins/hardhat/compiler"
```

## Configuration

**By default, this plugin will use OVM compiler version 0.7.6**.
Configure this plugin by adding an `ovm` field to your Hardhat config:

```js
// hardhat.config.js

require("@eth-optimism/plugins/hardhat/compiler")

module.exports = {
    ovm: {
        solcVersion: 'X.Y.Z' // Your version goes here.
    }
}

```

Has typings so it won't break your Hardhat config if you're using TypeScript.
