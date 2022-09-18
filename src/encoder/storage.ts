import { Address, Builder, Cell, DictBuilder } from 'ton'
import BN from 'bn.js'

interface StateSlice {
    state: number
    rightNftsCount: number
    leftNftsCount: number
}

interface AddrSlice {
    leftUser: Address
    rightUser: Address
    superUser: Address
}

interface CommissionSlice {
    leftCommission: BN
    rightCommission: BN
    coinsForNft: BN
}

interface NFTItem {
    addr: Address
    received: boolean
}

interface DictSlice {
    leftNfts: NFTItem[]
    rightNfts: NFTItem[]
}

function encodeRaffleStorage
(
    stateSlice: StateSlice,
    addrSlice: AddrSlice,
    commissionSlice: CommissionSlice,
    dictSlice: DictSlice
): Cell {
    const stateCell = new Builder()
        .storeUint(stateSlice.state, 2)
        .storeUint(stateSlice.rightNftsCount, 4)
        .storeUint(0, 4)
        .storeUint(stateSlice.leftNftsCount, 4)
        .storeUint(0, 4)
        .endCell()
    const addrCell = new Builder()
        .storeAddress(addrSlice.leftUser)
        .storeAddress(addrSlice.rightUser)
        .storeAddress(addrSlice.superUser)
        .endCell()
    const commissionCell = new Builder()
        .storeCoins(commissionSlice.leftCommission)
        .storeCoins(commissionSlice.rightCommission)
        .storeCoins(new BN(0))
        .storeCoins(new BN(0))
        .storeCoins(commissionSlice.coinsForNft)
        .endCell()
    const raffledNfts = new DictBuilder(256)
    const leftNfts = new DictBuilder(256)
    if (dictSlice.leftNfts.length > 0) {
        for (let i = 0; i < dictSlice.leftNfts.length; i += 1) {
            const bitCell = new Cell()
            bitCell.bits.writeBit(dictSlice.leftNfts[i].received)
            leftNfts.storeCell(new BN(dictSlice.leftNfts[i].addr.hash), bitCell)
            raffledNfts.storeCell(new BN(dictSlice.leftNfts[i].addr.hash), bitCell)
        }
    }
    const rightNfts = new DictBuilder(256)
    if (dictSlice.rightNfts.length > 0) {
        for (let i = 0; i < dictSlice.rightNfts.length; i += 1) {
            const bitCell = new Cell()
            bitCell.bits.writeBit(dictSlice.rightNfts[i].received)
            rightNfts.storeCell(new BN(dictSlice.rightNfts[i].addr.hash), bitCell)
            raffledNfts.storeCell(new BN(dictSlice.rightNfts[i].addr.hash), bitCell)
        }
    }
    const dictCell = new Builder()
        .storeDict(leftNfts.endCell())
        .storeDict(rightNfts.endCell())
        .storeDict(raffledNfts.endCell())
    const storageCell = new Builder()
        .storeRef(stateCell)
        .storeRef(addrCell)
        .storeRef(commissionCell)
        .storeRef(dictCell.endCell())
    return storageCell.endCell()
}

export { encodeRaffleStorage }
