/* Imports: External */
import { subtask } from 'hardhat/config'
import {
  TASK_COMPILE_SOLIDITY_RUN_SOLCJS,
  TASK_COMPILE_SOLIDITY_RUN_SOLC,
} from 'hardhat/builtin-tasks/task-names'

export const loadCompilerPlugin = (version: string) => {
  subtask(
    TASK_COMPILE_SOLIDITY_RUN_SOLC,
    async (
      { input, solcPath }: { input: any; solcPath: string },
      { config, run },
      runSuper
    ) => {
      // Try to find a path to @eth-optimism/solc, throw if we can't.
      let ovmSolcPath: string
      try {
        ovmSolcPath = require.resolve(version)
      } catch (err) {
        console.log(err)
        if (err.toString().contains('Cannot find module')) {
          throw new Error(
            `@eth-optimism/plugins: Could not find "@eth-optimism/solc" in your node_modules.`
          )
        } else {
          throw err
        }
      }

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
        ovmInput.sources[file] = input.sources[file]
      }

      // Build both inputs separately.
      const evmOutput = await runSuper({ input: evmInput, solcPath })
      const ovmOutput = await run(TASK_COMPILE_SOLIDITY_RUN_SOLCJS, {
        input: ovmInput,
        solcJsPath: ovmSolcPath,
      })

      ovmOutput.errors = (ovmOutput.errors || []).map((error: any) => {
        if (error.severity === 'error') {
          if (
            input.sources[error.sourceLocation.file].content.includes(
              '// @unsupported: ovm'
            )
          ) {
            error.severity = 'warning'
            error.formattedMessage = `OVM Compiler Warning (silenced by "// @unsupported: ovm"):\n ${error.formattedMessage}`
          } else {
            error.formattedMessage = `OVM Compiler Error (silence by adding: "// @unsupported: ovm" to the top of this file):\n ${error.formattedMessage}`
          }
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

            evmOutput.contracts[fileName][
              `${contractName}.ovm`
            ] = contractOutput
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
}
