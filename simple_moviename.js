const readline = require("readline");
var fse = require("fs-extra");
var rp = require("request-promise");
var path = require("path");

const request = require("superagent");
var _ = require("lodash");
require("superagent-proxy")(request);
var proxy = "http://127.0.0.1:1080";

var movieList = [];
var movieSimples = [];
var filen = 0;
var moviedb = require("./tmdb.js");

var intentName = "search";

var savepath = "simple_movieName";

const LUIS_programmaticKey = "3fef2f7e9fed4310bd7faea51c2d2609";
// ID of your LUIS app to which you want to add an utterance
const LUIS_appId = "cc01a368-404c-4e2b-a70a-60b71575ea10";
// The version number of your LUIS app
const LUIS_versionId = "0.1";

var configAddUtterance = {
    LUIS_subscriptionKey: LUIS_programmaticKey,
    LUIS_appId: LUIS_appId,
    LUIS_versionId: LUIS_versionId,
    uri: "https://westeurope.api.cognitive.microsoft.com/luis/api/v2.0/apps/{appId}/versions/{versionId}/examples"
        .replace("{appId}", LUIS_appId)
        .replace("{versionId}", LUIS_versionId)
};

var getSavePath = () => {
    return `/${savepath}/simple_${filen}.json`;
};

var discoverMovie = async function(n = 1) {
    try {
        return await moviedb.discoverMovie({
            page: n
        });
    } catch (e) {
        console.log(e);
    }
};
var main = async n => {
    let res = await discoverMovie(n);
    let page = res.page;
    let total_pages = res.total_pages;
    let results = res.results;

    for (obj of results) {
        // console.log(obj);

        let simpleObj = {
            text: obj.title,
            intentName: intentName,
            entityLabels: [
                {
                    entityName: "movieName",
                    startCharIndex: 0,
                    endCharIndex: obj.title.length - 1
                }
            ]
        };
        console.log("movieSimples.length:", movieSimples.length);

        if (movieSimples.length < 100) {
            movieSimples.push(simpleObj);
        } else {
            // writeJsonF();
            await addUtterance(configAddUtterance, movieSimples).then(() => {
                console.log("Add utterance complete.");
            });
            movieSimples = [];
        }
    }
    console.log("end movieSimples.length:", movieSimples.length);
    if (page !== 100) {
        await main(page + 1);
    }
    if (movieSimples.length > 0) {
        // writeJsonF();
        await addUtterance(configAddUtterance, movieSimples).then(() => {
            console.log("Add utterance complete.");
        });
        movieSimples = [];
    }
};
main(1);
var addUtterance = async (config, jsonObj) => {
    try {
        // Extract the JSON for the request body
        // The contents of the file to upload need to be in this format described in the comments above.
        var jsonUtterance = jsonObj;

        // Add an utterance
        var utterancePromise = sendUtteranceToApi({
            uri: config.uri,
            method: "POST",
            headers: {
                "Ocp-Apim-Subscription-Key": config.LUIS_subscriptionKey
            },
            json: true,
            body: jsonUtterance
        });

        let results = await utterancePromise;

        console.log("Add utterance done");
    } catch (err) {
        console.log(`Error adding utterance:  ${err.message} `);
        //throw err;
    }
};
var sendUtteranceToApi = async options => {
    try {
        var response;
        if (options.method === "POST") {
            response = await rp.post(options);
        } else if (options.method === "GET") {
            response = await rp.get(options);
        }

        return { request: options.body, response: response };
    } catch (err) {
        throw err;
    }
};
// writeJsonF = () => {
//     try {
//         fse.writeJsonSync(__dirname + getSavePath(), movieSimples);
//     } catch (err) {
//         console.log(`Error w utterance json:  ${err.message} `);
//         //throw err;
//     }
//     filen += 1;
// };
