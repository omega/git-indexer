var singelton;
var colors = require('colors');

var defaults = {
    levels: {
        debug: 0,
        info : 0x1,
        warn : 0x1 | 0x2,
        error: 0x1 | 0x2,
        fatal: 0x1 | 0x2
    },
    colors: {
        debug: "bold",
        info : "blue",
        warn : "yellow",
        error: "red"
    }
};

var Logger = function(config) {
    singelton = this;
    var self = this;

    if (!config) {
        config = {};
    }
    if (!config.buffer) {
        config.buffer = 1000;
    }
    if (!config.levels) {
        // 1 means console, 2 means buffer, bitwise
        config.levels = defaults.levels
    } else {
        // Extend whatever we have with the default
        for (var i in defaults.levels) {
            if (!config.levels[i]) {
                config.levels[i] = defaults.levels[i];
            }
        }
    }
    if (!config.colors) {
        config.colors = defaults.colors;
    }

    self.config = config;
    self.buffer = new Array(config.buffer);
};

module.exports = function(config) {
    if (singelton) return singelton;
    return new Logger(config);
};

Logger.prototype._log = function(level) {
    if (!this.config.levels[level]) return;
    var c = this.config.levels[level];
    var args = Array.prototype.slice.call(arguments);
    args.shift(); // get the level off
    if (c & 0x1) { // log with console
        var str = "[" + level.toUpperCase() + "]";
        while (str.length < 7) {
            str = " " + str;
        }
        args.unshift(str[this.config.colors[level]]);
        if (level == "debug") level = "log";
        console[level].apply(console, args);
        args.shift(); // get that damn label of again
    }
    if (c & 0x2) { // log to buffer as well
        this.buffer.unshift({
            level: level,
            args: args,
            time: new Date()
        });
        if (this.buffer.length > this.config.buffer)
            this.buffer.length = this.config.buffer;
    }
};

Logger.prototype.log = function() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift("info");
    this._log.apply(this, args);
};
Logger.prototype.debug = function() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift("debug");
    this._log.apply(this, args);
};
Logger.prototype.info = function() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift("info");
    this._log.apply(this, args);
};
Logger.prototype.warn = function() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift("warn");
    this._log.apply(this, args);
};
Logger.prototype.error = function() {
    var args = Array.prototype.slice.call(arguments);
    args.unshift("error");
    this._log.apply(this, args);
};



