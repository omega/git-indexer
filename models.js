var Event, Issue, Repo;

function defineModels(mongoose, fn) {
    var path = require("path"),
        exec = require("child_process").exec,
        gitteh = require("gitteh")
    ;


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
        // Check to avoid dupes
        //console.log("in add_event: " + e.id + " " + this.find_event(e.id));
        if (this.find_event(e.id).length == 0) {
            console.log("  Adding " + e.id);
            this.events.push(e);
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
        this.filepath = path.join(base, this.safename + ".git");
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
            var r = gitteh.openRepository(repo.filepath);
            console.log("Opened");
            var headRef = r.getReference("HEAD");
            console.log("Found head");
            var head = headRef.resolve()
            console.log("HEAD resolved");

            var walker = r.createWalker();
            console.log("created walker");

            walker.sort(gitteh.GIT_SORT_TIME);
            console.log("sorted");
            walker.push(head.target);
            if (repo.last_seen) {
                console.log("  Have last seen: " + repo.last_seen);
                walker.hide(repo.last_seen); // Wonder if this works well :p
            }

            var commit;
            console.log("about to start walking");
            while (commit = walker.next()) {
                // attempt to find a JIRA bug id in teh message
                var bugs;
                if (bugs = commit.message.match(/([A-Z]+-\d+)/g)) {
                    console.log("has bugs");
                    repo.store_commit(bugs, commit);
                }
            }
            // XXX: Update last_seen here?
            console.log("should set repo.last_seen to ", commit);
            worker.finish();
        }, 'scan:' + this.safename);
    });
    Repo.method("store_commit", function(bugs, commit) {
        console.log(this.safename + " : " + bug + " : " + commit);
    });



    mongoose.model("Repo", Repo);


    fn();
}

exports.defineModels = defineModels;

