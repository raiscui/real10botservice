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
    console.log(message);
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
    log.debug("===========luis on enabled");
    cb(null, true);
});
// bot.recognizer(recognizer);
var intents = new builder.IntentDialog({ recognizers: [recognizer] })
    .onBegin((session, args, next) => {
        log("in / intents");

        // session.send("in /");

        // session.send("/ begin:arg: %j", args);
        // session.send("stste %j", session.sessionState);
        let data = _.pick(session, [
            "message.text",
            "conversationData",
            "dialogData"
        ]);
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
        let data = _.pick(session, ["conversationData", "dialogData"]);
        log.debug("/ in help");
        log.debug(data);
        log.debug(args);
        // session.send(
        //     "/ You reached Help intent, you said '%s'.",
        //     session.message.text
        // );
        session.beginDialog("/help");
    })
    .matches("Utilities.ShowNext", "/next")
    .matchesAny(["search"], "/search")
    .matches("greetings", "/greetings")
    .onDefault((session, args) => {
        session.conversationData.search = session.conversationData.search || {
            use: "discover"
        };
        let searchData = session.conversationData.search;

        let skw = filterKeyWord(session, args);
        if (skw) {
            searchData.q = {
                query: skw,
                page: 1
            };
            searchData.use = "search";
        } else {
            searchData.q.query = null;
            searchData.page = 1;
            searchData.use = "discover";
        }
        doTmdbSearch(searchData, session);
        session.endDialog();

        // session.send(
        //     "h Sorry, I did not understand '%s'.",
        //     session.message.text
        // );
    });
