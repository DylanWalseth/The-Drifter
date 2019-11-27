require('source-map-support').install();

import {Client as DiscordClient, TextChannel, VoiceChannel, VoiceConnection, GuildMember} from 'discord.js';
import {promisify} from 'util';
import {createClient, RedisClient} from 'redis';
import {checkToxicity, Attribute} from "./external-services/perspective-api";
import moment from 'moment';
import * as fs from 'fs';
import * as path from 'path';
import { CONFIG } from './config';
import { randInt, selectRandom } from './utils/math-utils';
import { main } from './external-services/destiny-api';
import { Stream, Duplex } from 'stream';

const redisClientPrebinded: RedisClient = createClient();
const getAsync: (key: string) => Promise<string> = promisify(redisClientPrebinded.get).bind(redisClientPrebinded);
const setAsync: (key: string, value: string) => Promise<void> = promisify(redisClientPrebinded.set).bind(redisClientPrebinded);
const redisClient: RedisClient & {getAsync: (key: string) => Promise<string>, setAsync: (key: string, value: string) => Promise<void>} = { ...redisClientPrebinded, getAsync, setAsync } as any;

const soundsDir = path.join(__dirname, "..", "sounds", "memes");
const drifterSoundsDir = path.join(__dirname, "..", "sounds", "drifter-lines");
const armyOfOneSoundsDir = path.join(__dirname, "..", "sounds", "army-of-one");
const client = new DiscordClient();
client.on('ready', async () => {
    console.log("Online");
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
client.on('message', async message => {
    if(/\$setchannel/i.test(message.content)) {
        let guild = (message.channel as TextChannel).guild;
        if(!guild) return;
        await redisClient.setAsync(guild.id, message.channel.id);
        await message.channel.send("Channel set as trash bin!");
        return;
    }
    const textChannelId = await redisClient.getAsync(message.guild.id);
    if (message.channel.id === textChannelId && !message.member.user.bot) {
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