var Event, Issue, Repo;
var config = require('confu')(__dirname, 'config.json');
var events = require("events"),
    logger = require("./logger")(config.logging),
    path = require("path"),
    exec = require("child_process").exec,
    colors = require('colors'),
    spawn = require("child_process").spawn,
    mongoose = require('mongoose')
    ;
var base;
var git_auth;

function defineModels() {
    if (config) {
        if (config.paths && config.paths.repo_base) base = config.paths.repo_base;
        if (config.git_auth) git_auth = config.git_auth;
    }

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
        email   : String,
        gravatar: String,
        remoteuser: String,
    });
    mongoose.model("Event", Event);

    Issue   = new Schema({
        key     : {'type': String, 'unique': true},
        events : [Event],
        repos : [String]
    });
    Issue.method("find_event", function(id) {
        return this.events.filter(function(e) {
            return (e.id == id);
        })
    });
    Issue.method("has_event", function(id) {
        return this.find_event(id).length > 0;
    });

    Issue.method("find_repo", function(name) {
        return this.repos.filter(function(r) {
            if (r == name) return r;
        })
    });

    Issue.method("has_repo", function(id) {
        return this.find_repo(id).length > 0;
    });

    Issue.method("add_repo_for_event", function(e) {
        if (!this.has_repo(e.repo)) this.repos.push(e.repo);
    });

    Issue.method("add_event", function(e, worker) {
        var self = this;
        // Check to avoid dupes
        //console.log("in add_event: " + e.id + " " + this.has_event(e.id));
        if (self.has_event(e.id)) worker.finish(); // nothing to do
        else {
            //console.log("  Adding " + e.id);
            logger.info("Issue ".green + "New event for issue " + self.key);
            self.events.push(e);
            self.add_repo_for_event(e);
            self.save(function(err, obj) {
                if (err) {
                    logger.error("Saving issue: ", err, self.key);
                }
                worker.finish();
            });
        }
    });

    mongoose.model("Issue", Issue);

    Repo = new Schema({
        'user'       : { 'type': String },
        'name'       : { 'type': String },
        'last_seen'  : { 'type': String },
        'filepath'   : String,
         'errcount'  : Number,
    });

    /* this returns true if we have a clone, false otherwise */
    Repo.method("cloned", function() {
        var self = this;
        // XXX: prolly ugly to use Sync, but omg it would be so complicated!
        if (path.existsSync(self.filepath)) {
            return true;
        } else {
            return false;
        }
    });
    Repo.method("reclone", function(worker) {
        var repo = this;
        repo.errcount = repo.errcount + 1 || 1;
        logger.debug("Repo.reclone ".green + repo.safename + " error count: " + repo.errcount);
        repo.save(function(err, obj) {
            if (err) {
                logger.error("Repo.reclone ".green + "error updating error count..." + err);
            }
        });
        if (repo.errcount >= 10) {
            if (repo.errcount == 10 || repo.errcount == 11) {
                logger.info("Repo.reclone ". green + repo.safename
                    + " 10 errcount, ignoring reclone attempts");
            }
            return worker.finish();
        }

        logger.info("Repo.reclone ".green + repo.safename + " errcount: " + repo.errcount.toString().red);
        // should remove old, then call clone?
        logger.debug("Repo.reclone".green + " base: " + base);
        exec("rm -rf " + repo.safename, { cwd: base },
            function(err, stdout, stderr) {
                logger.debug("Repo ".green + err + ":" + stdout + " - " + stderr);
                if (err) {
                    logger.error("Repo".green + " Error removing: " + err + ", " + stderr + ", " + stdout);
                    return worker.finish();
                }
                repo.clone(worker);
            });
    });
    Repo.method("clone", function(worker) {
        var repo = this;
        if (repo.cloned()) return; // No need to clone again
        // Should shell out and clone this repo to base and set this.filepath
        logger.log("Repo.clone ".green + "Should clone the repo: "
            + repo.name + " into " + repo.filepath + " BASE:" + base
            );

        exec("git clone " + repo.real_origin() + " " + repo.safename , { cwd: base },
            function(err, stdout, stderr) {
                if (err || stderr) {
                    if (stderr == "warning: You appear to have cloned an empty repository.\n") {
                        // we ignore this error?
                    } else {
                        logger.error(err + " : " + stderr);
                    }
                } else {
                    logger.info("Repo.clone ".green + "Clone of " + repo.safename + " completed");
                }
                worker.finish(err);
            });
    });
    Repo.virtual("origin").get(function() {
        return "git@github.com:" + this.path;
    });
    Repo.virtual("path").get(function() {
        return this.user + "/" + this.name + ".git";
    });
    Repo.method("real_origin", function() {
        if (typeof(git_auth) == "undefined") {
            return this.origin;
        } else {
            return "https://" + git_auth.user + ":" + git_auth.pw + "@github.com/" + this.path;
        }
    });
    Repo.virtual("safename").get(function() {
        return this.user + "-" + this.name;
    });

    Repo.method("pull", function(worker, cb) {
        if (!this.cloned()) {
            // Need to clone it!
            logger.log("Turning a pull into a clone on ".red + this.safename);
            return this.clone(worker);
        }
        var repo = this;
        logger.debug("Pulling: ".blue + repo.safename);
        // Should run git pull in the filepath
        exec("git fetch -pq", {cwd: repo.filepath}, function(err,stdout, stderr) {
            if (err) {
                logger.error("(pull of " + repo.safename + ")" + err + " : " + stderr);
            } else {
                logger.debug("Repo ".green + "pulling complete");
            }
            //if (err) throw err;
            //if (stderr) console.log("ERR: " + stderr);
            if (typeof(cb) == "function") {
                cb(err);
            } else {
                worker.finish(err);
            }
        });
    });
    Repo.method("describe", function(branch, cb) {
        if (!this.cloned()) {
            logger.info("Repo ".green + "ooops, calling describe on uncloned repo is not supported ".red
                    + this.safename
                    );
            return cb("Not cloned");
        }
        var repo = this;
        repo.pull(null, function() {
            exec("git describe --tags origin/" + branch,
                {cwd: repo.filepath},
                function(err, stdout, stderr) {
                    logger.debug("Repo ".green + "describe output: ", err, stdout, stderr);
                    if (err) {
                        return cb("Wrong branch?");
                    }
                    var m = stdout.match(/^(.*)-(\d+)-([a-z0-9]+)\n$/);
                    if (m && m[1]) {
                        cb(err, m[1], parseInt(m[2]), m[3]);
                    } else {
                        cb(err, stdout, 0, '');
                    }
                }
                );
        });
    });




    mongoose.model("Repo", Repo);
}

exports.defineModels = defineModels;

