/*-----------------------------------------------------------------------------
A simple echo bot for the Microsoft Bot Framework. 
-----------------------------------------------------------------------------*/
if (!process.env.MicrosoftAppI) {
    require("dotenv-extended").load();
}
let moment = require("moment");
require("minilog").enable();
let log = require("minilog")("bot");
// let debug = log.debug.bind(log);
let _ = require("lodash");
let fp = require("lodash/fp");
var restify = require("restify");
var builder = require("botbuilder");
var botbuilder_azure = require("botbuilder-azure");
var moviedb = require("./tmdb.js");
var { movieGenre } = require("./genre");
var moviedbConfig;
moviedb.configuration().then(res => {
    moviedbConfig = res;
    log.debug("config: %j", moviedbConfig);
});

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function() {
    console.log("%s listening to %s", server.name, server.url);
});

// Create chat connector for communicating with the Bot Framework Service
var connector = new builder.ChatConnector({
    appId: process.env.MicrosoftAppId,
    appPassword: process.env.MicrosoftAppPassword,
    openIdMetadata: process.env.BotOpenIdMetadata
});

// Listen for messages from users
server.post("/api/messages", connector.listen());

/*----------------------------------------------------------------------------------------
* Bot Storage: This is a great spot to register the private state storage for your bot. 
* We provide adapters for Azure Table, CosmosDb, SQL Azure, or you can implement your own!
* For samples and documentation, see: https://github.com/Microsoft/BotBuilder-Azure
* ---------------------------------------------------------------------------------------- */

var tableName = "botdata";
var azureTableClient = new botbuilder_azure.AzureTableClient(
    tableName,
    process.env["AzureWebJobsStorage"]
);
var tableStorage = new botbuilder_azure.AzureBotStorage(
    { gzipData: false },
    azureTableClient
);

// Create your bot with a function to receive messages from the user
var bot = new builder.UniversalBot(connector);
// bot.set("storage", tableStorage);
var inMemoryStorage = new builder.MemoryBotStorage();
bot.set("storage", inMemoryStorage);

bot.on("conversationUpdate", message => {
    // console.log(message);
    if (message.membersAdded) {
        message.membersAdded.forEach(identity => {
            // 当启动, 有两个用户加进来 , 用户 和 bot, 分辨 bot
            if (identity.id == message.address.bot.id) {
                const reply = new builder.Message()
                    .address(message.address)
                    .text("How can I help you?");
                bot.send(reply);
            }
        });
    }
});

// Make sure you add code to validate these fields
var luisAppId = process.env.LuisAppId;
var luisAPIKey = process.env.LuisAPIKey;
var BING_Spell_Check_API_KEY = process.env.BING_Spell_Check_API_KEY;
var luisAPIHostName =
    process.env.LuisAPIHostName || "westus.api.cognitive.microsoft.com";

const LuisModelUrl =
    "https://" +
    luisAPIHostName +
    "/luis/v2.0/apps/" +
    luisAppId +
    "?subscription-key=" +
    luisAPIKey +
    "&verbose=true&timezoneOffset=0" +
    // "&spellCheck=true&bing-spell-check-subscription-key=" +
    // BING_Spell_Check_API_KEY +
    "&q=";

