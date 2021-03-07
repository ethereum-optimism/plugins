/* Imports: External */
import type EthersT from 'ethers'
import { extendEnvironment } from 'hardhat/config'
import { lazyObject } from 'hardhat/plugins'
import { getContractDefinition } from '@eth-optimism/contracts'

/* Imports: Internal */
import './types/type-extensions'
import type * as ProviderProxyT from './internal/provider-proxy'
import {
  getContractAt,
  getContractFactory,
  getSigners,
} from './internal/helpers'
import { makeL2Provider } from '../internal/provider'

/**
 * Generates an ethers contract from a definition pulled from the optimism
 * contracts package.
 * @param ethers Ethers instance.
 * @param name Name of the contract to generate
 * @param args Constructor arguments to the contract.
 * @returns Ethers contract object.
 */
const getContractFromDefinition = (
  ethers: any,
  signer: any,
  name: string,
  args: any[] = [],
  ovm?: boolean
): any => {
  const contractDefinition = getContractDefinition(name, ovm)
  const contractFactory = new ethers.ContractFactory(
    contractDefinition.abi,
    contractDefinition.bytecode,
    signer
  )

  return contractFactory.deploy(...args)
}

extendEnvironment((hre) => {
  hre.l2provider = lazyObject(() => {
    return makeL2Provider(hre)
  })

  hre.l2ethers = lazyObject(() => {
    const {
      createProviderProxy,
    } = require('./internal/provider-proxy') as typeof ProviderProxyT

    const { ethers } = require('ethers') as typeof EthersT

    const providerProxy = createProviderProxy(hre.l2provider)

    const contracts: {
      L1CrossDomainMessenger: EthersT.Contract
      L2CrossDomainMessenger: EthersT.Contract
    } = {} as any

    ;(async () => {
      if (!process.env.__OVM_USE_EXPERIMENTAL_FEATURES__) {
        return
      }

      await new Promise((resolve, reject) => {
        let ticks = 0
        setTimeout(() => {
          if (ticks >= 50) {
            reject(new Error('Unable to load L2 ethers in time!'))
          }

          if ((hre as any).ethers && (hre as any).l2ethers) {
            resolve(null)
          } else {
            ticks++
          }
        }, 50)
      })

      const l1ethers = (hre as any).ethers
      const l2ethers = (hre as any).l2ethers

      const l1accounts = await l1ethers.getSigners()
      const l2accounts = await l2ethers.getSigners()

      contracts.L1CrossDomainMessenger = await getContractFromDefinition(
        l1ethers,
        l1accounts[l1accounts.length - 1],
        'mockOVM_GenericCrossDomainMessenger',
        [],
        false
      )

      try {
        contracts.L2CrossDomainMessenger = await getContractFromDefinition(
          l2ethers,
          l2accounts[1],
          'mockOVM_GenericCrossDomainMessenger',
          [],
          true
        )
      } catch (err) {
        console.log(err)
      }
    })()

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

        const l1Messages = await contracts.L1CrossDomainMessenger.queryFilter(
          contracts.L1CrossDomainMessenger.filters.SentMessage(),
          receipt.blockNumber,
          receipt.blockNumber
        )

        for (const message of l1Messages) {
          await contracts.L2CrossDomainMessenger.relayMessage(
            message.args._sender,
            message.args._target,
            message.args._message,
            message.args._gasLimit
          )
        }

        const l2Messages = await contracts.L2CrossDomainMessenger.queryFilter(
          contracts.L2CrossDomainMessenger.filters.SentMessage(),
          receipt.blockNumber,
          receipt.blockNumber
        )

        for (const message of l2Messages) {
          await contracts.L1CrossDomainMessenger.relayMessage(
            message.args._sender,
            message.args._target,
            message.args._message,
            message.args._gasLimit
          )
        }
      },
      contracts,
    }
  })
})

// We're iceboxing this plugin for a bit.
console.log(`
@eth-optimism/plugins/hardhat/ethers: WARNING -- this plugin has been moved to
our develoment backlog and is not currently being actively maintained. Most
contracts should "just work" on the OVM. If you want to explicitly test on the
OVM you should run an L2 geth node. See the below link for more information:
https://community.optimism.io/docs/developers/integration.html
`)
