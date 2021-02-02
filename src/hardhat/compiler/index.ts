/* Imports: External */
import * as fs from 'fs'
import * as path from 'path'
import fetch from 'node-fetch'
import { subtask } from 'hardhat/config'
import {
  TASK_COMPILE_SOLIDITY_RUN_SOLCJS,
  TASK_COMPILE_SOLIDITY_RUN_SOLC,
} from 'hardhat/builtin-tasks/task-names'
import { getCompilersDir } from 'hardhat/internal/util/global-dir'

import './type-extensions'

const OPTIMISM_SOLC_BIN_URL =
  'https://raw.githubusercontent.com/ethereum-optimism/solc-bin/gh-pages/bin'

const DEFAULT_OVM_SOLC_VERSION = '0.7.6'

const getOvmSolcPath = async (version: string): Promise<string> => {
  const ovmCompilersCache = path.join(await getCompilersDir(), 'ovm')
  const cachedCompilerPath = path.join(ovmCompilersCache, `${version}.js`)
  if (fs.existsSync(cachedCompilerPath)) {
    return cachedCompilerPath
  }

  console.log(`Downloading OVM compiler version ${version}`)

  const compilerContentResponse = await fetch(
    OPTIMISM_SOLC_BIN_URL + `/soljson-v${version}.js`
  )
  if (!compilerContentResponse.ok) {
    throw new Error(
      `Unable to download OVM compiler version ${version}. Are you sure that version exists?`
    )
  }

  const compilerContent = await compilerContentResponse.text()

  fs.mkdirSync(path.join(ovmCompilersCache), { recursive: true })
  fs.writeFileSync(cachedCompilerPath, compilerContent)

  return cachedCompilerPath
}

subtask(
  TASK_COMPILE_SOLIDITY_RUN_SOLC,
  async (
    { input, solcPath }: { input: any; solcPath: string },
    { config, run },
    runSuper
  ) => {
    let ovmSolcVersion: string
    if (!config.ovm || !config.ovm.solcVersion) {
      ovmSolcVersion = DEFAULT_OVM_SOLC_VERSION
    } else {
      ovmSolcVersion = config.ovm.solcVersion
    }

    const ovmSolcPath = await getOvmSolcPath(ovmSolcVersion)

    const ovmInput = {
      language: 'Solidity',
      sources: {},
      settings: input.settings,
    }
    const evmInput = {
      language: 'Solidity',
      sources: {},
      settings: input.settings,
    }

    // Separate the EVM and OVM inputs.
    for (const file of Object.keys(input.sources)) {
      evmInput.sources[file] = input.sources[file]

      if (!input.sources[file].content.includes('// @unsupported: ovm')) {
        ovmInput.sources[file] = input.sources[file]
      }
    }

    console.log(
      `Compiling ${
        Object.keys(ovmInput.sources).length
      } files with OVM compiler ${ovmSolcVersion}`
    )

    // Build both inputs separately.
    const evmOutput = await runSuper({ input: evmInput, solcPath })
    const ovmOutput = await run(TASK_COMPILE_SOLIDITY_RUN_SOLCJS, {
      input: ovmInput,
      solcJsPath: ovmSolcPath,
    })

    ovmOutput.errors = (ovmOutput.errors || []).map((error: any) => {
      if (error.severity === 'error') {
        error.formattedMessage = `OVM Compiler Error (silence by adding: "// @unsupported: ovm" to the top of this file):\n ${error.formattedMessage}`
      }

      return error
    })

    // Filter out any "No input sources specified" errors, but only if one of the two compilations
    // threw the error.
    let errors = (ovmOutput.errors || []).concat(evmOutput.errors || [])
    const filtered = errors.filter((error: any) => {
      return error.message !== 'No input sources specified.'
    })
    if (errors.length === filtered.length + 1) {
      errors = filtered
    }

    // Transfer over any OVM outputs to the EVM output, with an identifier.
    for (const fileName of Object.keys(ovmOutput.contracts || {})) {
      if (fileName in evmOutput.contracts) {
        for (const [contractName, contractOutput] of Object.entries(
          ovmOutput.contracts[fileName]
        )) {
          const linkRefs = (contractOutput as any).evm.bytecode.linkReferences
          for (const linkRefFileName of Object.keys(linkRefs || {})) {
            for (const [linkRefName, linkRefOutput] of Object.entries(
              linkRefs[linkRefFileName]
            )) {
              delete linkRefs[linkRefFileName][linkRefName]
              linkRefs[linkRefFileName][`${linkRefName}.ovm`] = linkRefOutput
            }
          }

          evmOutput.contracts[fileName][`${contractName}.ovm`] = contractOutput
        }
      }
    }

    const output = {
      errors,
      contracts: evmOutput.contracts,
      sources: evmOutput.sources,
    }

    return output
  }
)
