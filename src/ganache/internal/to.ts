import { bufferToInt, addHexPrefix, toBuffer, BN } from 'ethereumjs-util'
import { BigNumber } from 'ethers'

export const to = {
  hex: (val: any) => {
    if (typeof val === 'string') {
      if (val.indexOf('0x') === 0) {
        return val.trim()
      } else {
        val = new BN(val)
      }
    }

    if (typeof val === 'boolean') {
      val = val ? 1 : 0
    }

    if (typeof val === 'number') {
      val = BigNumber.from(val).toHexString()
    } else if (val == null) {
      return '0x'
    } else if (typeof val === 'object') {
      // Support Buffer, BigInteger and BN library
      // Hint: BN is used in ethereumjs
      val = val.toString('hex')
    }

    return addHexPrefix(val)
  },
  number: (val: any): number => {
    if (typeof val === 'number') {
      return val
    }

    if (typeof val === 'string') {
      if (val.indexOf('0x') !== 0) {
        return parseInt(val, 10)
      }
    }

    return bufferToInt(toBuffer(val))
  },
}
