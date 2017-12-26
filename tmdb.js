require("dotenv-extended").load();

const MovieDb = require("moviedb-promise");
module.exports = new MovieDb(process.env.TmdbKey);
