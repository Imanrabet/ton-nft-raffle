import { Builder, Address, Cell, Slice, parseDict, toNano } from 'ton'
import BN from 'bn.js'
import { SmartContract } from 'ton-contract-executor'
import { getRandSigner } from '../utils'

type StateResponse = {
    State: number,
    RightNftsCount: number,
    RightNftsReceived: number,
    LeftNftsCount: number,
    LeftNftsReceived: number,
    LeftUser: Address,
    RightUser: Address,
    SuperUser: Address,
    LeftCommission: BN,
    RightCommission: BN,
    LeftCoinsGot: BN,
    RightCoinsGot: BN,
    CoinsForNft: BN,
    LeftNfts: Map<string, boolean> | null,
    RightNfts: Map<string, boolean> | null,
    RaffledNfts: Map<string, boolean> | null
}

function DictToMap (slice : Slice): boolean {
    return slice.readBit()
}

class MSG {
    public static async getRaffleState (contract: SmartContract): Promise<StateResponse> {
        const res = await contract.invokeGetMethod('get::raffle_state', [])
        if (res.type !== 'success') {
            throw new Error('Can`t run get raffle state')
        }
        const [ state, rightNftsCount, rightNftsReceived, leftNftsCount,
            leftNftsReceived, leftUser, rightUser, superUser, leftCommission,
            rightCommission, leftCoinsGot, rightCoinsGot,
            coinsForNft, leftNfts, rightNfts, raffledNfts ] = res.result as [BN, BN,
            BN, BN,
            BN, Slice, Slice, Slice, BN, BN, BN, BN, BN, Cell, Cell, Cell]
        const leftMap = leftNfts ? parseDict<boolean>(
            leftNfts.beginParse(),
            256,
            DictToMap
        ) : null
        const rightMap = rightNfts ? parseDict<boolean>(
            rightNfts.beginParse(),
            256,
            DictToMap
        ) : null
        const raffledMap = raffledNfts ? parseDict<boolean>(
            raffledNfts.beginParse(),
            256,
            DictToMap
        ) : null
        return {
            State: state ? state.toNumber() : 0,
            RightNftsCount: rightNftsCount.toNumber(),
            RightNftsReceived: rightNftsReceived.toNumber(),
            LeftNftsCount: leftNftsCount.toNumber(),
            LeftNftsReceived: leftNftsReceived.toNumber(),
            LeftUser: leftUser.readAddress() as Address,
            RightUser: rightUser.readAddress() as Address,
            SuperUser: superUser.readAddress() as Address,
            LeftCommission: leftCommission,
            RightCommission: rightCommission,
            LeftCoinsGot: leftCoinsGot,
            RightCoinsGot: rightCoinsGot,
            CoinsForNft: coinsForNft,
            LeftNfts: leftMap,
            RightNfts: rightMap,
            RaffledNfts: raffledMap
        }
    }

    public static nftOwnerAssigned (
        queryId: BN,
        prevOwner: Address,
        op: number = 0x05138d91
    ): Cell {
        const msg = new Builder()
            .storeUint(op, 32)
            .storeUint(queryId, 64)
            .storeAddress(prevOwner)
            .storeBit(0)

        return msg.endCell()
    }

    public static cancel (): Cell {
        const msg = new Builder()
            .storeUint(2001, 32)

        return msg.endCell()
    }

    public static addCoins (): Cell {
        const msg = new Builder()
            .storeUint(2002, 32)
        return msg.endCell()
    }

    public static sendTrans (): Cell {
        const body = new Builder()
            .storeUint(0x18, 6)
            .storeAddress(getRandSigner())
            .storeCoins(toNano(0.1))
            .storeUint(0, 1 + 4 + 4 + 64 + 32 + 1 + 1)
        const msg = new Builder()
            .storeUint(2003, 32)
            .storeRef(body.endCell())
            .storeUint(0, 8)
            .endCell()
        return msg
    }
}

export { MSG }
