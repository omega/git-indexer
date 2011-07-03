#!/usr/bin/env node
// Attempt to read a git repos history

var config = require('confu')(__dirname, 'config.json');
var gitteh = require("gitteh"),
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
    spore = require('spore'),
    github_auth = spore.middlewares.basic(
            config.github_auth.user, config.github_auth.pw
            ),
    github = spore.createClient(
            github_auth, spore.middlewares.json(),
            '../../other/spore-descriptions/services/github/organization.json'
            ),
    timers = {},
    GitHubEvents = require('./atom'),
    db, Issue, Commit, Repo, Comment
;

var REPO_BASE =  path.join(__dirname, "data");


models.defineModels(mongoose, function() {
    Issue = mongoose.model("Issue");
    Event = mongoose.model("Event");
    Repo = mongoose.model("Repo");
    db = mongoose.connect("mongodb://localhost/jira");
});

/*****
 * GitHubEvents PART
 *
 * This will hopefully fire events whenever it enoucters something in the feed
 * :p
 */

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
            var E = new EventM({
                id: e.id,
                user: e.repo().origin.user,
                repo: e.repo().origin.repo,
                date: new Date(e.published),
                url: e.linkByRel("alternate")[0].href,
                text: e.content
            });
            monchain.add(function(worker) {
                issue.add_event(E);
                worker.finish();
            });
        }
    });
});

/*************** End of GitHubEvents ****************/



/*****
 *
 * WEB SERVER PART
 *
 */

require('http').createServer(function(req, resp) {
    console.log("GOT REQ: " + JSON.stringify(req.headers) + " " + req.url);
    var r = url.parse(req.url, true);
    resp.writeHead(200, {"Content-Type": "application/json"});
    if (!r.query.issue) {
        // No issue specified, lets return empty
        resp.write(JSON.stringify({ 'error': 'No issue specified' }));
        resp.end();
        return;
    }
    Issue.findOne({'key': r.query.issue}, function(err, issue) {
        if (err) console.log("ERROR: " + err);
        resp.write(JSON.stringify(issue));
        resp.end();
    });
}).listen(8091);

/************** END OF WEB SERVER ****************/


// XXX: Timers needed:
//  - check for new repos on github
//  - Re-scan repos
//  -- Make sure we hide from last commit or something?

/******
 *
 * GITHUB TIMER
 *
 */

timers.github = setTimeout(update_github_repos, 1000);
timers.pull = setTimeout(repull_repos, 3000);

timers.feedreader = setTimeout(function() { githubevents.poll() }, 1);
//timers.feedreader = setInterval(function() { githubevents.poll() }, 5000);

function update_github_repos() {
    console.log("Scheduled: Updating repos from GitHub.");
    github.get_organization_repositories(
            {format: 'json', org: 'startsiden'},
            function(err, resp) {
                process_github_repos(resp.body.repositories);
            }
            );
}
var GIT_LIMIT = 2;
function process_github_repos(repos) {
    repos.forEach(function(repo) {
        //console.log("GIT_LIMIT: ", GIT_LIMIT);
        if (GIT_LIMIT < 1) return;
        GIT_LIMIT--;
        console.log(" - " + repo.name + " " + JSON.stringify(repo));
        Repo.findOne({'user': repo.owner, 'name': repo.name}, function(err, r) {
            if (!r && !err) {
                console.log("Not found, but no error, lets save!");
                r = new Repo({
                    user: repo.owner,
                    name: repo.name
                });
                r.clone(REPO_BASE, gitchain);
                r.save(function(err) {
                    if (err) console.log("ERROR inserting repo: " + err);
                });
            } else if (err) {
                console.log("ERROR Fetching repo: " + err);
            } else {
                console.log(" Found repo: " + repo);
                // XXX: Check that we have a clone!
                path.exists(r.filepath, function(exists) {
                    if (!exists) {
                        r.clone(REPO_BASE, gitchain);
                        r.save(function(err) {
                            if (err) console.log("ERROR saving updated repo: " + err);
                        });
                    } else {
                        console.log("path exists, triggering scan? OR NOT");
                        //r.scan(gitchain);
                    }
                });
            }
        });
    });
}


function repull_repos() {
    console.log("Scheduled: repull_repos");
    // Get all repos, and issue pyll on them
    Repo.find(function(err, repos) {
        //console.log("Found repos: " + repos);
        repos.forEach(function(repo) {
            if (repo.safename != "startsiden-net-search-1881") {
            repo.scan(gitchain);
            //repo.pull(chain);
            }
        });
    });
}