function filterKeyWord(session, args) {
    let message = session.message.text;
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
        builder.EntityRecognizer.findAllEntities(args.entities, "actor")
    );
    if (!_.isEmpty(searchKeyWords)) {
        log.debug(searchKeyWords);
        let act = _.find(searchKeyWords, { type: "action" });
        log.debug("act:", act);

        if (act) {
            message = message.slice(act.endIndex + 1);
            log.debug("message slice:", message);
        }

        let allw = _.map(searchKeyWords, _.property("entity")).concat([
            "finding",
            "searching",
            "search",
            "find",
            "watch",
            "watching",
            "looking for",
            "looking",
            "see",
            "seeing",
            "seeking"
        ]);
        log.debug("allw:", allw);

        message = _.trim(
            _.reduce(
                allw,
                (msg, aw) => {
                    log.debug("msg, aw", msg, aw);
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
        searchData.page = 1;
        searchData.q = searchData.q || { sort_by: "popularity.desc" };
        // • • • • •
        let data = _.pick(session, [
            "message.text",
            "conversationData",
            "dialogData"
        ]);
        log.debug("/ search");
        if (searchData.q.query) {
            session.send("last movie name use : %s", searchData.q.query);
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

        // • • • • •
        //
        // DATE TIME
        //

        let datetimerange = builder.EntityRecognizer.findEntity(
            args.entities,
            "builtin.datetimeV2.datetimerange"
        );
        if (datetimerange) {
            let day = moment(
                fp.first(datetimerange.resolution.values)["start"]
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
        let daterange = builder.EntityRecognizer.findEntity(
            args.entities,
            "builtin.datetimeV2.daterange"
        );

        log.debug("date range", daterange);
        if (daterange) {
            let start = moment(fp.first(daterange.resolution.values)["start"]);
            let end = moment(fp.first(daterange.resolution.values)["end"]);
            searchData.q["primary_release_date.gte"] = start.format(
                "YYYY-MM-DD"
            );
            searchData.q["primary_release_date.lte"] = end.format("YYYY-MM-DD");
            session.send([
                "searching  movies released in " + daterange.entity,
                "will find movies for " + daterange.entity
            ]);
        }
        //primary_release_year
        // if (daterange)

        // let p_datetimerange = builder.EntityRecognizer.parseTime([
        //     datetimerange
        // ]);

        // movieNames ─────────────────────────────────────────────────────────────────

        let movieNames = [].concat(
            builder.EntityRecognizer.findEntity(
                args.entities,
                "builtin.encyclopedia.film.film"
            ),
            builder.EntityRecognizer.findEntity(args.entities, "movieName")
        );

        let movieName = fp.get("entity")(
            fp.first(
                fp.find(entitie => {
                    if (!entitie) {
                        return false;
                    }
                    return entitie.score > 0.5;
                })(movieNames)
            )
        );

        if (movieName && !searchData.q.query) {
            // 新发现
            searchData.page = 1;
            searchData.q.query = movieName;
            searchData.use = "search";
            delete searchData.q["primary_release_date.gte"];
            delete searchData.q["primary_release_date.lte"];
            delete searchData.q.primary_release_year;
            session.send("search named %j", movieName);
        } else if (movieName && searchData.q.query) {
            // 替换
            searchData.q.query = movieName;
            searchData.page = 1;
            searchData.use = "search";
            delete searchData.q["primary_release_date.gte"];
            delete searchData.q["primary_release_date.lte"];
            delete searchData.q.primary_release_year;
            session.send("change name to %j", movieName);
        } else if (!movieName && searchData.q.query) {
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
        // • • • • •

        // • • • • • remove the "search" genre

        let someOther = fp.find(
            _.over([
                { entity: "some" },
                { entity: "other" },
                { entity: "another" },
                { entity: "else" }
            ])
        )(builder.EntityRecognizer.findAllEntities(args.entities, "genre"));

        if (someOther) {
            searchData.q.query = null;
            searchData.use = "discover";
        }

        // • • • • •

        let searchKeyWords = [].concat(
            builder.EntityRecognizer.findAllEntities(args.entities, "movie"),
            builder.EntityRecognizer.findAllEntities(args.entities, "genre")
        );

        // ─────────────────────────────────────────────────────────────────

        if (
            _.isEmpty(searchKeyWords) &&
            !datetimerange &&
            !daterange &&
            !movieName
        ) {
            log.debug("========================= empty ");
            let skw = filterKeyWord(session, args);
            if (skw) {
                searchData.q = {
                    query: skw,
                    page: 1
                };
                delete searchData.q["primary_release_date.gte"];
                delete searchData.q["primary_release_date.lte"];
                delete searchData.q.primary_release_year;
                searchData.use = "search";
            } else {
                searchData.q.query = null;
                searchData.page = 1;
                searchData.use = "discover";
            }
        }

        //  actor ─────────────────────────────────────────────────────────────────
        // builtin.encyclopedia.people.person
        let actor = builder.EntityRecognizer.findEntity(
            args.entities,
            "builtin.encyclopedia.people.person"
        );
        if (actor) {
            searchData.use = "search";
            searchData.page = 1;
            searchData.q.query = actor.entity;
            delete searchData.q["primary_release_date.gte"];
            delete searchData.q["primary_release_date.lte"];
            delete searchData.q.primary_release_year;
        }

        // ─────────────────────────────────────────────────────────────────

        log.debug(movie);
        log.debug(movieName);

        doTmdbSearch(searchData, session);
        session.endDialog();
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
    session.send("next page...");
    session.conversationData.search = session.conversationData.search || {
        use: "discover"
    };

    let searchData = session.conversationData.search;
    if (
        _.isEmpty(searchData) ||
        !searchData.page ||
        searchData.page == searchData.total_pages
    ) {
        searchData.page = searchData.total_pages = null;
        session.endDialog("no next page");
    } else {
        log.debug("go next.............");
    }
    searchData.q.page = searchData.page + 1;

    if (searchData.use == "search") {
        if (searchData.q.query) {
            log.debug("searchData.q:", searchData.q);
            moviedb
                .searchMovie(searchData.q)
                .then(res => {
                    // log.debug(res);
                    searchData.page = res.page;
                    searchData.total_pages = res.total_pages;
                    handleApiResponse(session, res.results);
                })
                .catch(error => {
                    handleErrorResponse(session, error);
                });
        }
    } else if (searchData.use == "discover") {
        if (searchData.tv) {
            moviedb
                .discoverTv(searchData.q)
                .then(res => {
                    // log.debug(res);
                    searchData.page = res.page;
                    searchData.total_pages = res.total_pages;
                    handleApiResponse(session, res.results);
                })
                .catch(error => {
                    handleErrorResponse(session, error);
                });
        } else {
            moviedb
                .discoverMovie(searchData.q)
                .then(res => {
                    log.debug(res);
                    searchData.page = res.page;
                    searchData.total_pages = res.total_pages;
                    handleApiResponse(session, res.results);
                })
                .catch(error => {
                    handleErrorResponse(session, error);
                });
        }
    } else {
        log.debug("no use var.............");
    }
    session.endDialog();
});
//     .triggerAction({
//         matches: /^(hd|hd)/i
//     });

var helpintents = new builder.IntentDialog({
    recognizers: [recognizer],
    recognizeMode: builder.RecognizeMode.onBegin
})

    // .onBegin((session, args, next) => {
    //     log("in help intents");
    //     session.send("in help");
    //     session.message.text = "-==";
    //     helpintents.recognize(session, (err, res) => {
    //         session.send("helpintents.recognize");
    //         session.send(err);
    //         session.send("recognize res:%j", res);
    //         helpintents.replyReceived(session, res);
    //     });
    //     session.send("/help begin:arg: %j", args);
    //     let data = _.pick(session, [
    //         "message.text",
    //         "conversationData",
    //         "dialogData"
    //     ]);
    //     session.send("/help begin %j", data);
    //     // next();
    // })

    .matches("Utilities.Help", (session, args) => {
        session.conversationData.help = true;
        let data = _.pick(session, ["conversationData", "dialogData"]);
        log.debug("/help in help");
        log.debug(data);
        log.debug(args);
        session.send([
            'you can say "search matrix/star war" and "start over" to clear memory',
            'eg: "find some movie published in this month"'
        ]);
        session.endDialogWithResult({ response: "help end" });
    })
    .matches("Utilities.Cancel", session => {
        session.send(
            "/ You reached Cancel intent, you said '%s'.",
            session.message.text
        );
        session.endDialog(" end for Cancel");
    })
    .onDefault(session => {
        session.send('h: test channal.  only "help" you can say .');
    });
//     .triggerAction({
//         matches: /^(hhhh|sssf)/i
//         // matches: "Utilities.Help"
//     });
// helpintents.addDialogTrigger(intents, "helpDialog");
const handleErrorResponse = (session, error) => {
    session.send("Oops! Something went wrong. Try again later.");
    console.error(error);
};
const handleApiResponse = (session, movies) => {
    if (movies && movies.constructor === Array && movies.length > 0) {
        if (movies.media_type) {
            // "media_type": "person",
            movies = _.find(
                movies,
                _.over([{ media_type: "movie" }, { media_type: "tv" }])
            );
        }
        var cards = [];
        for (var i = 0; i < movies.length; i++) {
            cards.push(constructCard(session, movies[i]));
        }

        // create reply with Carousel AttachmentLayout
        var reply = new builder.Message(session)
            // .text(session.conversationData.search.total_pages.toString())
            .attachmentLayout(builder.AttachmentLayout.list)
            .attachments(cards);
        session.send(reply);
    } else {
        session.send("Couldn't find movies for this one");
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
//movieCtx.poster_path
const constructCard = (session, movieCtx) => {
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
bot.dialog("/help", helpintents);
function doTmdbSearch(searchData, session) {
    if (searchData.use == "search") {
        let searchFn;
        log.debug("use search");
        if (searchData.q.query) {
            if (_.has(searchData, ["q", "primary_release_date.gte"])) {
                searchData.q.primary_release_year = moment(
                    searchData.q["primary_release_date.gte"]
                ).format("YYYY");
                searchFn = moviedb.searchMovie;
            } else {
                searchFn = moviedb.searchMulti;
            }
            log.debug("searchData.q:", searchData.q);
            searchFn(searchData.q)
                .then(res => {
                    // log.info(res)
                    searchData.page = res.page;
                    searchData.total_pages = res.total_pages;
                    handleApiResponse(session, res.results);
                })
                .catch(error => {
                    handleErrorResponse(session, error);
                });
        }
    } else if (searchData.use == "discover") {
        log.debug("use discover");
        if (searchData.tv) {
            moviedb
                .discoverTv(searchData.q)
                .then(res => {
                    // log.debug(res);
                    searchData.page = res.page;
                    searchData.total_pages = res.total_pages;
                    handleApiResponse(session, res.results);
                })
                .catch(error => {
                    handleErrorResponse(session, error);
                });
        } else {
            moviedb
                .discoverMovie(searchData.q)
                .then(res => {
                    // log.debug(res);
                    searchData.page = res.page;
                    searchData.total_pages = res.total_pages;
                    handleApiResponse(session, res.results);
                })
                .catch(error => {
                    handleErrorResponse(session, error);
                });
        }
    }
}