// Main dialog with LUIS
var recognizer = new builder.LuisRecognizer(LuisModelUrl);
recognizer.onEnabled((ctx, cb) => {
    // log.debug("===========luis on enabled");
    // log.debug(ctx);
    log.debug("msg:", ctx.message.text);
    cb(null, true);
});
recognizer.onFilter((ctx, res, cb) => {
    log.debug("===========luis onFilter");
    // log.debug(ctx);
    log.debug(res);

    // cb(null, true);
    cb(null, res);
});
// bot.recognizer(recognizer);
var intents = new builder.IntentDialog({ recognizers: [recognizer] })
    .onBegin((session, args, next) => {
        log("in / intents");

        // session.send("in /");

        // session.send("/ begin:arg: %j", args);
        // session.send("stste %j", session.sessionState);
        // let data = _.pick(session, [
        //     "message.text",
        //     "conversationData",
        //     "dialogData"
        // ]);
        log.debug("/ ");
        // session.send("/ %j", data);

        next();
    })
    // Utilities.StartOver
    .matchesAny(["Utilities.StartOver", "Utilities.Cancel"], session => {
        log.debug(intents);
        session.endConversation([
            "OK,let's begin",
            "How can I help you?",
            "I'm back!"
        ]);
    })
    .matches("Utilities.Help", (session, args) => {
        log.debug("=========!!!!!!!!!! help  !!!");
        session.beginDialog("/help");
    })
    .matches("Utilities.ShowNext", "/next")
    .matchesAny(["Utilities.GoBack", "Utilities.ShowPrevious"], "/goback")
    .matchesAny(["search"], "/search")
    .matches("greetings", "/greetings")
    .onDefault((session, args) => {
        session.conversationData.search = session.conversationData.search || {
            use: "discover"
        };
        let searchData = session.conversationData.search;

        let skw = filterKeyWord(session, args);
        let actorKw = builder.EntityRecognizer.findAllEntities(
            args.entities,
            "actor"
        );
        if (skw) {
            searchData.q = {
                query: skw,
                page: 1,
                sort_by: "popularity.desc"
            };

            delete searchData.q["primary_release_date.gte"];
            delete searchData.q["primary_release_date.lte"];
            delete searchData.q.primary_release_year;
            delete searchData.q.with_genres;
            if (actorKw) {
                searchData.actor = actorKw;
            } else {
                delete searchData.actor;
            }
            searchData.use = "search";
        } else {
            delete searchData.q["primary_release_date.gte"];
            delete searchData.q["primary_release_date.lte"];
            delete searchData.q.primary_release_year;
            delete searchData.q.with_genres;
            delete searchData.actor;

            searchData.q.query = null;

            searchData.page = searchData.q.page = 1;
            searchData.use = "discover";
        }
        searchData.luo = true;

        // session.beginDialog("/doTmdbSearch");
        doTmdbSearch(session).then(() => {
            session.endDialog();
        });

        // session.send(
        //     "h Sorry, I did not understand '%s'.",
        //     session.message.text
        // );
    });
