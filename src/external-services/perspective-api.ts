import Axios from 'axios';
import { CONFIG } from '../../config';

const URL = `https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${CONFIG.GOOGLE_CLOUD.API_KEY}`;
export async function checkToxicity(message: string): Promise<ToxicityResponse> {
    let response = await Axios.post(URL, {
        comment: {
            text: message
        },
        languages: ["en"],
        requestedAttributes: {
            "FLIRTATION": {
                "scoreThreshold": .8
            },
            "THREAT": {
                "scoreThreshold": .8
            },
            "IDENTITY_ATTACK": {
                "scoreThreshold": .8
            },
            "INSULT": {
                "scoreThreshold": .8
            } ,
            "SEXUALLY_EXPLICIT": {
                "scoreThreshold": .8
            },
            "TOXICITY": {
                "scoreThreshold": .8
            },
            "PROFANITY": {
                "scoreThreshold": .8
            },
            "SEVERE_TOXICITY": {
                "scoreThreshold": .8
            }
          },
          "doNotStore": true
    });
    return response.data;
}

export declare type Attribute = "FLIRTATION" | "THREAT" | "IDENTITY_ATTACK" | "INSULT" | "SEXUALLY_EXPLICIT" | "TOXICITY" | "SEVERE_TOXICITY" | "PROFANITY"
export declare type ToxicityResponse = {
    "attributeScores": {
        [key in Attribute]: {
            "summaryScore": {
                "value": number,
                "type": "PROBABILITY"
            }
        }
    }
}