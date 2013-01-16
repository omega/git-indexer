var lp = require("../link-parser");
var test = require("tap").test;
test("Test link header parser", function(t) {
    var h = '<https://api.github.com/orgs/startsiden/repos?format=json&page=2>; rel="next", <https://api.github.com/orgs/startsiden/repos?format=json&page=8>; rel="last"';

    var p = lp(h);

    t.equal(p.nextPage, 2, "Found that next page is page #2");
    t.equal(p.lastPage, 8, "Found that last page is page #8");
    t.equal(p.next, "https://api.github.com/orgs/startsiden/repos?format=json&page=2", "right next link");
    t.equal(p.last, "https://api.github.com/orgs/startsiden/repos?format=json&page=8", "right last link");

    t.end();

});

