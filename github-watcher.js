var events = require('events'),
    logger = require("./logger")(),
    path = require("path"),
    spore = require('spore')
;
var GitHubWatcher = function(config, repo) {
    var self = this;
    Repo = repo;
    events.EventEmitter.call(self);
    self.repos = [];
    self.org = config.org;
    self.repo_base = config.paths.repo_base;

    var github_auth = spore.middlewares.basic(
            config.github_auth.user, config.github_auth.pw
            );

    /*
    var github_pager = function(method, request, next) {
        next(function(response, next) {
            console.log("IN RESPONSE MIDDLEWARE");
            console.log(response.headers);

            next();
        });
    };
    */

    spore.createClientWithUrl(
            config.githubspore || 'https://raw.github.com/omega/api-description/master/services/github/org3.json',
            function(err, client) {
                if (err) return logger.error("creating spore client failed: " + err);
                client.enable(github_auth);
                client.enable(spore.middlewares.json());
                //client.enable(github_pager);
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
GitHubWatcher.prototype.poll = function() {
    var self = this;
    if(!self.github) {
        // Try again in a little while
        setTimeout(function() { self.poll() }, 2000);
        return logger.info("spore client not ready");
    }
    logger.log("GitHubWatcher:".green + " Scheduled: Updating repos from GitHub.");
    this.github.list_org_repos(
            {format: 'json', org: this.org},
            function(err, resp) {
                if (err) return logger.error(err);
                if (typeof(resp.body) == "undefined")
                    return logger.error("No repositories found in response: ", resp);
                logger.log("GitHub:".cyan, resp.body.length);
                self.process_github_repos(resp.body);
            }
            );
};
var GIT_LIMIT = 300;
GitHubWatcher.prototype.process_github_repos = function(repos) {
    var self = this;
    repos.forEach(function(repo) {
        // We simply emit an event here? No checking for existance?
        //console.log("GIT_LIMIT: ", GIT_LIMIT);
        if (GIT_LIMIT < 1) return;
        GIT_LIMIT--;
        //logger.debug("Looking for", repo.owner.login, repo.name);
        Repo.findOne({'user': repo.owner.login, 'name': repo.name}, function(err, r) {
            if (err) {
                logger.error("Fetching repo: " + err);
            } else if (!r) {
                logger.info("New repo found: " + repo.name);
                r = new Repo({
                    user: repo.owner.login,
                    name: repo.name
                });
                r.filepath = path.join(self.repo_base, r.safename);
                r.save(function(err) {
                    if (err) logger.error("inserting repo: " + err);
                });
                self.emit("new-repo", r);
            } else {
                self.emit("old-repo", r);
            }
        });
    });
    GIT_LIMIT = 200;
}

