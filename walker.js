var events = require('events'),
    exec = require("child_process").exec,
    spawn = require("child_process").spawn,
    logger = require("./logger")()
;
function Walker(repo) {
    events.EventEmitter.call(this);
    this.repo = repo;
    this.count = 0;
}

module.exports = Walker;
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
            logger.debug(" WALKER: ".blue + "git branch -r failed on " + self.repo.safename);
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

