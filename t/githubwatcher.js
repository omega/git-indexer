var config = require('confu')(__dirname, '../config.json');
var test = require("tap").test;

var GHW = require("../github-watcher");

test("Make sure github watcher can fetch more than 30 repos", { timeout: 500*1000 }, function(t) {
    t.plan(1);
    var seen = 0;
    var ghw = new GHW(config);
    ghw.on('repo', function (repo) {
        seen++;
    });
    ghw.on("end", function () {
        console.warn("IN END HANDLER??");
        t.ok(seen > 30, "seen more than 30 repos: " + seen);
        console.warn("did ok test");
    });

    ghw.poll();

});



