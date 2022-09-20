import { expect } from 'chai'
import * as fs from 'fs'
import BN from 'bn.js'
import {
    Builder,
    InternalMessage,
    CommonMessageInfo,
    CellMessage,
    Cell,
    toNano,
    Address
} from 'ton'
import { SmartContract } from 'ton-contract-executor'
import { encodeRaffleStorage, MSG } from '../src/encoder'
import { buffer256ToDec, getRandSigner } from '../src/utils'

function bocFileToTCell (filename: string): Cell {
    const file = fs.readFileSync(filename)
    return Cell.fromBoc(file)[0]
}

function queryId (): BN {
    return new BN(~~(Date.now() / 1000))
}

interface NFTItem {
    addr: Address
    received: boolean
}

const STATES = {
    Active: 1,
    Canceled: 2,
    Completed: 3
}

const TVM_EXIT_CODES = {
    OK: 0,
    state: 1001,
    wrongAddr: 1002,
    notFound: 0xffff
}

describe('nft raffle main test', () => {
    let smc: SmartContract

    const SELF_ADDR = getRandSigner()

    const COMMISSION_FOR_NFT = 0.5

    const LEFT_NFTS_COUNT = 3
    const RIGHT_NFTS_COUNT = 3

    const LEFT_USER = getRandSigner()
    const RIGHT_USER = getRandSigner()
    const SUPER_USER = getRandSigner()

    const LEFT_COMMISSION = toNano(COMMISSION_FOR_NFT * LEFT_NFTS_COUNT)
    const RIGHT_COMMISSION = toNano(COMMISSION_FOR_NFT * RIGHT_NFTS_COUNT)
    const COINS_FOR_NFT = toNano(COMMISSION_FOR_NFT)
    const LEFT_NFTS: NFTItem[] = []
    const RIGHT_NFTS: NFTItem[] = []
    const EMPTY_BODY = new CommonMessageInfo(
        { body: new CellMessage(new Builder().endCell()) }
    )
    for (let i = 0; i < LEFT_NFTS_COUNT; i += 1) {
        LEFT_NFTS.push({ addr: getRandSigner(), received: false })
    }
    for (let i = 0; i < RIGHT_NFTS_COUNT; i += 1) {
        RIGHT_NFTS.push({ addr: getRandSigner(), received: false })
    }
    beforeEach(async () => {
        const code = bocFileToTCell('./auto/code.boc')
        const data = encodeRaffleStorage(
            {
                state: STATES.Active,
                rightNftsCount: RIGHT_NFTS_COUNT,
                leftNftsCount: LEFT_NFTS_COUNT
            },
            {
                leftUser: LEFT_USER,
                rightUser: RIGHT_USER,
                superUser: SUPER_USER
            },
            {
                leftCommission: LEFT_COMMISSION,
                rightCommission: RIGHT_COMMISSION,
                coinsForNft: COINS_FOR_NFT
            },
            {
                leftNfts: LEFT_NFTS,
                rightNfts: RIGHT_NFTS
            }
        )
        smc = await SmartContract.fromCell(code, data)
    })
    describe('contract', () => {
        async function simpleTransferNFT (nftAddr: Address, nftOwner: Address, amount: number) {
            const msg = MSG.nftOwnerAssigned(queryId(), nftOwner)
            const result = await smc.sendInternalMessage(new InternalMessage({
                to: SELF_ADDR,
                from: nftAddr,
                value: toNano(amount),
                bounce: true,
                body: new CommonMessageInfo({ body: new CellMessage(msg) })
            }))
            return result
        }

        async function sendAllNfts () {
            for (let i = 0; i < LEFT_NFTS_COUNT; i += 1) {
                const result = await simpleTransferNFT(
                    LEFT_NFTS[i].addr,
                    LEFT_USER,
                    COMMISSION_FOR_NFT
                )
                const get = await MSG.getRaffleState(smc)
                expect(get.LeftNfts.get(buffer256ToDec(LEFT_NFTS[i].addr.hash))).to.equals(true)
                expect(result.exit_code).to.equals(TVM_EXIT_CODES.OK)
                expect(get.LeftNftsReceived).to.equals(i + 1)
                expect(get.LeftCoinsGot.toNumber()).to
                    .equals(toNano(COMMISSION_FOR_NFT * (i + 1)).toNumber())
            }
            for (let i = 0; i < RIGHT_NFTS_COUNT - 1; i += 1) {
                const result = await simpleTransferNFT(
                    RIGHT_NFTS[i].addr,
                    RIGHT_USER,
                    COMMISSION_FOR_NFT
                )
                const get = await MSG.getRaffleState(smc)
                expect(get.RightNfts.get(buffer256ToDec(RIGHT_NFTS[i].addr.hash))).to.equals(true)
                expect(result.exit_code).to.equals(TVM_EXIT_CODES.OK)
                expect(get.RightNftsReceived).to.equals(i + 1)
                expect(get.RightCoinsGot.toNumber()).to
                    .equals(toNano(COMMISSION_FOR_NFT * (i + 1)).toNumber())
            }
            const lastTransaction = await simpleTransferNFT(
                RIGHT_NFTS[RIGHT_NFTS_COUNT - 1].addr,
                RIGHT_USER,
                COMMISSION_FOR_NFT
            )
            return lastTransaction
        }

        it('1) simple NFT transfer', async () => {
            const result = await simpleTransferNFT(LEFT_NFTS[0].addr, LEFT_USER, COMMISSION_FOR_NFT)
            const get = await MSG.getRaffleState(smc)
            expect(get.LeftNfts.get(buffer256ToDec(LEFT_NFTS[0].addr.hash))).to.equals(true)
            expect(result.exit_code).to.equals(TVM_EXIT_CODES.OK)
            expect(get.LeftNftsReceived).to.equals(1)
            expect(get.LeftCoinsGot.toNumber()).to.equals(toNano(COMMISSION_FOR_NFT).toNumber())
        })

        it('2) NFT transfer, but wrong commission', async () => {
            const result = await simpleTransferNFT(LEFT_NFTS[0].addr, LEFT_USER, 0.1)
            const get = await MSG.getRaffleState(smc)
            expect(get.LeftNfts.get(buffer256ToDec(LEFT_NFTS[0].addr.hash))).to.equals(false)
            expect(result.exit_code).to.equals(TVM_EXIT_CODES.OK)
            expect(result.actionList[0].type).to.equals('send_msg')
            expect(result.actionList[0].mode).to.equals(64)
            expect(get.LeftNftsReceived).to.equals(0)
        })
        it('3) NFT transfer, but wrong NFT address', async () => {
            const result = await simpleTransferNFT(getRandSigner(), LEFT_USER, 0.5)
            const get = await MSG.getRaffleState(smc)
            expect(result.exit_code).to.equals(TVM_EXIT_CODES.OK)
            expect(get.LeftNftsReceived).to.equals(0)
            expect(get.LeftCoinsGot.toNumber()).to.equals(0)
        })
        it('4) Left and Right NFT transfer', async () => {
            const result1 = await simpleTransferNFT(LEFT_NFTS[0].addr, LEFT_USER, 0.5)
            expect(result1.exit_code).to.equals(TVM_EXIT_CODES.OK)
            const result2 = await simpleTransferNFT(RIGHT_NFTS[0].addr, RIGHT_USER, 0.5)
            expect(result2.exit_code).to.equals(TVM_EXIT_CODES.OK)

            const get = await MSG.getRaffleState(smc)
            expect(get.LeftNfts.get(buffer256ToDec(LEFT_NFTS[0].addr.hash))).to.equals(true)
            expect(get.RightNfts.get(buffer256ToDec(RIGHT_NFTS[0].addr.hash))).to.equals(true)
        })
        it('5) raffle cancel', async () => {
            const result = await smc.sendInternalMessage(new InternalMessage({
                to: SELF_ADDR,
                from: SUPER_USER,
                value: toNano(0.1),
                bounce: true,
                body: new CommonMessageInfo({ body: new CellMessage(MSG.cancel()) })
            }))
            expect(result.exit_code).to.equals(TVM_EXIT_CODES.OK)
            const get = await MSG.getRaffleState(smc)
            expect(get.State).to.equals(STATES.Canceled)
            const modes: number[] = [ 0, 2, 2, 130 ]
            const types: string[] = [ 'reserve_currency', 'send_msg', 'send_msg', 'send_msg' ]
            result.actionList.forEach((e, i: number) => {
                const msgo = <any>e
                expect(msgo.mode).to.equals(modes[i])
                expect(msgo.type).to.equals(types[i])
            })
        })
        it('6) raffle cancel + return nft', async () => {
            const result1 = await simpleTransferNFT(LEFT_NFTS[0].addr, LEFT_USER, 0.5)
            expect(result1.exit_code).to.equals(TVM_EXIT_CODES.OK)
            const result2 = await simpleTransferNFT(RIGHT_NFTS[0].addr, RIGHT_USER, 0.5)
            expect(result2.exit_code).to.equals(TVM_EXIT_CODES.OK)
            const result = await smc.sendInternalMessage(new InternalMessage({
                to: SELF_ADDR,
                from: SUPER_USER,
                value: toNano(0.1),
                bounce: true,
                body: new CommonMessageInfo({ body: new CellMessage(MSG.cancel()) })
            }))
            expect(result.exit_code).to.equals(TVM_EXIT_CODES.OK)
            const get = await MSG.getRaffleState(smc)
            expect(get.State).to.equals(STATES.Canceled)
            const modes: number[] = [ 1, 1, 0, 2, 2, 130 ]
            const types: string[] = [ 'send_msg', 'send_msg', 'reserve_currency', 'send_msg', 'send_msg', 'send_msg' ]
            result.actionList.forEach((e, i: number) => {
                const msgo = <any>e
                expect(msgo.mode).to.equals(modes[i])
                expect(msgo.type).to.equals(types[i])
            })
        })
        it('7) raffle cancel with wrong addr', async () => {
            const result1 = await simpleTransferNFT(LEFT_NFTS[0].addr, LEFT_USER, 0.5)
            expect(result1.exit_code).to.equals(TVM_EXIT_CODES.OK)
            const result2 = await simpleTransferNFT(RIGHT_NFTS[0].addr, RIGHT_USER, 0.5)
            expect(result2.exit_code).to.equals(TVM_EXIT_CODES.OK)
            const result = await smc.sendInternalMessage(new InternalMessage({
                to: SELF_ADDR,
                from: getRandSigner(),
                value: toNano(0.1),
                bounce: true,
                body: new CommonMessageInfo({ body: new CellMessage(MSG.cancel()) })
            }))
            expect(result.exit_code).to.equals(TVM_EXIT_CODES.wrongAddr)
        })
        it('8) add coins', async () => {
            const result = await smc.sendInternalMessage(new InternalMessage({
                to: SELF_ADDR,
                from: LEFT_USER,
                value: toNano(0.5),
                bounce: true,
                body: new CommonMessageInfo({ body: new CellMessage(MSG.addCoins()) })
            }))
            expect(result.exit_code).to.equals(TVM_EXIT_CODES.OK)
            const get = await MSG.getRaffleState(smc)
            expect(get.LeftCoinsGot.toNumber()).to.equals(toNano(0.5).toNumber())
        })
        it('9) add coins wrong addr', async () => {
            const result = await smc.sendInternalMessage(new InternalMessage({
                to: SELF_ADDR,
                from: getRandSigner(),
                value: toNano(0.5),
                bounce: true,
                body: new CommonMessageInfo({ body: new CellMessage(MSG.addCoins()) })
            }))
            expect(result.exit_code).to.equals(TVM_EXIT_CODES.wrongAddr)
        })
        it('10) manually send transaction', async () => {
            const result = await smc.sendInternalMessage(new InternalMessage({
                to: SELF_ADDR,
                from: SUPER_USER,
                value: toNano(0.5),
                bounce: true,
                body: new CommonMessageInfo({ body: new CellMessage(MSG.sendTrans()) })
            }))
            expect(result.exit_code).to.equals(TVM_EXIT_CODES.OK)
            expect(result.actionList[0].type).to.equals('send_msg')
            expect(result.actionList[0].mode).to.equals(0)
        })
        it('11) manually send transaction from wrong addr', async () => {
            const result = await smc.sendInternalMessage(new InternalMessage({
                to: SELF_ADDR,
                from: getRandSigner(),
                value: toNano(0.5),
                bounce: true,
                body: new CommonMessageInfo({ body: new CellMessage(MSG.sendTrans()) })
            }))
            expect(result.exit_code).to.equals(TVM_EXIT_CODES.wrongAddr)
        })
        it('12) Should raffle after all NFTs received', async () => {
            const lastTransaction = await sendAllNfts()
            expect(lastTransaction.exit_code).to.equal(TVM_EXIT_CODES.OK)
            const get = await MSG.getRaffleState(smc)
            expect(get.State).to.equal(STATES.Completed)
            const modes: number[] = [ 1, 1, 1, 1, 1, 1, 0, 130 ]
            const types: string[] = [ 'send_msg', 'send_msg', 'send_msg', 'send_msg', 'send_msg', 'send_msg', 'reserve_currency', 'send_msg' ]
            lastTransaction.actionList.forEach((e, i: number) => {
                const msgo = <any>e
                expect(msgo.mode).to.equals(modes[i])
                expect(msgo.type).to.equals(types[i])
            })
        })
        it('13) cancel after raffle', async () => {
            const lastTransaction = await sendAllNfts()
            expect(lastTransaction.exit_code).to.equal(TVM_EXIT_CODES.OK)
            const get = await MSG.getRaffleState(smc)
            expect(get.State).to.equal(STATES.Completed)
            const modes: number[] = [ 1, 1, 1, 1, 1, 1, 0, 130 ]
            const types: string[] = [ 'send_msg', 'send_msg', 'send_msg', 'send_msg', 'send_msg', 'send_msg', 'reserve_currency', 'send_msg' ]
            lastTransaction.actionList.forEach((e, i: number) => {
                const msgo = <any>e
                expect(msgo.mode).to.equals(modes[i])
                expect(msgo.type).to.equals(types[i])
            })
            const result = await smc.sendInternalMessage(new InternalMessage({
                to: SELF_ADDR,
                from: SUPER_USER,
                value: toNano(0.1),
                bounce: true,
                body: new CommonMessageInfo({ body: new CellMessage(MSG.cancel()) })
            }))
            expect(result.exit_code).to.equals(TVM_EXIT_CODES.state)
        })
    })
    after(() => { setTimeout(() => { process.exit(0) }, 2500) })
})
