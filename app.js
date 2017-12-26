/*-----------------------------------------------------------------------------
A simple echo bot for the Microsoft Bot Framework. 
-----------------------------------------------------------------------------*/
if (!process.env.MicrosoftAppI) {
    require("dotenv-extended").load();
}

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
    // console.log(message);
    if (message.membersAdded) {
        message.membersAdded.forEach(identity => {
            // 当启动, 有两个用户加进来 , 用户 和 bot, 分辨 bot
            if (identity.id === message.address.bot.id) {
                const reply = new builder.Message()
                    .address(message.address)
                    .text(
                        "Hi! do you want search some movies? try say some movies type or actor name."
                    );
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
    luisAPIKey;
// + "&spellCheck=true&bing-spell-check-subscription-key=" + BING_Spell_Check_API_KEY;
// + "&verbose=true&timezoneOffset=0&q=";
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
            .text("Here are some movies I found")
            .attachmentLayout(builder.AttachmentLayout.list)
            .attachments(cards);
        session.send(reply);
    } else {
        session.send("Couldn't find movies for this one");
    }
};

const constructCard = (session, image) => {
    return (
        new builder.HeroCard(session)
            .title(image.name)
            // .subtitle(image.hostPageDisplayUrl)
            .images([
                builder.CardImage.create(
                    session,
                    `${moviedbConfig.images.base_url}${
                        moviedbConfig.images.poster_sizes[
                            moviedbConfig.images.poster_sizes.length - 3
                        ]
                    }${image.poster_path}`
                )
            ])
    );
    // .buttons([
    //     builder.CardAction.openUrl(session, image.hostPageUrl, "Buy from merchant"),
    //     builder.CardAction.openUrl(session, image.webSearchUrl, "Find more in Bing")
    // ])
};
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
    .matches("search", [
        (session, args, next) => {
            let data = _.pick(session, [
                "message.text",
                "conversationData",
                "dialogData"
            ]);
            log.debug("/ search");
            if (!_.isEmpty(session.conversationData.movieNames)) {
                session.send(
                    _.pick(session.conversationData.movieNames, ["entity"])
                );
            }
            session.send("stste %j", session.sessionState);

            session.send("/ search %j", data);
            session.send("/ search arg: %j", args);

            // next({ response: "search next" });

            // ─────────────────────────────────────────────────────────────────
            /**
             * {
             *  entity: 'movies',
             * type: 'movie',
             *  startIndex: 10,
             *  endIndex: 15,
             *  score: 0.8963896 }
             * score is dyn
             */
            var movie = builder.EntityRecognizer.findAllEntities(
                args.entities,
                "movie"
            );
            var movieNames = builder.EntityRecognizer.findAllEntities(
                args.entities,
                "builtin.encyclopedia.tv.program"
            ).concat(
                builder.EntityRecognizer.findAllEntities(
                    args.entities,
                    "builtin.encyclopedia.film.film"
                ),
                builder.EntityRecognizer.findAllEntities(
                    args.entities,
                    "movieName"
                )
            );

            session.conversationData.movieNames = movieNames.concat(
                session.conversationData.movieNames
            );

            log.debug(movie);
            log.debug(movieNames);

            session.send(
                "You reached search intent, you said '%s'.",
                session.message.text
            );
            let aMovieName = fp.get("entity")(fp.first(movieNames));
            moviedb
                .searchMovie({ query: aMovieName })
                .then(res => {
                    // log.info(res)
                    handleApiResponse(session, res.results);
                    session.endDialog();
                })
                .catch(error => {
                    handleErrorResponse(session, error);
                    session.endDialog();
                });
        }
    ])
    .matches(
        "greetings",
        //  session => {
        //     session.send(
        //         "!!3 You reached Greeting intent, you said '%s'.",
        //         session.message.text
        //     );
        // }
        "flip"
    )

    .matches("Utilities.Cancel", session => {
        session.send(
            "You reached Cancel intent, you said '%s'.",
            session.message.text
        );
    });
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

bot.dialog("flip", function(session, args) {
    session.send("hello .");
    session.send("stste %j", session.sessionState);
    session.endDialog();
});
//     .triggerAction({
//         matches: /^(hd|hd)/i
//     });

var helpintents = new builder.IntentDialog({
    recognizers: [recognizer]
    // , recognizeMode: builder.RecognizeMode.onBegin
})

    .onBegin((session, args, next) => {
        log("in help intents");
        session.send("in help");
        session.message.text = "-==";
        helpintents.recognize(session, (err, res) => {
            session.send("helpintents.recognize");
            session.send(err);
            session.send("recognize res:%j", res);
            helpintents.replyReceived(session, res);
        });
        session.send("/help begin:arg: %j", args);
        let data = _.pick(session, [
            "message.text",
            "conversationData",
            "dialogData"
        ]);
        session.send("/help begin %j", data);
        // next();
    })

    .matches("Utilities.Help", (session, args) => {
        session.conversationData.help = true;
        let data = _.pick(session, ["conversationData", "dialogData"]);
        log.debug("/help in help");
        log.debug(data);
        log.debug(args);
        session.send(
            "You reached Help intent, you said '%s'.",
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

bot.dialog("/", intents);
bot.dialog("/help", helpintents);
