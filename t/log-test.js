var logger = require('./logger')({
    buffer: 2,
    levels: {
        debug: 0x1
    }});
logger.log("testing");
logger.debug("testing debug");
logger.info("testing info");
logger.warn("testing warn");

logger.error("testing error");
logger.error("testing error");

console.log(logger.buffer);


var l2 = require('./logger')();

l2.warn("What happens now?");

console.log(l2.buffer);
console.log(logger.buffer);
