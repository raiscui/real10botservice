const readline = require("readline");
var fse = require("fs-extra");
// const rl = readline.createInterface({
//     input: fs.createReadStream("movie1.csv")
// });

// rl.on("line", line => {
//     console.log("Line from file:", line);
// });

const request = require("superagent");
var _ = require("lodash");
require("superagent-proxy")(request);
var proxy = "http://127.0.0.1:1080";

var csv = require("ya-csv");
// var reader = csv.createCsvFileReader("movie.csv", {
//     separator: ",",
//     quote: "",
//     escape: "",
//     comment: ""
// });
var reader = csv.createCsvFileReader("movie1.csv", {
    separator: ";",
    quote: '"',
    escape: '"',
    comment: '"'
});
// var wstream = fs.createWriteStream("movie1.csv");
// var writer = new csv.CsvWriter(wstream, {
//     separator: ";",
//     quote: '"',
//     escape: '"'
// });
// var writer = new csv.CsvWriter(process.stdout);
var movieList = [];
var movieSimples = [];
var filen = 0;
var act = ["get", "watch", "watching", "looking", "find", "search"];
reader.addListener("data", function(data) {
    // writer.writeRecord(data);
    // console.log("=================");
    console.log("..");
    console.log(data);
    // let amovie = { value: data[0], language: "en" };

    let word = _.sample(act) + " " + data[0];
    let simpleObj = {
        text: word,
        intentName: "search",
        entityLabels: []
    };
    if (movieSimples.length < 100) {
        movieSimples.push(simpleObj);
    } else {
        writeJsonF();
        movieSimples = [];
    }
});
reader.addListener("end", function(data) {
    // writer.writeRecord(data);

    if (movieSimples.length > 0) {
        writeJsonF();
        movieSimples = [];
    }

    console.log(" end");
});
writeJsonF = () => {
    try {
        fse.writeJsonSync(
            __dirname + `/simple/simple_${filen}.json`,
            movieSimples
        );
    } catch (err) {
        console.log(`Error w utterance json:  ${err.message} `);
        //throw err;
    }
    filen += 1;
};
