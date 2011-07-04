// Based losely on https://github.com/banksean/node-webfinger/blob/master/lib/atom.js
//
// NOTE: This is not really an ATOM parser. It parses the github private feed,
// and generates events based on that.
var sax = require('sax'),
    events = require("events"),
    htmlparser = require('htmlparser'),
    select = require('soupselect').select,
    util = require('util'),
    Entry = function() {
        this.links      = [];
        this.title      = "";
        this.updated    = "";
        this.published  = "";
        this.summary    = "";
        this.content    = "";
        this.id         = "";
    },
    GitHubEvents = function(url) {
        var self = this;
        events.EventEmitter.call(self);
        self.url = url;
        console.log("GitHubEvents In initializer: " + url);
        self.VERSION = '0.1';
        self.handler = new htmlparser.DefaultHandler(function(error, dom) {
            if (error) throw error;
        });
        self.htmlparser = new htmlparser.Parser(self.handler, {});

        self.atomparser = new AtomParser();
        // XXX: This is quite ugly!
        self.atomparser.on('entry', function() {self.onevent(arguments[0]) });
        self.timer = setInterval(function() { self.poll() }, 10000);
    },
    https = require('https'),
    URL = require('url')
;
module.exports = GitHubEvents;

GitHubEvents.super_ = events.EventEmitter;
GitHubEvents.prototype = Object.create(events.EventEmitter.prototype, {
    constructor: {
                     value: GitHubEvents,
                     enumerable: false
                 }
});

GitHubEvents.prototype.parse_content = function(html) {
    this.htmlparser.parseComplete(html);
    var res = this.handler.dom;
    this.htmlparser.reset();
    return res;
};

GitHubEvents.prototype.poll = function() {
    // Conveniance to fetch a remote feed and send it to parsing
    console.log("GitHubEvents: Polling...");
    var u = URL.parse(this.url);
    var parser = this;
    https.get({
        host: u.hostname,
        port: u.port,
        path: u.pathname + u.search
    }, function(res) {
        res.on('data', function(d) {
            parser.atomparser.write(d.toString());
        });
    }).on('error', function(err) {
        console.error("ERROR during fetch: " + err);
    });
};
GitHubEvents.prototype.onevent = function(entry) {
    // Now to send along the events in the more structured channels!
    if (entry.type() == 'commitcomment') {
        // Need to fix links in entry.content
        entry.content = entry.content.replace(/href="\/(.*?)"/g,
                "href=\"https://github.com/$1\"");
        this.emit("comment", entry);
    }
};
/* AtomParser */

function AtomParser() {
    events.EventEmitter.call(this);
    this.sax = sax.parser(false, {lowercasetags: true, trim: true});
    var parser = this;
    parser.atomCurrentNodeName = '';
    parser.atomCurrentEntry = null;
    parser.sax.ontext = function(text) {
        if (parser.atomCurrentEntry) {
            var e = parser.atomCurrentEntry;
            // We are in an atom <entry> tag
            if (typeof(e[parser.atomCurrentNodeName]) == "string") {
                e[parser.atomCurrentNodeName] += text;
            }
        }
    };
    parser.sax.onopentag = function(node) {
        if (node.name == 'entry') {
            parser.atomCurrentEntry = new Entry();
        } else if (node.name == 'link' && parser.atomCurrentEntry) {
            var l = {};
            for (var attrName in node.attributes) {
                l[attrName] = node.attributes[attrName];
            }

            parser.atomCurrentEntry.links.push(l);
        } else {
            parser.atomCurrentNodeName = node.name;
        }
    };
    parser.sax.onclosetag = function(name) {
        if (name == 'entry' && parser.atomCurrentEntry) {
            //this.owner.callback(this.atomCurrentEntry);
            parser.emit('entry', parser.atomCurrentEntry);
            parser.atomCurrentEntry = null;
        }
    };
}
AtomParser.super_ = events.EventEmitter;
AtomParser.prototype = Object.create(events.EventEmitter.prototype, {
    constructor: {
                     value: AtomParser,
                     enumerable: false
                 }
});
AtomParser.prototype.write = function(data) {this.sax.write(data);};

/* Entry */
Entry.prototype.linkByRel = function(rel) {
    var filtered = this.links.filter(function(e, i, a) {
        return (e.rel == rel);
    });
    return filtered;
};

Entry.prototype.type = function() {
    // Attempts to extract what type of event this is from the id
    if (this.id == '') {
        console.error("Calling type on Entry with empty id");
        return null;
    }
    var type = this.id.match(/:([A-Z]+)Event/i);
    return type[1].toLowerCase();
};
Entry.prototype.commit = function() {
    var links = this.linkByRel("alternate");
    var l = links[0];
    var commit = {
        committer: {
                       time: new Date(this.updated)
        }
    };
    if (this.type() == 'push') {
        // Need to find the prefix of the sha1, then look in the content
        // for the rest
        var m = l.href.match(/\.\.\.([a-z0-9]+)/);
        var sha_pref = m[1];
        var re = new RegExp("/commit/(" + sha_pref + "[a-z0-9]+)");
        m = this.content.match(re);
        if (m)
            commit.id = m[1];

    } else if (this.type() == 'commitcomment') {
        // Attempt to find commit from link?
        var m = l.href.match(/commit\/([a-z0-9]+)\#comments/);
        if (m)
            commit.id = m[1];
    }
    if (commit.id)
        return commit;
    else
        return null;
};
Entry.prototype.repo = function() {
    var m = this.title.match(/(at|on) (.*)\/(.*)/);
    if (!m)
        return;

    // for some reason need to decode this in some events
    return {
        origin: {
                    user: m[2],
                    repo: m[3]
                }
    }
};
