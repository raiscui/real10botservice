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
            if (identity.id !== message.address.bot.id) {
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

        session.send("in /");

        session.send("/ begin:arg: %j", args);
        session.send("stste %j", session.sessionState);
        let data = _.pick(session, [
            "message.text",
            "conversationData",
            "dialogData"
        ]);
        log.debug("/ ");
        session.send("/ %j", data);

        next();
    })
    // Utilities.StartOver
    .matchesAny(["Utilities.StartOver", "Utilities.Cancel"], session => {
        log.debug(intents);
        session.endConversation("OK,let's begin");
    })
    .matches("Utilities.Help", (session, args) => {
        let data = _.pick(session, ["conversationData", "dialogData"]);
        log.debug("/ in help");
        log.debug(data);
        log.debug(args);
        session.send(
            "/ You reached Help intent, you said '%s'.",
            session.message.text
        );
        session.beginDialog("/help");
    })
    .matches("Utilities.ShowNext", "/next")
    .matchesAny(
        ["search", "movieName", "movie", "builtin.encyclopedia.film.film"],
        [
            (session, args, next) => {
                // • • • • •
                session.conversationData.search = session.conversationData
                    .search || { use: "discover" };

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
                    session.send("last movie name : %s", searchData.q.query);
                }
                session.send("stste %j", session.sessionState);

                session.send("/ search %j", data);
                session.send("/ search arg: %j", args);
                session.send(
                    "You reached search intent, you said '%s'.",
                    session.message.text
                );

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
                        searchData.q[
                            "primary_release_date.lte"
                        ] = moment().format("YYYY-MM-DD");
                    }
                    session.send("I will finding some movies are in theatres ");
                }
                let daterange = builder.EntityRecognizer.findEntity(
                    args.entities,
                    "builtin.datetimeV2.daterange"
                );

                log.debug("date range", daterange);
                if (daterange) {
                    let start = moment(
                        fp.first(daterange.resolution.values)["start"]
                    );
                    let end = moment(
                        fp.first(daterange.resolution.values)["end"]
                    );
                    searchData.q["primary_release_date.gte"] = start.format(
                        "YYYY-MM-DD"
                    );
                    searchData.q["primary_release_date.lte"] = end.format(
                        "YYYY-MM-DD"
                    );
                    session.send(
                        "searching  movies released in " + daterange.entity
                    );
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
                    builder.EntityRecognizer.findAllEntities(
                        args.entities,
                        "movieName"
                    )
                );

                let movieName = fp.get("entity")(fp.first(movieNames));

                if (movieName && !searchData.q.query) {
                    // 新发现
                    searchData.q.query = movieName;
                    searchData.use = "search";
                    session.send("search movie name %j", movieName);
                } else if (movieName && searchData.q.query) {
                    // 替换
                    searchData.q.query = movieName;
                    searchData.use = "search";
                    session.send("change movie name %j", movieName);
                } else if (!movieName && searchData.q.query) {
                    // 没新的
                } else {
                    // all null
                }

                // • • • • • tv
                let tvName = fp.get("entity")(
                    fp.first(
                        builder.EntityRecognizer.findAllEntities(
                            args.entities,
                            "builtin.encyclopedia.tv.program"
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
                )(
                    builder.EntityRecognizer.findAllEntities(
                        args.entities,
                        "genre"
                    )
                );

                if (someOther) {
                    searchData.q.query = null;
                    searchData.use = "discover";
                }

                // • • • • •

                // ─────────────────────────────────────────────────────────────────

                log.debug(movie);
                log.debug(movieName);

                if (searchData.use == "search") {
                    log.debug("use search");
                    if (searchData.q.query) {
                        if (
                            _.has(searchData, ["q", "primary_release_date.gte"])
                        ) {
                            searchData.q.primary_release_year = moment(
                                searchData.q["primary_release_date.gte"]
                            ).format("YYYY");
                        }
                        log.debug("searchData.q:", searchData.q);
                        moviedb
                            .searchMovie(searchData.q)
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
                                log.debug(res);
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
                }
            }
        ]
    )
    .matches(
        "greetings",
        // (session, args) => {
        //     // session.send(
        //     //     "!!3 You reached Greeting intent, you said '%s'.",
        //     //     session.message.text
        //     // );
        //     // session.send("/ greeting:arg: %j", args);
        //     // session.replaceDialog("/", (args.intent = "search"));
        // }
        "/greetings"
    )

    // .matches("Utilities.Cancel", session => {
    //     session.send(
    //         "You reached Cancel intent, you said '%s'.",
    //         session.message.text
    //     );
    // })
    /*
.matches('<yourIntent>')... See details at http://docs.botframework.com/builder/node/guides/understanding-natural-language/
*/

    // .triggerAction({
    //     matches: /^(ttt|ddd)/i,
    //     confirmPrompt: "This will cancel the current . Are you sure?"
    // });
    // .cancelAction("cancelact", "act canceled.", {
    //     matches: /^(cancel|nevermind)/i,
    //     confirmPrompt: "Are you sure?"
    // });
    .onDefault(session => {
        session.send(
            "h Sorry, I did not understand '%s'.",
            session.message.text
        );
    });

intents.dialogResumed = (session, args) => {
    let data = _.pick(session, [
        "message.text",
        "conversationData",
        "dialogData"
    ]);
    log.debug("/ resume");
    session.send("/ resume %j", data);
    log.debug("/ resume data %j", data);
    log.debug("/ resume args %j", args);
};

bot.dialog("/greetings", function(session, args) {
    session.send("/greetings:arg: %j", args);

    session.send("hello .");
    session.send("stste %j", session.sessionState);
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
                    log.debug(res);
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
                    log.debug(res);
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
        session.send(
            "/help You reached Help intent, you said '%s'.",
            session.message.text
        );
        session.endDialogWithResult({ response: "help end" });
    })
    .matches("Utilities.Cancel", session => {
        session.send(
            "/help You reached Cancel intent, you said '%s'.",
            session.message.text
        );
        session.endDialog("help end for Cancel");
    })
    .onDefault(session => {
        session.send(
            "h Sorry, I did not understand '%s'.",
            session.message.text
        );
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
        var cards = [];
        for (var i = 0; i < movies.length; i++) {
            cards.push(constructCard(session, movies[i]));
        }

        // create reply with Carousel AttachmentLayout
        var reply = new builder.Message(session)
            .text(session.conversationData.search.total_pages.toString())
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
