var models = require('./models.js'),
    http   = require('http'),
    mongoose = require('mongoose'),
    url = require('url'),
    colors = require('colors'),
    Issue
    ;

models.defineModels(mongoose, function() {
    Issue = mongoose.model("Issue")
});

var WebServer = function(port) {
    this.port = port || 8091;
};

WebServer.prototype.start = function() {
    var self = this;

    http.createServer(function(req, resp) {
        console.log("->WebServer: ".cyan + req.url);
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
    }).listen(self.port);
    console.log("WebServer started, listening on http://localhost:" + this.port + "/");
};

module.exports = WebServer;
