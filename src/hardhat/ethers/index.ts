/* Imports: External */
const VM = require('@eth-optimism/ethereumjs-vm').default
const BN = require('bn.js')
import type EthersT from 'ethers'
import { ContractFactory } from 'ethers'
import { HARDHAT_NETWORK_NAME } from 'hardhat/internal/constants'
import { extendEnvironment } from 'hardhat/config'
import { lazyObject } from 'hardhat/plugins'
import { createProvider } from 'hardhat/internal/core/providers/construction'
import { getLatestStateDump, getContractDefinition, getContractFactory as getL2ContractFactory } from '@eth-optimism/contracts'
import Account from 'ethereumjs-account'

/* Imports: Internal */
import './types/type-extensions'
import type * as ProviderProxyT from './internal/provider-proxy'
import {
  getContractAt,
  getContractFactory,
  getSigners,
} from './internal/helpers'

const layer1BridgeRouter = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
const layer2BridgeRouter = '0xfeedfacefeedfacefeedfacefeedfacefeedface'

const findProvider = (base: any): any => {
  let provider = base
  for (let i = 0; i < 10; i++) {
    if (provider['_init']) {
      break
    } else {
      if (provider['_wrapped']) {
        provider = provider['_wrapped']
      } else {
        // throw?
      }
    }
  }

  if (!provider['_init']) {
    // throw?
  }

  return provider
}

extendEnvironment((hre) => {
  hre.l2provider = lazyObject(() => {
    const networkName = HARDHAT_NETWORK_NAME
    const networkConfig = hre.config.networks[networkName]

    const actualprovider = createProvider(
      networkName,
      networkConfig,
      hre.config.paths,
      hre.artifacts
    )

    let provider = actualprovider

    for (let i = 0; i < 10; i++) {
      if (provider['_init']) {
        break
      } else {
        if (provider['_wrapped']) {
          provider = provider['_wrapped']
        } else {
          // throw?
        }
      }
    }

    if (!provider['_init']) {
      // throw?
    }

    // const l1ProviderActual = hre.network.provider
    // let l1Provider = l1ProviderActual
    // for (let i = 0; i < 10; i++) {
    //   if (l1Provider['_init']) {
    //     break
    //   } else {
    //     if (l1Provider['_wrapped']) {
    //       l1Provider = l1Provider['_wrapped']
    //     } else {
    //       // throw?
    //     }
    //   }
    // }

    // if (!l1Provider['_init']) {
    //   // throw?
    // }

    // const _init2 = l1Provider['_init' as any].bind(l1Provider)
    // const init2 = async function () {
    //   await _init2()

    //   if (this._node.ovmified) {
    //     return
    //   }

    //   this._node.ovmified = true
    //   const vm = this._node['_vm' as any]

    //   const bridgeCode = getContractDefinition('mockOVM_GenericCrossDomainMessenger').deployedBytecode

    //   await vm.pStateManager.putAccount(Buffer.from(layer1BridgeRouter.slice(2), 'hex'), new Account({
    //     nonce: '0x1',
    //     balance: '0x0',
    //     stateRoot: '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
    //     codeHash: '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470'
    //   }))

    //   await vm.pStateManager.putContractCode(
    //     Buffer.from(layer1BridgeRouter.slice(2), 'hex'),
    //     Buffer.from(bridgeCode.slice(2), 'hex')
    //   )
    // }
    // l1Provider['_init'] = init2.bind(l1Provider)


    const _init = provider['_init' as any].bind(provider)
    const init = async function () {
      await _init()

      if (this._node.ovmified) {
        return
      }

      this._node.ovmified = true

      // Copy the options from the old VM instance and create a new one.
      const vm = this._node['_vm' as any]
      const ovm = new VM({
        ...vm.opts,
        stateManager: vm.stateManager,
        ovmOpts: {
          emGasLimit: this._blockGasLimit,
          dump: getLatestStateDump(),
        },
      })

      // Initialize the OVM and replace the old VM.
      await ovm.init()
      this._node['_vm' as any] = ovm

      // Hijack the gas estimation function.
      this._node.estimateGas = async (): Promise<{ estimation: any }> => {
        return {
          estimation: new BN(this._blockGasLimit),
        }
      }

      // const bridgeCode = getContractDefinition('mockOVM_GenericCrossDomainMessenger').deployedBytecode

      // await ovm.pStateManager.putAccount(Buffer.from(layer2BridgeRouter.slice(2), 'hex'), new Account({
      //   nonce: '0x1',
      //   balance: '0x0',
      //   stateRoot: '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
      //   codeHash: '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470'
      // }))

      // await ovm.pStateManager.putContractCode(
      //   Buffer.from(layer2BridgeRouter.slice(2), 'hex'),
      //   Buffer.from(bridgeCode.slice(2), 'hex')
      // )

      // Reset the vm tracer to avoid other buidler errors.
      const vmTracer = this._node['_vmTracer' as any]
      vmTracer['_vm' as any] = ovm
      vmTracer.enableTracing()
    }

    provider['_init'] = init.bind(provider)

    return actualprovider
  })

  hre.l2ethers = lazyObject(() => {
    const {
      createProviderProxy,
    } = require('./internal/provider-proxy') as typeof ProviderProxyT

    const { ethers } = require('ethers') as typeof EthersT

    const providerProxy = createProviderProxy(hre.l2provider)

    return {
      ...ethers,

      // The provider wrapper should be removed once this is released
      // https://github.com/nomiclabs/hardhat/pull/608
      provider: providerProxy,

      getSigners: async () => getSigners(hre),
      // We cast to any here as we hit a limitation of Function#bind and
      // overloads. See: https://github.com/microsoft/TypeScript/issues/28582
      getContractFactory: getContractFactory.bind(null, hre) as any,
      getContractAt: getContractAt.bind(null, hre),

      waitForBridgeRelay: async (response: any): Promise<void> => {
        const receipt = await response.wait()

        const l1Bridge = (getL2ContractFactory('mockOVM_GenericCrossDomainMessenger') as any).attach(
          layer1BridgeRouter
        ).connect((await (hre as any).ethers.getSigners())[0])
        const l2Bridge = (getL2ContractFactory('mockOVM_GenericCrossDomainMessenger') as any).attach(
          layer2BridgeRouter
        ).connect((await getSigners(hre))[0])

        const l1Messages = await l1Bridge.queryFilter(
          l1Bridge.filters.SentMessage(),
          receipt.blockNumber,
          receipt.blockNumber
        )

        for (const message of l1Messages) {
          await l2Bridge.relayMessage(
            message.args._sender,
            message.args._target,
            message.args._message,
            message.args._gasLimit
          )
        }

        const l2Messages = await l1Bridge.queryFilter(
          l1Bridge.filters.SentMessage(),
          receipt.blockNumber,
          receipt.blockNumber
        )

        for (const message of l2Messages) {
          await l1Bridge.relayMessage(
            message.args._sender,
            message.args._target,
            message.args._message,
            message.args._gasLimit
          )
        }
      },
      layer1BridgeRouter,
      layer2BridgeRouter,
    }
  })
})
