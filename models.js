var Event, Issue, Repo;
var events = require("events"),
    path = require("path"),
    exec = require("child_process").exec,
    spawn = require("child_process").spawn,
    ;
function defineModels(mongoose, fn) {


    var Schema = mongoose.Schema,
        ObjectId = mongoose.ObjectId;

    Event  = new Schema({
        id     : { 'type': String },
        user    : String,
        repo    : String,
        url     : String,
        type    : String,
        date    : { 'type': Date, 'index': 1 },
        text    : String,
    });
    mongoose.model("Event", Event);

    Issue   = new Schema({
        key     : {'type': String, 'unique': true},
        events : [Event]
    });
    Issue.method("find_event", function(id) {
        return this.events.filter(function(e,i,a) {
            return (e.id == id);
        })
    });
    Issue.method("add_event", function(e) {
        var self = this;
        // Check to avoid dupes
        //console.log("in add_event: " + e.id + " " + this.find_event(e.id));
        if (self.find_event(e.id).length == 0) {
            //console.log("  Adding " + e.id);
            self.events.push(e);
            self.save(function(err, obj) {
                if (err) {
                    console.log("Error saving issue: ", err, self.key);
                } else {
                    //console.log("Saved issue: ", self.key);
                }
                // XXX: What to do?
                console.log("Calling finish on worker", self.key);
            });
        }

    });

    mongoose.model("Issue", Issue);

    Repo = new Schema({
        'user'       : { 'type': String },
        'name'       : { 'type': String },
        'last_seen'  : { 'type': String },
         'filepath'      : String
    });

    Repo.method("clone", function(base, chain) {
        this.filepath = path.join(base, this.safename);
        var repo = this;
        // Should shell out and clone this repo to base and set this.filepath
        chain.add(function(worker) {
            console.log("Should clone the repo: " + repo.name + " into " + repo.filepath);

            exec("git clone " + repo.origin + " " + repo.safename , { cwd: base },
                function(err, stdout, stderr) {
                    //if (err) throw err;
                    if (stderr) {
                        console.log("ERR: " + err + " : " + stderr);
                    } else {
                        // lets trigger a initial walk!
                        repo.scan(chain);
                    }
                    worker.finish(err);
                });
        }, 'clone:' + this.safename);

    });
    Repo.virtual("origin").get(function() {
        return "git@github.com:" + this.user + "/" + this.name + ".git";
    });
    Repo.virtual("safename").get(function() {
        return this.user + "-" + this.name;
    });

    Repo.method("pull", function(chain) {
        var repo = this;
        chain.add(function(worker) {
            console.log("Pulling: " + repo.safename);
            // Should run git pull in the filepath
            exec("git fetch -q", {cwd: repo.filepath}, function(err,stdout, stderr) {
                if (err) {
                    console.log("ERROR: (pull of " + repo.safename + ")" + err + " : " + stderr);
                } else {
                    repo.scan(chain);
                }
                //if (err) throw err;
                //if (stderr) console.log("ERR: " + stderr);
                worker.finish(err);
            });
        }, 'pull:' + repo.safename);
    });
    Repo.method("scan", function(chain) {
        var repo = this;
        chain.add(function(worker) {
            console.log("Attempting to scan: " + repo.safename);
            console.log("about to start walking");
            var walker = new Walker(repo);
            walker.on("commit", function(commit) {
                //console.log("Got commit event from Walker", commit);
                if (typeof(commit.message) == "undefined") return;
                var bugs;
                if (bugs = commit.message.match(/([A-Z]+-\d+)/g)) {
                    //console.log("    has bugs");
                    bugs.forEach(function(bug) {
                        repo.store_commit(bug, commit);
                    });
                }
            });
            walker.walk();
            walker.on("end", function() {
                console.log("triggered end event on walker, to finish worker");
                // XXX: Should somehow update last_seen here, so we can use it
                // in walker!
                worker.finish();
            });
        }, 'scan:' + this.safename);
    });
    Repo.method("store_commit", function(bug, commit) {
        var self = this;
        //console.log(this.safename + " : " + bug + " : " + commit);
        var IssueM = mongoose.model("Issue");
        var EventM = mongoose.model("Event");
        IssueM.findOne({key: bug}, function(err, issue) {
            if (err) {
                console.log("ERROR: ", err);
                return;
            } else if (!issue) {
                console.log("CREATING "  + bug);
                issue = new IssueM({ 'key': bug });
            } else {
                //console.log("Found old issue ", bug);
            }
            var E = new EventM({
                id: commit.sha,
                user: self.user,
                repo: self.name,
                url: 'https://github.com/' + self.user + '/' + self.repo +
                    '/commit/' + commit.sha,
                date: commit.date,
                text: commit.message
            });
            issue.add_event(E);
        });

    });



    mongoose.model("Repo", Repo);


    fn();
}

exports.defineModels = defineModels;

// XXX: This is probably better if it emits events?
function Walker(repo) {
    this.repo = repo;
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
    exec("git branch -r | grep -v '\\->'", {cwd: this.repo.filepath}, function(err, stdout, stderr) {
        if (err) {
            console.log("ERROR: git branch -r failed on " + self.repo.safename,
                err, stdout, stderr);
            return;
        }
        var branches = stdout.split(/\s+/g).filter(function(e) {
            return (e != "")
        });
        console.log("BRANCHES: ", branches);
        var args = ["log", "--pretty=%H;%ae;%ai;X;%s"];
        args = args.concat(branches);
        console.log("args: ", args);
        // exec a git log --pretty="%H;%ae;%ai;%s" <all branches>
        var walker = spawn("git", args, {cwd: self.repo.filepath});
        walker.on("exit", function(code) {
            console.log("walker on ", self.repo, " exited: ", code);
            self.emit("end");
        });
        walker.stdout.on("data", function(d) {
            //console.log("got: " + d);
            d.toString().split(/\n/).forEach(function(line) {
                if (line == '') return;
                var splits = line.toString().split(/;X;/);
                var controls = splits[0].split(";");
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
