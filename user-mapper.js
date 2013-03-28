
var config = require('confu')(__dirname, 'config.json');
var http = require('http'),
    fs   = require('fs'),
    logger = require("./logger")(config.logging)
;

var UserMapper = function(url) {
    this.url = url;
    this.cache = {};
};

module.exports = UserMapper;

UserMapper.prototype.map = function(email, cb, err_cb) {
    var self = this;
    if (!self.url) {
        return cb({username: email});

    }
    if (self.cache[email]) {
        //logger.debug("Returning cached username for email: " + email);
        return cb({username: self.cache[email].username});
    }
    var url = this.url.replace(/\$/, email);
    // Fetch the url..
    var wrapped_cb = function(data) {
        var json = JSON.parse(data);
        logger.debug("UserMapper ".yellow + "Setting cache for email: " + email);
        self.cache[email] = {
            username: json.username
        };
        cb(json);
    };
    var fetcher = this.fetch(url, wrapped_cb, err_cb);
};

UserMapper.prototype.fetch = function(url, cb, err_cb) {
    if (url.match(/^http/)) {
        var wrapped_cb = function(res) {
            var data = "";
            res.on("data", function(chunk) { data += chunk });
            res.on("end", function() { cb(data) });
        }
        return http.get(url, wrapped_cb).on("error", function(e) {
            if (err_cb) {
                err_cb(e);
            } else {
                throw e;
            }
        });
    } else if (url.match(/^file/)) {
        var m = url.match(/^file:\/\/.\/(.*)/);
        var wrapped_cb = function(err, data) {
            if (err) throw err;
            cb(data);
        };

        return fs.readFile(m[1], wrapped_cb);
    }
}