//genreKeyWord
function filterKeyWord(session, args) {
    let message = session.message.text;
    let actorKw = builder.EntityRecognizer.findAllEntities(
        args.entities,
        "actor"
    );

    let searchKeyWords = [].concat(
        builder.EntityRecognizer.findAllEntities(args.entities, "action"),
        builder.EntityRecognizer.findAllEntities(args.entities, "movie"),
        builder.EntityRecognizer.findAllEntities(args.entities, "genre"),
        builder.EntityRecognizer.findAllEntities(
            args.entities,
            "builtin.datetimeV2.datetimerange"
        ),
        builder.EntityRecognizer.findEntity(
            args.entities,
            "builtin.datetimeV2.daterange"
        ),
        builder.EntityRecognizer.findAllEntities(args.entities, "daici"),
        actorKw,
        builder.EntityRecognizer.findAllEntities(
            args.entities,
            "feedback::free"
        ),
        builder.EntityRecognizer.findAllEntities(args.entities, "genreKeyWord"),
        builder.EntityRecognizer.findEntity(args.entities, "all"),
        builder.EntityRecognizer.findEntity(args.entities, "movieSortType")
    );
    if (!_.isEmpty(searchKeyWords)) {
        // log.debug(searchKeyWords);
        let act = _.find(searchKeyWords, { type: "action" });
        log.debug("act find:", act);

        if (act) {
            message = message.slice(act.endIndex + 1);
            log.debug("message slice:", message);
        }

        let allw = _.map(searchKeyWords, _.property("entity")).concat([]);
        log.debug("allw:", allw);

        message = _.trim(
            _.reduce(
                allw,
                (msg, aw) => {
                    log.debug("msg:", msg, " aw:", aw);
                    return msg.replace(_.lowerCase(aw), "");
                },
                _.lowerCase(message)
            )
        );
        log.debug("message:", message);

        return message;
    } else {
        return message;
    }
}
bot.dialog("/search", [
    (session, args, next) => {
        // • • • • •
        session.conversationData.search = session.conversationData.search || {
            use: "discover"
        };

        let searchData = session.conversationData.search;
        searchData.qs = null;
        searchData.page = 1;
        searchData.q = searchData.q || { sort_by: "popularity.desc" };
        searchData.q.page = 1;
        // • • • • •
        let data = _.pick(session, [
            "message.text",
            "conversationData",
            "dialogData"
        ]);
        log.debug("/ search");
        log.debug(searchData.q);

        if (searchData.q.query) {
            // session.send("last movie name use : %s", searchData.q.query);
        }
        // session.send("stste %j", session.sessionState);

        // session.send("/ search %j", data);
        // session.send("/ search arg: %j", args);

        // movie ─────────────────────────────────────────────────────────────────
        /**
         * {
         *  entity: 'movies',
         * type: 'movie',
         *  startIndex: 10,
         *  endIndex: 15,
         *  score: 0.8963896 }
         * score is dyn
         */
        var _movie = builder.EntityRecognizer.findAllEntities(
            args.entities,
            "movie"
        );
        let movie = !_.isEmpty(_movie);

        //  actor ─────────────────────────────────────────────────────────────────
        // builtin.encyclopedia.people.person
        let actors = builder.EntityRecognizer.findAllEntities(
            args.entities,
            "builtin.encyclopedia.people.person"
        );
        log.debug(" actors:", actors);
        // actor = _.chain(actors)
        //     .map(entitie => {
        //         entitie.score = entitie.score || 1.0;
        //         return entitie;
        //     })
        //     .filter(entitie => {
        //         return entitie.score > 0.4 || !entitie.score;
        //     })

        //     .maxBy("score")
        //     .get("entity")
        //     .value();
        actor = _.chain(actors)
            // .map(entitie => {
            //     entitie.score = entitie.score || 1.0;
            //     return entitie;
            // })
            .filter(entitie => {
                return entitie.score > 0.4 || !entitie.score;
            })
            .first()

            // .maxBy("score")
            .get("entity")
            .value();

        if (actor && !searchData.actor) {
            //new
            log.debug("find actor:", actor);
            searchData.actor = actor;
            delete searchData.actorIds;
            searchData.page = searchData.q.page = 1;
        } else if (actor && searchData.actor) {
            searchData.page = searchData.q.page = 1;

            //change
            log.debug("find actor:", actor);
            if (searchData.actor != actor) {
                searchData.actor = actor;
                delete searchData.actorIds;
            }
        } else if (!actor && searchData.actor) {
            // keep
        } else if (!actor && !searchData.actor) {
            // no have
        }

        //primary_release_year
        // if (daterange)

        // let p_datetimerange = builder.EntityRecognizer.parseTime([
        //     datetimerange
        // ]);

        // movieNames ─────────────────────────────────────────────────────────────────

        let movieNames = [].concat(
            builder.EntityRecognizer.findAllEntities(
                args.entities,
                "builtin.encyclopedia.film.film"
            ),
            builder.EntityRecognizer.findAllEntities(args.entities, "movieName")
        );

        let movieName = _.chain(movieNames)
            .map(entitie => {
                entitie.score = entitie.score || 1.0;
                return entitie;
            })
            .filter(entitie => {
                return entitie.score > 0.5;
            })
            .maxBy("score")
            .get("entity")
            .value();
        if (movieName) {
            log.debug("find movieName:", movieName);
            searchData.q.with_genres = null;
            searchData.actor = null;
        }

        // ─────────────────────────────────────────────────────────────────

        if ((movieName || actor) && !searchData.q.query) {
            // 新发现
            searchData.page = searchData.q.page = 1;
            searchData.q.query = movieName || actor;
            searchData.use = "search";
            delete searchData.q["primary_release_date.gte"];
            delete searchData.q["primary_release_date.lte"];
            delete searchData.q.primary_release_year;
            session.send("search  %s", movieName || actor);
        } else if ((movieName || actor) && searchData.q.query) {
            // 替换
            if ((movieName || actor) != searchData.q.query) {
                searchData.q.query = movieName || actor;
                searchData.page = searchData.q.page = 1;
                searchData.use = "search";
                delete searchData.q["primary_release_date.gte"];
                delete searchData.q["primary_release_date.lte"];
                delete searchData.q.primary_release_year;
                session.send("change search words to %s", movieName || actor);
            }
        } else if (!(movieName || actor) && searchData.q.query) {
            // 没新的
        } else {
            // all null
        }

        // • • • • • tv
        let tvName = fp.get("entity")(
            fp.first(
                fp.find(entitie => {
                    if (!entitie) {
                        return false;
                    }
                    return entitie.score > 0.5;
                })(
                    builder.EntityRecognizer.findAllEntities(
                        args.entities,
                        "builtin.encyclopedia.tv.program"
                    )
                )
            )
        );
        let hasTvName = tvName && !_.includes(["search"], tvName);
        if (hasTvName) {
            searchData.tv = true;
        }

        // ─────────────────────────────────────────────────────────────────

        // • • • • •
        //
        // DATE TIME
        //

        let dateTimeRange = builder.EntityRecognizer.findEntity(
            args.entities,
            "builtin.datetimeV2.datetimerange"
        );
        if (dateTimeRange) {
            let day = moment(
                fp.first(dateTimeRange.resolution.values)["start"]
            );
            if (day.format("L") == moment().format("L")) {
                searchData.q["primary_release_date.gte"] = moment()
                    .add(-2, "week")
                    .format("YYYY-MM-DD");
                searchData.q["primary_release_date.lte"] = moment().format(
                    "YYYY-MM-DD"
                );
            }
            session.send([
                "I will finding some movies are in theatres ",
                "Here is some movies released within a month",
                "Top Movie!"
            ]);
        }
        let dateRange = builder.EntityRecognizer.findEntity(
            args.entities,
            "builtin.datetimeV2.daterange"
        );

        log.debug("date range", dateRange);
        if (dateRange) {
            let start = moment(fp.first(dateRange.resolution.values)["start"]);
            let end = moment(fp.first(dateRange.resolution.values)["end"]);
            searchData.q["primary_release_date.gte"] = start.format(
                "YYYY-MM-DD"
            );
            searchData.q["primary_release_date.lte"] = end.format("YYYY-MM-DD");
            session.send([
                "searching  movies released in " + dateRange.entity,
                "will find movies for " + dateRange.entity
            ]);
        }
        // ────────────────────────────────────────────────────────────────────────────────

        let someOther = builder.EntityRecognizer.findAllEntities(
            args.entities,
            "feedback::free"
        );

        // if (someOther) {
        //     // 要其他的 , 就删了 电影名字
        //     searchData.q.query = null;
        //     searchData.use = "discover";
        // }

        // ─────────────────────────────────────────────────────────────────

        let genresE = builder.EntityRecognizer.findAllEntities(
            args.entities,
            "genre"
        );
        let genres = _.chain(genresE).map("resolution.values[0]");
        // log.debug("genres:===>", genres);

        let gIds = _.chain(movieGenre)
            .filter(
                _.overSome(
                    genres
                        .map(g => {
                            return {
                                name: g
                            };
                        })
                        .value()
                )
            )
            .map("id")
            .join(",")
            .value();
        log.debug("gids:", gIds);
        if (gIds) {
            searchData.use = "discover";
            searchData.q.with_genres = gIds;
        }

        let all = builder.EntityRecognizer.findEntity(args.entities, "all");
        if (all) {
            delete searchData.q.with_genres;
        }
        // sort type ─────────────────────────────────────────────────────────────────

        let sortTypeE = builder.EntityRecognizer.findEntity(
            args.entities,
            "movieSortType"
        );
        let sortType = _.get(sortTypeE, "resolution.values[0]");

        if (sortType == "top") {
            searchData.q.sort_by = "popularity.desc";
            searchData.use = "discover";
        }
        if (sortType == "new") {
            searchData.q.sort_by = "release_date.desc";
            searchData.use = "discover";
        }
        if (sortType == "best") {
            searchData.q.sort_by = "vote_average.desc";
            searchData.use = "discover";
        }

        // ─────────────────────────────────────────────────────────────────

        if (
            // _.isEmpty(searchKeyWords) &&
            !dateTimeRange &&
            !dateRange &&
            !movieName &&
            !actor &&
            !gIds &&
            !all &&
            !sortType
        ) {
            log.debug("========================= KeyWords empty ");
            // 吧 电影名字 什么的 搜索词过滤出来
            let skw = filterKeyWord(session, args);
            let actorKw = builder.EntityRecognizer.findAllEntities(
                args.entities,
                "actor"
            );

            if (skw) {
                searchData.q = {
                    query: skw,
                    page: 1,
                    sort_by: "popularity.desc"
                };
                delete searchData.q["primary_release_date.gte"];
                delete searchData.q["primary_release_date.lte"];
                delete searchData.q.primary_release_year;
                delete searchData.q.with_genres;
                if (actorKw) {
                    searchData.actor = actorKw;
                } else {
                    delete searchData.actor;
                }
                searchData.use = "search";
            } else {
                // 啥都没过滤出来 空了, 就discover
                delete searchData.q["primary_release_date.gte"];
                delete searchData.q["primary_release_date.lte"];
                delete searchData.q.primary_release_year;
                delete searchData.q.with_genres;
                delete searchData.actor;
                delete searchData.q.query;
                searchData.page = searchData.q.page = 1;
                searchData.use = "discover";
            }
            searchData.luo = true;
        } else {
            searchData.luo = false;
        }

        // ─────────────────────────────────────────────────────────────────

        log.debug(movie);
        log.debug(movieName);

        // log.debug("===========will tmdb search ..");
        // if (!process.env.BotEnv) session.send("===========will tmdb search ..");

        // session.beginDialog("/doTmdbSearch");
        // log.debug("===========did tmdb search ..");
        // if (!process.env.BotEnv) session.send("===========did tmdb search ..");
        doTmdbSearch(session).then(() => {
            if (
                !searchData.actor &&
                !searchData.q.with_genres &&
                searchData.use == "discover"
            ) {
                builder.Prompts.text(session, [
                    "What movie genre or actor you like?",
                    "emm.. you can use actor name find movie"
                ]);
            } else if (
                !searchData.actor &&
                searchData.use == "discover" &&
                !searchData.stopconfirm
            ) {
                searchData.qs = "Johnny Depp";
                builder.Prompts.confirm(session, "how about Johnny Depp?");
            } else if (!searchData.q.with_genres) {
                builder.Prompts.text(session, [
                    "you can say 'action movie'|'romance movie'|'science fiction'|'war' define the genre ",
                    "you can say 'horror movie'|'fantasy movie'|'animation'|'adventure' define the genre "
                ]);
            } else {
                // searchData.qs = "restart";
                // builder.Prompts.confirm(session, "Do you want start over?");
                next({ response: "wait" });
            }
            // session.endDialog();
        });
    },
    (session, res) => {
        let searchData = session.conversationData.search;
        log.debug("res.response:============>>>", res.response);
        if (res.response == "done") {
            session.endConversation();
        } else if (res.response == "wait") {
            session.endDialog();
        } else if (typeof res.response == "boolean") {
            if (res.response && searchData.qs == "Johnny Depp") {
                session.message.text = "Johnny Depp";

                intents.recognize(session, (err, ress) => {
                    // session.send(err);
                    // session.send("recognize res:%j", ress);
                    // session.routeToActiveDialog();
                    intents.replyReceived(session, ress);
                });
            } else if (
                res.response == false &&
                searchData.qs == "Johnny Depp"
            ) {
                searchData.stopconfirm = true;
                session.endDialog();
            }
        } else {
            session.message.text = res.response;

            intents.recognize(session, (err, ress) => {
                // session.send(err);
                // session.send("recognize res:%j", ress);
                // session.routeToActiveDialog();
                intents.replyReceived(session, ress);
            });
        }
    }
]);
intents.dialogResumed = (session, args) => {
    let data = _.pick(session, [
        "message.text",
        "conversationData",
        "dialogData"
    ]);
    log.debug("/ resume");
    // session.send("/ resume %j", data);
    log.debug("/ resume data %j", data);
    log.debug("/ resume args %j", args);
};

