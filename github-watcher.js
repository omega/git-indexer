var events = require('events'),
    logger = require("./logger"),
    path = require("path"),
    spore = require('spore'),
    lp = require("./link-parser")
;
var GitHubWatcher = function(config) {
    logger = logger(config.logging);
    var self = this;
    events.EventEmitter.call(self);
    self.repos = config.repos.inc;
    self.org = config.org;


    var github_auth = spore.middlewares.basic(
            config.github_auth.user, config.github_auth.pw
            );

    var github_pager = function(method, request, next) {
        next(function(response, next) {
            var link = response.headers.link;
            if (link) {
                var parsed = lp(link);
                if (parsed.next) {
                    self.github.nextPage = parsed.next;
                    logger.debug(" -> Next page " + parsed.nextPage + ", total: " + parsed.lastPage);
                } else {
                    self.github.nextPage = undefined;
                }
            }
            next();
        });
    };

    spore.createClientWithUrl(
            config.githubspore || 'https://raw.github.com/omega/api-description/master/services/github/org3.json',
            function(err, client) {
                if (err) return logger.error("creating spore client failed: " + err);
                client.enable(github_auth);
                client.enable(github_pager);
                client.enable(spore.middlewares.json());
                self.github = client;
            }
            );
    //self.timer = setInterval(function() {
        //self.poll();
    //}, 60000);
}
;


module.exports = GitHubWatcher;

GitHubWatcher.super_ = events.EventEmitter;
GitHubWatcher.prototype = Object.create(events.EventEmitter.prototype, {
    constructor: {
                     value: GitHubWatcher,
                     enumerable: false
                 }
});
GitHubWatcher.prototype.fakerepos = function(repos) {
    var self = this;
    // We have some repos included in config, lets just emit events for
    // those and be done!
    logger.debug("GitHubWatcher ".green + "repos from config");
    repos.forEach(function(v) {
        self.emit("repo", {
            name: v,
            owner: {
                login: self.org
            }
        });
    });
    return logger.info("repos.inc defined in config, faking repo info");

};
GitHubWatcher.prototype.poll = function() {
    var self = this;
    if (self.repos) {
        return self.fakerepos(self.repos);
    }
    if(!self.github) {
        // Try again in a little while
        setTimeout(function() { self.poll() }, 2000);
        return logger.info("spore client not ready");
    }
    logger.log("GitHubWatcher:".green + " Scheduled: Updating repos from GitHub.");
    var responder;
    responder = function(err, resp) {
        if (err) return logger.error(err);
        if (typeof(resp.body) == "undefined")
            return logger.error("No repositories found in response: ", resp);
        logger.debug("GitHub:".cyan, resp.body.length);
        self.process_github_repos(resp.body);
        if (self.github.nextPage) {
            logger.debug("GitHub:".cyan, "have another page..");
            self.github.get(self.github.nextPage, responder);
        } else {
            logger.log("GitHub:".cyan, "end of transmission");
            self.emit("end");
        }
    };

    self.github.list_org_repos(
            {format: 'json', org: this.org},
            responder
            );

};
GitHubWatcher.prototype.process_github_repos = function(repos) {
    var self = this;
    repos.forEach(function(repo) {
        // We simply emit an event here? No checking for existance?
        self.emit("repo", repo);

        //console.log("GIT_LIMIT: ", GIT_LIMIT);
    });
}

