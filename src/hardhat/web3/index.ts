/* Imports: External */
import { task } from 'hardhat/config'
import { TASK_TEST_SETUP_TEST_ENVIRONMENT } from 'hardhat/builtin-tasks/task-names'
import { Web3HTTPProviderAdapter } from '@nomiclabs/hardhat-web3/dist/src/web3-provider-adapter'
import { makeL2Provider } from '../internal/provider'

task(TASK_TEST_SETUP_TEST_ENVIRONMENT, async (args, hre: any, runSuper) => {
  // Exit quickly if we're not using Web3 or not running against the OVM.
  if (!hre.ovm || !hre.web3) {
    return runSuper(args)
  }

  // Replace the normal hardhat provider with our L2 provider and replace the existing web3
  // object with a wrapper around the L2 provider.
  const Web3 = require('web3')
  hre.l2provider = hre.l2provider || makeL2Provider(hre)
  hre.network.provider = hre.l2provider
  hre.web3 = new Web3(new Web3HTTPProviderAdapter(hre.l2provider))

  // Patch the require function to point to OVM files.
  const _req = hre.artifacts.require
  const req = (name: string) => {
    if (!name.endsWith('-ovm')) {
      name = name + '-ovm'
    }
    return _req(name)
  }
  hre.artifacts.require = req

  // Patch the read artifact function, also to point to OVM files.
  const _read = hre.artifacts.readArtifact.bind(hre.artifacts)
  const read = (name: string) => {
    if (!name.endsWith('-ovm')) {
      name = name + '-ovm'
    }
    return _read(name)
  }
  hre.artifacts.readArtifact = read

  // Finish off by running the parent function.
  return runSuper(args)
})
