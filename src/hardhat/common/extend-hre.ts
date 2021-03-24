/* Imports: External */
import { extendEnvironment } from 'hardhat/config'
import { Artifacts } from 'hardhat/internal/artifacts'

extendEnvironment((hre) => {
  if (process.env.TARGET === 'ovm') {
    ;(hre.network as any).ovm = true
    // Quick check to make sure we don't accidentally perform this transform multiple times.
    let artifactsPath = hre.config.paths.artifacts
    if (!artifactsPath.endsWith('-ovm')) {
      artifactsPath = artifactsPath + '-ovm'
    }

    // Forcibly update the artifacts object.
    hre.config.paths.artifacts = artifactsPath
    ;(hre as any).artifacts = new Artifacts(artifactsPath)
    ;(hre.network as any).ovm = true
  }
})