bot.dialog("/greetings", function(session, args) {
    // session.send("/greetings:arg: %j", args);

    session.send(["hello .", "Hi! there!"]);
    // session.send("stste %j", session.sessionState);
    session.endDialog();
});

bot.dialog("/next", function(session, args) {
    session.conversationData.search = session.conversationData.search || {
        use: "discover"
    };

    let searchData = session.conversationData.search;
    if (
        _.isEmpty(searchData) ||
        _.isNil(searchData.page) ||
        searchData.page >= (searchData.total_pages || 1)
    ) {
        if (searchData.page == searchData.total_pages && searchData.actor) {
            searchData.use = "discover";
            searchData.page = 0;

            session.send("next page actor...");
            searchData.q.page = searchData.page + 1;

            doTmdbSearch(session).then(() => {
                session.endDialog();
            });
        } else {
            session.endDialog("no next page");
        }
    } else {
        session.send("next page...");
        searchData.q.page = searchData.page + 1;

        doTmdbSearch(session).then(() => {
            session.endDialog();
        });
    }
});
bot.dialog("/goback", function(session, args) {
    session.conversationData.search = session.conversationData.search || {
        use: "discover"
    };

    let searchData = session.conversationData.search;
    if (
        _.isEmpty(searchData) ||
        _.isNil(searchData.page) ||
        searchData.page == 1
    ) {
        searchData.page = 1;

        session.endDialog("no Previous page");
    } else {
        session.send("Previous page...");
        searchData.q.page = searchData.page - 1;

        doTmdbSearch(session).then(() => {
            session.endDialog();
        });
    }
});
// var helpintents = new builder.IntentDialog({
//     recognizers: [recognizer],
//     recognizeMode: builder.RecognizeMode.onBegin
// })

