require('source-map-support').install();

import {Client as DiscordClient, TextChannel, VoiceChannel, VoiceConnection, GuildMember, DMChannel, MessageEmbed} from 'discord.js';
import {promisify} from 'util';
import {createClient, RedisClient} from 'redis';
import {checkToxicity, Attribute} from "./external-services/perspective-api";
import { lookupItemPrice, lookupItemPriceFast } from './external-services/tarkov-price-api';
import { lookupAmmoData, Ammo, lookupAmmoDataSpecific, BlankAmmo } from './external-services/tarkov-ammo-api';
import moment from 'moment';
import * as fs from 'fs';
import * as path from 'path';
import { CONFIG } from './config';
import { randInt, selectRandom } from './utils/math-utils';
import { main } from './external-services/destiny-api';
import { Stream, Duplex } from 'stream';
import { table, TableUserConfig } from 'table';
import { Parser } from 'expr-eval';

const parser = new Parser();
const redisClientPrebinded: RedisClient = createClient();
const getAsync: (key: string) => Promise<string> = promisify(redisClientPrebinded.get).bind(redisClientPrebinded);
const setAsync: (key: string, value: string) => Promise<void> = promisify(redisClientPrebinded.set).bind(redisClientPrebinded);
const redisClient: RedisClient & {getAsync: (key: string) => Promise<string>, setAsync: (key: string, value: string) => Promise<void>} = { ...redisClientPrebinded, getAsync, setAsync } as any;

const soundsDir = path.join(__dirname, "..", "sounds", "memes");
const drifterSoundsDir = path.join(__dirname, "..", "sounds", "drifter-lines");
const dingFolder = path.join(drifterSoundsDir, "drifter-special", "ding-individual");
const armyOfOneSoundsDir = path.join(__dirname, "..", "sounds", "army-of-one");
const client = new DiscordClient();
client.on('ready', async () => {
    console.log("Online");
    client.user.setPresence({
        status: "online",
        activity: {
            name: "Gambit and Chill",
            type: "WATCHING",
            url: "https://github.com/DylanWalseth/The-Drifter"
        }
    });

    // client.user.setAvatar(path.join(__dirname, "..", "images", "gnome_child.png"));
});

client.on('voiceStateUpdate', async (oldState, newState) => {
    if (newState.channel && newState.channel.guild && newState.channel.guild.id && newState.channel.members){
        const potentialVictimsPromise = newState.channel.members.filter(x => !x.user.bot).filter(x => !x.voice.selfDeaf).map(x => amIIncludedInRaidChecks(x));
        const potentialVictims = (await Promise.all(potentialVictimsPromise)).filter(x => x.includeMe).map(x => x.player);
        if (potentialVictims.length > 5) {
            const textChannelId = await redisClient.getAsync(newState.channel.guild.id);
            if (!newState.guild.channels.has(textChannelId)) {
                redisClient.del(textChannelId);
                return;
            }
            const textChannel = newState.guild.channels.get(textChannelId) as TextChannel;
       
            if(textChannel) {
                let timeToWaitTil = await redisClient.getAsync(`${newState.guild.id}-waituntiltime`);
                let m = moment().subtract(1, "second");
                if(timeToWaitTil) {
                    m = moment(timeToWaitTil);
                }

                if(moment().isAfter(m)) {
                    textChannel.send("https://i.imgur.com/8HGuZQG.png");
                    textChannel.send(`Some potential victims are: ${potentialVictims.map(x => x.displayName).join(", ")}`);
                    await redisClient.setAsync(`${newState.guild.id}-waituntiltime`, moment().add(1, "day").startOf("day").format());
                }
            }
        }
    }
});

const memeFinder = [
    {key: /awkewainze/i, responses: ["Isn't Awk the best?"]},
    {key: /bairborne/i, responses: ["You mean smelly dude?"]},
    {key: /scorn/i, responses: ["I could eat a whole scorn."]},
    {key: /hive/i, responses: ["Bring a sword.", "I could eat a whole hive."]},
    {key: /raid.*\?/i, responses: ["No", "Nope", "Never"]},
    {key: /(drifter)|(dredgen)/i, responses: ["Bring a scorn.", "I could eat a whole scorn.", "Bring a sword.", "I could eat a whole hive.", "...", undefined]},
    {key: /moon/i, responses: ["Moon's haunted"]},
];

