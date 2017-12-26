const readline = require("readline");
var fse = require("fs-extra");

const request = require("superagent");
var _ = require("lodash");
require("superagent-proxy")(request);
var proxy = "http://127.0.0.1:1080";

var movieList = [];
var movieSimples = [];
var filen = 0;
// var intentName = "search";
// var simplefile = "searchword.txt";
var intentName = "greetings";
var simplefile = "greetings.txt";
var savepath = "simple_greetings";
var getSavePath = () => {
    return `/${savepath}/simple_${filen}.json`;
};

const fs = require("fs");

const rl = readline.createInterface({
    input: fs.createReadStream(simplefile)
});

rl.on("line", line => {
    if (line == "") return;
    console.log("..");
    console.log(line);
    console.log("Line from file:", line);
    let word = line;
    let simpleObj = {
        text: word,
        intentName: intentName,
        entityLabels: []
    };
    if (movieSimples.length < 100) {
        movieSimples.push(simpleObj);
    } else {
        writeJsonF();
        movieSimples = [];
    }
});

rl.on("close", () => {
    // writer.writeRecord(data);

    if (movieSimples.length > 0) {
        writeJsonF();
        movieSimples = [];
    }

    console.log(" end");
});
writeJsonF = () => {
    try {
        fse.writeJsonSync(__dirname + getSavePath(), movieSimples);
    } catch (err) {
        console.log(`Error w utterance json:  ${err.message} `);
        //throw err;
    }
    filen += 1;
};
