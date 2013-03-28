var events = require('events'),
    logger = require("./logger")(),
    chainGang = require("chain-gang"),
    colors = require('colors'),
    exec = require("child_process").exec,
    spawn = require("child_process").spawn,
    gitchain = chainGang.create({ workers: 2 })
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
var GitWatcher = function() {
    var self = this;
    events.EventEmitter.call(self);
    this.repos = [];

    // XXX: Setup a timer here to pull all repos?
    this.timer = setInterval(function() {
        self.repull();
    }, 60000);
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
    logger.debug("scan " + repo.safename);
    if (!repo.cloned()) {
        logger.log("Turning a scan into a clone on ".red + repo.safename);
        return gitchain.add(function(worker) {
            repo.clone(worker);
        }, "clone:" + repo.safename);
    }
    var self = this;
    gitchain.add(function(worker) {
        logger.debug("New Walker".red);
        var walker = new Walker(repo);
        walker.on("commit", function(commit) {
            self.emit("commit", commit);
        });
        walker.on("end", function(err) {
            if (err) {
                logger.error("Error in walker end: " + err);
                if (err == "EGITBRANCH") {
                    // Should try a reclone..
                    repo.reclone(worker);
                } else {
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
    logger.log(" GitWatcher".magenta.bold + ": rescanning repos: "
            + this.repos.length.toString().bold.red);

    self.repos.forEach(function(repo) {
        logger.debug(" GitWatcher".magenta.bold + ": scan repo: " + repo.safename);
        gitchain.add(function(worker) {
            self.scan(repo);
        }, "pull:" + repo.safename, function(err) {
            logger.debug("did scan on " + repo);
        });
    });
};

function Walker(repo) {
    events.EventEmitter.call(this);
    this.repo = repo;
    this.count = 0;
}

Walker.super_ = events.EventEmmiter;
Walker.prototype = Object.create(events.EventEmitter.prototype, {
    constructor: {
                     value: Walker,
                     enumerable: false
                 }
});

Walker.prototype.walk = function() {
    // Get a list of branches in this repo
    var self = this;
    logger.debug(" WALKER: ".blue + self.repo.safename);
    exec("git branch -r | grep -v '\\->'", {cwd: self.repo.filepath}, function(err, stdout, stderr) {
        if (err) {
            logger.error("git branch -r failed on " + self.repo.safename);
            return self.emit("end", "EGITBRANCH");
        }
        var branches = stdout.split(/\s+/g).filter(function(e) {
            return (e != "")
        });
        //console.log("BRANCHES: ", branches);
        // the format is ;Y;<sha>;<email>;<date>;X;message;Z;
        // We have the ;Y|X|Z; magic markers to work with the damn
        // buffering :/
        var args = ["log", "--pretty=;Y;%H;%ae;%ai;X;%s;Z;"];
        args = args.concat(branches);
        //console.log("args: ", args);
        // exec a git log --pretty="%H;%ae;%ai;%s" <all branches>
        var walker = spawn("git", args, {cwd: self.repo.filepath});
        walker.on("exit", function(code) {
            //console.log("walker on ", self.repo, " exited: ", code);
            //console.log("-WALKER: ".blue + "  #revs: " + self.count.toString().red.bold);
            self.emit("end");
        });
        var buffer = null;
        walker.stdout.on("data", function(d) {
            //console.log("DATA".yellow);
            if (buffer) {
                //console.log("  Have spill-over buffer: ".green, buffer);
                d = buffer + d;
                buffer = null;
            }
            d.toString().split(/\n/).forEach(function(line) {
                if (line == '') return;
                // If we do not match our "line" regexp, we set the buffer for
                // next iteration, and then we prepend that to d
                var m = line.match(/^;Y;(.*);Z;$/);
                //console.log(m);
                if (!m) {
                    buffer = line;
                    return;
                } else {
                    line = m[1];
                }
                //console.log("line: ", line);
                var splits = line.toString().split(/;X;/);
                var controls = splits[0].split(";");
                self.count = self.count + 1;
                self.emit("commit", {
                    sha: controls[0],
                    email: controls[1],
                    date: controls[2],
                    message: splits[1],
                    repo: self.repo
                });
            });

        });
        walker.stderr.on("data", function(d) {
            logger.error(d.toString());
        });
    });
};
