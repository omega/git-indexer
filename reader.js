#!/usr/bin/env node
// Attempt to read a git repos history

var config = require('confu')(__dirname, 'config.json');
var
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
    WebServer = require('./webserver'),
    colors = require('colors'),
    db, Issue, Commit, Repo, Comment
;
new WebServer(config).start();
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
models.defineModels(mongoose, function() {
    Issue = mongoose.model("Issue");
    Event = mongoose.model("Event");
    Repo = mongoose.model("Repo");
    if (config.mongo.indexOf(",") != -1) {
        // Replica set
        db = mongoose.connectSet(config.mongo);
    } else {
        db = mongoose.connect(config.mongo);
    }

    // XXX: Ugly to pass it here!
}, config);



var githubevents = new GitHubEvents(config.feed);
githubevents.on('comment', function(comment) {
    //console.log("  comment emitted: " + comment.type());
    // Lets try to locate this Commit on some Issue
    commitchain.add(function(worker) {
        Issue.findOne({'events.id': comment.commit().id }, function(err, issue) {
            if (err) {
                console.error("ERROR: ", err);
                worker.finish();
                return;
            } else if (!issue) {
                console.log("No issue found for comment", comment.commit().id, comment.repo().origin.repo);
                worker.finish();
            } else {
                var E = new Event({
                    id: comment.id,
                    user: comment.repo().origin.user,
                    repo: comment.repo().origin.repo,
                    date: new Date(comment.published),
                    url: comment.linkByRel("alternate")[0].href,
                    text: comment.content
                });
                issue.add_event(E, worker);
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
                        console.log("ERROR: ", err);
                        return;
                    } else if (!issue) {
                        //console.log("CREATING "  + bug);
                        issue = new Issue({ 'key': bug });
                    } else {
                        //console.log("Found old issue ", bug);
                    }
                    var E = new Event({
                        id: commit.sha,
                        user: commit.repo.user,
                        repo: commit.repo.name,
                        url: 'https://github.com/' + commit.repo.user + '/' + commit.repo.name +
                        '/commit/' + commit.sha,
                        date: commit.date,
                        text: commit.message
                    });
                    issue.add_event(E, worker);
                });
            }, "save:" + bug + ":" + commit.sha);
        });
    }
});

var githubwatcher = new GitHubWatcher(config);
githubwatcher.on('new-repo', function(repo) {
    if (!is_included(repo.name)) return;
    console.log("  new-repo emitted", repo);
    gitwatcher.new_repo(repo);
});
githubwatcher.on('old-repo', function(repo) {
    if (!is_included(repo.name)) return;
    console.log(" old-repo".bold, repo);
    gitwatcher.add_repo(repo);
});

function is_included(reponame) {
    if (!config.repos) return true; // No repos restriction

    if (config.repos.inc) {
        return config.repos.inc.some(function(v) {
            return reponame == v;
        });
    }
    return true; // Default to not filtered
}

//var ws = new WebServer();
//ws.start();



// XXX: Timers needed:
//  - check for new repos on github
//  - Re-scan repos
//  -- Make sure we hide from last commit or something?

/******
 *
 * GITHUB TIMER
 *
 */

//timers.github = setTimeout(update_github_repos, 1000);
//timers.pull = setTimeout(repull_repos, 3000);

timers.feedreader = setTimeout(function() {
    githubevents.poll();
    githubwatcher.poll();
}, 1);
timers.repo_fetcher = setInterval(function() {
    githubwatcher.poll();
}, 60 * 1000);
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