//     // .onBegin((session, args, next) => {
//     //     log("in help intents");
//     //     session.send("in help");
//     //     session.message.text = "-==";
//     //     helpintents.recognize(session, (err, res) => {
//     //         session.send("helpintents.recognize");
//     //         session.send(err);
//     //         session.send("recognize res:%j", res);
//     //         helpintents.replyReceived(session, res);
//     //     });
//     //     session.send("/help begin:arg: %j", args);
//     //     let data = _.pick(session, [
//     //         "message.text",
//     //         "conversationData",
//     //         "dialogData"
//     //     ]);
//     //     session.send("/help begin %j", data);
//     //     // next();
//     // })

//     .matches("Utilities.Help", (session, args) => {
//         session.conversationData.help = true;
//         let data = _.pick(session, ["conversationData", "dialogData"]);
//         log.debug("/help in help");
//         log.debug(data);
//         log.debug(args);
//         session.send([
//             'you can say "search matrix/star war" and "start over" to clear memory',
//             'eg: "find some movie published in this month"'
//         ]);
//         session.endDialogWithResult({ response: "help end" });
//     })
//     .matches("Utilities.Cancel", session => {
//         session.send(
//             "/ You reached Cancel intent, you said '%s'.",
//             session.message.text
//         );
//         session.endDialog(" end for Cancel");
//     })
//     .onDefault(session => {
//         // session.send('h: test channal.  only "help" you can say .');
//         session.endDialog();
//     })
//     .triggerAction({ matches: /help/i });

