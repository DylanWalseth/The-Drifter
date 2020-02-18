import * as path from 'path';
import Flexsearch, { Index } from "flexsearch";

const ammoFileLocation = path.join(__dirname, "..", "..", "data", "ammo-pen.json");
const ammoData: Ammo[] = require(ammoFileLocation);

let ammoIndex: Index<unknown> = Flexsearch.create({
    cache: true,
    async: true,
});
ammoIndex.addMatcher({
    "/": "x",
    " mm": "mm",
});
for (let i = 0; i < ammoData.length; i++) {
    ammoIndex.add(i, ammoData[i]["Ammo Type"]);
}

export async function lookupAmmoData(query: string, limit: number = 5): Promise<Ammo[]> {
    let results = await ammoIndex.search({
        query,
        limit,
        suggest: true
    }) as number[];
    return results.map(x => ammoData[x]);
}

export async function lookupAmmoDataSpecific(field: string): Promise<Ammo[]> {
    let results = await ammoIndex.search(field) as number[];
    return results.map(x => ammoData[x]);
}

export type PenValue = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type Ammo = {
    "Ammo Type": string,
    "Damage": number,
    "Pen Value": number,
    "Armor Damage": number,
    "Frag. Chance*": string,
    "Class 1": PenValue,
    "Class 2": PenValue,
    "Class 3": PenValue,
    "Class 4": PenValue,
    "Class 5": PenValue,
    "Class 6": PenValue,
    "META-OriginalName": string,
    "META-Tags": "TODO"
}

export var BlankAmmo: Ammo = {
    "Ammo Type": "-",
    "Damage": -1,
    "Pen Value": -1,
    "Armor Damage": -1,
    "Frag. Chance*": "-",
    "Class 1": 0,
    "Class 2": 0,
    "Class 3": 0,
    "Class 4": 0,
    "Class 5": 0,
    "Class 6": 0,
    "META-OriginalName": "-",
    "META-Tags": "TODO"
}