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

// I figured this was a reasonably modern default, but not sure if this is too new. Maybe we can
// default to 0.6.X instead?
const DEFAULT_OVM_SOLC_VERSION = '0.7.6'

/**
 * Find or generate an OVM soljson.js compiler file and return the path of this file.
 * We pass the path to this file into hardhat.
 * @param version Solidity compiler version to get a path for in the format `X.Y.Z`.
 * @return Path to the downloaded soljson.js file.
 */
const getOvmSolcPath = async (version: string): Promise<string> => {
  // If __DANGEROUS_OVM_IGNORE_ERRORS__ env var is not undefined we append the -no-errors suffix to the solc version.
  if (process.env.__DANGEROUS_OVM_IGNORE_ERRORS__) {
    console.log('\n\n__DANGEROUS_OVM_IGNORE_ERRORS__ IS ENABLED!\n\n')
    version += '-no_errors'
  }

  // First, check to see if we've already downloaded this file. Hardhat gives us a folder to use as
  // a compiler cache, so we'll just be nice and use an `ovm` subfolder.
  const ovmCompilersCache = path.join(await getCompilersDir(), 'ovm')

  // Need to create the OVM compiler cache folder if it doesn't already exist.
  if (!fs.existsSync(ovmCompilersCache))
    [fs.mkdirSync(ovmCompilersCache, { recursive: true })]

  // Check to see if we already have this compiler version downloaded. We store the cached files at
  // `X.Y.Z.js`. If it already exists, just return that instead of downloading a new one.
  const cachedCompilerPath = path.join(ovmCompilersCache, `${version}.js`)
  if (fs.existsSync(cachedCompilerPath)) {
    return cachedCompilerPath
  }

  console.log(`Downloading OVM compiler version ${version}`)

  // We don't have a cache, so we'll download this file from GitHub. Currently stored at
  // ethereum-optimism/solc-bin.
  const compilerContentResponse = await fetch(
    OPTIMISM_SOLC_BIN_URL + `/soljson-v${version}.js`
  )

  // Throw if this request failed, e.g., 404 because of an invalid version.
  if (!compilerContentResponse.ok) {
    throw new Error(
      `Unable to download OVM compiler version ${version}. Are you sure that version exists?`
    )
  }

  // Otherwise, write the content to the cache. We probably want to do some sort of hash
  // verification against these files but it's OK for now. The real "TODO" here is to instead
  // figure out how to properly extend and/or hack Hardat's CompilerDownloader class.
  const compilerContent = await compilerContentResponse.text()
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
    // Just some silly sanity checks, make sure we have a solc version to download. Our format is
    // `X.Y.Z` (for now).
    let ovmSolcVersion: string
    if (!config.ovm || !config.ovm.solcVersion) {
      ovmSolcVersion = DEFAULT_OVM_SOLC_VERSION
    } else {
      ovmSolcVersion = config.ovm.solcVersion
    }

    // Get a path to a soljson file.
    const ovmSolcPath = await getOvmSolcPath(ovmSolcVersion)

    // These objects get fed into the compiler. We're creating two of these because we need to
    // throw one into the OVM compiler and another into the EVM compiler. Users are able to prevent
    // certain files from being compiled by the OVM compiler by adding "// @unsupported: ovm"
    // somewhere near the top of their file.
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

      // Ignore any contract that has this tag.
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

    // Just doing this to add some extra useful information to any errors in the OVM compiler output.
    ovmOutput.errors = (ovmOutput.errors || []).map((error: any) => {
      if (error.severity === 'error') {
        error.formattedMessage = `OVM Compiler Error (silence by adding: "// @unsupported: ovm" to the top of this file):\n ${error.formattedMessage}`
      }

      return error
    })

    // Filter out any "No input sources specified" errors, but only if one of the two compilations
    // threw the error. Basically, it might be intended for only one of the EVM or OVM compilers to
    // be compiling contracts, but something went wrong if *both* compilers recieve no input.
    let errors = (ovmOutput.errors || []).concat(evmOutput.errors || [])
    const filtered = errors.filter((error: any) => {
      return error.message !== 'No input sources specified.'
    })

    // Make sure we only saw one of those "No input sources specified." errors.
    if (errors.length === filtered.length + 1) {
      errors = filtered
    }

    // Transfer over any OVM outputs to the EVM output, with an identifier.
    for (const fileName of Object.keys(ovmOutput.contracts || {})) {
      if (fileName in Object.keys(evmOutput.contracts || {})) {
        for (const contractName of Object.keys(ovmOutput.contracts[fileName])) {
          const contractOutput = ovmOutput.contracts[fileName][contractName]

          // Need to fix any link references in the OVM outputs. Otherwise we'll be trying to link
          // an OVM-compiled contract to EVM-compiled contracts.
          const linkRefs = contractOutput.evm.bytecode.linkReferences
          for (const linkRefFileName of Object.keys(linkRefs || {})) {
            for (const [linkRefName, linkRefOutput] of Object.entries(
              linkRefs[linkRefFileName]
            )) {
              delete linkRefs[linkRefFileName][linkRefName]
              linkRefs[linkRefFileName][`${linkRefName}.ovm`] = linkRefOutput
            }
          }

          // OVM compiler output is signified by adding .ovm to the output name.
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
