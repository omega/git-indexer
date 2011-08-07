// Based losely on https://github.com/banksean/node-webfinger/blob/master/lib/atom.js
//
// NOTE: This is not really an ATOM parser. It parses the github private feed,
// and generates events based on that.
var sax = require('sax'),
    events = require("events"),
    htmlparser = require('htmlparser'),
    select = require('soupselect').select,
    util = require('util'),
    GitHubEvents = function(config) {
        var self = this;
        events.EventEmitter.call(self);
        self.auth = "Basic " + new Buffer(
                config.git_auth.user + ":" + config.git_auth.pw
                ).toString("base64");

        self.repos = [];

        console.log("GitHubEvents".cyan + " In initializer");
        self.VERSION = '0.1';
    },
    https = require('https'),
    URL = require('url'),
    chaingang = require("chain-gang"),
    commentchain = chaingang.create({ workers: 1})
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
        console.log("unseen repo!" + repo.safename);
        // New repo!
        this.repos.push(repo)
        this.poll(repo);
    }
};
GitHubEvents.prototype.mkreq = function(user, repo, page) {
    if (!page) page = 1;
    return {
        host: "api.github.com",
        port: 443,
        path: "/repos/" + user + "/" + repo + "/comments",
        search: '?per_page=100&page=' + page,
        headers: {
            "Authorization": this.auth,
            'Accept': 'application/vnd.github-commitcomment.html+json'
        }
    }
};

GitHubEvents.prototype.poll = function(repo) {
    var self = this;
    return commentchain.add(function(worker) {
        // Conveniance to fetch a remote feed and send it to parsing
        console.log("GitHubEvents".cyan + ": Polling comments on ", repo.safename);

        https.get(self.mkreq(repo.user, repo.name), function(res) {
            self.parse_headers(res.headers);
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
                    }, 60 * 1000); // Wait for a while, then poll it again?
                });
            } else {
                console.log("ERROR:".red.bold + " fetching comments: ", res.statusCode);
            }
        }).on("error", function(err) {
            console.log("ERROR:".red + " error fetching comments: ", err);
        });
    }, "commits:" + repo.safename, function(err) {
    });
};

GitHubEvents.prototype.parse_headers = function(headers) {
    if (headers.link) {
        console.log("WARN:".yellow + " WE HAVE SOME LINK: ", headers.link);
    }
    if (parseInt(headers["x-ratelimit-remaining"]) < 100) {
        console.log("WARN:".yellow + " Low ratelimit remaining");
    }
};

