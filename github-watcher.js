var events = require('events'),
    path = require("path"),
    models = require('./models'),
    mongoose = require("mongoose"),
    spore = require('spore'),
    db, Repo
;

models.defineModels(mongoose, function() {
    Repo = mongoose.model("Repo");
});
var GitHubWatcher = function(config) {
    var self = this;
    events.EventEmitter.call(self);
    self.repos = [];
    self.org = config.org;
    self.repo_base = config.paths.repo_base;

    var github_auth = spore.middlewares.basic(
            config.github_auth.user, config.github_auth.pw
            );

    spore.createClientWithUrl(
            'https://raw.github.com/omega/api-description/master/services/github/organization.json',
            function(err, client) {
                if (err) return console.log("ERROR: ".red.bold + " creating spore client failed: " + err);
                client.enable(github_auth);
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

GitHubWatcher.prototype.poll = function() {
    var self = this;
    if(!self.github) return console.log("WARN:".yellow + " spore client not ready");
    console.log("Scheduled: Updating repos from GitHub.");
    this.github.get_organization_repositories(
            {format: 'json', org: this.org},
            function(err, resp) {
                if (err) console.log("ERROR: ".red + err);
                console.log("  GitHub: ".cyan + resp.body.repositories.length);
                self.process_github_repos(resp.body.repositories);
            }
            );
};
var GIT_LIMIT = 200;
GitHubWatcher.prototype.process_github_repos = function(repos) {
    var self = this;
    repos.forEach(function(repo) {
        // We simply emit an event here? No checking for existance?
        //console.log("GIT_LIMIT: ", GIT_LIMIT);
        if (GIT_LIMIT < 1) return;
        GIT_LIMIT--;
        //console.log(" - " + repo.name);
        Repo.findOne({'user': repo.owner, 'name': repo.name}, function(err, r) {
            if (err) {
                console.log("ERROR Fetching repo: " + err);
            } else if (!r) {
                console.log("Not found, but no error, lets save!");
                r = new Repo({
                    user: repo.owner,
                    name: repo.name
                });
                r.filepath = path.join(self.repo_base, r.safename);
                r.save(function(err) {
                    if (err) console.log("ERROR inserting repo: " + err);
                });
                self.emit("new-repo", r);
            } else {
                self.emit("old-repo", r);
            }
        });
    });
    GIT_LIMIT = 200;
}

