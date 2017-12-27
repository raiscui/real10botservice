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

var configGetInfo = {
    LUIS_subscriptionKey: LUIS_programmaticKey,
    LUIS_appId: LUIS_appId,
    LUIS_versionId: LUIS_versionId,
    uri: "https://westeurope.api.cognitive.microsoft.com/luis/api/v2.0/apps/{appId}/versions/{versionId}/features"
        .replace("{appId}", LUIS_appId)
        .replace("{versionId}", LUIS_versionId)
};
var configSetInfo = {
    LUIS_subscriptionKey: LUIS_programmaticKey,
    LUIS_appId: LUIS_appId,
    LUIS_versionId: LUIS_versionId,
    uri: "https://westeurope.api.cognitive.microsoft.com/luis/api/v2.0/apps/{appId}/versions/{versionId}/phraselists/{plid}"
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

        // let simpleObj = {
        //     text: obj.title,
        //     intentName: intentName,
        //     entityLabels: [
        //         {
        //             entityName: "movieName",
        //             startCharIndex: 0,
        //             endCharIndex: obj.title.length - 1
        //         }
        //     ]
        // };
        console.log("movieSimples.length:", movieSimples.length);

        movieSimples.push(obj.title);
    }
    console.log("end movieSimples.length:", movieSimples.length);
    if (page !== 300) {
        await main(page + 1);
    }
};
main(1).then(() => {
    console.log(movieSimples);
    // https://westeurope.api.cognitive.microsoft.com/luis/api/v2.0/apps/cc01a368-404c-4e2b-a70a-60b71575ea10/versions/0.1/features
    getInfo(configGetInfo)
        .then(res => {
            console.log(res.response);
            var plf = _.find(res.response.phraselistFeatures, {
                name: "movie-Name"
            });
            console.log(plf);
            plf.phrases += "," + movieSimples.join(",");
            setInfo(configSetInfo, plf)
                .then(console.log)
                .catch(console.error);
        })
        .catch(console.error);
});

var setInfo = async (config, bodys) => {
    try {
        var apiPromise = sendToApi({
            uri: config.uri.replace("{plid}", bodys.id),
            method: "PUT",
            headers: {
                "Ocp-Apim-Subscription-Key": config.LUIS_subscriptionKey
            },
            json: true,
            body: bodys
        });

        return await apiPromise;

        console.log("Add utterance done");
    } catch (err) {
        console.log(`Error adding utterance:  ${err.message} `);
        //throw err;
    }
};
var getInfo = async config => {
    try {
        var apiPromise = sendToApi({
            uri: config.uri,
            method: "GET",
            headers: {
                "Ocp-Apim-Subscription-Key": config.LUIS_subscriptionKey
            },
            json: true
        });

        return await apiPromise;

        console.log("Add utterance done");
    } catch (err) {
        console.log(`Error adding utterance:  ${err.message} `);
        //throw err;
    }
};
var sendToApi = async options => {
    try {
        // console.log(options);

        var response;
        if (options.method === "POST") {
            response = await rp.post(options);
        } else if (options.method === "GET") {
            response = await rp.get(options);
        } else if (options.method === "PUT") {
            response = await rp.put(options);
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
