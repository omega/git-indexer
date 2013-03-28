#!/usr/bin/env node
var config = require('confu')(__dirname, 'config.json');
var models = require('./models.js'),
    logger = require("./logger")(config.logging),
    http   = require('http'),
    mongoose = require('mongoose'),
    url = require('./url.js'),
    fs = require("fs"),
    colors = require('colors'),
    Issue, Repo
    ;

models.defineModels();
mongoose.connection.on('error', function(err) {
    console.error("MongoDB error: ", err);
});
var db = mongoose.createConnection(config.mongo);



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
            handler.call(self, path[1], resp, r);
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
WebServer.prototype.respond_x   = function(resp, code, body) {
    resp.writeHead(code, {"Content-Type": "application/json"});
    resp.write(JSON.stringify( body ));
    resp.end();
};
WebServer.prototype.respond_200 = function(resp, body) {
    this.respond_x(resp, 200, body);
};
WebServer.prototype.respond_404 = function(resp, error) {
    if (!error) {
        error = "Not found";
    }
    this.respond_x(resp, 404, { 'error': 'Not found', 'message': error });
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
    this.respond_200(resp, config.repos.inc);
};

WebServer.prototype.handle_issue = function(issue, resp) {
    if (!issue) {
        // No issue specified, lets return empty
        return this.respond_404(resp, "No issue specified");
    }
    resp.writeHead(200, {"Content-Type": "application/json"});
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

WebServer.prototype.handle_commitlag = function(repo, resp, req) {
    var self = this;
    var branch = req.query.branch;

    Repo.findOne({'user': config.org, 'name': repo}, function(err, repo) {
        if (err) {
            return self.respond_404(resp, err);
        }
        if (!repo) {
            return self.respond_404(resp, "No such repo found :(");
        }
        repo.describe(branch, function(err, tag, nr, hash) {
            if (err) {
                console.log("error from describe", err);
                return self.respond_404(resp, err);
            }
            return self.respond_200(resp, {
                'tag': tag,
                'lag': nr,
                'hash': hash
            });
        });
    });
};







if (config.restartfile) {
    WebServer.prototype.handle_readerrestart = function(nothing, resp) {
        fs.openSync(config.restartfile, "w");
        resp.writeHead(200, {"Content-Type": "application/json"});
        resp.write(JSON.stringify({ 'restart': 'ok' }));
        resp.end();
    };
}



module.exports = WebServer;

var WS = new WebServer(config);
db.once('open', function() {
    logger.info("we are connected to mongodb, starting WS");
    Issue = db.model('Issue');
    Repo = db.model('Repo');
    WS.start();
});
db.on('error', function(err) {
    console.log("connection error:", err);
});
