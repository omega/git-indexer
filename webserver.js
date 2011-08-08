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

WebServer.prototype.start = function() {
    var self = this;
    models.defineModels(mongoose, function() {
        Issue = mongoose.model("Issue");
        db = self.connector(self.mongo, mongoose);
    });

    http.createServer(function(req, resp) {
        logger.log("->WebServer: ".cyan + req.url);
        var r = url.parse(req.url, true);
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
    }).listen(self.port);
    logger.log("WebServer".cyan, "started, listening on http://localhost:" + this.port + "/");
};

module.exports = WebServer;

//new WebServer().start();
