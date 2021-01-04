/* Imports: External */
import type EthersT from 'ethers'
import { extendEnvironment } from 'hardhat/config'
import { lazyObject } from 'hardhat/plugins'
import { getContractFactory as getL2ContractFactory } from '@eth-optimism/contracts'

/* Imports: Internal */
import './types/type-extensions'
import type * as ProviderProxyT from './internal/provider-proxy'
import {
  getContractAt,
  getContractFactory,
  getSigners,
} from './internal/helpers'
import { makeL2Provider } from '../internal/provider'

const layer1BridgeRouter = '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'
const layer2BridgeRouter = '0xfeedfacefeedfacefeedfacefeedfacefeedface'

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

        const l1Bridge = (getL2ContractFactory(
          'mockOVM_GenericCrossDomainMessenger'
        ) as any)
          .attach(layer1BridgeRouter)
          .connect((await (hre as any).ethers.getSigners())[0])
        const l2Bridge = (getL2ContractFactory(
          'mockOVM_GenericCrossDomainMessenger'
        ) as any)
          .attach(layer2BridgeRouter)
          .connect((await getSigners(hre))[0])

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
