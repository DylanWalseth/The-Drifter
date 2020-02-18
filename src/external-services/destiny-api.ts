import Traveler from 'the-traveler';
import { BungieMembershipType } from 'the-traveler/build/type-definitions/app';
import { DestinyComponentType, DestinyProfileResponse } from 'the-traveler/build/type-definitions/destiny2';
import { CONFIG } from '../config';

const awkewainzeId = "4611686018468627048";
const traveler = new Traveler({
    apikey: CONFIG.DESTINY.API_KEY,
    userAgent: "bot"
});


export async function main() {
    traveler.destiny2.getProfile(3, awkewainzeId, {
        components: [
            DestinyComponentType.Characters,
            DestinyComponentType.CharacterInventories,
            DestinyComponentType.CharacterProgressions,
            DestinyComponentType.CharacterRenderData,
            DestinyComponentType.CharacterActivities,
            DestinyComponentType.CharacterEquipment
        ]
    }).then(x => {
        console.log(x.Response.characterInventories);
    }).catch(err => {
        console.error("error", err);
    });
}

// export function getCharacterInfo(id: string): DestinyProfileResponse {
//     return traveler.destiny2.getProfile(3, id, {
//         components: [
//             DestinyComponentType.Characters,
//             DestinyComponentType.CharacterInventories,
//             DestinyComponentType.CharacterProgressions,
//             DestinyComponentType.CharacterRenderData,
//             DestinyComponentType.CharacterActivities,
//             DestinyComponentType.CharacterEquipment
//         ]
//     }).then(x => x.Response);
// }
