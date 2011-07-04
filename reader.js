#!/usr/bin/env node
// Attempt to read a git repos history

var config = require('confu')(__dirname, 'config.json');
var
    chainGang = require("chain-gang"),
    gitchain = chainGang.create({ workers: 1 }),
    chain = chainGang.create({workser: 1}),
    monchain = chainGang.create({workser: 1}),
    path = require("path"),
    fs = require("fs"),
    exec = require("child_process").exec,
    mongoose = require("mongoose"),
    models = require('./models'),
    url = require('url'),
    timers = {},
    GitHubEvents = require('./atom'),
    GitHubWatcher = require('./github-watcher'),
    GitWatcher = require('./git-watcher'),
    WebServer = require('./webserver'),
    colors = require('colors'),
    db, Issue, Commit, Repo, Comment
;

var REPO_BASE =  config.paths.repo_base;


models.defineModels(mongoose, function() {
    Issue = mongoose.model("Issue");
    Event = mongoose.model("Event");
    Repo = mongoose.model("Repo");
    db = mongoose.connect("mongodb://localhost/jira");
});


var githubevents = new GitHubEvents(config.feed);
githubevents.on('comment', function(comment) {
    //console.log("  comment emitted: " + comment.type());
    // Lets try to locate this Commit on some Issue
    Issue.findOne({'events.id': comment.commit()}, function(err, issue) {
        if (err) {
            console.log("ERROR: ", err);
            return;
        } else if (!issue) {
            console.log("No issue found for comment", comment.commit().id, comment.repo().origin.repo);
        } else {
            var E = new Event({
                id: e.id,
                user: e.repo().origin.user,
                repo: e.repo().origin.repo,
                date: new Date(e.published),
                url: e.linkByRel("alternate")[0].href,
                text: e.content
            });
            monchain.add(function(worker) {
                issue.add_event(E);
            }, "save:" + E.id);
        }
    });
});

var gitwatcher = new GitWatcher();
gitwatcher.on('commit', function(commit) {
    //console.log("  commit emitted");
    /*
    if (typeof(commit.message) == "undefined") return;
    var bugs;
    if (bugs = commit.message.match(/([A-Z]+-\d+)/g)) {
        //console.log("    has bugs");
        bugs.forEach(function(bug) {
            repo.store_commit(bug, commit);
        });
    }
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
            commitchain.add(function(worker) {
                issue.add_event(E, worker);
            }, "save:" + E.id);
        });
    */
});

var githubwatcher = new GitHubWatcher(config);
githubwatcher.on('new-repo', function(repo) {
    console.log("  new-repo emitted", repo);
    gitwatcher.new_repo(repo);
});
githubwatcher.on('old-repo', function(repo) {
    console.log(" old-repo".bold);
    gitwatcher.add_repo(repo);
});

var ws = new WebServer();
ws.start();



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
//timers.feedreader = setInterval(function() { githubevents.poll() }, 5000);