const handleErrorResponse = (session, error) => {
    session.send("Oops! Something went wrong. Try again later.");
    session.endConversation();
    console.error(error);
};
const handleApiResponse = (session, movies) => {
    if (movies && movies.constructor === Array && movies.length > 0) {
        log.debug(
            "handleApiResponse 1 =====>>  ",
            session.conversationData.search.total_pages,
            movies.slice(0, 3)
        );

        var cards = [];
        var cardsPush = function(movPersonList, resCards) {
            let tmpPids = [];
            // if (movPersonList.length>0 && (movPersonList[i].media_type &&
            //     movPersonList[i].media_type == "person")){

            // }
            for (var i = 0; i < movPersonList.length; i++) {
                if (
                    movPersonList[i].media_type &&
                    movPersonList[i].media_type == "person"
                ) {
                    if (tmpPids.length < 1) {
                        tmpPids.push(movPersonList[i].id);

                        resCards = cardsPush(
                            movPersonList[i].known_for,
                            resCards
                        );
                    }
                } else {
                    resCards.push(constructCard(session, movPersonList[i]));
                }
            }
            if (tmpPids.length != 0 && session.conversationData.search.actor) {
                session.conversationData.search.actorIds = tmpPids[0];
            }
            return resCards;
        };

        cards = cardsPush(movies, cards);

        if (!process.env.BotEnv) {
            cards = cards.slice(0, 3);
        }

        // create reply with Carousel AttachmentLayout
        var reply = new builder.Message(session)
            // .text(session.conversationData.search.total_pages.toString())
            .attachmentLayout(builder.AttachmentLayout.list)
            .attachments(cards);
        session.send(reply);
    } else {
        delete session.conversationData.search;
        session.send([
            "Couldn't find something for this one",
            "I can't find anything :(  maybe try other words"
        ]);
    }
};
var tmdbImagePath = (posterPath, back = false) => {
    if (back) {
        return `${moviedbConfig.images.base_url}${
            moviedbConfig.images.backdrop_sizes[
                moviedbConfig.images.backdrop_sizes.length - 2
            ]
        }${posterPath}`;
    }
    return `${moviedbConfig.images.base_url}${
        moviedbConfig.images.poster_sizes[
            moviedbConfig.images.poster_sizes.length - 3
        ]
    }${posterPath}`;
};
const constructCard = (session, movieCtx) => {
    if (movieCtx.name) {
        movieCtx.title = movieCtx.name;
    }
    return new builder.HeroCard(session)
        .title(movieCtx.title)
        .text(movieCtx.id.toString())
        .subtitle(tmdbImagePath(movieCtx.backdrop_path, true))
        .images([
            builder.CardImage.create(
                session,
                tmdbImagePath(movieCtx.poster_path)
            )
        ]);
    // .buttons([
    //     builder.CardAction.openUrl(session, image.hostPageUrl, "Buy from merchant"),
    //     builder.CardAction.openUrl(session, image.webSearchUrl, "Find more in Bing")
    // ])
};
bot.dialog("/", intents);
bot
    .dialog("/help", (session, args) => {
        session.conversationData.help = true;
        let data = _.pick(session, ["conversationData", "dialogData"]);
        log.debug("/help in help");
        log.debug(data);
        log.debug(args);
        session.send([
            'you can say "search <<matrix>>/<<star war>>" or "start over" to clear memory',

            'eg: "find some movie published in this month"'
        ]);
        session.endDialogWithResult({ response: "help end" });
    })
    .triggerAction({ matches: /help/i });

