import Axios from "axios";
import { Moment } from "moment";
import moment from "moment";
import Flexsearch, { Index } from "flexsearch";

const marketDataUrl = "https://eft-loot.com/page-data/index/page-data.json";
let itemPriceIndex: Index<unknown> = Flexsearch.create({
    profile: "speed",
    async: true,
    cache: true,
    tokenize: "forward"
});

let itemPriceIndexFast: Index<unknown> = Flexsearch.create({
    profile: "fast",
    async: true,
    cache: true
})
let itemPriceData: ItemPrice[];

itemPriceIndex.addMatcher({
    "/": "x",
    " mm": "mm",
})
let lastMarketRefresh: Moment;

export async function reloadMarketData(): Promise<void> {
    const response = await Axios.get(marketDataUrl);
    itemPriceData = response.data.result.data.allDataJson.nodes as ItemPrice[];
    reloadMarketIndex(itemPriceData);
    lastMarketRefresh = moment();
}

export async function reloadDataIfTooOld(): Promise<void> {
    if (!isValidMoment(lastMarketRefresh) || moment().isAfter(lastMarketRefresh.add(2, 'days'))) {
        await reloadMarketData();
    }
}

export async function lookupItemPrice(query: string, limit: number = 5): Promise<ItemPrice[]> {
    await reloadDataIfTooOld();
    let results = await itemPriceIndex.search({
        query,
        limit,
        suggest: true
    }) as number[];
    let itemPriceArr: ItemPrice[] = []
    for (let result of results) {
        itemPriceArr.push(itemPriceData[result]);
    }
    return itemPriceArr;
}

export async function lookupItemPriceFast(query: string, limit: number = 5): Promise<ItemPrice[]> {
    await reloadDataIfTooOld();
    let results = await itemPriceIndexFast.search({
        query,
        limit,
        suggest: true
    }) as number[];
    let itemPriceArr: ItemPrice[] = []
    for (let result of results) {
        itemPriceArr.push(itemPriceData[result]);
    }
    return itemPriceArr;
}

async function reloadMarketIndex(itemPriceData: ItemPrice[]) {
    itemPriceIndex.clear();
    for(let i = 0; i < itemPriceData.length; i++) {
        itemPriceIndex.add(i, itemPriceData[i].title);
        itemPriceIndexFast.add(i, itemPriceData[i].title);
    }
} 

export interface ItemPrice {
    price_avg: number,
    price_array: number[],
    name: string,
    title: string,
    price_per_slot: number,
    slots: number,
    imagePath: string
    id: string,
    timestamp: string,
    category: string
}

function isValidMoment(momentObj: Moment) {
    return !!momentObj && moment.isMoment(momentObj) && momentObj.isValid();
}