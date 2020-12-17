/* Imports: External */
const VM = require('@eth-optimism/ethereumjs-vm').default
const BN = require('bn.js')
import type EthersT from 'ethers'
import { HARDHAT_NETWORK_NAME } from 'hardhat/internal/constants'
import { extendEnvironment } from 'hardhat/config'
import { lazyObject } from 'hardhat/plugins'
import { createProvider } from 'hardhat/internal/core/providers/construction'
import { getLatestStateDump } from '@eth-optimism/contracts'

/* Imports: Internal */
import './types/type-extensions'
import type * as ProviderProxyT from './internal/provider-proxy'
import {
  getContractAt,
  getContractFactory,
  getSigners,
} from './internal/helpers'

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
    } = require('./provider-proxy') as typeof ProviderProxyT

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
    }
  })
})
