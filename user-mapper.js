
var http = require('http'),
    fs   = require('fs')
;

var UserMapper = function(url) {
    this.url = url;
};

module.exports = UserMapper;

UserMapper.prototype.map = function(email, cb, err_cb) {
    if (!this.url) {
        return cb({username: email});

    }
    var url = this.url.replace(/\$/, email);
    // Fetch the url..
    var wrapped_cb = function(data) {
        var json = JSON.parse(data);
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

