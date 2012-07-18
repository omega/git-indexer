// Based losely on https://github.com/banksean/node-webfinger/blob/master/lib/atom.js
//
// NOTE: This is not really an ATOM parser. It parses the github private feed,
// and generates events based on that.
var sax = require('sax'),
    logger = require("./logger")(),
    events = require("events"),
    util = require('util'),
    https = require('https'),
    URL = require('url'),
    chaingang = require("chain-gang"),
    commentchain = chaingang.create({ workers: 1}),

    GitHubEvents = function(config) {
        var self = this;
        events.EventEmitter.call(self);
        self.auth = "Basic " + new Buffer(
                config.git_auth.user + ":" + config.git_auth.pw
                ).toString("base64");

        self.repos = [];

        logger.log("GitHubEvents".cyan + " In initializer");
        self.VERSION = '0.1';
    }
;
module.exports = GitHubEvents;

GitHubEvents.super_ = events.EventEmitter;
GitHubEvents.prototype = Object.create(events.EventEmitter.prototype, {
    constructor: {
                     value: GitHubEvents,
                     enumerable: false
                 }
});
GitHubEvents.prototype.add_repo = function(repo) {
    // Add watching for comments on this repo.
    if (!this.repos.some(function(v) {
        return v.safename == repo.safename;
    })) {
        logger.debug("unseen repo!" + repo.safename);
        // New repo!
        this.repos.push(repo)
        this.poll(repo);
    }
};
GitHubEvents.prototype.mkreq = function(user, repo, page) {
    if (!page) page = 1;
    var search = '?per_page=100&page=' + page;
    var req = {
        host: "api.github.com",
        port: 443,
        path: "/repos/" + user + "/" + repo + "/comments" + search,
        headers: {
            "Authorization": this.auth,
            'Accept': 'application/vnd.github-commitcomment.html+json'
        }
    }
    return req;
};

GitHubEvents.prototype.poll = function(repo, page) {
    var self = this;
    if (!page) page = 1;

    return commentchain.add(function(worker) {
        // Conveniance to fetch a remote feed and send it to parsing
        logger.log("GitHubEvents".cyan + ": Polling comments on ",
            repo.safename, "page: ", page);

        https.get(self.mkreq(repo.user, repo.name, page), function(res) {
            self.parse_headers(repo, res.headers);
            if (res.statusCode == 200) {
                var buf = "";
                res.on("data", function(d) {
                    buf += d;
                });
                res.on("end", function() {
                    // parse it, split it up into events and emit!
                    var comments = JSON.parse(buf);
                    comments.forEach(function(comment) {
                        var m = comment.user.avatar_url.match(/avatar\/(.*)\?/);
                        if (m) {
                            comment.gravatar = m[1];
                        }
                        comment.repo = { user: repo.user, name: repo.name };
                        comment.url = 'https://github.com/' + repo.user + "/" + repo.name
                        + "/commit/" + comment.commit_id + "#commitcomment-" + comment.id;
                        self.emit("comment", comment);
                    });
                    // XXX: What do I do here?
                    worker.finish();
                    setTimeout(function() {
                        self.poll(repo);
                    }, 10 * 60 * 1000); // Wait for a while, then poll it again?
                });
            } else {
                logger.error("fetching comments: ", res.statusCode);
            }
        }).on("error", function(err) {
            logger.error("fetching comments: ", err, repo.safename);
        });
    }, "comments:" + repo.safename + ":" + page, function(err) {
    });
};

GitHubEvents.prototype.parse_headers = function(repo, headers) {
    var self = this;
    if (headers.link) {
        if (!headers.link.match(/page=0/)) {

            var links = headers.link.split(",").map(function(e) {
                var link_details = e.split(";");
                var url = URL.parse(link_details[0], true);

                if (link_details[1].match(/next/)) {
                    logger.debug(link_details[1], url.query);
                    self.poll(repo, url.query.page);
                }
                return {}
            });
        }
    }
    if (parseInt(headers["x-ratelimit-remaining"]) < 100) {
        logger.warn("Low ratelimit remaining");
    }
};

