var events = require('events'),
    chainGang = require("chain-gang"),
    colors = require('colors'),
    exec = require("child_process").exec,
    spawn = require("child_process").spawn,
    gitchain = chainGang.create({ workers: 2 })
;
gitchain.on("add", function(name) {
    console.log("+GITCHAIN: ".green + name.replace(/([a-z]{4})/, "$1".bold));
});
gitchain.on("starting", function(name) {
    console.log(">GITCHAIN: ".yellow + name.replace(/([a-z]{4})/, "$1".bold));
});
gitchain.on("finished", function(name) {
    console.log("-GITCHAIN: ".blue + name.replace(/([a-z]{4})/, "$1".bold));
});
var GitWatcher = function() {
    var self = this;
    events.EventEmitter.call(self);
    this.repos = [];

    // XXX: Setup a timer here to pull all repos?
    this.timer = setTimeout(function() {
        self.repull();
    }, 5000);
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
    console.log(" GitWatcher".magenta.bold + " #repos: " + this.repos.length.toString().bold.red);
};
GitWatcher.prototype.scan = function(repo) {
    var self = this;
    gitchain.add(function(worker) {
        var walker = new Walker(repo);
        walker.on("commit", function(commit) {
            self.emit("commit", commit);
        });
        walker.on("end", function() {
            worker.finish();
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
        console.log("Cloining " + repo.safename + " finished, adding to Watcher");
        self.add_repo(repo);
    });
};

GitWatcher.prototype.repull = function() {
    var self = this;
    console.log(" GitWatcher".magenta.bold + ": repull");

    self.repos.forEach(function(repo) {
        gitchain.add(function(worker) {
            repo.pull(worker);
        }, "pull:" + repo.safename, function(err) {
            //console.log("Done pulling " + repo.safename);
            self.scan(repo);
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
    console.log(" WALKER: ".blue + self.repo.safename);
    exec("git branch -r | grep -v '\\->'", {cwd: self.repo.filepath}, function(err, stdout, stderr) {
        if (err) {
            console.log("ERROR:".red.bold + " git branch -r failed on " + self.repo.safename,
                err, stdout, stderr);
            return;
        }
        var branches = stdout.split(/\s+/g).filter(function(e) {
            return (e != "")
        });
        //console.log("BRANCHES: ", branches);
        var args = ["log", "--pretty=%H;%ae;%ai;X;%s"];
        args = args.concat(branches);
        //console.log("args: ", args);
        // exec a git log --pretty="%H;%ae;%ai;%s" <all branches>
        var walker = spawn("git", args, {cwd: self.repo.filepath});
        walker.on("exit", function(code) {
            //console.log("walker on ", self.repo, " exited: ", code);
            console.log("-WALKER: ".blue + "  #revs: " + self.count.toString().red.bold);
            self.emit("end");
        });
        walker.stdout.on("data", function(d) {
            //console.log("got: " + d);
            d.toString().split(/\n/).forEach(function(line) {
                if (line == '') return;
                var splits = line.toString().split(/;X;/);
                var controls = splits[0].split(";");
                self.count = self.count + 1;
                self.emit("commit", {
                    sha: controls[0],
                    email: controls[1],
                    date: controls[2],
                    message: splits[1],
                });
            });

        });
        walker.stderr.on("data", function(d) {
            console.log("ERR: " + d);
        });
    });
};
