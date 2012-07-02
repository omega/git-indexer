require('should');
var url = require('./url.js');

describe('url', function(){
    describe('#path_as_array()', function(){
        it('should return path as array', function(){
            var u = url.parse('http://localhost:666/this/is/a/path',true);
            u.path_as_array.toString().should.equal('this,is,a,path');
            u = url.parse('http://localhost:666/this',true);
            u.path_as_array.toString().should.equal('this');
        });

        it('should return empty array for empty path', function(){
            var u = url.parse('http://localhost:666/',true);
            u.path_as_array.should.have.length(0);
            u = url.parse('http://localhost:666',true);
            u.path_as_array.should.have.length(0);
        });
    });
});

