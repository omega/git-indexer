module.exports = function(header) {
    l = function(d) {
        process.stderr.write(d + "\n");
    }

    var links = header.split(", ");
    var parsed = {};
    for (var i = 0; i < links.length; i++) {
        var link = links[i];
        var m = link.match(/<(.*)>; rel="(.*?)"/);

        parsed[m[2]] = m[1];

        var p = m[1].match(/page=(\d+)/)[1];
        parsed[m[2] + "Page"] = parseInt(p);

    }
    return parsed;
}