const villagerDir = path.join(__dirname, "..", "sounds", "mcsounds", "villager-no-death-sounds");
async function playRandomVillagerSoundsForever(connection: VoiceConnection, guildId: string): Promise<void> {
    let stream = connection.play(await getRandomFileFromDir(villagerDir), {
        volume: .4
    });
    stream.once('end', () => {
        setTimeout(() => {
            if (!guildVillagerStatusEnabled[guildId]) return;
            playRandomVillagerSoundsForever(connection, guildId);
        }, 1000 + (Math.random() * 1000 * 3));
    });
}

async function playDingForever(connection: VoiceConnection, guildId: string): Promise<void> {
    let stream = connection.play(await getRandomFileFromDir(dingFolder), {
        volume: .4
    });
    stream.once('end', () => {
        setTimeout(() => {
            if (!guildDingStatusEnabled[guildId]) return;
            playDingForever(connection, guildId);
        }, 250);
    });
}

const cockneyDir = path.join(__dirname, "..", "sounds", "cockney");
async function playCockneyLewdSound(connection: VoiceConnection): Promise<void> {
    let stream = connection.play(await getRandomFileFromDir(cockneyDir), {
        volume: .4
    });
}

async function getOrCreateConnectionForGuild(guildId: string, channelToUseIfNotInExisting: VoiceChannel): Promise<VoiceConnection> {
    if (!guildConnectionMap[guildId]) {
        guildConnectionMap[guildId] = await channelToUseIfNotInExisting.join();
    }
    let connection = guildConnectionMap[guildId];
    return connection;
}

async function getRandomFileFromDir(directory: string): Promise<string> {
    let files: string[] = await new Promise((resolve, reject) => {
        fs.readdir(directory, (err, files) => {
            if (err) return reject(err);
            resolve(files);
        });
    });
    return path.join(directory, selectRandom(files));
}

const keyPrefix = "raid-check-me-";
async function includeMeInRaidChecks(player: GuildMember): Promise<GuildMember> {
    await redisClient.setAsync(keyPrefix + player.user.id, "true");
    return player;
}

function doNotAllowMeToBeRaidChecked(player: GuildMember): Promise<GuildMember> {
    return new Promise(resolve => {
        redisClient.del(keyPrefix + player.user.id, () => resolve(player));
    });
}

async function amIIncludedInRaidChecks(player: GuildMember): Promise<{includeMe: boolean, player: GuildMember}> {
    return {includeMe: !!(await redisClient.getAsync(keyPrefix + player.user.id)), player};
}

let guildConnectionMap: {[id: string]: VoiceConnection} = {};
let guildVillagerStatusEnabled: {[id: string]: boolean} = {};
let guildDingStatusEnabled: {[id: string]: boolean} = {};

const fullConfig: TableUserConfig = {
    columnCount: 9,
    columns: {
        0: {
            width: 10,
            wrapWord: true
        },
        1 : {
            width: 10
        },
        2: { 
            width: 3
        },
        3: {
            width: 1
        },
        4: {
            width: 1
        },
        5: {
            width: 1
        },
        6: {
            width: 1
        },
        7: {
            width: 1
        },
        8: {
            width: 1
        }
    }
}

const priceConfig: TableUserConfig = {
    columnDefault: {
        width: 12,
        wrapWord: true
    },
    columnCount: 3
}

const ammoConfig: TableUserConfig = {
    columnCount: 8,
    columns: {
        0: {
            width: 20,
            wrapWord: true
        },
        1: { 
            width: 3
        },
        2: {
            width: 1
        },
        3: {
            width: 1
        },
        4: {
            width: 1
        },
        5: {
            width: 1
        },
        6: {
            width: 1
        },
        7: {
            width: 1
        }
    }
}

