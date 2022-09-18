import { Builder } from 'ton'
import { getRandSigner } from './signers'

function buffer256ToDec (buff: Buffer): string {
    const build = new Builder().storeBuffer(buff).endCell()
    return build.beginParse().readUint(256).toString(10)
}

export { getRandSigner, buffer256ToDec }