// bot.dialog("/doTmdbSearch", doTmdbSearch);
async function doTmdbSearch(session) {
    let searchData = session.conversationData.search || {
        use: "discover"
    };

    if (
        searchData.actor &&
        (searchData.q.with_genres ||
            searchData.q["primary_release_date.gte"] ||
            searchData.q["primary_release_date.lte"] ||
            searchData.q.primary_release_year ||
            searchData.use == "discover") &&
        !searchData.luo
    ) {
        // 某演员 某类型 的电影
        log.debug("=================>>> 某演员 某类型/时间 的电影");

        if (!searchData.actorIds) {
            log.debug("=================>>>finded person0:");
            try {
                res = await moviedb.searchPerson({ query: searchData.actor });
            } catch (error) {
                handleErrorResponse(session, error);
            }

            log.debug("=================>>>finded person:", res);
            if (res.results.length != 0) {
                log.debug(
                    "=================>>>finded person2:",
                    res.results[0].id
                );

                searchData.actorIds = res.results[0].id;
            } else {
                let tmpact = searchData.actor;
                searchData.actor = null;

                session.endDialog([
                    tmpact + " not find.",
                    "Can not find " + tmpact
                ]);
            }
        }
        log.debug("=================>>>finded person3:", searchData.actorIds);

        delete searchData.q.query;
        searchData.q.with_people = searchData.actorIds;
        searchData.use = "discover";
    }

    if (searchData.use == "search") {
        let searchFn;
        log.debug("use search");
        if (searchData.q.query) {
            if (_.has(searchData, ["q", "primary_release_date.gte"])) {
                searchData.q.primary_release_year = moment(
                    searchData.q["primary_release_date.gte"]
                ).format("YYYY");
                log.debug("===> use movie search:", searchData.q);
                searchFn = moviedb.searchMovie;
            } else {
                log.debug("===> use Multi search:", searchData.q);
                searchFn = moviedb.searchMulti;
            }

            // searchFn = moviedb.searchMovie;

            log.debug("searchData.q:", searchData.q);

            try {
                res = await searchFn(searchData.q);
            } catch (error) {
                handleErrorResponse(session, error);
            }

            // log.info(res)
            searchData.page = res.page;
            searchData.total_pages = res.total_pages;
            handleApiResponse(session, res.results);
        }
    } else if (searchData.use == "discover") {
        log.debug("use discover:", searchData.q);
        if (searchData.tv) {
            try {
                res = await moviedb.discoverTv(searchData.q);
            } catch (error) {
                handleErrorResponse(session, error);
            }

            log.debug(res);
            searchData.page = res.page;
            searchData.total_pages = res.total_pages;
            handleApiResponse(session, res.results);
        } else {
            // if (searchData.q.query)

            try {
                res = await moviedb.discoverMovie(searchData.q);
            } catch (error) {
                handleErrorResponse(session, error);
            }

            // log.debug(res);
            searchData.page = res.page;
            searchData.total_pages = res.total_pages;
            handleApiResponse(session, res.results);
        }
    }
}
