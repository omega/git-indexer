#!/usr/bin/env node
var config = require('confu')(__dirname, 'config.json');
var models = require('./models.js'),
    logger = require("./logger")(),
    http   = require('http'),
    mongoose = require('mongoose'),
    url = require('./url.js'),
    colors = require('colors'),
    Issue
    ;

models.defineModels();
mongoose.connection.on('error', function(err) {
    console.error("MongoDB error: ", err);
});
var db = mongoose.createConnection(config.mongo);
db.on('error', console.error.bind(console, "connection error:"));


var WebServer = function(config) {
    this.port = process.env.PORT || config.web.port || 8091;
};

WebServer.prototype.start = function() {
    var self = this;

    http.createServer(function(req, resp) {
        logger.log("->WebServer: ".cyan + req.url);
        var r = url.parse(req.url, true);
        if (r.pathname === '/favicon.ico') {
            resp.writeHead(200, {'Content-Type': 'image/x-icon'} );
            resp.end();
            //console.log('favicon requested');
            return;
        }
        var path = r.path_as_array;
        var handler = self['handle_' + path[0]];
        if (handler) {
            handler(path[1], resp);
        }
        else if (r.query.issue) {
            self.handle_issue(r.query.issue, resp);
        }
        else {
            resp.writeHead(404, {"Content-Type": "text/plain;charset=utf-8"});
            resp.write('No such page');
            resp.end();
        }
    }).listen(self.port);
    logger.log("WebServer".cyan, "started, listening on http://localhost:" + this.port + "/");
};

WebServer.prototype.handle_log = function(r, resp) {
    resp.writeHead(200, {"Content-Type": "text/html;charset=utf-8"});
    resp.write("<html><head><title>git-indexer log</title>");
    resp.write("<style>.error { color: red; } .warn { color: orange; }</style></head>");
    resp.write("<body><ul>");
    logger.buffer.forEach(function(v) {
        resp.write("<li class='" + v.level + "'>" +
            v.args.join(" ").replace(/</g, "&lt;").replace(/>/g, "&gt;") +
            "</li>");
    });
    resp.write('</ul></body></html>');
    resp.end();
};

WebServer.prototype.handle_repos = function(dummy, resp) {
    resp.writeHead(200, {"Content-Type": "application/json"});
    resp.write(JSON.stringify(config.repos.inc));
    resp.end();
};

WebServer.prototype.handle_issue = function(issue, resp) {
    resp.writeHead(200, {"Content-Type": "application/json"});
    if (!issue) {
        // No issue specified, lets return empty
        resp.write(JSON.stringify({ 'error': 'No issue specified' }));
        resp.end();
        return;
    }
    Issue.findOne({'key': issue}).exec(function(err, issue) {
        if (err) logger.error(err);

        if (issue) {
            // Should re-sort the events
            issue.events = issue.events.sort(function(a, b) {
                if (!b.date || !a.date) return 0; // undetermined
                return a.date.getTime() - b.date.getTime();
            });
            resp.write(JSON.stringify(issue));
        }
        if (!issue) resp.write(JSON.stringify({'error': "No issue found with that key"}));
        resp.end();
    });
};

WebServer.prototype.handle_issues_for_repo = function(repo, resp) {
    resp.writeHead(200, {"Content-Type": "application/json"});
    if (!repo) {
        // No repo specified, lets return empty
        resp.write(JSON.stringify({ 'error': 'No repo specified' }));
        resp.end();
        return;
    }
    Issue.find({'repos': repo}, function(err, issues) {
        if (err) logger.error(err);
        resp.write(JSON.stringify(issues));
        resp.end();
    });
};


WebServer.prototype.handle_status = function(nothing, resp) {
    Issue.find({}, {'events.date': 1 }).sort({ 'events.date': -1 }).limit(1).exec( function(err, issue) {
        var events = issue[0].events;

        var last = events[0].date;

        events.forEach(function(e) {
            if (e.date.getTime() > last.getTime()) {
                last = e.date;
            }
        });

        resp.writeHead(200, {"Content-Type": "application/json"});
        resp.write(JSON.stringify({ 'last-event': last }));
        resp.end();
    });
};



module.exports = WebServer;

var WS = new WebServer(config);
db.once('open', function() {
    logger.info("we are connected to mongodb, starting WS");
    Issue = db.model('Issue');
    WS.start();
});
