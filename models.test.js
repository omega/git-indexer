require('should');
mongoose = require('mongoose');
models = require('./models');
worker = { finish: function() {} };

models.defineModels(mongoose, function() {
    Issue = mongoose.model("Issue");
    Event = mongoose.model("Event");
    Repo = mongoose.model("Repo");
});

describe('Issue', function(){
    describe('#add_event()', function(){
        before(function(){
            // ...
        });

        it('should add events', function(){
            var issue = new Issue({ key:"XXX-42" });
            issue.add_event( new Event({ id: "dummy", repo: "" }), worker);
            issue.events.length.should.equal(1);
            issue.add_event( new Event({ id: "dummy2", repo: "" }), worker);
            issue.events.length.should.equal(2);
        });

        it('should eliminate duplicates', function(){
            var issue = new Issue({ key:"XXX-42" });
            issue.add_event( new Event({ id: "dummy", repo: "" }), worker);
            issue.add_event( new Event({ id: "dummy2", repo: "" }), worker);
            issue.add_event( new Event({ id: "dummy", repo: "" }), worker);
            issue.events.length.should.equal(2);
        });

        it('should register repos', function(){
            var issue = new Issue({ key:"XXX-42" });
            issue.add_event( new Event({ id: "dummy", repo: "repo" }), worker);
            issue.add_event( new Event({ id: "dummy2", repo: "repo2" }), worker);
            issue.events[0].repo.should.equal("repo");
            issue.repos[0].should.equal("repo");
            issue.repos[1].should.equal("repo2");
            issue.repos.length.should.equal(2);
        });

        it('should eliminate duplicate repos', function(){
            var issue = new Issue({ key:"XXX-42" });
            issue.add_event( new Event({ id: "dummy", repo: "repo" }), worker);
            issue.add_event( new Event({ id: "dummy2", repo: "repo2" }), worker);
            issue.add_event( new Event({ id: "dummy3", repo: "repo" }), worker);
            issue.repos.length.should.equal(2);
        });


    });
});