function getTableSafe(tableData: (string | number)[][], tableConfig: TableUserConfig): string {
    let text = `\`\`\`${table(tableData, tableConfig)}\`\`\``;
    if (text.length > 2048) {
        tableData.pop();
        text = getTableSafe(tableData, tableConfig);
    }
    return text;
}

client.on('message', async message => {
    if (message.author.bot) return;
    // TODO: OPTIMIZE
    if (message.channel.type === "dm" && message.content && message.content.trim() !== "" && message) {
        if (/^\$tp /i.test(message.content)) {
            const query = /^\$tp (?<query>.+)$/i.exec(message.content).groups.query;
            const priceData = await lookupItemPrice(query);
            let priceTable = priceData.map(x => {
                return [x.title, x.price_avg, x.category]
            });
            let response = new MessageEmbed();
            response.setTitle("Lookup for: " + query);
            response.setColor(0xCF40FA);
            priceTable.unshift(["Name", "Price", "Category"]);
            response.setDescription(getTableSafe(priceTable, priceConfig));
            message.reply(response);
            console.log("Done");
            return;
        }
    
        if (/^\$tpq /i.test(message.content)) {
            const query = /^\$tpq (?<query>.+)$/i.exec(message.content).groups.query;
            const priceData = await lookupItemPriceFast(query);
            let priceTable = priceData.map(x => {
                return [x.title, x.price_avg, x.category]
            });
            let response = new MessageEmbed();
            response.setTitle("Lookup for: " + query);
            response.setColor(0xCF40FA);
            priceTable.unshift(["Name", "Price", "Category"]);
            response.setDescription(getTableSafe(priceTable, priceConfig));
            message.reply(response);
            console.log("Done");
            return;
        }

        if (/^\$ta /i.test(message.content)) {
            const query = /^\$ta (?<query>.+)$/i.exec(message.content).groups.query;
            const ammoData = await lookupAmmoData(query);
            let ammoTable = ammoData.map(x => {
                return [x["Ammo Type"], x.Damage, x["Class 1"], x["Class 2"], x["Class 3"], x["Class 4"], x["Class 5"], x["Class 6"]]
            });
            let response = new MessageEmbed();
            response.setTitle("Lookup for: " + query);
            response.setColor(0xCF40FA);
            ammoTable.unshift(["Ammo Type", "Dmg", "1", "2", "3", "4", "5", "6"]);
            response.setDescription(getTableSafe(ammoTable, ammoConfig));
            message.reply(response);
            return;
        }

        if (/^\$c /i.test(message.content)) {
            try {
                const expression = /^\$c (?<expression>.+)$/i.exec(message.content).groups.expression;
                message.reply(parser.evaluate(expression));
            } catch {
                message.reply("Unable to evaluate provided expression");
            }
            console.log("Done");
            return;
        }

        const query = message.content;
        const priceData = await lookupItemPrice(query);
        let fullTablePromises = priceData.map(async p => {
            const ammoData = await lookupAmmoDataSpecific(p.title);
            let x = BlankAmmo;
            if (ammoData.length > 0) x = ammoData[0];
            return [p.title, p.price_avg, x.Damage, x["Class 1"], x["Class 2"], x["Class 3"], x["Class 4"], x["Class 5"], x["Class 6"]]
        });
        let fullTable = await Promise.all(fullTablePromises);
        let response = new MessageEmbed();
        response.setTitle("Lookup for: " + query);
        response.setColor(0xCF40FA);
        fullTable.unshift(["Name", "Price", "Dmg", "1", "2", "3", "4", "5", "6"]);
        response.setDescription(getTableSafe(fullTable, fullConfig));
        message.reply(response);
        console.log("Done");
        return;
    }
    

    if(/\$setchannel/i.test(message.content)) {
        let guild = (message.channel as TextChannel).guild;
        if(!guild) return;
        await redisClient.setAsync(guild.id, message.channel.id);
        await message.channel.send("Channel set as trash bin!");
        return;
    }
    if (message.channel.type === "dm") {
        const channel = message.channel as DMChannel;
        // if (channel.recipient.id === "181223459202924556") {
        //     // interface PresenceData {
        //     //     status?: PresenceStatusData;
        //     //     afk?: boolean;
        //     //     activity?: {
        //     //         name?: string;
        //     //         type?: ActivityType | number;
        //     //         url?: string;
        //     //     };
        //     //     shardID?: number | number[];
        //     // }
            
        // }
        return;
    }
    
    const textChannelId = await redisClient.getAsync(message.guild.id);
    if (message.channel.id === textChannelId && !message.member.user.bot) {
        if (message.member.user.id === "163853794113748992") { // IsBAirborne
            await message.channel.send("You seem the type...");
        }
        if (/drifter/i.test(message.content)) {
            const tox = await checkToxicity(message.content);
            if (tox.attributeScores) {
                let keys: Set<Attribute> = new Set(Object.keys(tox.attributeScores) as any);
                if (keys.has("FLIRTATION") || keys.has("SEXUALLY_EXPLICIT")) {
                    const responses = ["I think we should just stay friends", "I'm flattered, but no thanks..."];
                    return await message.channel.send(selectRandom(responses));
                }
                if (keys.has("THREAT") || keys.has("INSULT")) {
                    const responses = ["I'll feed you to the Taken.", `I could eat a whole ${message.member.displayName}`, ];
                    return await message.channel.send(selectRandom(responses));
                }
                if (keys.has("TOXICITY") || keys.has("SEVERE_TOXICITY")) {
                    const responses = [`Wow, don't be so toxic, ${message.member.displayName}`];
                    return await message.channel.send(selectRandom(responses));
                }
            }
        }

        if (/\$gtfo/i.test(message.content)) {
            let connection = guildConnectionMap[message.guild.id];
            if (connection) {
                connection.disconnect();
                delete(guildConnectionMap[message.guild.id]);
            }
        }

        // if (/\$copy/i.test(message.content)) {
        //     let userChannel = message.member.voice.channel;
        //     if(userChannel) {
        //         let connection = await getOrCreateConnectionForGuild(message.guild.id, userChannel);
        //         let stream = connection.receiver.createStream(message.member.user, {
        //             mode: "opus",
        //             end: "silence"
        //         });
        //         let myStream = new Duplex();
        //         stream.pipe(myStream);
        //         let playStream = connection.play(myStream, {
        //             volume: .5
        //         });
        //         stream.addListener('data', data => {
        //             console.log("data", data);
        //         });
        //         myStream.addListener('data', data => {
        //             console.log("mydata", data);
        //         });
        //         return;
        //     }
        // }

        if(/\$(crc)|(check-raid-check)/i.test(message.content)) {
            await message.channel.send(`${message.member.displayName} is ${await amIIncludedInRaidChecks(message.member) ? "included": "not included"} in raid checks`);
        }

        if(/\$(drc)|(disable-raid-check)/i.test(message.content)) {
            await doNotAllowMeToBeRaidChecked(message.member);
            await message.channel.send(`${message.member.displayName} is now removed from raid checks`);
        }

        if(/\$(erc)|(enable-raid-check)/i.test(message.content)) {
            await includeMeInRaidChecks(message.member);
            await message.channel.send(`${message.member.displayName} is now added to raid checks`);
        }

        if (/\$goldwatch/i.test(message.content)) {
            let userChannel = message.member.voice.channel;
            if(userChannel) {
                let audioFileToPlay = path.join(__dirname, "..", "sounds", "misc", "goldwatch.mp3");
                let connection = await getOrCreateConnectionForGuild(message.guild.id, userChannel);
                let stream = connection.play(audioFileToPlay, {
                    volume: .6
                });
                return;
            }
        }

        if (/\$villager/i.test(message.content)) {
            let userChannel = message.member.voice.channel;
            let connection: VoiceConnection;
            if (!userChannel && !guildConnectionMap[message.guild.id]) return;
            connection = await getOrCreateConnectionForGuild(message.guild.id, userChannel);
            if (!connection) return;
            if (/stop/i.test(message.content)) {
                guildVillagerStatusEnabled[message.guild.id] = false;
            }
            if (/start/i.test(message.content) && !guildVillagerStatusEnabled[message.guild.id]) {
                guildVillagerStatusEnabled[message.guild.id] = true;
                playRandomVillagerSoundsForever(connection, message.guild.id);
            }
        }

        if (/\$ding/i.test(message.content)) {
            let userChannel = message.member.voice.channel;
            let connection: VoiceConnection;
            if (!userChannel && !guildConnectionMap[message.guild.id]) return;
            connection = await getOrCreateConnectionForGuild(message.guild.id, userChannel);
            if (!connection) return;
            if (/stop/i.test(message.content)) {
                guildDingStatusEnabled[message.guild.id] = false;
            }
            if (/start/i.test(message.content) && !guildDingStatusEnabled[message.guild.id]) {
                guildDingStatusEnabled[message.guild.id] = true;
                playDingForever(connection, message.guild.id);
            }
        }

        if (/\$meme/i.test(message.content)) {
            let userChannel = message.member.voice.channel;
            if(userChannel) {
                let audioFileToPlay = await getRandomFileFromDir(soundsDir);
                let connection = await getOrCreateConnectionForGuild(message.guild.id, userChannel);
                let stream = connection.play(audioFileToPlay, {
                    volume: .4
                });
                return;
            }
        }

        if (/\$cockney/i.test(message.content)) {
            let userChannel = message.member.voice.channel;
            if(userChannel) {
                let connection = await getOrCreateConnectionForGuild(message.guild.id, userChannel);
                await playCockneyLewdSound(connection);
                return;
            }
        }

        if (/\$succ/i.test(message.content)) {
            let userChannel = message.member.voice.channel;
            if(userChannel) {
                let audioFileToPlay = path.join(soundsDir, "succ.mp3");
                let connection = await getOrCreateConnectionForGuild(message.guild.id, userChannel);
                let stream = connection.play(audioFileToPlay, {
                    volume: .4
                });
                return;
            }
        }

        if (/\$voiceline\s+hive/i.test(message.content)) {
            let userChannel = message.member.voice.channel;
            if(userChannel) {
                let connection = await getOrCreateConnectionForGuild(message.guild.id, userChannel);
                let audioFileToPlay = path.join(drifterSoundsDir, "Hive-Bring-A-Sword.ogg");
                let stream = connection.play(audioFileToPlay, {
                    volume: .4
                });
                return;
            }
        }

        if (/\$voiceline\s+!/i.test(message.content)) {
            let userChannel = message.member.voice.channel;
            if(userChannel) {
                let audioFileToPlay = await getRandomFileFromDir(armyOfOneSoundsDir);
                let connection = await getOrCreateConnectionForGuild(message.guild.id, userChannel);
                let stream = connection.play(audioFileToPlay, {
                    volume: .4
                });
                return;
            }
        }

        if (/\$voiceline/i.test(message.content)) {
            let userChannel = message.member.voice.channel;
            if(userChannel) {
                let audioFileToPlay = await getRandomFileFromDir(drifterSoundsDir);
                let connection = await getOrCreateConnectionForGuild(message.guild.id, userChannel);
                let stream = connection.play(audioFileToPlay, {
                    volume: .4
                });
                return;
            }
        }

        for(let meme of memeFinder) {
            if(meme.key.test(message.content)) {
                let randomResponse = selectRandom(meme.responses);
                if(randomResponse) return await message.channel.send(randomResponse);
            }
        }

        if (randInt(100) < 5) {
            const randomMessages = [
                "Wow, that's the dumbest thing I've ever seen. You should really be ashamed of yourself for that one.",
                "Weird kink, but okay...",
                "https://youtu.be/W4fx7gE2pGg",
                "https://matias.ma/nsfw/",
                "https://youtu.be/IdHTnpgpLDc",
                "http://www.ismycodeshit.com/",
                "https://youtu.be/32Ki6Gx2Pgk",
                "https://youtu.be/JmSqorj-EC0",
                "https://i.imgur.com/XtC4At2.jpg",
                "https://i.imgur.com/QwXDkfG.jpg",
                "https://youtu.be/7mBqm8uO4Cg"

            ];
            await message.channel.send(selectRandom(randomMessages));
        }
    }
});

client.login(CONFIG.DISCORD.LOGIN_TOKEN);