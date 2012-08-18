#!/usr/bin/env node

var UserMapper = require('../user-mapper.js');

var m = new UserMapper("file://./t/test-$");
console.log("1..3");
var u = m.map("bo", function(data) {

if (data.username == "bo2") {
    console.log("ok # got right username out");
} else {
    console.log("not ok # got the right username out");
}
});


var m2 = new UserMapper("http://localhost:4500/api/v2/user/git/jira?username=$");

m2.map("bo@startsiden.no", function(data) {
    if (data.username == "bolav") {
        console.log("ok # got right username from live");
    } else {
        console.log("not ok # got right username from live");
        console.log("# got: " + data.username);
    }
}, function(e) {
    if (e.toString().match(/ECONNREFUSED/)) {
        console.log("not ok # TODO: could not connect to local builder at port 4500");
    } else {
        console.log("not ok # Error fetching: " + e)
    }
});


var m3 = new UserMapper();
m3.map("bo", function(data) {
    
if (data.username == "bo") {
    console.log("ok # got right username out");
} else {
    console.log("not ok # got the right username out");
}
});
