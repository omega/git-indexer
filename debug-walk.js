#!/usr/bin/env node
// Attempt to read a git repos history

var config = require('confu')(__dirname, 'config.json');
var
    logger = require("./logger")(config.logging),
    chainGang = require("chain-gang"),
    commitchain = chainGang.create({workers: 1}),
    path = require("path"),
    fs = require("fs"),
    exec = require("child_process").exec,
    mongoose = require("mongoose"),
    models = require('./models'),
    timers = {},
    Walker = require('./walker'),
    colors = require('colors'),
    UserMapper = require('./user-mapper.js'),
    db, Issue, Commit, Repo, Comment
;

models.defineModels();
var db = mongoose.createConnection(config.mongo);
db.on('error', function(err) { logger.error("Error connection to mongodb: ", err); });
db.once('open', function() {
    console.log("connected?");
    Repo = db.model('Repo');

    Repo.findOne({ name: process.argv[2] }, function(err, repo) {
        if (err) { return logger.error("ERR:" + err); }
        if (!repo) { logger.error("No repo found for " + process.argv[2]); process.exit(1) }
        logger.info("repo: " + repo.safename)
        var walker = new Walker(repo);
        walker.on("end", function(err) {
            if (err) { logger.error("ERR:" + err); process.exit(1) }
            logger.info("end of walker");
            process.exit(0);
        });
        walker.on("commit", function(commit) {
            if (bugs = commit.message.match(/([A-Z]+-\d+)/g)) {
                logger.info(
                    commit.sha.substr(0,8).toString().red +
                    " : " + bugs.join(", ") +
                    " <" + commit.date + ">"
                );
            }
        });
        walker.walk();

    });

});

