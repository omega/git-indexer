require('should');
mongoose = require('mongoose');
models = require('./models');

// Test spy ("mock") to replace worker object everywhere
worker = { 
    has_finished: false, 
    finish : function() {
        this.has_finished = true;
    }
};

models.defineModels(mongoose, function() {
    Issue = mongoose.model("Issue");
    Event = mongoose.model("Event");
    Repo = mongoose.model("Repo");
});

var issue;
var Setup = {
    add_event : function(id,repo) {
        if (!repo) repo = "repo";
        issue.add_event( new Event({ id: id, repo: repo }), worker);
        return this;
    },
    issue : function() {
        return new Issue({ key:"XXX-42" });
    }
};


describe('Issue', function(){
    describe('#has_event()', function(){

        it('can check for presence of event', function(){
            issue = Setup.issue();
            issue.has_event("dummy").should.be.false;
            Setup.add_event("dummy");
            issue.has_event("dummy").should.be.true;
        });
    });

    describe('#add_event()', function(){
        beforeEach(function(){
            issue = Setup.issue();
        });

        it('can add events', function(){
            Setup.add_event("dummy");
            issue.events.length.should.equal(1);
            Setup.add_event("dummy2");
            issue.events.length.should.equal(2);
        });

        it('should eliminate duplicate events', function(){
            Setup.add_event("dummy").add_event("dummy2").add_event("dummy")
            issue.events.length.should.equal(2);
        });

        it('should register repos', function(){
            Setup.add_event("dummy").add_event("dummy2", "repo2");
            issue.events[0].repo.should.equal("repo");
            issue.repos[0].should.equal("repo");
            issue.repos[1].should.equal("repo2");
            issue.repos.length.should.equal(2);
        });

        it('should eliminate duplicate repos', function(){
            Setup.add_event("dummy").add_event("dummy2", "repo2").add_event("dummy3");
            issue.repos.length.should.equal(2);
        });

        it('should call finish method on worker if duplicate event', function(){
            Setup.add_event("dummy").add_event("dummy");
            worker.has_finished.should.be.true;
        });

        it('should call save() method if non-duplicte event', function(){
            issue.has_saved = false;
            issue.save = function() {
                this.has_saved = true;
            };
            Setup.add_event("dummy");
            issue.has_saved.should.be.true;
        });

    });
});

