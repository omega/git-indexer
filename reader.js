#!/usr/bin/env node
// Attempt to read a git repos history

var config = require('confu')(__dirname, 'config.json');
var
    logger = require("./logger")(config.logging),
    chainGang = require("chain-gang"),
    commitchain = chainGang.create({workers: 1}),
    path = require("path"),
    fs = require("fs"),
    exec = require("child_process").exec,
    mongoose = require("mongoose"),
    models = require('./models'),
    timers = {},
    GitHubEvents = require('./atom'),
    GitHubWatcher = require('./github-watcher'),
    GitWatcher = require('./git-watcher'),
    colors = require('colors'),
    UserMapper = require('./user-mapper.js'),
    db, Issue, Commit, Repo, Comment
;
/*
commitchain.on("add", function(name) {
    console.log("+ISSCHAIN: ".green + name.replace(/([a-z]{4})/, "$1".bold));
});
commitchain.on("starting", function(name) {
    console.log(">ISSCHAIN: ".yellow + name.replace(/([a-z]{4})/, "$1".bold));
});
commitchain.on("finished", function(name) {
    console.log("-ISSCHAIN: ".blue + name.replace(/([a-z]{4})/, "$1".bold));
});
*/
var gitusermapper = new UserMapper(config.git_map_url);
var githubusermapper = new UserMapper(config.github_map_url);

models.defineModels();
var db = mongoose.createConnection(config.mongo);
db.on('error', function(err) { logger.error("Error connection to mongodb: ", err); });
db.once('open', function() {
    // This is when we start the app then..
    Issue = db.model('Issue');
    Event = db.model('Event');
    Repo = db.model('Repo');
    timers.feedreader = setTimeout(function() {
        githubwatcher.poll();
    }, 1);
    timers.repo_fetcher = setInterval(function() {
        githubwatcher.poll();
    }, 60 * 1000);


var githubevents = new GitHubEvents(config);
githubevents.on('comment', function(comment) {
    // Lets try to locate this Commit on some Issue
    commitchain.add(function(worker) {
        Issue.findOne({'events.id': comment.commit_id }, function(err, issue) {
            if (err) {
                logger.error(err);
                worker.finish();
                return;
            } else if (!issue) {
                logger.log("No issue found for comment", comment.commit_id, comment.repo.name);
                worker.finish();
            } else {
                githubusermapper.map(comment.user.login, function(json) {
                    var E = new Event({
                        id: "comment:" + comment.id,
                        user: comment.repo.user,
                        repo: comment.repo.name,
                        date: new Date(comment.created_at),
                        url: comment.url,
                        text: comment.body_html,
                        gravatar: comment.gravatar,
                        github_login: comment.user.login,
                        remoteuser: json.username
                    });
                    issue.add_event(E, worker);
                });
            }
        });
    }, "save:" + comment.id);
});

var gitwatcher = new GitWatcher();
gitwatcher.on('commit', function(commit) {
    //console.log("  commit emitted");
    if (typeof(commit.message) == "undefined") return;
    var bugs;
    if (bugs = commit.message.match(/([A-Z]+-\d+)/g)) {
        //console.log("    has bugs");
        bugs.forEach(function(bug) {
            commitchain.add(function(worker) {
                Issue.findOne({key: bug}, function(err, issue) {
                    if (err) {
                        logger.error(err);
                        return;
                    } else if (!issue) {
                        //console.log("CREATING "  + bug);
                        issue = new Issue({ 'key': bug });
                    } else {
                        //console.log("Found old issue ", bug);
                    }
                    gitusermapper.map(commit.email, function(json) {
                        var E = new Event({
                            id: commit.sha,
                            user: commit.repo.user,
                            repo: commit.repo.name,
                            url: 'https://github.com/' + commit.repo.user + '/' + commit.repo.name +
                            '/commit/' + commit.sha,
                            date: commit.date,
                            text: commit.message,
                            email: commit.email,
                            remoteuser: json.username
                        });
                        issue.add_event(E, worker);
                    });
                });
            }, "save:" + bug + ":" + commit.sha);
        });
    }
});

var githubwatcher = new GitHubWatcher(config, Repo);
githubwatcher.on('new-repo', function(repo) {
    if (!is_included(repo.name)) return;
    //console.log("  new-repo emitted", repo);
    gitwatcher.new_repo(repo);
    githubevents.add_repo(repo);
});
githubwatcher.on('old-repo', function(repo) {
    if (!is_included(repo.name)) return;
    //console.log(" old-repo".bold, repo);
    gitwatcher.add_repo(repo);
    githubevents.add_repo(repo);
});

function is_included(reponame) {
    if (!config.repos) return true; // No repos restriction
    if (config.repos.exc) {
        return !config.repos.exc.some(function(v) {
            return reponame == v;
        });
    }

    if (config.repos.inc) {
        return config.repos.inc.some(function(v) {
            return reponame == v;
        });
    }
    return true; // Default to not filtered
}


});

/*
var memory = process.memoryUsage();
var max = memory;
timers.memory = setInterval(function() {
    var now = process.memoryUsage();
    var MS = "";
    for (var i in now) {
        var rec = false;
        if (now[i] > max[i]) {
            max[i] = now[i];
            rec = true;
        }
        var pst = parseInt(now[i] * 100 / max[i]);
        var d = now[i] - memory[i];
        MS = MS + (rec ? i.red : i) + ": " + now[i].toString().bold;

        if (d > 0) {
            MS = MS + (" (+" + d + ")").red;
        } else {
            MS = MS + (" (" + d + ")").green;
        }
        MS = MS + " " + (pst + "%").magenta + "   ";
    }
    console.log(MS);
    memory = now;
}, 1000);

*/

//timers.feedreader = setInterval(function() { githubevents.poll() }, 5000);
