#!/usr/bin/env node
var config = require('confu')(__dirname, 'config.json');
var models = require('./models.js'),
    logger = require("./logger")(),
    http   = require('http'),
    mongoose = require('mongoose'),
    url = require('url'),
    colors = require('colors'),
    Issue, db
    ;


var WebServer = function(config, connector) {
    this.port = config.web.port || 8091;
    this.mongo = config.mongo;
    this.connector = connector;
};

var mongo_connector = function(uris, mongoose, cb) {
    var error_handler = function(err) {
        if (err) logger.error(err);
        if (typeof(cb) != "undefined") cb(err);
    };
    if (uris.indexOf(",") != -1) {
        logger.log("connecting to a replicaSet: ", uris);
        return mongoose.connectSet(uris, error_handler);
    } else {
        logger.log("Connecting to a single mongo instance: ", uris);
        return mongoose.connect(uris, error_handler);
    }
};
WebServer.prototype.start = function() {
    var self = this;
    models.defineModels(mongoose, function() {
        Issue = mongoose.model("Issue");
        db = self.connector(self.mongo, mongoose);
    });

    http.createServer(function(req, resp) {
        logger.log("->WebServer: ".cyan + req.url);
        var r = url.parse(req.url, true);
        if (r.pathname == '/log') {
            self.handle_log(r, resp);
        } else {
            if (r.query.issue) {
                self.handle_issue(r, resp);
            }
            else {
                self.handle_repo_issues(r, resp);
            }
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
WebServer.prototype.handle_issue = function(r, resp) {
    resp.writeHead(200, {"Content-Type": "application/json"});
    if (!r.query.issue) {
        // No issue specified, lets return empty
        resp.write(JSON.stringify({ 'error': 'No issue specified' }));
        resp.end();
        return;
    }
    Issue.findOne({'key': r.query.issue}, function(err, issue) {
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

WebServer.prototype.handle_repo_issues = function(r, resp) {
    resp.writeHead(200, {"Content-Type": "application/json"});
    if (!r.query.repo) {
        // No issue specified, lets return empty
        resp.write(JSON.stringify({ 'error': 'No repo specified' }));
        resp.end();
        return;
    }
    Issue.find({'repos': r.query.repo}, function(err, issues) {
        if (err) logger.error(err);
        var keys = [];
        issues.forEach(function(i) {
            keys.push(i.key);
        });
        keys.sort();
        resp.write(JSON.stringify(keys));
        resp.end();
    });
};

module.exports = WebServer;

new WebServer(config, mongo_connector).start();
