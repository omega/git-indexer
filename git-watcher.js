var events = require('events'),
    logger = require("./logger")(),
    chainGang = require("chain-gang"),
    colors = require('colors'),
    exec = require("child_process").exec,
    spawn = require("child_process").spawn,
    gitchain = chainGang.create({ workers: 2 }),
    Walker = require('./walker');
;
/*
gitchain.on("add", function(name) {
    console.log("+GITCHAIN: ".green + name.replace(/([a-z]{4})/, "$1".bold));
});
gitchain.on("starting", function(name) {
    console.log(">GITCHAIN: ".yellow + name.replace(/([a-z]{4})/, "$1".bold));
});
gitchain.on("finished", function(name) {
    console.log("-GITCHAIN: ".blue + name.replace(/([a-z]{4})/, "$1".bold));
});
*/

gitchain.on("empty", function() {
    logger.info(" GitWatcher ".magenta.bold + " empty gitchain, current active: "
        + gitchain.current.toString().red.bold
        );
});

setInterval(function() {
    logger.debug(" GitWatcher ".magenta.bold + " gitchain queue: "
                + gitchain.queue.length.toString().bold.red
        );
}, 60 * 1000);

var GitWatcher = function() {
    var self = this;
    events.EventEmitter.call(self);
    this.repos = [];
}
;


module.exports = GitWatcher;

GitWatcher.super_ = events.EventEmitter;
GitWatcher.prototype = Object.create(events.EventEmitter.prototype, {
    constructor: {
                     value: GitWatcher,
                     enumerable: false
                 }
});

GitWatcher.prototype.add_repo = function(repo) {
    var self = this;
    if(!self.repos.some(function(e) {
        return(e.safename == repo.safename);
    })) {
        self.repos.push(repo);
        self.scan(repo);
    }
};
GitWatcher.prototype.scan = function(repo) {
    logger.debug(" GitWatcher".magenta.bold + ": scan repo: " + repo.safename);
    if (!repo.cloned()) {
        logger.log("Turning a scan into a clone on ".red + repo.safename);
        return gitchain.add(function(worker) {
            repo.clone(worker);
        }, "clone:" + repo.safename);
    }
    var self = this;
    gitchain.add(function(worker) {
        var walker = new Walker(repo);
        walker.on("commit", function(commit) {
            self.emit("commit", commit);
        });
        walker.on("end", function(err) {
            if (err) {
                if (err == "EGITBRANCH") {
                    // Should try a reclone..
                    logger.debug(" GitWatcher ".magenta.bold + "recloning " + repo.safename);
                    repo.reclone(worker);
                } else {
                    logger.error("Error in walker end: " + err);
                    worker.finish();
                }
            } else {
                worker.finish();
            }
        });
        walker.walk();
    }, "scan:" + repo.safename);
};

GitWatcher.prototype.new_repo = function(repo) {
    var self = this;
    // Since this is a new one, lets clone!
    gitchain.add(function(worker) {
        repo.clone(worker);
    }, "clone:" + repo.safename, function(err) {
        logger.log("Cloining " + repo.safename + " finished, adding to Watcher");
        self.add_repo(repo);
    });
};

GitWatcher.prototype.repull = function() {
    var self = this;
    if (gitchain.queue.length > 50) {
        logger.info(" GitWatcher".magenta.bold + " gitchain queue over 50 ("
                + gitchain.queue.length.toString().bold.red
                + "), not adding more");
        return;
    }
    logger.log(" GitWatcher".magenta.bold + ": rescanning repos: "
            + this.repos.length.toString().bold.red
            + " gitchain queue size: "
            + gitchain.queue.length.toString().bold.red
            );
    logger.log(gitchain.checkStatus());

    self.repos.forEach(function(repo) {
        self.scan(repo);
    });
};

